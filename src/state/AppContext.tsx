import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AlertItem, AppUser, Db } from '../lib/types'
import { store } from '../data'
import { OpsService } from '../data/service'
import { can } from '../lib/permissions'
import { todayKL } from '../lib/dates'

export interface Toast { id: number; title: string; body?: string; tone: 'info' | 'success' | 'error' | 'warn' }

interface Ctx {
  db: Db | null
  user: AppUser | null
  ready: boolean
  today: string
  ops: () => OpsService
  run: (fn: (ops: OpsService) => Promise<unknown>, success?: string) => Promise<boolean>
  refresh: () => Promise<void>
  signIn: (u: string, p: string) => Promise<void>
  signOut: () => Promise<void>
  toasts: Toast[]
  toast: (t: Omit<Toast, 'id'>) => void
  dismiss: (id: number) => void
  theme: 'light' | 'dark'
  toggleTheme: () => void
}

const AppCtx = createContext<Ctx | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db | null>(null)
  const [user, setUser] = useState<AppUser | null>(null)
  const [ready, setReady] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [today, setToday] = useState(todayKL())
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'))
  const seenAlerts = useRef<Set<string> | null>(null)
  const userRef = useRef<AppUser | null>(null)
  userRef.current = user

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((xs) => [...xs.slice(-3), { ...t, id }])
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), t.tone === 'error' ? 8000 : 5000)
  }, [])
  const dismiss = useCallback((id: number) => setToasts((xs) => xs.filter((x) => x.id !== id)), [])

  const refresh = useCallback(async () => {
    const next = await store.loadAll()
    // surface new alerts from other users/devices as toasts
    const u = userRef.current
    if (seenAlerts.current && u && can(u.role, 'alerts')) {
      const fresh = next.alerts.filter((a: AlertItem) => !seenAlerts.current!.has(a.id) && a.createdBy !== u.id)
      for (const a of fresh.slice(0, 3)) toast({ title: a.title, body: a.message, tone: a.type === 'flag' || a.type === 'cancel' ? 'warn' : 'info' })
    }
    seenAlerts.current = new Set(next.alerts.map((a) => a.id))
    if (u) {
      const me = next.users.find((x) => x.id === u.id)
      if (me && (me.role !== u.role || me.active !== u.active || me.fullName !== u.fullName)) setUser(me.active ? me : null)
    }
    setDb(next)
  }, [toast])

  useEffect(() => {
    (async () => {
      try {
        const u = await store.restoreSession()
        setUser(u)
        userRef.current = u
        if (u) await refresh()
      } finally {
        setReady(true)
      }
    })()
  }, [refresh])

  useEffect(() => {
    if (!user) return
    let t: ReturnType<typeof setTimeout> | undefined
    const off = store.subscribe(() => {
      clearTimeout(t)
      t = setTimeout(() => { refresh().catch(() => undefined) }, 250)
    })
    const tick = setInterval(() => setToday(todayKL()), 60000)
    return () => { off(); clearInterval(tick); clearTimeout(t) }
  }, [user, refresh])

  const ops = useCallback(() => {
    if (!db || !user) throw new Error('Not signed in')
    return new OpsService(store, db, user)
  }, [db, user])

  const run = useCallback(async (fn: (o: OpsService) => Promise<unknown>, success?: string) => {
    try {
      await fn(ops())
      await refresh()
      if (success) toast({ title: success, tone: 'success' })
      return true
    } catch (e) {
      toast({ title: 'Could not save', body: (e as Error).message, tone: 'error' })
      await refresh().catch(() => undefined)
      return false
    }
  }, [ops, refresh, toast])

  const signIn = useCallback(async (u: string, p: string) => {
    const usr = await store.signIn(u, p)
    seenAlerts.current = null
    userRef.current = usr
    setUser(usr)
    await refresh()
  }, [refresh])

  const signOut = useCallback(async () => {
    await store.signOut()
    setUser(null)
    setDb(null)
    seenAlerts.current = null
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const n = t === 'dark' ? 'light' : 'dark'
      document.documentElement.classList.toggle('dark', n === 'dark')
      localStorage.setItem('tp.theme', n)
      return n
    })
  }, [])

  const value = useMemo(() => ({ db, user, ready, today, ops, run, refresh, signIn, signOut, toasts, toast, dismiss, theme, toggleTheme }), [db, user, ready, today, ops, run, refresh, signIn, signOut, toasts, toast, dismiss, theme, toggleTheme])
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useApp() {
  const c = useContext(AppCtx)
  if (!c) throw new Error('useApp outside provider')
  return c
}

/** Convenience when a page is only rendered with data loaded */
export function useData() {
  const c = useApp()
  if (!c.db || !c.user) throw new Error('data not loaded')
  return { ...c, db: c.db, user: c.user }
}
