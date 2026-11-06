"""Data types shared by the Campus Customs agent team."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Literal, get_args

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from pydantic_ai import Agent, UsageLimits

    from audit import AuditTrail

AgentName = Literal["boss", "inventory", "accounting", "facilities", "customer_service"]
AGENT_NAMES: tuple[str, ...] = get_args(AgentName)


class AgentReply(BaseModel):
    """What every agent returns, to the user or to the teammate who delegated to it."""

    agent: AgentName = Field(description="Your own agent name.")
    summary: str = Field(description="Short plain-language answer to the task.")
    facts: list[str] = Field(
        default_factory=list,
        description="Facts with their values, taken only from tool results or teammates' replies.",
    )
    proposed_actions: list[str] = Field(
        default_factory=list,
        description="Next steps you recommend. Nothing is executed yet.",
    )
    needs_human_approval: bool = Field(
        default=False,
        description="True if any proposed action moves money, changes a price, or promises a customer something.",
    )
    open_questions: list[str] = Field(
        default_factory=list,
        description="What is still unknown, or what no tool could answer.",
    )


class DelegationRecord(BaseModel):
    """One hand-off from one agent to another, kept for the run's trace."""

    from_agent: AgentName
    to_agent: AgentName
    task: str
    depth: int
    reply: AgentReply | None = None
    error: str | None = None


class TeamResult(BaseModel):
    """Result of one team run: the final reply plus every delegation that happened."""

    task: str
    model: str
    run_id: str
    reply: AgentReply
    delegations: list[DelegationRecord]
    model_requests: int
    total_tokens: int


@dataclass
class TeamDeps:
    """Per-agent run context. `chain` is the path of agents from the start agent to this one.
    `trace` and `audit` are shared by every agent in the run."""

    team: dict[str, "Agent[TeamDeps, AgentReply]"]
    usage_limits: "UsageLimits"
    audit: "AuditTrail"
    run_id: str
    chain: list[AgentName]
    trace: list[DelegationRecord] = field(default_factory=list)

    @property
    def current(self) -> AgentName:
        return self.chain[-1]

    @property
    def depth(self) -> int:
        return len(self.chain) - 1

    def child(self, to_agent: AgentName) -> "TeamDeps":
        return TeamDeps(team=self.team, usage_limits=self.usage_limits, audit=self.audit,
                        run_id=self.run_id, chain=[*self.chain, to_agent], trace=self.trace)
