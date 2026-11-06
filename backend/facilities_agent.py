"""Facilities agent for Campus Customs. Prompt: prompts/facilities.md"""
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPToolset
from pydantic_ai.models.openai import OpenAIResponsesModel

from models import AgentReply, TeamDeps
from team import build_agent

NAME = "facilities"
ROLE = "The shop lease: landlord, rent amount and due date. Checks rent requests against the lease on file and payment history."
# The campus-customs MCP tools this agent may call (least privilege). Every agent also has `delegate`.
MCP_TOOLS = frozenset({"get_today", "get_ticket", "get_lease", "list_payments"})


def create(model: OpenAIResponsesModel, toolset: MCPToolset) -> Agent[TeamDeps, AgentReply]:
    return build_agent(NAME, model, toolset, MCP_TOOLS)
