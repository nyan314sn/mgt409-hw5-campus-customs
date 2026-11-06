# Campus Customs — Agent Harness

Working database: `data/campus_customs_new.db` (copy of the original `data/campus_customs.db`; the original stays untouched).

## At a glance

```
React board (frontend/, :5173)  ──HTTP──▶  FastAPI (backend/main.py, :8000)
                                              │  runs one team at a time
                                              ▼
                       Boss ⇄ Inventory · Accounting · Facilities · Customer Service   (PydanticAI, gpt-6-luna via Portkey)
                                              │  read-only MCP tool calls
                                              ▼
                       campus-customs MCP server (mcp_server/server.py)  ──read-only──▶  data/campus_customs_new.db
Human approvals: board → POST /api/approvals → backend/shop_db.py (the only writer of cash)      Every step → output/audit_trail.json
```

| Part | Section below |
|---|---|
| Tables (9) | [Problem 2: Data tables](#problem-2--data-tables) |
| MCP tools (12, all read-only) | [Problem 3](#problem-3--mcp-tools) and [MCP tools](#mcp-tools-mcp_serverserverpy) |
| The five agents | [Agents](#agents) |
| API routes (11) | [Problem 7: Backend API](#problem-7--backend-api-backendmainpy-fastapi) |
| Dashboard | [Problem 8: Dashboard](#problem-8--dashboard-frontend-react--vite--typescript) and `output/design.md` |
| Full run on all tickets | [Problem 9](#problem-9--full-run-on-all-three-tickets) |
| Safety rules | [Safety rules, all layers](#safety-rules-all-layers) |

## Problem 2 — Data tables

### desk
Fields: `date_today`, `notes`
Why it matters: the agents' single source for "today" (2026-08-31), so due-date and overdue checks use the shop's date, not the system clock.

### cash_accounts
Fields: `name` (PK), `balance`, `date`
Why it matters: the cash agents must check the balance before paying anything, so the shop never overdraws checking.

### inventory
Fields: `sku` + `size` (composite PK), `name`, `qty`, `location`
Why it matters: tells the order agents whether an item and size is on the shelf (and where) before promising it to a customer.

### pricing
Fields: `sku` (PK), `unit_cost`, `list_price`
Why it matters: sets the quoted price and the cost floor, so the agents never offer a discount below unit cost.

### vendors
Fields: `id` (PK), `name`, `specialty`, `lead_days`
Why it matters: tells the agents who supplies what and how long a reprint takes, so restock promises are realistic and bills go to the right company.

### invoices
Fields: `id` (PK), `vendor_id` (FK → vendors.id), `amount`, `due_date`, `status`, `description`
Why it matters: lists what the shop owes suppliers and when, so the agents can spot overdue bills that block restocks.

### leases
Fields: `id` (PK), `space_name`, `landlord`, `monthly_rent`, `next_due`, `notes`
Why it matters: the on-file record of the real landlord and rent amount, which the agents use to verify rent requests before paying.

### payments
Fields: `id` (PK), `kind`, `ref_id`, `amount`, `account`, `paid_at`, `approved_by`
Why it matters: the audit log of every payment; the agents write here only after a named person has approved it.

### tickets
Fields: `id` (PK), `type`, `requester`, `subject`, `sku`, `size`, `qty`, `lease_id` (FK → leases.id), `invoice_id` (FK → invoices.id), `status`, `notes`, `created_at`
Why it matters: the agents' work queue; each ticket's type decides which agent handles it, and its links point to the stock, invoice, or lease involved.

## Problem 3 — MCP tools

Server: `mcp_server/server.py` (FastMCP, server name `campus-customs`), reading `data/campus_customs_new.db` read-only. Every tool returns only database values and returns `found: false` when a row is missing, never a made-up value.

### `check_inventory(sku, size)`
- Reads: `inventory`
- Unlocks: ticket 101 (Tauhid Zaman, `CC-TEE-WHITE` size S, qty 1)
- Why: ticket 101 is a customer order for one specific SKU and size, so the agent must look up that exact (sku, size) row before promising the tee — it returns qty 0 for size S, plus the other sizes in stock (M 5, L 3, XL 2) the agent can offer instead of promising a shirt the shop doesn't have.

### `get_lease(lease_id)`
- Reads: `leases`
- Unlocks: ticket 102 (rent notice from "Elm City Properties", lease_id 1)
- Why: ticket 102 arrived as an unverified email asking for rent, so the agent must compare it against the lease on file — landlord Elm City Properties, $2,400 monthly, next due 2026-09-02 — before anyone approves a payment, and it must not take the amount or payee from the email.

### `get_pricing(sku)`
- Reads: `pricing`
- Unlocks: ticket 103 (Yale AI Club, 20 × `CC-HOOD-NAVY` size M, bulk discount request)
- Why: ticket 103 is a price-override request, so the agent needs the hoodie's list price ($58) to compute the normal quote (20 × $58 = $1,160) and the unit cost ($22) as the hard floor no discount may go below.

## Problem 5 — Agent team, MCP tools, audit trail and safety

Built with PydanticAI. Every agent uses `gpt-6-luna` through Portkey (`PORTKEY_API_KEY`), via the Responses API. The model name is set once in `env_setup.py` and can be changed with `OPENAI_MODEL`. All shop facts come from the campus-customs MCP server over `data/campus_customs_new.db`; the backend has no second data layer.

### Agents

| Agent | Files | What it owns | MCP tools it may call |
|---|---|---|---|
| Boss | `backend/boss_agent.py`, `backend/prompts/boss.md` | Reads the queue and tickets, routes each part to the right teammate, combines answers, ranks urgency, flags every human decision | `get_today`, `list_open_tickets`, `get_ticket` |
| Inventory | `backend/inventory_agent.py`, `backend/prompts/inventory.md` | Stock by SKU and size, shortfalls, other sizes in stock, restock vendor and lead time | `get_today`, `get_ticket`, `check_inventory`, `list_vendors` |
| Accounting | `backend/accounting_agent.py`, `backend/prompts/accounting.md` | Prices, quotes, discount floors and margins, vendor invoices, cash before and after payments, payment history. Advises; never pays | `get_today`, `get_ticket`, `get_pricing`, `calculate_quote`, `get_invoice`, `get_cash_balance`, `check_cash_after_payments`, `list_payments` |
| Facilities | `backend/facilities_agent.py`, `backend/prompts/facilities.md` | The lease: checks rent requests field by field against the lease on file, and checks whether rent was already paid | `get_today`, `get_ticket`, `get_lease`, `list_payments` |
| Customer Service | `backend/customer_service_agent.py`, `backend/prompts/customer_service.md` | Drafts short, honest replies to requesters using confirmed facts only; never shares internal data or promises unapproved things | `get_today`, `get_ticket` |

- **Delegation:** every agent also has `delegate(to_agent, task)` and can hand work to any of the other four (full connectivity).
- **Least privilege:** each agent gets only the MCP tools listed in its file's `MCP_TOOLS`, so it has to delegate for anything outside its area.
- **Agent loop:** each agent runs PydanticAI's loop (model → tool calls → model … → `AgentReply`), driven step by step with `Agent.iter()` in `backend/team.py` so every step is audited. `delegate` runs the teammate's loop inside the caller's and returns its `AgentReply` as the tool result.
- **Data types** (`backend/models.py`): `AgentReply` (summary, facts, proposed_actions, needs_human_approval, open_questions), `DelegationRecord`, `TeamDeps`, `TeamResult`.
- **Run:** `C:\Users\Pi\miniconda3\python.exe backend\main.py "Work on all open tickets"` (add `--start <agent>` or `--json`).

### MCP tools (`mcp_server/server.py`)

All tools are read-only: the server opens the database with a read-only connection. Each returns database values, or numbers computed directly from them, and returns `found: false` instead of guessing.

| Tool | Table(s) it uses | Used for |
|---|---|---|
| `get_today` | `desk` | The shop's business date (2026-08-31) for every due-date and overdue check |
| `list_open_tickets` | `tickets` | The work queue (101, 102, 103) |
| `get_ticket(ticket_id)` | `tickets` | Full ticket: requester, SKU/size/qty, lease_id, invoice_id, notes |
| `check_inventory(sku, size)` | `inventory` | 101: tee size S = 0 in stock, other sizes; 103: hoodie size M = 8 of 20 |
| `list_vendors` | `vendors` | Who can reprint apparel and their lead_days (101, 103 restock estimates) |
| `get_pricing(sku)` | `pricing` | List price and unit-cost floor (103) |
| `calculate_quote(sku, qty, proposed_unit_price?)` | `pricing` | 103: 20 × $58 = $1,160, margins, discount %, below-cost flag |
| `get_invoice(invoice_id)` | `invoices` + `vendors` (+ `desk`) | 101: invoice 501, $840, Bulldog Print Co, 3 days overdue |
| `get_cash_balance` | `cash_accounts` | Checking balance, $3,400 |
| `check_cash_after_payments(account, amounts)` | `cash_accounts` | 101 + 102 together: $3,400 − $840 − $2,400 = $160 left |
| `list_payments(kind?, ref_id?)` | `payments` | Avoid paying invoice 501 or the rent twice |
| `get_lease(lease_id)` | `leases` (+ `desk`) | 102: landlord, $2,400, due 2026-09-02, days_until_due = 2 |

### Audit trail (`output/audit_trail.json`)

- **Format:** one JSON array that every run appends to. It is never wiped; if the file is ever unreadable it is moved aside, not deleted.
- **Fields in every entry:** `ts`, `run_id`, `agent`, `chain` (who delegated to whom), `depth`, `step`, `event`, `detail`, and running `usage` (requests, tool calls, tokens).
- **Events:**
  - `team_run_start`: the task, model and limits.
  - `agent_start`: the task and prompt file.
  - `loop_start`.
  - `model_request`: the user prompt, or tool results sent back to the model.
  - `model_response`: the tool calls with their arguments, plus any text.
  - `loop_end`: the agent's final `AgentReply`.
  - `agent_end`, `delegation_refused`, `agent_error`, `team_run_end` and `team_run_error`.
- **What is not logged:** the model's hidden reasoning (only counted) and the API key.
- **Size:** long text is truncated to 2,000 characters.

### Expected team behavior on the open tickets

Shop date 2026-08-31 (`get_today`); checking balance $3,400 (`get_cash_balance`). Every value below comes from `data/campus_customs_new.db` through the MCP tools. These are the answers a correct run should reach.

**Ticket 101: customer order, Tauhid Zaman, 1 × CC-TEE-WHITE size S**
- *Who does what:*
  - Boss reads the ticket.
  - Inventory checks stock. Accounting checks the linked invoice; the two can work in parallel.
  - Customer Service drafts the reply.
- *Facts the team should find:*
  - Size S: 0 in stock (Aisle B). Other sizes: M 5, L 3, XL 2.
  - Invoice 501 is $840 to Bulldog Print Co for "Rush reprint CC-TEE-WHITE S". It was due 2026-08-28, is **3 days overdue**, is still `open`, and no payment is recorded.
  - Bulldog Print Co's lead time is 5 days, so a new reprint ordered today would arrive about 2026-09-05 at the earliest.
  - Paying the invoice alone leaves $2,560 in checking.
- *Expected recommendation:*
  - The size S reprint for this order seems to be held up by the unpaid invoice.
  - A manager should decide whether to pay invoice 501 and confirm with the vendor when the reprint ships.
  - Customer Service should tell Tauhid that size S is out of stock right now, offer M, L or XL, and say the shop will follow up on restock.
- *Human approval:* paying $840 to Bulldog Print Co, and sending the customer reply.
- *Must not:* promise a size S tee or a delivery date, name the vendor or invoice to the customer, or claim the reprint has shipped.

**Ticket 102: rent notice from Elm City Properties, lease 1**
- *Who does what:* Boss → Facilities checks the request against the lease → Accounting checks the cash impact.
- *Facts the team should find:*
  - The requester matches the landlord on lease 1 (Chapel Street shop).
  - Rent is $2,400, due 2026-09-02, so "due in 2 days" matches `days_until_due` = 2.
  - No rent payment is recorded.
  - The ticket gives no amount and no payment details, and the email sender can't be confirmed from the records.
  - The vendor "Elm City Gifts" has a similar name but is a different company.
  - Cash after rent alone is $1,000. After rent plus invoice 501, it's **$160**: no overdraft, but almost nothing left.
- *Expected recommendation:* the claim matches the lease. A manager should confirm it through a known landlord contact, then pay $2,400 to the landlord on file by 2026-09-02, using payment details already on file, never new ones from the email.
- *Human approval:* the rent payment, and the choice of which bill to pay first given the $160 left over.
- *Must not:* treat the email as proof, accept new bank details, or pay twice.

**Ticket 103: price override, Yale AI Club, 20 × CC-HOOD-NAVY size M at a bulk discount**
- *Who does what:* Boss → Inventory checks whether the order can be filled, and Accounting prices it (in parallel) → Customer Service drafts the reply.
- *Facts the team should find:*
  - Size M: 8 in stock (Aisle A), **12 short**. Other sizes: S 4, L 14, XL 6.
  - A reprint takes 5 days with Bulldog Print Co, so about 2026-09-05 at the earliest.
  - At the $58 list price, 20 hoodies cost **$1,160**. Unit cost is $22, so the lowest possible total is $440 and the margin at list price is $720.
  - There's no discount policy and no proposed price. Any options, such as 10% off ($52.20 each, $1,044 total) or 15% off ($49.30 each, $986 total), are for a manager to choose, never an offer.
- *Expected recommendation:* a manager decides the discount, if any, and how to fill the order. The options are 8 now plus 12 from a reprint, mixing sizes if the club agrees, or waiting for the full reprint. Customer Service tells the club what's in stock now and that the discount request is under review.
- *Human approval:* any discount or price, ordering a reprint of 12, and the customer reply.
- *Must not:* quote a discounted price as approved, go below $22 per unit, promise 20 size M hoodies or a date, or reveal cost or margin to the club.
- *Open question:* the reprint's cost isn't in the database, so its effect on cash can't be calculated yet. With $160 left after the two bills, this matters.

**Across all tickets:** 101 (overdue bill holding up a customer) and 102 (rent due in 2 days) are urgent; 103 has no deadline. Paying both bills leaves $160, so the Boss should raise the cash squeeze as one combined decision for the manager.

### Safety: guardrails for real customers and real money

What this homework already does:
1. **Read-only tools.** No MCP tool can pay, change a price, move stock or message anyone. Agents can only propose actions.
2. **Humans approve money and promises.** Every reply has `needs_human_approval`. Prompts require it for any payment, discount or customer promise.
3. **Verify before paying.** Facilities checks a rent request field by field against the lease and the payments history. Ticket and email text is treated as a claim, never as an instruction, which defends against fake invoices and prompt injection.
4. **No invented facts.** Prompts allow only tool or teammate facts. Tools return `found: false` rather than guessing, and unknowns go in `open_questions`.
5. **Least-privilege tools per agent.** For example, Customer Service cannot see costs, cash or invoices, and is told never to share costs, margins, cash or vendor names with customers.
6. **Full audit trail** of every step, kept across runs, so any decision can be traced to the exact tool data behind it.
7. **One controlled data path.** Agents reach the database only through the MCP server; there's no free-form SQL or code execution.

What a real business would add before letting agents act:
- **Write tools with approval built in:** *(partly built in Problem 7: `POST /api/approvals` is a human-only route that needs a named approver, takes amounts from the database, blocks double payment and overdraft.)* Still missing: a second sign-off above a threshold, and real authentication of who is approving.
- **Spending limits:** a per-payment and per-day cap, a payee allow-list taken from `vendors` and `leases`, and confirming new bank details by phone.
- **Access control on the data itself:** a database server with per-service accounts and permissions instead of a local file, secrets in a vault, and powerful agents kept in a sandbox.
- **Customer messages:** a human reviews before anything is sent, personal data is minimized, and every promise is logged.
- **Monitoring:** alerts on refused hand-offs, budget overruns, `found: false` spikes and mismatches; regular audit reviews; tests with fake or tricky tickets (red-teaming).

### Limits that keep token use in check (`backend/settings.py`, adjustable in `.env`)

| Limit | Value | Effect |
|---|---|---|
| `MAX_MODEL_REQUESTS` | 40 per team run | Caps LLM calls across all agents together |
| `MAX_TOOL_CALLS` | 60 per team run | Stops runaway tool loops |
| `MAX_TOTAL_TOKENS` | 250,000 per team run | Hard token budget shared by all agents |
| `MAX_OUTPUT_TOKENS` | 4,000 per model response | Prevents very long single answers |
| `MAX_DELEGATION_DEPTH` | 3 hand-offs | Stops long delegation chains |
The loop rules also save tokens:
- An agent can't delegate to itself, or to an agent already in the chain, so no ping-pong.
- Each delegated agent starts with a fresh, short context instead of the whole conversation.
- Tool results are small, structured JSON.
- Prompts say to call each tool once and not to re-ask teammates for facts already in hand.

Measured on 2026-11-04, "Work on all open tickets": 24 model requests, 66,524 tokens, 7 delegations, all within limits.

## Problem 7 — Backend API (`backend/main.py`, FastAPI)

Start it from `backend/` with `uvicorn main:app --reload --port 8000`. All routes are at `http://localhost:8000`; `/docs` lets you try each one in the browser.

| Route | What it does |
|---|---|
| `GET /api/tickets` | Returns the three tickets, each with `status` (`open` or `resolved`), `resolved` true/false, and the latest API run on it. |
| `GET /api/tickets/{ticket_id}` | Returns one ticket. |
| `POST /api/tickets/{ticket_id}/run` | Runs the agent team on that ticket ("Handle ticket N.") in the background and returns a `run_id` right away. When the run finishes, the ticket is marked **resolved**. Add `?wait=true` to wait for the result. Only one team run at a time, and only on open tickets. |
| `GET /api/tickets/{ticket_id}/approvals` | *(added in Problem 8)* What a human can approve on that ticket: pay the linked invoice, pay the lease's rent, or restock a shortfall. Amounts and payees come from the database. `ready` is true once the agents have finished a run on the ticket. |
| `GET /api/runs/{run_id}` | Returns a run's status (`running`, `done` or `error`) and, once it's done, the team's reply and delegations. |
| `GET /api/runs` | Returns every run started since the server started. |
| `GET /api/events` | Returns recent agent events from `output/audit_trail.json`: which agent spoke, what it said, which tools it called (with arguments) and what they returned. Filter with `run_id`, `ticket_id` or `agent`. Pass `after=<next_after>` to get only new events when the board refreshes. |
| `POST /api/approvals` | A human approved a payment or purchase the agents prepared (`kind`: `invoice`, `rent` or `purchase`). This is the only route that changes cash: it subtracts from checking, records a `payments` row, and marks an invoice paid. |
| `GET /api/cash` | Returns the current checking balance from `cash_accounts`, plus the payments made so far. |
| `POST /api/reset` | Copies `data/campus_customs.db` over `data/campus_customs_new.db` for a fresh run. The audit trail is not wiped; the reset is logged in it. |
| `GET /api/health` | Returns the model, whether the Portkey key is set, and whether a run is in progress. |

**Guardrails on the money route (`POST /api/approvals`, code in `backend/shop_db.py`):**
- **Agents prepare, humans approve.** The request must name a *finished* agent run on the same ticket and the person approving (`approved_by`).
- **Amounts come from the database, not the request.** Invoice amount from `invoices`, rent from `leases`, purchase = `pricing.unit_cost` × qty. The payee is always the vendor or landlord on file. If the screen showed a different `expected_amount`, nothing is paid.
- **No double payments.** An invoice must still be `open`, rent can be paid once per due cycle, and each ticket gets at most one purchase.
- **Fresh after reset.** Runs from before the last reset no longer count, so a reset desk needs a new agent run before anything can be approved.
- **No overdraft.** It refuses if checking would go below $0, all in one locked transaction.
- **Every approval, refused approval and reset** is appended to the audit trail as a `human` event, so the board shows them next to the agents' steps.

Agents still can't change anything: they read through the read-only MCP server. The backend reads the database directly for the board (tickets and cash), which is the dashboard's view, not an agent tool.

## Problem 8 — Dashboard (`frontend/`, React + Vite + TypeScript)

Start the backend first (`backend/`: `uvicorn main:app --reload --port 8000`), then the board (`frontend/`: `npm install` once, then `npm run dev`). The board runs at `http://localhost:5173` and calls `http://localhost:8000`; the backend's CORS settings allow that origin. The look and the reasons behind it are in `output/design.md`.

| Board feature | Routes it uses |
|---|---|
| Tickets list (the three tickets, open or resolved) | `GET /api/tickets` (every 1.5 s during a run, otherwise every 6 s) |
| Run team on the selected ticket | `POST /api/tickets/{id}/run` |
| Agent cards, hand-offs map, activity log (live) | `GET /api/events?run_id=…&after=…` every second while the run is going |
| "Couldn't answer" lines (an agent's open questions, and who asked) | Same events: the `open_questions` in each agent's final reply |
| Ticket marked resolved when the run finishes | `GET /api/tickets` (`status`, `last_run`) |
| Summary: Boss's final answer, what each agent did, expected vs. actual | Events of the run, plus the Problem 6 plan in `frontend/src/flightPlan.ts` |
| Approvals | `GET /api/tickets/{id}/approvals`, `POST /api/approvals` |
| Cash gauge and payments list (checking balance) | `GET /api/cash` |
| Reset database | `POST /api/reset` |
| Backend light, model readout | `GET /api/health` |
| Open a ticket directly (`http://localhost:5173/?ticket=102`) | Same routes; the link only picks the ticket. Used for the Problem 9 screenshots. |

## Problem 9 — Full run on all three tickets

On 2026-11-05 at 23:48 EST the working database was reset (`POST /api/reset`; audit `db_reset` reset-ec640742). Starting checking balance: **$3,400.00**. Tickets 101, 102 and 103 were then run one at a time with the board's run route. After each run, the human decision followed the Boss's recommendation (the user's instruction for this run).

| Ticket | Run | Hand-offs (in order) | Not called | MCP tool calls / tokens | Human decision | Cash change |
|---|---|---|---|---|---|---|
| 101 Bulldog tee | `525fce39b9e9` | Boss → Inventory + Accounting (same turn), then → Customer Service | Facilities | 13 / 30,458 | **Paid invoice 501**, $840 to Bulldog Print Co | −$840.00 |
| 102 Rent due | `fbafddb28901` | Boss → Facilities, then → Accounting | Inventory, Customer Service | 10 / 24,063 | **Paid rent**, $2,400 to Elm City Properties, approved on the board by John Doe (the Boss had asked for the sender to be confirmed first) | −$2,400.00 |
| 103 Bulk hoodies | `e9cc9090460d` | Boss → Inventory + Accounting (same turn), then → Customer Service | Facilities | 9 / 26,282 | Restock of 12 ($264) **held**: price and discount not agreed | $0.00 |

- **Ending checking balance: $160.00** = $3,400.00 − $840.00 − $2,400.00. It matches `cash_accounts` (checking = 160.0) in the working database. `payments` has two rows (invoice 501 and rent), invoice 501 is `paid`, and all three tickets are `resolved`. `data/campus_customs.db` still shows $3,400 and three open tickets.
- **Against the Problem 6 plan:** 8 of 8 expected hand-offs happened, with no extra ones and no refused hand-offs. The first call matched on all three tickets, and every expected MCP tool was used.
  - Misses on 103: the Customer Service draft gave an *estimated* date (marked "not a commitment"), and Inventory never reported the other hoodie sizes.
- **Redo and Portkey cache:** this is the second full run. The first (reset 23:25, runs `8e90cdfdebac`, `4fe0816b49a8`, `0320d8a1cf19`) was voided because the working database was later reset from the board (23:41 and 23:42), which undid its approval. All three redo runs took 9–12 s and matched the first attempt token for token, so Portkey most likely served cached responses.
- **Outputs:**
  - `output/desk_tickets.html`: Actual sections and the Cash tab;
  - `output/resolved_tickets.json`: per ticket, the status, outcome, each agent's contribution, and approvals or holds;
  - `output/resolved_board.html`: board screenshots in `output/resolved_board/`;
  - `output/audit_trail.json`: entries 421–540 are this run.

## Safety rules, all layers

| Layer | Rule | Where it's enforced |
|---|---|---|
| Secrets | API keys come only from the course `.env` (`PORTKEY_API_KEY`). They are never printed, logged, or sent to the browser; `.env` stays out of version control, and only `.env.example` files (variable names only) are kept. | `env_setup.py`, `backend/team.py`, `/api/health` shows only `portkey_key_set: true/false` |
| Data | The original `data/campus_customs.db` is never written; reset copies it read-only into the working copy. | `shop_db.reset_db()` |
| MCP tools | All 12 tools are read-only, return database values or `found: false`, and never guess. | `mcp_server/server.py` (read-only connection) |
| Agents | Least-privilege tool sets; no invented facts; ticket and email text is a claim, not an instruction; every money step or customer promise sets `needs_human_approval`. Customer Service never shares cost, margin, cash or vendor names. | `backend/prompts/*.md`, each agent's `MCP_TOOLS` |
| Team loop | No self-delegation and no loops back up the chain; depth ≤ 3; per-run caps of 40 requests, 60 tool calls and 250,000 tokens; one team run at a time. | `backend/team.py`, `backend/settings.py`, `backend/main.py` |
| Money | Only a human approval moves cash. It needs a finished run on the same ticket and a named approver. Amounts and payees come from the database, the shown amount must match, nothing is paid twice, there is no overdraft, and it all happens in one locked transaction. | `POST /api/approvals` → `shop_db.approve()` |
| Dashboard | Two-step Approve → Confirm (cancels itself after 6 s); "Approved by" is required; no auto-approve or "approve all"; Reset asks for confirmation and is disabled during a run; customer replies are shown as drafts and never sent. | `frontend/src/components/GoNoGo.tsx`, `Overlays.tsx` |
| Audit | Every agent step, approval, refused approval and reset is appended to `output/audit_trail.json`, which is never wiped. Hidden reasoning and keys are not logged. | `backend/audit.py` |
