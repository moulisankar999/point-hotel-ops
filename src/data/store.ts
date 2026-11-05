import type { AppUser, Db, Role, Settings } from '../lib/types'

export type TableName =
  | 'room_types' | 'rooms' | 'room_blocks' | 'bookings' | 'payments' | 'alerts' | 'hk_tasks'
  | 'fixed_expenses' | 'expenses' | 'cash_counts'

/** Which Db collection each table maps to */
export const TABLE_KEY: Record<TableName, keyof Db> = {
  room_types: 'roomTypes', rooms: 'rooms', room_blocks: 'blocks', bookings: 'bookings', payments: 'payments', alerts: 'alerts',
  hk_tasks: 'hkTasks', fixed_expenses: 'fixedExpenses', expenses: 'expenses', cash_counts: 'cashCounts',
}

export interface NewUserInput {
  username: string
  fullName: string
  role: Role
  password: string
}

/**
 * Low-level persistence. There is intentionally NO delete: every record is kept,
 * cancellations/voids are status changes with a reason, and every write is audited.
 */
export interface Store {
  mode: 'demo' | 'supabase'
  /** true when the database itself raises check-in/out alerts (Supabase triggers) */
  serverAlerts: boolean
  signIn(username: string, password: string): Promise<AppUser>
  signOut(): Promise<void>
  restoreSession(): Promise<AppUser | null>
  loadAll(): Promise<Db>
  subscribe(onChange: (table: string, row?: unknown) => void): () => void
  insert<T extends { id: string }>(table: TableName, row: T, reason?: string | null): Promise<T>
  update<T extends { id: string }>(table: TableName, id: string, patch: Partial<T>, reason?: string | null): Promise<T>
  markAlertsRead(ids: string[]): Promise<void>
  createUser(input: NewUserInput): Promise<AppUser>
  updateUser(id: string, patch: Partial<Pick<AppUser, 'fullName' | 'role' | 'active'>>, reason?: string | null): Promise<AppUser>
  setPassword(userId: string, password: string): Promise<void>
  saveSettings(s: Settings): Promise<void>
  resetDemo?(): Promise<void>
}
