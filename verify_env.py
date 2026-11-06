"""Verify that every required package imports and the environment is configured."""
import importlib
import sys

from env_setup import load_env, REQUIRED_VARS, get_model_name
import os

PACKAGES = {"python-dotenv": "dotenv", "pydantic-ai-slim[openai]": "pydantic_ai", "openai": "openai", "pandas": "pandas", "fastmcp": "fastmcp", "fastapi": "fastapi", "uvicorn": "uvicorn", "sqlite3 (stdlib)": "sqlite3"}

print(f"Python: {sys.executable} ({sys.version.split()[0]})")
ok = True
for pkg, module in PACKAGES.items():
    try:
        mod = importlib.import_module(module)
        print(f"  OK   {pkg:28} {getattr(mod, '__version__', '')}")
    except ImportError as exc:
        ok = False
        print(f"  FAIL {pkg:28} {exc}")

env_path = load_env()
print(f".env: {env_path or 'not found'}")
for var in REQUIRED_VARS:
    present = bool(os.environ.get(var))
    ok &= present
    print(f"  {var}: {'set' if present else 'MISSING'}")
print(f"  OPENAI_MODEL: {get_model_name()}")
sys.exit(0 if ok else 1)
