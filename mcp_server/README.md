# Campus Customs MCP Server

## What it is for
This MCP server is the single toolbox every Campus Customs agent (Boss, Inventory, Accounting, Facilities, Customer Service) uses to look up shop data. Agents never query the database directly; they call these tools.

Each tool returns only what is in the database, or numbers computed directly from it. If a row does not exist, the tool returns `"found": false` with a message instead of guessing.

## Database
`data/campus_customs_new.db` — the working copy of the original `data/campus_customs.db`. The path is resolved relative to this folder, so the server works from any current directory. All tools open the database **read-only**; none can pay, change prices, move stock or contact anyone.

## Tools

| Tool | Inputs | Reads | Returns |
|---|---|---|---|
| `get_today` | — | `desk` | The shop's business date and desk notes |
| `list_open_tickets` | — | `tickets` | Open tickets: id, type, requester, subject, created_at |
| `get_ticket` | `ticket_id` | `tickets` | Every field of one ticket |
| `check_inventory` | `sku`, `size` | `inventory` | Item name, qty, location, `in_stock`, and the other sizes' stock |
| `list_vendors` | — | `vendors` | Vendor id, name, specialty, lead_days |
| `get_pricing` | `sku` | `pricing` | Unit cost and list price |
| `calculate_quote` | `sku`, `qty`, `proposed_unit_price` (optional) | `pricing` | Totals at list price and proposed price, discount %, margins, `below_cost` |
| `get_invoice` | `invoice_id` | `invoices`, `vendors`, `desk` | Invoice, its vendor, shop date, `days_overdue` |
| `get_cash_balance` | — | `cash_accounts` | Every account's balance and date |
| `check_cash_after_payments` | `account`, `amounts` | `cash_accounts` | Balance, payments total, remaining balance, `would_overdraw` (nothing is paid) |
| `list_payments` | `kind` (optional), `ref_id` (optional) | `payments` | Payments already recorded |
| `get_lease` | `lease_id` | `leases`, `desk` | Space, landlord, monthly rent, next due date, `days_until_due` |

Each agent is allowed only a subset of these tools (see `MCP_TOOLS` in `backend/<agent>_agent.py`).

## Running
Built with FastMCP (`fastmcp` package).
- **Claude Code:** loads the server from `.mcp.json` at the hw5 root.
- **Agent team:** starts the server itself over stdio.
- **By hand:**

```
C:\Users\Pi\miniconda3\python.exe mcp_server\server.py
```
