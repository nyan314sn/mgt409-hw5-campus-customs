// The expected plan for each ticket, written before running the agents (Problem 6,
// output/desk_tickets.html). The debrief compares it with what the agents actually did.
import type { AgentId } from './crew'

export interface FlightPlan {
  first: string
  why: string
  handoffs: { from: AgentId; to: AgentId; note: string }[]
  tools: string[]
  notCalled: AgentId[]
}

export const FLIGHT_PLAN: Record<number, FlightPlan> = {
  101: {
    first: 'Inventory first, Accounting in the same turn',
    why: 'Everything hinges on whether a size S tee is on the shelf; the linked invoice can be checked in parallel.',
    handoffs: [
      { from: 'boss', to: 'inventory', note: 'Is size S in stock? Other sizes? Restock lead time?' },
      { from: 'boss', to: 'accounting', note: 'Invoice 501 status, days overdue, cash after paying' },
      { from: 'boss', to: 'customer_service', note: 'Draft a reply from confirmed facts, no date promised' },
    ],
    tools: ['get_today', 'get_ticket', 'check_inventory', 'list_vendors', 'get_invoice', 'list_payments', 'check_cash_after_payments'],
    notCalled: ['facilities'],
  },
  102: {
    first: 'Facilities first, alone',
    why: 'A rent email is a claim; verify it against the lease before anyone thinks about money.',
    handoffs: [
      { from: 'boss', to: 'facilities', note: 'Does the email match lease 1? Already paid?' },
      { from: 'boss', to: 'accounting', note: 'Cash left after $2,400 rent' },
    ],
    tools: ['get_today', 'get_ticket', 'get_lease', 'list_payments', 'check_cash_after_payments'],
    notCalled: ['inventory', 'customer_service'],
  },
  103: {
    first: 'Inventory first, Accounting in the same turn',
    why: 'A discount only matters if the order can be filled; the quote needs only SKU and quantity.',
    handoffs: [
      { from: 'boss', to: 'inventory', note: 'Can we fill 20 × size M? Shortfall?' },
      { from: 'boss', to: 'accounting', note: 'Quote 20 at list, cost floor, margin' },
      { from: 'boss', to: 'customer_service', note: 'Reply to the club, no discount promised' },
    ],
    tools: ['get_today', 'get_ticket', 'check_inventory', 'list_vendors', 'calculate_quote'],
    notCalled: ['facilities'],
  },
}
