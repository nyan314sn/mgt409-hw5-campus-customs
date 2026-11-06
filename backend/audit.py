"""Append-only audit trail for agent runs: output/audit_trail.json.

The file is one JSON array of entries. Each run appends to it; it is never wiped.
If the file exists but is not a valid JSON array, it is moved aside to
audit_trail.corrupt-<timestamp>.json (kept, not deleted) and a new array is started.

Every entry has: ts, run_id, agent, chain, depth, step, event, detail, usage.
Long texts are truncated so the trail stays readable and small.
"""
from __future__ import annotations

import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic_ai import Agent
from pydantic_ai.messages import (RetryPromptPart, TextPart, ThinkingPart, ToolCallPart,
                                  ToolReturnPart, UserPromptPart)

MAX_TEXT = 2000  # characters kept per text field
# One lock for the whole process: the API appends from an agent-run thread and from
# request handlers at the same time, and load+append+save must not interleave.
_LOCK = threading.Lock()


def _clip(value: Any, limit: int = MAX_TEXT) -> Any:
    text = value if isinstance(value, str) else json.dumps(value, default=str)
    return text if len(text) <= limit else text[:limit] + f"... [truncated {len(text) - limit} chars]"


def _usage(usage: Any) -> dict | None:
    if usage is None:
        return None
    return {"requests": usage.requests, "tool_calls": getattr(usage, "tool_calls", None),
            "input_tokens": usage.input_tokens, "output_tokens": usage.output_tokens,
            "total_tokens": usage.total_tokens}


class AuditTrail:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------ file handling
    def _load(self) -> list:
        if not self.path.exists():
            return []
        try:
            data = json.loads(self.path.read_text(encoding="utf-8") or "[]")
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            pass
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        self.path.replace(self.path.with_name(f"{self.path.stem}.corrupt-{stamp}.json"))
        return []

    def _save(self, entries: list) -> None:
        tmp = self.path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(entries, indent=2, default=str), encoding="utf-8")
        for attempt in range(5):  # OneDrive can briefly lock the file
            try:
                os.replace(tmp, self.path)
                return
            except PermissionError:
                time.sleep(0.2 * (attempt + 1))
        os.replace(tmp, self.path)

    def append(self, *, run_id: str, event: str, agent: str | None = None,
               chain: list[str] | None = None, step: int | None = None,
               detail: dict | None = None, usage: Any = None) -> None:
        entry = {
            "ts": datetime.now(timezone.utc).astimezone().isoformat(timespec="milliseconds"),
            "run_id": run_id, "agent": agent, "chain": chain,
            "depth": (len(chain) - 1) if chain else None, "step": step,
            "event": event, "detail": detail or {}, "usage": _usage(usage),
        }
        with _LOCK:
            entries = self._load()
            entries.append(entry)
            self._save(entries)

    def read(self) -> list:
        """All entries, oldest first. Read-only: never moves or changes the file."""
        try:
            data = json.loads(self.path.read_text(encoding="utf-8") or "[]")
        except (FileNotFoundError, json.JSONDecodeError):
            return []
        return data if isinstance(data, list) else []

    # ------------------------------------------------------------ loop steps
    @staticmethod
    def describe_node(node: Any) -> tuple[str, dict]:
        """Turn one PydanticAI agent-loop node into (event, detail)."""
        if Agent.is_user_prompt_node(node):
            return "loop_start", {"user_prompt": _clip(node.user_prompt)}
        if Agent.is_model_request_node(node):
            parts = []
            for p in node.request.parts:
                if isinstance(p, ToolReturnPart):
                    parts.append({"type": "tool_result", "tool": p.tool_name,
                                  "tool_call_id": p.tool_call_id, "content": _clip(p.content)})
                elif isinstance(p, RetryPromptPart):
                    parts.append({"type": "retry", "tool": p.tool_name, "content": _clip(p.content)})
                elif isinstance(p, UserPromptPart):
                    parts.append({"type": "user_prompt", "content": _clip(p.content)})
                else:
                    parts.append({"type": type(p).__name__})
            return "model_request", {"parts": parts}
        if Agent.is_call_tools_node(node):
            resp = node.model_response
            parts, thinking = [], 0
            for p in resp.parts:
                if isinstance(p, ToolCallPart):
                    parts.append({"type": "tool_call", "tool": p.tool_name,
                                  "tool_call_id": p.tool_call_id, "args": _clip(p.args)})
                elif isinstance(p, TextPart):
                    parts.append({"type": "text", "content": _clip(p.content)})
                elif isinstance(p, ThinkingPart):
                    thinking += 1  # reasoning content is not logged, only counted
                else:
                    parts.append({"type": type(p).__name__})
            return "model_response", {"model": resp.model_name, "parts": parts,
                                      "reasoning_parts": thinking,
                                      "response_usage": _usage(resp.usage)}
        if Agent.is_end_node(node):
            return "loop_end", {"output": node.data.output.model_dump() if hasattr(node.data.output, "model_dump")
                                else _clip(node.data.output)}
        return "loop_step", {"node": type(node).__name__}
