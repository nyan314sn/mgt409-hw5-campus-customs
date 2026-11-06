"""Boss agent for Campus Customs. Prompt: prompts/boss.md"""
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPToolset
from pydantic_ai.models.openai import OpenAIResponsesModel

from models import AgentReply, TeamDeps
from team import build_agent

NAME = "boss"
ROLE = "Team lead. Reads tickets, sends each part to the right teammate, combines their answers, and flags every decision a human must approve."
# The campus-customs MCP tools this agent may call (least privilege). Every agent also has `delegate`.
MCP_TOOLS = frozenset({"get_today", "list_open_tickets", "get_ticket"})


def create(model: OpenAIResponsesModel, toolset: MCPToolset) -> Agent[TeamDeps, AgentReply]:
    return build_agent(NAME, model, toolset, MCP_TOOLS)
