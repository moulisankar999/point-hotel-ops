import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AppUser, Db, Settings } from '../lib/types'
import type { NewUserInput, Store, TableName } from './store'

/** Fields whose DB column name is not the plain snake_case of the TS name */
const RENAME: Partial<Record<TableName, Record<string, string>>> = {
  room_blocks: { from: 'date_from', to: 'date_to' },
}
/** Columns the database owns (set by triggers / defaults); never sent from the client */
const SERVER_OWNED = new Set(['created_by', 'created_at', 'checked_in_at', 'checked_in_by', 'checked_out_at', 'checked_out_by', 'updated_at', 'code', 'below_floor', 'hk_seen_at', 'hk_seen_by', 'updated_by'])

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

export function toRow(table: TableName, obj: Record<string, unknown>): Record<string, unknown> {
  const ren = RENAME[table] ?? {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    const col = ren[k] ?? snake(k)
    if (SERVER_OWNED.has(col)) continue
    out[col] = v
  }
  return out
}

export function fromRow<T>(table: TableName | 'profiles' | 'settings' | 'audit_log', row: Record<string, unknown>): T {
  const ren = Object.fromEntries(Object.entries(RENAME[table as TableName] ?? {}).map(([a, b]) => [b, a]))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (k === 'change_reason') continue
    out[ren[k] ?? camel(k)] = typeof v === 'string' && /^-?\d+\.\d+$/.test(v) && ['amount', 'rate', 'base_rate', 'rate_floor', 'monthly_amount'].includes(k) ? Number(v) : v
  }
  return out as T
}

const TABLES: TableName[] = ['room_types', 'rooms', 'room_blocks', 'bookings', 'payments', 'alerts', 'hk_tasks', 'fixed_expenses', 'expenses', 'cash_counts']

export class SupabaseStore implements Store {
  mode = 'supabase' as const
  serverAlerts = true
  sb: SupabaseClient
  private emailDomain: string
  private user: AppUser | null = null

  constructor(url: string, anonKey: string, emailDomain = 'staff.thepoint.internal') {
    this.sb = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
    this.emailDomain = emailDomain
  }

  private email(username: string) {
    return `${username.trim().toLowerCase()}@${this.emailDomain}`
  }

  private async profile(id: string): Promise<AppUser> {
    const { data, error } = await this.sb.from('profiles').select('*').eq('id', id).single()
    if (error || !data) throw new Error('No staff profile for this login. Ask the CEO/GM.')
    const u = fromRow<AppUser>('profiles', data)
    if (!u.active) {
      await this.sb.auth.signOut()
      throw new Error('This account has been deactivated. Ask the CEO/GM.')
    }
    return u
  }

