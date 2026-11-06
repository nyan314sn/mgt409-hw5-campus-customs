// The five agents. Each has its own color AND shape, so they stay distinguishable
// without relying on color alone. `callsign` is the label shown on the board.

export const AGENT_IDS = ['boss', 'inventory', 'accounting', 'facilities', 'customer_service'] as const
export type AgentId = (typeof AGENT_IDS)[number]

export function isAgent(x: string | null | undefined): x is AgentId {
  return !!x && (AGENT_IDS as readonly string[]).includes(x)
}

export type GlyphShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'hex'

export interface CrewMember {
  callsign: string
  name: string
  post: string
  color: string
  glyph: GlyphShape
}

export const CREW: Record<AgentId, CrewMember> = {
  boss: { callsign: 'Boss', name: 'Boss', post: 'Routes the work and makes the final call', color: '#ff3d9a', glyph: 'circle' },
  inventory: { callsign: 'Inventory', name: 'Inventory', post: 'Shelf stock, sizes and suppliers', color: '#4fd1ff', glyph: 'square' },
  accounting: { callsign: 'Accounting', name: 'Accounting', post: 'Prices, invoices and cash', color: '#ffb547', glyph: 'triangle' },
  facilities: { callsign: 'Facilities', name: 'Facilities', post: 'The lease and rent', color: '#5fe3a1', glyph: 'diamond' },
  customer_service: { callsign: 'Customer Service', name: 'Customer Service', post: 'Drafts replies; the only voice to customers', color: '#b18cff', glyph: 'hex' },
}

export const TOOL_LABEL: Record<string, string> = {
  get_today: 'Shop clock',
  list_open_tickets: 'Ticket queue',
  get_ticket: 'Read ticket',
  check_inventory: 'Shelf scan',
  list_vendors: 'Vendor roster',
  get_pricing: 'Price sheet',
  calculate_quote: 'Quote calculator',
  get_invoice: 'Invoice lookup',
  get_cash_balance: 'Cash balance',
  check_cash_after_payments: 'Cash projection',
  list_payments: 'Payment history',
  get_lease: 'Lease lookup',
  delegate: 'Hand-off',
}

export const TICKET_TYPE: Record<string, string> = {
  customer_order: 'Customer order',
  rent_notice: 'Rent notice',
  price_override: 'Price override',
}

export function callsign(agent: string | null): string {
  if (isAgent(agent)) return CREW[agent].callsign
  if (agent === 'human') return 'Human'
  return 'System'
}

export function colorOf(agent: string | null): string {
  if (isAgent(agent)) return CREW[agent].color
  return agent === 'human' ? '#f3eef6' : '#8f86a0'
}
