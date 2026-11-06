"""Backend settings. Reuses hw5/env_setup.py so the .env lookup and the model default
live in one place. Secrets are read from the environment only and never printed."""
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
HW_DIR = BACKEND_DIR.parent
if str(HW_DIR) not in sys.path:
    sys.path.append(str(HW_DIR))

from env_setup import get_model_name, load_env  # noqa: E402

load_env()
os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")

# One model for every agent (gpt-6-luna by default; override with OPENAI_MODEL).
OPENAI_MODEL = get_model_name()
PORTKEY_BASE_URL = os.getenv("PORTKEY_BASE_URL", "https://api.portkey.ai/v1")

PROMPTS_DIR = BACKEND_DIR / "prompts"
MCP_SERVER_SCRIPT = HW_DIR / "mcp_server" / "server.py"
# The MCP server runs with the same interpreter as the team (C:\Users\Pi\miniconda3\python.exe).
PYTHON_EXE = sys.executable

AUDIT_TRAIL_FILE = HW_DIR / "output" / "audit_trail.json"

# Databases. Agents read WORKING_DB only through the MCP server (read-only).
# The FastAPI backend writes WORKING_DB only on a human approval or a reset;
# ORIGINAL_DB is never written, it is the source for POST /api/reset.
ORIGINAL_DB = HW_DIR / "data" / "campus_customs.db"
WORKING_DB = HW_DIR / "data" / "campus_customs_new.db"

# Agent-loop guard rails and token budget (one shared budget per team run, all agents).
MAX_DELEGATION_DEPTH = 3                                                   # boss -> A -> B -> C at most
MAX_MODEL_REQUESTS = int(os.getenv("MAX_MODEL_REQUESTS", "40"))            # LLM calls per run
MAX_TOOL_CALLS = int(os.getenv("MAX_TOOL_CALLS", "60"))                    # tool calls per run
MAX_TOTAL_TOKENS = int(os.getenv("MAX_TOTAL_TOKENS", "250000"))            # input + output tokens per run
MAX_OUTPUT_TOKENS_PER_RESPONSE = int(os.getenv("MAX_OUTPUT_TOKENS", "4000"))  # per model response
