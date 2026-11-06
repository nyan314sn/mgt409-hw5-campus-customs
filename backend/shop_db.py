"""Database access for the FastAPI backend (the human side of the desk). Agents never use this.

Agents read shop facts only through the MCP server, which opens the database read-only, and
they can only *propose* actions. This module is what the dashboard calls:
- read the tickets and the checking balance for the board,
- carry out a payment or purchase AFTER a human clicks approve (the only code that moves cash),
- reset the working copy (data/campus_customs_new.db) from the untouched original.

Every amount is taken from the database, never from the request: the human approves *what*
(which ticket, which kind of payment) and the server looks up *how much*.
"""
from __future__ import annotations

import calendar
import sqlite3
from contextlib import closing
from datetime import date, timedelta
from pathlib import Path

from settings import ORIGINAL_DB, WORKING_DB

ACCOUNT = "checking"
MAX_PURCHASE_QTY = 500


class ApprovalError(Exception):
    """An approval that must not go through. `status` is the HTTP status to return."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _connect(path: Path | None = None, readonly: bool = False) -> sqlite3.Connection:
    path = Path(path or WORKING_DB)
    if readonly:
        con = sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True, timeout=10)
    else:
        con = sqlite3.connect(path, timeout=10, isolation_level=None)  # we manage transactions
    con.row_factory = sqlite3.Row
    return con


def _one(con: sqlite3.Connection, sql: str, args: tuple = ()) -> dict | None:
    row = con.execute(sql, args).fetchone()
    return dict(row) if row else None


def _ticket_view(row: dict) -> dict:
    return {**row, "resolved": row["status"] == "resolved"}


# ------------------------------------------------------------------ reads (for the board)
def list_tickets() -> list[dict]:
    with closing(_connect(readonly=True)) as con:
        return [_ticket_view(dict(r)) for r in con.execute("SELECT * FROM tickets ORDER BY id")]


def get_ticket(ticket_id: int) -> dict | None:
    with closing(_connect(readonly=True)) as con:
        row = _one(con, "SELECT * FROM tickets WHERE id = ?", (ticket_id,))
    return _ticket_view(row) if row else None


def resolve_ticket(ticket_id: int) -> None:
    """Mark a ticket resolved (called when the agent team finishes a run on it)."""
    with closing(_connect()) as con:
        con.execute("UPDATE tickets SET status = 'resolved' WHERE id = ? AND status = 'open'", (ticket_id,))


def _rent_paid_this_cycle(con: sqlite3.Connection, lease: dict) -> bool:
    """True if rent on this lease was already paid for the cycle ending at next_due."""
    cycle_start = _add_month(lease["next_due"], -1)
    return con.execute("SELECT 1 FROM payments WHERE kind = 'rent' AND ref_id = ? AND paid_at >= ?",
                       (lease["id"], cycle_start)).fetchone() is not None


def _purchase_done(con: sqlite3.Connection, ticket_id: int) -> bool:
    return con.execute("SELECT 1 FROM payments WHERE kind = 'purchase' AND ref_id = ?",
                       (ticket_id,)).fetchone() is not None


def approval_options(ticket_id: int) -> dict | None:
    """What a human could approve for this ticket, with every amount taken from the database.
    invoice: the ticket's linked invoice. rent: the ticket's linked lease.
    purchase: a restock of the shortfall, offered only when the ticket's SKU/size can't be filled
    from the shelf and no invoice is already covering a reprint."""
    with closing(_connect(readonly=True)) as con:
        ticket = _one(con, "SELECT * FROM tickets WHERE id = ?", (ticket_id,))
        if ticket is None:
            return None
        balance = _one(con, "SELECT balance FROM cash_accounts WHERE name = ?", (ACCOUNT,))["balance"]
        options: list[dict] = []
        if ticket["invoice_id"] is not None:
            inv = _one(con, "SELECT i.*, v.name AS vendor_name FROM invoices i "
                            "JOIN vendors v ON v.id = i.vendor_id WHERE i.id = ?", (ticket["invoice_id"],))
            if inv:
                options.append({"kind": "invoice", "title": f"Pay invoice {inv['id']}", "payee": inv["vendor_name"],
                                "amount": inv["amount"], "detail": f"{inv['description']} · due {inv['due_date']}",
                                "done": inv["status"] != "open",
                                "done_reason": f"Invoice is {inv['status']}" if inv["status"] != "open" else None})
        if ticket["lease_id"] is not None:
            lease = _one(con, "SELECT * FROM leases WHERE id = ?", (ticket["lease_id"],))
            if lease:
                paid = _rent_paid_this_cycle(con, lease)
                options.append({"kind": "rent", "title": f"Pay rent · lease {lease['id']}", "payee": lease["landlord"],
                                "amount": lease["monthly_rent"],
                                "detail": f"{lease['space_name']} · due {lease['next_due']}",
                                "done": paid, "done_reason": "Rent for this cycle is already paid" if paid else None})
        if ticket["sku"] and ticket["invoice_id"] is None:
            stock = _one(con, "SELECT qty FROM inventory WHERE sku = ? AND size = ?", (ticket["sku"], ticket["size"]))
            on_shelf = stock["qty"] if stock else 0
            shortfall = max((ticket["qty"] or 0) - on_shelf, 0)
            price = _one(con, "SELECT * FROM pricing WHERE sku = ?", (ticket["sku"],))
            if shortfall > 0 and price:
                vendors = [dict(r) for r in con.execute("SELECT * FROM vendors ORDER BY id")]
                default = next((v for v in vendors if "apparel" in v["specialty"].lower()), vendors[0])
                done = _purchase_done(con, ticket_id)
                options.append({"kind": "purchase", "title": f"Restock {ticket['sku']} size {ticket['size']}",
                                "payee": default["name"], "amount": round(price["unit_cost"] * shortfall, 2),
                                "detail": f"{on_shelf} on shelf, {ticket['qty']} wanted · short {shortfall}",
                                "qty": shortfall, "unit_cost": price["unit_cost"], "vendors": vendors,
                                "vendor_id": default["id"], "done": done,
                                "done_reason": "A purchase for this ticket is already approved" if done else None})
    return {"ticket_id": ticket_id, "balance": balance, "options": options}


def cash() -> dict:
    """The checking balance from cash_accounts, plus every payment recorded so far."""
    with closing(_connect(readonly=True)) as con:
        acct = _one(con, "SELECT * FROM cash_accounts WHERE name = ?", (ACCOUNT,))
        payments = [dict(r) for r in con.execute("SELECT * FROM payments ORDER BY id")]
        today = _one(con, "SELECT date_today FROM desk")
    if acct is None:
        raise ApprovalError(500, f"No '{ACCOUNT}' row in cash_accounts.")
    return {"account": acct["name"], "balance": acct["balance"], "as_of": acct["date"],
            "shop_date": today["date_today"] if today else None, "payments": payments}


# ------------------------------------------------------------------ the one write path for money
def _add_month(iso_day: str, months: int = 1) -> str:
    d = date.fromisoformat(iso_day)
    total = d.year * 12 + d.month - 1 + months
    year, month = divmod(total, 12)
    month += 1
    return d.replace(year=year, month=month,
                     day=min(d.day, calendar.monthrange(year, month)[1])).isoformat()


def approve(*, ticket_id: int, kind: str, approved_by: str, qty: int | None = None,
            vendor_id: int | None = None, expected_amount: float | None = None) -> dict:
    """Carry out a human-approved payment in one transaction.

    kind = "invoice":  pay the vendor invoice linked to the ticket; marks the invoice paid.
    kind = "rent":     pay this cycle's rent on the lease linked to the ticket, to the landlord on file.
    kind = "purchase": buy `qty` units of the ticket's SKU from `vendor_id` at the unit cost in
                       pricing. Stock is not added: it arrives after the vendor's lead_days.
    Refused (nothing changes) if the linked record is missing, it was already paid (invoice not
    open, rent already paid this cycle, purchase already approved for this ticket),
    `expected_amount` differs from the database amount, or cash would go negative.
    """
    with closing(_connect()) as con:
        con.execute("BEGIN IMMEDIATE")  # lock writers so the balance check and update are atomic
        try:
            ticket = _one(con, "SELECT * FROM tickets WHERE id = ?", (ticket_id,))
            if ticket is None:
                raise ApprovalError(404, f"Ticket {ticket_id} does not exist.")
            shop_date = _one(con, "SELECT date_today FROM desk")["date_today"]
            effect: dict = {}

            if kind == "invoice":
                if ticket["invoice_id"] is None:
                    raise ApprovalError(400, f"Ticket {ticket_id} has no linked invoice.")
                inv = _one(con, "SELECT i.*, v.name AS vendor_name FROM invoices i "
                                "JOIN vendors v ON v.id = i.vendor_id WHERE i.id = ?", (ticket["invoice_id"],))
                if inv is None:
                    raise ApprovalError(404, f"Invoice {ticket['invoice_id']} does not exist.")
                if inv["status"] != "open":
                    raise ApprovalError(409, f"Invoice {inv['id']} is already {inv['status']}.")
                amount, ref_id = inv["amount"], inv["id"]
                payee = inv["vendor_name"]
                effect = {"invoice_id": inv["id"], "invoice_status": "paid"}

            elif kind == "rent":
                if ticket["lease_id"] is None:
                    raise ApprovalError(400, f"Ticket {ticket_id} has no linked lease.")
                lease = _one(con, "SELECT * FROM leases WHERE id = ?", (ticket["lease_id"],))
                if lease is None:
                    raise ApprovalError(404, f"Lease {ticket['lease_id']} does not exist.")
                if _rent_paid_this_cycle(con, lease):
                    raise ApprovalError(409, f"Rent on lease {lease['id']} due {lease['next_due']} is already paid.")
                amount, ref_id = lease["monthly_rent"], lease["id"]
                payee = lease["landlord"]  # always the landlord on file, never details from an email
                effect = {"lease_id": lease["id"], "paid_for_due_date": lease["next_due"]}

            elif kind == "purchase":
                if not ticket["sku"]:
                    raise ApprovalError(400, f"Ticket {ticket_id} has no SKU to purchase.")
                if _purchase_done(con, ticket_id):
                    raise ApprovalError(409, f"A purchase for ticket {ticket_id} is already approved.")
                if qty is None or not 1 <= qty <= MAX_PURCHASE_QTY:
                    raise ApprovalError(400, f"A purchase needs qty between 1 and {MAX_PURCHASE_QTY}.")
                if vendor_id is None:
                    raise ApprovalError(400, "A purchase needs vendor_id (see the vendors table).")
                vendor = _one(con, "SELECT * FROM vendors WHERE id = ?", (vendor_id,))
                if vendor is None:
                    raise ApprovalError(404, f"Vendor {vendor_id} does not exist.")
                price = _one(con, "SELECT * FROM pricing WHERE sku = ?", (ticket["sku"],))
                if price is None:
                    raise ApprovalError(404, f"No pricing row for {ticket['sku']}.")
                amount, ref_id = round(price["unit_cost"] * qty, 2), ticket_id
                payee = vendor["name"]
                effect = {"sku": ticket["sku"], "size": ticket["size"], "qty": qty,
                          "unit_cost": price["unit_cost"], "vendor_lead_days": vendor["lead_days"],
                          "expected_arrival": (date.fromisoformat(shop_date)
                                               + timedelta(days=vendor["lead_days"])).isoformat(),
                          "note": "Stock is not added until the order arrives."}
            else:
                raise ApprovalError(400, f"Unknown kind '{kind}'. Use invoice, rent or purchase.")

            if expected_amount is not None and abs(expected_amount - amount) > 0.005:
                raise ApprovalError(409, f"The amount shown (${expected_amount:,.2f}) does not match "
                                         f"the database amount (${amount:,.2f}). Nothing was paid.")
            acct = _one(con, "SELECT * FROM cash_accounts WHERE name = ?", (ACCOUNT,))
            before = acct["balance"]
            if before < amount:
                raise ApprovalError(409, f"Not enough cash: {ACCOUNT} has ${before:,.2f}, "
                                         f"payment is ${amount:,.2f}. Nothing was paid.")

            con.execute("UPDATE cash_accounts SET balance = balance - ?, date = ? WHERE name = ?",
                        (amount, shop_date, ACCOUNT))
            cur = con.execute("INSERT INTO payments (kind, ref_id, amount, account, paid_at, approved_by) "
                              "VALUES (?, ?, ?, ?, ?, ?)", (kind, ref_id, amount, ACCOUNT, shop_date, approved_by))
            if kind == "invoice":
                con.execute("UPDATE invoices SET status = 'paid' WHERE id = ?", (ref_id,))
            after = _one(con, "SELECT balance FROM cash_accounts WHERE name = ?", (ACCOUNT,))["balance"]
            con.execute("COMMIT")
        except BaseException:
            con.execute("ROLLBACK")
            raise
    return {"payment_id": cur.lastrowid, "ticket_id": ticket_id, "kind": kind, "ref_id": ref_id,
            "payee": payee, "amount": amount, "account": ACCOUNT, "paid_at": shop_date,
            "approved_by": approved_by, "balance_before": before, "balance_after": after, "effect": effect}


# ------------------------------------------------------------------ reset
def reset_db() -> dict:
    """Copy the original database over the working copy (SQLite backup API, one step)."""
    with closing(_connect(ORIGINAL_DB, readonly=True)) as src, closing(sqlite3.connect(WORKING_DB)) as dst:
        src.backup(dst)
    return {"restored_from": ORIGINAL_DB.name, "working_db": WORKING_DB.name,
            "tickets": [{"id": t["id"], "status": t["status"]} for t in list_tickets()],
            "checking_balance": cash()["balance"]}
