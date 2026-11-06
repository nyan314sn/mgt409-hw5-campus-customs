"""Shared machinery for the Campus Customs agent team.

- make_model():        the one model (gpt-6-luna via Portkey) every agent uses
- make_mcp_toolset():  the campus-customs MCP server, shared by every agent
- build_agent():       one agent = prompt file + model + its allowed MCP tools + `delegate`
- run_agent():         runs one agent's loop step by step, writing each step to the audit trail
- delegate():          the tool that lets any agent hand a sub-task to any other agent
- run_team():          runs the team for one task, starting at the Boss by default

Agent loop: each agent runs PydanticAI's loop (model -> tool calls -> model ... -> AgentReply).
run_agent() drives that loop with Agent.iter() so every step (model request, model response
with tool calls, final output) is appended to output/audit_trail.json.
`delegate` starts the teammate's own loop inside the caller's, and the teammate's AgentReply
comes back as the tool result. Every agent can delegate to every other agent (full
connectivity). Endless loops are prevented by refusing hand-offs to an agent already in the
chain, capping chain depth, and sharing one request/token budget across the whole run.

All shop facts come from the MCP server; there is no second data layer here.
"""
from __future__ import annotations

import os
import uuid
from importlib import import_module

from fastmcp import Client
from fastmcp.client.transports import StdioTransport
from openai import AsyncOpenAI
from pydantic_ai import Agent, RunContext, UsageLimits
from pydantic_ai.exceptions import UsageLimitExceeded
from pydantic_ai.mcp import MCPToolset
from pydantic_ai.models.openai import OpenAIResponsesModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.usage import RunUsage

from audit import AuditTrail
from models import AGENT_NAMES, AgentName, AgentReply, DelegationRecord, TeamDeps, TeamResult
from settings import (AUDIT_TRAIL_FILE, MAX_DELEGATION_DEPTH, MAX_MODEL_REQUESTS,
                      MAX_OUTPUT_TOKENS_PER_RESPONSE, MAX_TOOL_CALLS, MAX_TOTAL_TOKENS,
                      MCP_SERVER_SCRIPT, OPENAI_MODEL, PORTKEY_BASE_URL, PROMPTS_DIR, PYTHON_EXE)

# Module that defines each agent (backend/<name>_agent.py).
AGENT_MODULES: dict[str, str] = {name: f"{name}_agent" for name in AGENT_NAMES}


class TeamUnavailable(Exception):
    """The team can't run (missing key, provider error)."""


def make_model() -> OpenAIResponsesModel:
    """The model every agent uses, routed through Portkey. Uses the Responses API, which
    gpt-6-luna requires for tool calls (Chat Completions rejects tools + reasoning)."""
    api_key = os.getenv("PORTKEY_API_KEY")
    if not api_key:
        raise TeamUnavailable("PORTKEY_API_KEY is not set (check the course .env file).")
    client = AsyncOpenAI(
        base_url=PORTKEY_BASE_URL,
        api_key="portkey",  # auth goes through the Portkey header below
        default_headers={"x-portkey-api-key": api_key},
    )
    return OpenAIResponsesModel(OPENAI_MODEL, provider=OpenAIProvider(openai_client=client))


def make_mcp_toolset() -> MCPToolset:
    """The campus-customs MCP server (mcp_server/server.py), started over stdio."""
    transport = StdioTransport(command=PYTHON_EXE, args=[str(MCP_SERVER_SCRIPT)])
    return MCPToolset(Client(transport), id="campus-customs")


def make_limits() -> UsageLimits:
    """One budget shared by every agent in a run."""
    return UsageLimits(request_limit=MAX_MODEL_REQUESTS, tool_calls_limit=MAX_TOOL_CALLS,
                       total_tokens_limit=MAX_TOTAL_TOKENS)


def roster() -> str:
    """One line per agent, taken from each agent file's ROLE."""
    return "\n".join(f"- {name}: {import_module(AGENT_MODULES[name]).ROLE}" for name in AGENT_NAMES)


async def run_agent(deps: TeamDeps, task: str, usage: RunUsage | None = None):
    """Run the agent at the end of deps.chain on `task`, auditing every loop step."""
    agent, audit = deps.team[deps.current], deps.audit
    audit.append(run_id=deps.run_id, event="agent_start", agent=deps.current, chain=deps.chain,
                 detail={"task": task, "prompt_file": f"backend/prompts/{deps.current}.md",
                         "model": OPENAI_MODEL}, usage=usage)
    step = 0
    try:
        async with agent.iter(task, deps=deps, usage=usage, usage_limits=deps.usage_limits) as run:
            async for node in run:
                step += 1
                event, detail = AuditTrail.describe_node(node)
                audit.append(run_id=deps.run_id, event=event, agent=deps.current, chain=deps.chain,
                             step=step, detail=detail, usage=run.usage)
    except Exception as exc:
        audit.append(run_id=deps.run_id, event="agent_error", agent=deps.current, chain=deps.chain,
                     step=step, detail={"error": f"{type(exc).__name__}: {exc}"})
        raise
    result = run.result
    audit.append(run_id=deps.run_id, event="agent_end", agent=deps.current, chain=deps.chain,
                 step=step, detail={"needs_human_approval": result.output.needs_human_approval},
                 usage=result.usage)
    return result


