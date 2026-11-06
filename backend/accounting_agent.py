"""Accounting agent for Campus Customs. Prompt: prompts/accounting.md"""
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPToolset
from pydantic_ai.models.openai import OpenAIResponsesModel

from models import AgentReply, TeamDeps
from team import build_agent

NAME = "accounting"
ROLE = "Prices, quotes, discounts and margins, vendor invoices, cash balance and payment history. Advises only; never pays."
# The campus-customs MCP tools this agent may call (least privilege). Every agent also has `delegate`.
MCP_TOOLS = frozenset({"get_today", "get_ticket", "get_pricing", "calculate_quote", "get_invoice", "get_cash_balance", "check_cash_after_payments", "list_payments"})


def create(model: OpenAIResponsesModel, toolset: MCPToolset) -> Agent[TeamDeps, AgentReply]:
    return build_agent(NAME, model, toolset, MCP_TOOLS)
