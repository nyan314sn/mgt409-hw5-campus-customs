"""Campus Customs backend: FastAPI routes for the React dashboard, plus the command line.

Start the API (from backend/):
    uvicorn main:app --reload --port 8000
    -> http://localhost:8000          (route list)
    -> http://localhost:8000/docs     (try every route in the browser)

Command line (from hw5/):
    C:\\Users\\Pi\\miniconda3\\python.exe backend\\main.py "Handle ticket 102"

Who changes what:
- Agents only read (through the read-only MCP server) and *propose* actions.
- POST /api/approvals is the only route that moves cash, called after a human clicks approve.
- POST /api/reset restores data/campus_customs_new.db from the untouched original.
Every run, approval, refused approval and reset is appended to output/audit_trail.json.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import shop_db
from audit import AuditTrail
from models import AGENT_NAMES, TeamResult
from settings import AUDIT_TRAIL_FILE, OPENAI_MODEL
from team import TeamUnavailable, run_team

app = FastAPI(title="Campus Customs desk API",
              description="Tickets, agent runs, agent events, human approvals, cash and reset.")
app.add_middleware(  # the React dev server (next problem) runs on another port
    CORSMiddleware,
    allow_origins=[f"http://{host}:{port}" for host in ("localhost", "127.0.0.1")
                   for port in (3000, 5173, 4173, 8080)],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# In-memory record of team runs started through the API (the audit trail is the durable record).
RUNS: dict[str, dict] = {}
_TASKS: set[asyncio.Task] = set()


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _audit() -> AuditTrail:
    return AuditTrail(AUDIT_TRAIL_FILE)


def _running() -> dict | None:
    return next((r for r in RUNS.values() if r["status"] == "running"), None)


# ------------------------------------------------------------------ agent runs
def _run_blocking(task: str, run_id: str, meta: dict) -> TeamResult:
    """Run the team on its own event loop in a worker thread. On Windows, uvicorn --reload
    uses a selector loop that cannot start subprocesses, and the MCP server is a subprocess,
    so the team gets a Proactor loop of its own."""
    factory = asyncio.ProactorEventLoop if sys.platform == "win32" else None
    return asyncio.run(run_team(task, run_id=run_id, meta=meta), loop_factory=factory)


async def _execute(run_id: str) -> None:
    job = RUNS[run_id]
    try:
        result = await asyncio.to_thread(_run_blocking, job["task"], run_id, {"ticket_id": job["ticket_id"]})
        await asyncio.to_thread(shop_db.resolve_ticket, job["ticket_id"])  # the run finished: resolved
        job.update(status="done", result=result.model_dump(mode="json"))
    except Exception as exc:  # the audit trail has the full step history
        job.update(status="error", error=f"{type(exc).__name__}: {exc}")
    finally:
        job["finished_at"] = _now()


def _since_last_reset(entries: list[dict]) -> list[dict]:
    """Audit entries after the most recent database reset (older runs belong to an old desk)."""
    last = max((i for i, e in enumerate(entries) if e.get("event") == "db_reset"), default=-1)
    return entries[last + 1:]


def _ticket_runs_from_audit() -> dict[int, dict]:
    """Latest team run per ticket since the last reset, rebuilt from the audit trail
    (so the board still knows after a server restart)."""
    runs: dict[str, dict] = {}
    for e in _since_last_reset(_audit().read()):
        d, ev = e.get("detail") or {}, e.get("event")
        if ev == "team_run_start" and d.get("ticket_id") is not None:
            runs[e["run_id"]] = {"run_id": e["run_id"], "ticket_id": d["ticket_id"], "status": "interrupted",
                                 "started_at": e.get("ts")}
        elif ev in ("team_run_end", "team_run_error") and e.get("run_id") in runs:
            runs[e["run_id"]]["status"] = "done" if ev == "team_run_end" else "error"
    latest: dict[int, dict] = {}
    for r in runs.values():  # dicts keep insertion order, so later runs overwrite earlier ones
        latest[r["ticket_id"]] = r
    return latest


def _run_was_completed(run_id: str, ticket_id: int) -> bool:
    """True if `run_id` is a finished team run on `ticket_id` since the last reset."""
    job = RUNS.get(run_id)
    if job is not None:
        return job["status"] == "done" and job["ticket_id"] == ticket_id
    return any(e.get("run_id") == run_id and e.get("event") == "team_run_end"
               and (e.get("detail") or {}).get("ticket_id") == ticket_id
               for e in _since_last_reset(_audit().read()))


# ------------------------------------------------------------------ events for the board
def _parse_args(args) -> object:
    if isinstance(args, str):
        try:
            return json.loads(args)
        except json.JSONDecodeError:
            return args
    return args


def _event_view(index: int, e: dict, ticket_of_run: dict) -> dict:
    """One audit entry, reduced to what the board shows: who, what they said, which tools."""
    d, ev = e.get("detail") or {}, e.get("event")
    said, tools, results, reply = None, [], [], None
    if ev == "model_response":
        parts = d.get("parts", [])
        said = "\n".join(p["content"] for p in parts if p.get("type") == "text") or None
        tools = [{"tool": p["tool"], "args": _parse_args(p.get("args"))}
                 for p in parts if p.get("type") == "tool_call" and p.get("tool") != "final_result"]
    elif ev == "model_request":
        results = [{"tool": p.get("tool"), "result": str(p.get("content"))[:400]}
                   for p in d.get("parts", []) if p.get("type") == "tool_result" and p.get("tool") != "final_result"]
    elif ev == "loop_end":
        reply = d.get("output") if isinstance(d.get("output"), dict) else None
        said = reply.get("summary") if reply else str(d.get("output"))
    elif ev in ("team_run_start", "agent_start"):
        said = f"Task: {d.get('task')}"
    elif ev == "team_run_end":
        said = d.get("summary")
    elif ev in ("agent_error", "team_run_error"):
        said = f"Error: {d.get('error')}"
    elif ev == "delegation_refused":
        said = d.get("reason")
    elif ev in ("human_approval", "approval_rejected", "db_reset"):
        said = d.get("message")
    usage = e.get("usage") or {}
    return {"index": index, "ts": e.get("ts"), "run_id": e.get("run_id"),
            "ticket_id": d.get("ticket_id", ticket_of_run.get(e.get("run_id"))),
            "agent": e.get("agent"), "chain": e.get("chain"), "step": e.get("step"), "event": ev,
            "said": said, "tools": tools, "tool_results": results, "reply": reply,
            "total_tokens": usage.get("total_tokens")}


# ------------------------------------------------------------------ routes
@app.get("/")
def index() -> dict:
    return {"service": "Campus Customs desk API", "docs": "/docs",
            "routes": sorted(f"{m} {r.path}" for r in app.routes
                             for m in getattr(r, "methods", ()) if r.path.startswith("/api") and m != "HEAD")}


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "model": OPENAI_MODEL, "portkey_key_set": bool(os.getenv("PORTKEY_API_KEY")),
            "working_db": shop_db.WORKING_DB.name, "audit_trail": AUDIT_TRAIL_FILE.name,
            "running_run_id": (_running() or {}).get("run_id")}


@app.get("/api/tickets")
def tickets() -> dict:
    """The tickets and whether each is open or resolved, plus the latest team run on each."""
    rows = shop_db.list_tickets()
    from_audit = _ticket_runs_from_audit()
    for t in rows:
        runs = [r for r in RUNS.values() if r["ticket_id"] == t["id"]]
        last = max(runs, key=lambda r: r["started_at"]) if runs else from_audit.get(t["id"])
        t["last_run"] = {"run_id": last["run_id"], "status": last["status"]} if last else None
    return {"tickets": rows}


@app.get("/api/tickets/{ticket_id}/approvals")
def ticket_approvals(ticket_id: int) -> dict:
    """What a human can approve on this ticket (pay invoice, pay rent, restock purchase), with
    amounts from the database, and the agent run that prepared it. `ready` is true once the
    agents have finished a run on the ticket."""
    opts = shop_db.approval_options(ticket_id)
    if opts is None:
        raise HTTPException(404, f"Ticket {ticket_id} does not exist.")
    runs = [r for r in RUNS.values() if r["ticket_id"] == ticket_id]
    last = max(runs, key=lambda r: r["started_at"]) if runs else _ticket_runs_from_audit().get(ticket_id)
    ready = bool(last and last["status"] == "done")
    return {**opts, "ready": ready, "run_id": last["run_id"] if ready else None}


@app.get("/api/tickets/{ticket_id}")
def ticket(ticket_id: int) -> dict:
    row = shop_db.get_ticket(ticket_id)
    if row is None:
        raise HTTPException(404, f"Ticket {ticket_id} does not exist.")
    return row


@app.post("/api/tickets/{ticket_id}/run", status_code=202)
async def run_ticket(ticket_id: int, response: Response,
                     wait: bool = Query(False, description="Wait for the run to finish (can take minutes)")) -> dict:
    """Start the agent team on one ticket. Returns a run_id at once; poll /api/runs/{run_id}
    and /api/events?run_id=... to follow it, or pass ?wait=true to block until it finishes.
    When the run finishes, the ticket is marked resolved."""
    row = shop_db.get_ticket(ticket_id)
    if row is None:
        raise HTTPException(404, f"Ticket {ticket_id} does not exist.")
    if row["status"] != "open":
        raise HTTPException(409, f"Ticket {ticket_id} is {row['status']}. Reset the database to run it again.")
    busy = _running()
    if busy:  # one team run at a time keeps token use and cost predictable
        raise HTTPException(409, f"Run {busy['run_id']} on ticket {busy['ticket_id']} is still going.")
    if not os.getenv("PORTKEY_API_KEY"):
        raise HTTPException(503, "PORTKEY_API_KEY is not set, so the agents cannot run.")
    run_id = uuid.uuid4().hex[:12]
    RUNS[run_id] = {"run_id": run_id, "ticket_id": ticket_id, "task": f"Handle ticket {ticket_id}.",
                    "status": "running", "started_at": _now(), "finished_at": None,
                    "result": None, "error": None}
    task = asyncio.create_task(_execute(run_id))
    _TASKS.add(task)
    task.add_done_callback(_TASKS.discard)
    if wait:
        await task
        response.status_code = 200
    return RUNS[run_id]


@app.get("/api/runs")
def runs() -> dict:
    return {"runs": sorted(RUNS.values(), key=lambda r: r["started_at"], reverse=True)}


@app.get("/api/runs/{run_id}")
def run(run_id: str) -> dict:
    if run_id not in RUNS:
        raise HTTPException(404, f"No run {run_id} started since the server started (check /api/events).")
    return RUNS[run_id]


@app.get("/api/events")
def events(limit: int = Query(100, ge=1, le=1000),
           after: int | None = Query(None, ge=0, description="Only entries with index >= after "
                                                             "(pass the last next_after to get new ones)"),
           run_id: str | None = None, ticket_id: int | None = None, agent: str | None = None) -> dict:
    """Recent agent events from output/audit_trail.json: what each agent said, which tools it
    called (with arguments) and what the tools returned. Newest last."""
    entries = _audit().read()
    ticket_of_run = {e.get("run_id"): (e.get("detail") or {}).get("ticket_id")
                     for e in entries if e.get("event") == "team_run_start"}
    start = after or 0
    items = [_event_view(i, e, ticket_of_run) for i, e in enumerate(entries[start:], start)]
    if run_id:
        items = [x for x in items if x["run_id"] == run_id]
    if ticket_id is not None:
        items = [x for x in items if x["ticket_id"] == ticket_id]
    if agent:
        items = [x for x in items if x["agent"] == agent]
    return {"events": items[-limit:], "next_after": len(entries), "total_entries": len(entries)}


class ApprovalRequest(BaseModel):
    ticket_id: int
    kind: Literal["invoice", "rent", "purchase"]
    run_id: str = Field(min_length=1, max_length=64,
                        description="The finished agent run on this ticket that prepared the action")
    approved_by: str = Field(min_length=1, max_length=80, description="The human who clicked approve")
    qty: int | None = Field(None, ge=1, le=shop_db.MAX_PURCHASE_QTY, description="purchase only")
    vendor_id: int | None = Field(None, description="purchase only")
    expected_amount: float | None = Field(None, gt=0, description="The amount the human saw; must match")


@app.post("/api/approvals")
def approve(req: ApprovalRequest) -> dict:
    """A human approved a payment or purchase the agents prepared. The only route that moves cash.
    Amounts come from the database; the request only says which ticket and what kind."""
    audit = _audit()
    try:
        if not _run_was_completed(req.run_id, req.ticket_id):
            raise shop_db.ApprovalError(409, f"Run {req.run_id} is not a finished agent run on ticket "
                                             f"{req.ticket_id}. Run the agents first, then approve.")
        result = shop_db.approve(ticket_id=req.ticket_id, kind=req.kind, approved_by=req.approved_by,
                                 qty=req.qty, vendor_id=req.vendor_id,
                                 expected_amount=req.expected_amount)
    except shop_db.ApprovalError as exc:
        audit.append(run_id=req.run_id, event="approval_rejected", agent="human",
                     detail={**req.model_dump(), "status": exc.status, "message": str(exc)})
        raise HTTPException(exc.status, str(exc))
    message = (f"{req.approved_by} approved {req.kind} of ${result['amount']:,.2f} to {result['payee']} "
               f"for ticket {req.ticket_id}; checking ${result['balance_before']:,.2f} -> "
               f"${result['balance_after']:,.2f}.")
    audit.append(run_id=req.run_id, event="human_approval", agent="human",
                 detail={**result, "message": message})
    return {**result, "message": message}


@app.get("/api/cash")
def cash() -> dict:
    """The current checking balance from cash_accounts and the payments made so far."""
    try:
        return shop_db.cash()
    except shop_db.ApprovalError as exc:
        raise HTTPException(exc.status, str(exc))


@app.post("/api/reset")
def reset() -> dict:
    """Restore data/campus_customs_new.db from data/campus_customs.db for a fresh run.
    The audit trail is NOT wiped; the reset itself is appended to it."""
    busy = _running()
    if busy:  # agents would be reading a database that changes under them
        raise HTTPException(409, f"Run {busy['run_id']} is still going; reset after it finishes.")
    result = shop_db.reset_db()
    RUNS.clear()  # a fresh desk: earlier runs no longer count for approvals
    message = (f"Database reset from {result['restored_from']}; checking ${result['checking_balance']:,.2f}, "
               f"tickets " + ", ".join(f"{t['id']} {t['status']}" for t in result["tickets"]) + ".")
    _audit().append(run_id=f"reset-{uuid.uuid4().hex[:8]}", event="db_reset", agent="human",
                    detail={**result, "message": message})
    return {**result, "message": message}


# ------------------------------------------------------------------ command line
def show(result: TeamResult) -> None:
    r = result.reply
    print(f"\n=== Final reply from {r.agent} (model {result.model}) ===")
    print(r.summary)
    for title, items in (("Facts", r.facts), ("Proposed actions", r.proposed_actions),
                         ("Open questions", r.open_questions)):
        if items:
            print(f"\n{title}:")
            print("\n".join(f"  - {item}" for item in items))
    print(f"\nNeeds human approval: {'YES' if r.needs_human_approval else 'no'}")
    print(f"\n=== Delegations ({len(result.delegations)}) ===")
    for d in result.delegations:
        status = f"error: {d.error}" if d.error else (d.reply.summary if d.reply else "no reply")
        print(f"  [{d.depth}] {d.from_agent} -> {d.to_agent}: {d.task}\n      => {status}")
    print(f"\nModel requests: {result.model_requests}, tokens: {result.total_tokens}")
    print(f"Audit trail: output/audit_trail.json (run_id {result.run_id})")


def cli() -> int:
    parser = argparse.ArgumentParser(description="Campus Customs agent team")
    parser.add_argument("task", help="What the team should do, e.g. 'Handle ticket 101'")
    parser.add_argument("--start", choices=AGENT_NAMES, default="boss", help="Agent that receives the task")
    parser.add_argument("--json", action="store_true", help="Print the full result as JSON")
    args = parser.parse_args()
    try:
        result = asyncio.run(run_team(args.task, start=args.start))
    except TeamUnavailable as exc:
        print(f"Team unavailable: {exc}", file=sys.stderr)
        return 1
    if args.json:
        print(result.model_dump_json(indent=2))
    else:
        show(result)
    return 0


if __name__ == "__main__":
    sys.exit(cli())
