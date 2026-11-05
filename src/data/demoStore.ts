import type { AppUser, AuditEntry, Db, Settings } from '../lib/types'
import { uid } from '../lib/format'
import { DEMO_PASSWORD, seedDemoDb } from './seed'
import type { NewUserInput, Store, TableName } from './store'
import { TABLE_KEY } from './store'

const DB_KEY = 'tp.demo.db.v1'
const PW_KEY = 'tp.demo.pw.v1'
const SESSION_KEY = 'tp.demo.session.v1'

async function hash(pw: string): Promise<string> {
  const data = new TextEncoder().encode('point-hotel-demo:' + pw)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

type Listener = (table: string, row?: unknown) => void

/** Browser-only demo backend: localStorage + BroadcastChannel ("realtime" across tabs). */
export class DemoStore implements Store {
  mode = 'demo' as const
  serverAlerts = false
  private db: Db | null = null
  private user: AppUser | null = null
  private listeners = new Set<Listener>()
  private chan: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tp-demo') : null

  constructor() {
    this.chan?.addEventListener('message', (e) => {
      this.db = null // reload from storage
      this.listeners.forEach((l) => l(e.data?.table ?? '*', e.data?.row))
    })
  }

  private read(): Db {
    if (this.db) return this.db
    const raw = localStorage.getItem(DB_KEY)
    if (raw) {
      try { this.db = JSON.parse(raw) as Db; return this.db } catch { /* reseed */ }
    }
    this.db = seedDemoDb()
    this.write()
    return this.db
  }

  private write() {
    localStorage.setItem(DB_KEY, JSON.stringify(this.db))
  }

  private emit(table: string, row?: unknown) {
    this.listeners.forEach((l) => l(table, row))
    this.chan?.postMessage({ table, row })
  }

  private audit(entity: string, entityId: string, action: AuditEntry['action'], before: unknown, after: unknown, reason?: string | null) {
    const db = this.read()
    db.audit.unshift({ id: uid('a-'), at: new Date().toISOString(), userId: this.user?.id ?? null, userName: this.user?.fullName ?? 'System', entity, entityId, action, reason: reason ?? null, before, after })
    if (db.audit.length > 5000) db.audit.length = 5000
  }

  private async passwords(): Promise<Record<string, string>> {
    const raw = localStorage.getItem(PW_KEY)
    if (raw) return JSON.parse(raw)
    const h = await hash(DEMO_PASSWORD)
    const pw: Record<string, string> = {}
    for (const u of this.read().users) pw[u.id] = h
    localStorage.setItem(PW_KEY, JSON.stringify(pw))
    return pw
  }

  async signIn(username: string, password: string): Promise<AppUser> {
    const db = this.read()
    const u = db.users.find((x) => x.username.toLowerCase() === username.trim().toLowerCase())
    const pw = await this.passwords()
    if (!u || pw[u.id] !== (await hash(password))) throw new Error('Wrong username or password.')
    if (!u.active) throw new Error('This account has been deactivated. Ask the CEO/GM.')
    this.user = u
    localStorage.setItem(SESSION_KEY, u.id)
    this.audit('session', u.id, 'login', null, { username: u.username }, null)
    this.write()
    this.emit('audit')
    return u
  }

  async signOut() {
    if (this.user) {
      this.audit('session', this.user.id, 'logout', null, { username: this.user.username }, null)
      this.write()
    }
    this.user = null
    localStorage.removeItem(SESSION_KEY)
  }

  async restoreSession(): Promise<AppUser | null> {
    const id = localStorage.getItem(SESSION_KEY)
    const u = id ? this.read().users.find((x) => x.id === id && x.active) : undefined
    this.user = u ?? null
    return this.user
  }

  async loadAll(): Promise<Db> {
    return structuredClone(this.read())
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  async insert<T extends { id: string }>(table: TableName, row: T, reason?: string | null): Promise<T> {
    const db = this.read()
    const list = db[TABLE_KEY[table]] as unknown as T[]
    if (list.some((x) => x.id === row.id)) throw new Error('Duplicate id')
    list.push(row)
    if (table !== 'alerts') this.audit(table, row.id, 'insert', null, row, reason)
    this.write()
    this.emit(table, row)
    return structuredClone(row)
  }

  async update<T extends { id: string }>(table: TableName, id: string, patch: Partial<T>, reason?: string | null): Promise<T> {
    const db = this.read()
    const list = db[TABLE_KEY[table]] as unknown as T[]
    const i = list.findIndex((x) => x.id === id)
    if (i < 0) throw new Error('Record not found')
    const before = list[i]
    const after = { ...before, ...patch, ...(table === 'bookings' ? { updatedAt: new Date().toISOString() } : {}) }
    list[i] = after
    const changed: Record<string, unknown> = {}
    const prev: Record<string, unknown> = {}
    for (const k of Object.keys(patch)) {
      const kk = k as keyof T
      if (JSON.stringify(before[kk]) !== JSON.stringify(after[kk])) { changed[k] = after[kk]; prev[k] = before[kk] }
    }
    if (Object.keys(changed).length) this.audit(table, id, 'update', prev, changed, reason)
    this.write()
    this.emit(table, after)
    return structuredClone(after)
  }

  async markAlertsRead(ids: string[]) {
    if (!this.user) return
    const db = this.read()
    for (const a of db.alerts) if (ids.includes(a.id) && !a.readBy.includes(this.user.id)) a.readBy.push(this.user.id)
    this.write()
    this.emit('alerts')
  }

  async createUser(input: NewUserInput): Promise<AppUser> {
    const db = this.read()
    const username = input.username.trim().toLowerCase()
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('Username: 3–30 letters, numbers, dot, dash or underscore.')
    if (db.users.some((u) => u.username === username)) throw new Error('That username is taken.')
    if (input.password.length < 8) throw new Error('Password must be at least 8 characters.')
    const u: AppUser = { id: uid('u-'), username, fullName: input.fullName.trim(), role: input.role, active: true, createdAt: new Date().toISOString() }
    db.users.push(u)
    const pw = await this.passwords()
    pw[u.id] = await hash(input.password)
    localStorage.setItem(PW_KEY, JSON.stringify(pw))
    this.audit('users', u.id, 'insert', null, u, null)
    this.write()
    this.emit('users', u)
    return u
  }

  async updateUser(id: string, patch: Partial<Pick<AppUser, 'fullName' | 'role' | 'active'>>, reason?: string | null): Promise<AppUser> {
    const db = this.read()
    const u = db.users.find((x) => x.id === id)
    if (!u) throw new Error('User not found')
    const before = { ...u }
    Object.assign(u, patch)
    this.audit('users', id, 'update', before, { ...u }, reason)
    this.write()
    this.emit('users', u)
    return { ...u }
  }

  async changeOwnPassword(password: string): Promise<AppUser> {
    if (!this.user) throw new Error('Not signed in')
    await this.setPassword(this.user.id, password)
    return this.user
  }

  async setPassword(userId: string, password: string) {
    if (password.length < 8) throw new Error('Password must be at least 8 characters.')
    const pw = await this.passwords()
    pw[userId] = await hash(password)
    localStorage.setItem(PW_KEY, JSON.stringify(pw))
    this.audit('users', userId, 'update', null, { password: '(changed)' }, 'Password reset')
    this.write()
    this.emit('audit')
  }

  async saveSettings(s: Settings) {
    const db = this.read()
    const before = db.settings
    db.settings = s
    this.audit('settings', 'hotel', 'update', before, s, null)
    this.write()
    this.emit('settings')
  }

  async resetDemo() {
    localStorage.removeItem(DB_KEY)
    localStorage.removeItem(PW_KEY)
    localStorage.removeItem(SESSION_KEY)
    this.db = null
    this.user = null
    this.read()
    this.emit('*')
  }
}
