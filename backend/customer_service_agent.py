"""Customer Service agent for Campus Customs. Prompt: prompts/customer_service.md"""
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPToolset
from pydantic_ai.models.openai import OpenAIResponsesModel

from models import AgentReply, TeamDeps
from team import build_agent

NAME = "customer_service"
ROLE = "Drafts short, honest replies to the people who opened tickets, using only facts teammates confirmed. Never promises unapproved things."
# The campus-customs MCP tools this agent may call (least privilege). Every agent also has `delegate`.
MCP_TOOLS = frozenset({"get_today", "get_ticket"})


def create(model: OpenAIResponsesModel, toolset: MCPToolset) -> Agent[TeamDeps, AgentReply]:
    return build_agent(NAME, model, toolset, MCP_TOOLS)