  async signIn(username: string, password: string) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email: this.email(username), password })
    if (error || !data.user) throw new Error('Wrong username or password.')
    this.user = await this.profile(data.user.id)
    await this.sb.rpc('log_session', { p_action: 'login' })
    return this.user
  }

  async signOut() {
    await this.sb.rpc('log_session', { p_action: 'logout' }).then(() => undefined, () => undefined)
    await this.sb.auth.signOut()
    this.user = null
  }

  async restoreSession() {
    const { data } = await this.sb.auth.getSession()
    if (!data.session) return null
    try { this.user = await this.profile(data.session.user.id) } catch { return null }
    return this.user
  }

  async loadAll(): Promise<Db> {
    const all = async (t: string, order?: string) => {
      let q = this.sb.from(t).select('*')
      if (order) q = q.order(order, { ascending: false })
      const { data, error } = await q.limit(t === 'audit_log' ? 1000 : 20000)
      if (error) throw new Error(`${t}: ${error.message}`)
      return (data ?? []) as Record<string, unknown>[]
    }
    const [settingsRows, profiles, audit, ...rest] = await Promise.all([
      all('settings'), all('profiles'), all('audit_log', 'at'), ...TABLES.map((t) => all(t)),
    ])
    const db: Record<string, unknown> = {}
    TABLES.forEach((t, i) => {
      const key = { room_types: 'roomTypes', rooms: 'rooms', room_blocks: 'blocks', bookings: 'bookings', payments: 'payments', alerts: 'alerts', hk_tasks: 'hkTasks', fixed_expenses: 'fixedExpenses', expenses: 'expenses', cash_counts: 'cashCounts' }[t]
      db[key] = rest[i].map((r) => fromRow(t, r))
    })
    const s = settingsRows[0] ? fromRow<Settings & { id: number }>('settings', settingsRows[0]) : null
    return {
      ...(db as unknown as Db),
      settings: s ?? { hotelName: 'The Point Boutique Hotel', city: 'Johor Bahru', currency: 'RM', timezone: 'Asia/Kuala_Lumpur', checkInTime: '15:00', checkOutTime: '12:00' },
      users: profiles.map((p) => fromRow<AppUser>('profiles', p)),
      audit: audit.map((a) => fromRow('audit_log', a)),
    }
  }

  subscribe(onChange: (table: string, row?: unknown) => void) {
    const ch = this.sb.channel('ops-realtime')
    for (const t of ['bookings', 'alerts', 'rooms', 'room_blocks', 'hk_tasks', 'payments']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, (p) => onChange(t, p.new && Object.keys(p.new).length ? fromRow(t as TableName, p.new as Record<string, unknown>) : undefined))
    }
    ch.subscribe()
    return () => { this.sb.removeChannel(ch) }
  }

  async insert<T extends { id: string }>(table: TableName, row: T, reason?: string | null): Promise<T> {
    if (table === 'alerts') return row // raised by database triggers
    const payload = { ...toRow(table, row as unknown as Record<string, unknown>), change_reason: reason ?? null }
    const { data, error } = await this.sb.from(table).insert(payload).select().single()
    if (error) throw new Error(friendly(error.message))
    return fromRow<T>(table, data)
  }

  async update<T extends { id: string }>(table: TableName, id: string, patch: Partial<T>, reason?: string | null): Promise<T> {
    const payload = { ...toRow(table, patch as Record<string, unknown>), change_reason: reason ?? null }
    const { data, error } = await this.sb.from(table).update(payload).eq('id', id).select().single()
    if (error) throw new Error(friendly(error.message))
    return fromRow<T>(table, data)
  }

  async markAlertsRead(ids: string[]) {
    const { error } = await this.sb.rpc('mark_alerts_read', { p_ids: ids })
    if (error) throw new Error(error.message)
  }

  async createUser(input: NewUserInput): Promise<AppUser> {
    const { data, error } = await this.sb.functions.invoke('admin-users', {
      body: { action: 'create', username: input.username.trim().toLowerCase(), fullName: input.fullName, role: input.role, password: input.password, email: this.email(input.username) },
    })
    if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Could not create user')
    return fromRow<AppUser>('profiles', data.profile)
  }

  async updateUser(id: string, patch: Partial<Pick<AppUser, 'fullName' | 'role' | 'active'>>, reason?: string | null): Promise<AppUser> {
    const payload: Record<string, unknown> = { change_reason: reason ?? null }
    if (patch.fullName !== undefined) payload.full_name = patch.fullName
    if (patch.role !== undefined) payload.role = patch.role
    if (patch.active !== undefined) payload.active = patch.active
    const { data, error } = await this.sb.from('profiles').update(payload).eq('id', id).select().single()
    if (error) throw new Error(friendly(error.message))
    if (patch.active === false) await this.sb.functions.invoke('admin-users', { body: { action: 'ban', userId: id } })
    if (patch.active === true) await this.sb.functions.invoke('admin-users', { body: { action: 'unban', userId: id } })
    return fromRow<AppUser>('profiles', data)
  }

  async setPassword(userId: string, password: string) {
    const { data, error } = await this.sb.functions.invoke('admin-users', { body: { action: 'set_password', userId, password } })
    if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Could not set password')
  }

  async saveSettings(s: Settings) {
    const { error } = await this.sb.from('settings').update({ hotel_name: s.hotelName, city: s.city, currency: s.currency, timezone: s.timezone, check_in_time: s.checkInTime, check_out_time: s.checkOutTime, change_reason: null }).eq('id', 1)
    if (error) throw new Error(friendly(error.message))
  }
}

function friendly(msg: string): string {
  if (msg.includes('bookings_no_overlap')) return 'That room is already booked for overlapping dates.'
  if (msg.includes('bookings_pms_ref_unique')) return 'That PMS ref no. is already used by another booking.'
  if (msg.includes('row-level security')) return 'You do not have permission to do that.'
  return msg
}
