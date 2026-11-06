"""Locate and load the nearest .env file (this folder or any parent) without printing secrets."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
REQUIRED_VARS = ["PORTKEY_API_KEY"]
DEFAULT_MODEL = "gpt-6-luna"  # HW5 Problem 5: every agent uses gpt-6-luna


def find_env_file(start: Path = HERE) -> Path | None:
    for directory in [start, *start.parents]:
        candidate = directory / ".env"
        if candidate.is_file():
            return candidate
    return None


def load_env() -> Path | None:
    env_path = find_env_file()
    if env_path:
        load_dotenv(env_path, override=False)
    os.environ.setdefault("OPENAI_MODEL", DEFAULT_MODEL)
    return env_path


def get_model_name() -> str:
    return os.environ.get("OPENAI_MODEL", DEFAULT_MODEL)


if __name__ == "__main__":
    path = load_env()
    print(f".env loaded from: {path}" if path else "No .env file found.")
    for var in REQUIRED_VARS:
        print(f"{var}: {'set' if os.environ.get(var) else 'MISSING'}")
    print(f"OPENAI_MODEL: {get_model_name()}")