async def delegate(ctx: RunContext[TeamDeps], to_agent: AgentName, task: str) -> str:
    """Hand a sub-task to a teammate and wait for their reply.

    Args:
        to_agent: The teammate to ask: boss, inventory, accounting, facilities, or customer_service.
        task: A clear, self-contained request including any ticket id, SKU, size, quantity,
            amount, or lease/invoice id the teammate needs. They cannot see your conversation.
    """
    deps = ctx.deps
    refusal = None
    if to_agent == deps.current:
        refusal = "Refused: you cannot delegate to yourself. Do the task with your own tools."
    elif to_agent in deps.chain:
        refusal = (f"Refused: {to_agent} is already working on this request "
                   f"(chain: {' -> '.join(deps.chain)}). Answer with what you have.")
    elif deps.depth >= MAX_DELEGATION_DEPTH:
        refusal = f"Refused: delegation depth limit ({MAX_DELEGATION_DEPTH}) reached. Answer with what you have."
    if refusal:
        deps.audit.append(run_id=deps.run_id, event="delegation_refused", agent=deps.current,
                          chain=deps.chain, detail={"to_agent": to_agent, "task": task, "reason": refusal})
        return refusal

    record = DelegationRecord(from_agent=deps.current, to_agent=to_agent, task=task, depth=deps.depth + 1)
    deps.trace.append(record)
    try:
        result = await run_agent(deps.child(to_agent), task, usage=ctx.usage)
    except UsageLimitExceeded:
        record.error = "Team budget used up."
        raise
    except Exception as exc:  # report the teammate's failure to the caller instead of crashing
        record.error = f"{type(exc).__name__}: {exc}"
        return f"{to_agent} could not finish: {record.error}"
    record.reply = result.output
    return result.output.model_dump_json()


def build_agent(name: AgentName, model: OpenAIResponsesModel, toolset: MCPToolset,
                mcp_tools: frozenset[str]) -> Agent[TeamDeps, AgentReply]:
    """One team member: its prompt file, the shared model, its allowed MCP tools, and `delegate`."""
    allowed = toolset.filtered(lambda ctx, tool_def: tool_def.name in mcp_tools)
    agent: Agent[TeamDeps, AgentReply] = Agent(
        model,
        name=name,
        deps_type=TeamDeps,
        output_type=AgentReply,
        instructions=(PROMPTS_DIR / f"{name}.md").read_text(encoding="utf-8"),
        toolsets=[allowed],
        tools=[delegate],
        retries=2,
        model_settings={"max_tokens": MAX_OUTPUT_TOKENS_PER_RESPONSE},
    )

    @agent.instructions
    def team_context(ctx: RunContext[TeamDeps]) -> str:
        return (
            f"You are the `{name}` agent. Set `agent` to \"{name}\" in your reply.\n"
            f"Your MCP tools: {', '.join(sorted(mcp_tools))}, plus `delegate`.\n"
            f"Your teammates (use the `delegate` tool to ask any of them):\n{roster()}\n"
            f"Current hand-off chain: {' -> '.join(ctx.deps.chain)}."
        )

    return agent


def build_team() -> tuple[dict[str, Agent[TeamDeps, AgentReply]], MCPToolset]:
    """All five agents, sharing one model and one MCP connection."""
    model, toolset = make_model(), make_mcp_toolset()
    team = {name: import_module(AGENT_MODULES[name]).create(model, toolset) for name in AGENT_NAMES}
    return team, toolset


async def run_team(task: str, start: AgentName = "boss", run_id: str | None = None,
                   meta: dict | None = None) -> TeamResult:
    """Run one task through the team, starting at `start` (the Boss by default).
    `meta` (e.g. {"ticket_id": 101}) is stored on the run's start/end audit entries."""
    meta = meta or {}
    team, toolset = build_team()
    audit = AuditTrail(AUDIT_TRAIL_FILE)
    deps = TeamDeps(team=team, usage_limits=make_limits(), audit=audit,
                    run_id=run_id or uuid.uuid4().hex[:12], chain=[start])
    audit.append(run_id=deps.run_id, event="team_run_start", agent=start, chain=deps.chain,
                 detail={**meta, "task": task, "model": OPENAI_MODEL, "mcp_server": str(MCP_SERVER_SCRIPT.name),
                         "limits": {"requests": MAX_MODEL_REQUESTS, "tool_calls": MAX_TOOL_CALLS,
                                    "total_tokens": MAX_TOTAL_TOKENS,
                                    "max_output_tokens_per_response": MAX_OUTPUT_TOKENS_PER_RESPONSE,
                                    "max_delegation_depth": MAX_DELEGATION_DEPTH}})
    try:
        async with toolset:  # one MCP server process for the whole run
            result = await run_agent(deps, task)
    except Exception as exc:
        audit.append(run_id=deps.run_id, event="team_run_error", agent=start, chain=deps.chain,
                     detail={**meta, "error": f"{type(exc).__name__}: {exc}",
                             "delegations": len(deps.trace)})
        raise
    usage = result.usage
    team_result = TeamResult(task=task, model=OPENAI_MODEL, run_id=deps.run_id, reply=result.output,
                             delegations=deps.trace, model_requests=usage.requests,
                             total_tokens=usage.total_tokens or 0)
    audit.append(run_id=deps.run_id, event="team_run_end", agent=start, chain=deps.chain,
                 detail={**meta, "summary": result.output.summary,
                         "needs_human_approval": result.output.needs_human_approval,
                         "delegations": [f"{d.from_agent}->{d.to_agent}" for d in deps.trace]},
                 usage=usage)
    return team_result
