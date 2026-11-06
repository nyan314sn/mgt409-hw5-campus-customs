"""Inventory agent for Campus Customs. Prompt: prompts/inventory.md"""
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPToolset
from pydantic_ai.models.openai import OpenAIResponsesModel

from models import AgentReply, TeamDeps
from team import build_agent

NAME = "inventory"
ROLE = "Shelf stock by SKU and size, shortfalls, other sizes in stock, and which vendor can restock and how fast."
# The campus-customs MCP tools this agent may call (least privilege). Every agent also has `delegate`.
MCP_TOOLS = frozenset({"get_today", "get_ticket", "check_inventory", "list_vendors"})


def create(model: OpenAIResponsesModel, toolset: MCPToolset) -> Agent[TeamDeps, AgentReply]:
    return build_agent(NAME, model, toolset, MCP_TOOLS)
