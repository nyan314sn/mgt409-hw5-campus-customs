# Campus Customs: AI back-office desk (HW5)

A team of five AI agents (Boss, Inventory, Accounting, Facilities, Customer Service) works the shop's tickets. They read shop data **only** through a read-only MCP server. A FastAPI backend runs the team and records every step, and a React board lets a person watch the agents, read their summaries, and approve payments. Only a signed human approval moves cash.

Every agent uses `gpt-6-luna` through Portkey. The model is set once and can be changed with `OPENAI_MODEL`.

## Before you start (once)

1. **API key.** Put `PORTKEY_API_KEY=...` in a `.env` file. The app looks in this folder and its parent folders and never prints the key. `.env.example` lists the variable names.
2. **Python packages** (always use this interpreter):
   ```powershell
   C:\Users\Pi\miniconda3\python.exe -m pip install -r requirements.txt
   C:\Users\Pi\miniconda3\python.exe verify_env.py
   ```
3. **Board packages:**
   ```powershell
   cd frontend
   npm install
   ```

Run every command below from the `hw5` folder (the repository root) unless it says `cd`.

> **Cloning this on another machine?** Replace `C:\Users\Pi\miniconda3\python.exe` with your own Python 3.10+ (for example `python`). The app finds its files relative to the repository, so no paths need editing. `.mcp.json` holds this machine's paths and is only used by Claude Code.

## 1. Copy the original database to the working copy (when you need a clean run)

`data/campus_customs.db` is the original and is never changed. Everything works on the copy `data/campus_customs_new.db`. Copying the original over it puts back $3,400 in checking, three open tickets and no payments.

```powershell
Copy-Item data\campus_customs.db data\campus_customs_new.db -Force
```

Do this while the backend is **stopped**. While it's running, use the reset in step 5 instead, which does the same copy safely and records it in the audit trail.

## 2. Start the MCP server

You normally don't start it yourself. The agent team launches `mcp_server/server.py` automatically for each run, and Claude Code loads it from `.mcp.json`. To start it by hand, for example to check that it loads:

```powershell
C:\Users\Pi\miniconda3\python.exe mcp_server\server.py
```

It talks over stdio, so it sits silently waiting for a client. Press Ctrl+C to stop it. Its 12 read-only tools are listed in `mcp_server/README.md`.

## 3. Start the FastAPI backend (terminal 1)

```powershell
cd backend
C:\Users\Pi\miniconda3\python.exe -m uvicorn main:app --reload --port 8000
```

To check that it's up, open http://localhost:8000/api/health. It should show `"ok": true` and `"portkey_key_set": true`. Every route can be tried at http://localhost:8000/docs.

## 4. Start the React board (terminal 2)

```powershell
cd frontend
npm run dev
```

It opens http://localhost:5173 in your browser. Start the backend first; otherwise the board shows a red "Backend offline" banner. `?ticket=102` at the end of the address opens that ticket directly.

## 5. Full three-ticket run: reset the database first

1. **Reset.** Click **Reset database** on the board, or run:
   ```powershell
   Invoke-RestMethod -Method Post http://localhost:8000/api/reset
   ```
   The working copy is restored from the original, and a `db_reset` entry is added to `output/audit_trail.json`, which is never wiped.
2. **Note the starting balance** on the Cash gauge ($3,400.00).
3. **Run the tickets one at a time:** pick 101 and press **Run team**, then 102, then 103. Only one team run can go at a time, and each ticket is marked resolved when its run finishes.
4. **Decide each approval** in the Approvals panel after the run: enter your name under "Approved by", then **Approve → Confirm**, or **Hold**. Approving is the only thing that changes cash.
5. **Check the cash.** The Cash gauge, the payments list, and `cash_accounts` in `data/campus_customs_new.db` must agree.

After a run you've written up, avoid **Reset** and **Approve**. They change the working copy, and it will no longer match the numbers in `output/`.

## Command-line run (no board)

```powershell
cd backend
C:\Users\Pi\miniconda3\python.exe main.py "Handle ticket 101" --json
```

## Where things are

| Path | What it is |
|---|---|
| `mcp_server/server.py` | The read-only MCP server (12 tools) |
| `backend/main.py` | FastAPI routes and the command-line entry point |
| `backend/team.py`, `backend/*_agent.py`, `backend/prompts/*.md` | The five agents, their allowed tools and their prompts |
| `backend/shop_db.py` | Approvals and reset: the only code that writes the working database |
| `backend/audit.py` | Append-only audit trail |
| `frontend/` | The React + Vite + TypeScript board |
| `output/harness.md` | Tables, MCP tools, agents, API routes, dashboard, safety rules |
| `output/desk_tickets.html` | Expected vs. actual for each ticket, plus the Cash and Reflection tabs |
| `output/resolved_tickets.json`, `output/resolved_board.html` | Results of the full run, with board screenshots |
| `output/design.md` | How the board looks, and why |
| `output/audit_trail.json` | Every agent step, approval and reset |
| `AI_prompts.md` | Every prompt used, with EST timestamps |

## Safety in one paragraph

Keys come only from `.env` and are never printed. Agents can only look things up: every MCP tool is read-only. Only `POST /api/approvals` moves cash, and it needs a finished agent run and a named approver. It takes the amount from the database, and it refuses double payments and overdrafts. The original database is never written. Full details are in `output/harness.md`.
