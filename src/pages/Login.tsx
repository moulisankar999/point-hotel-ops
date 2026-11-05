import { useState } from 'react'
import { KeyRound, LogIn, Moon, Sun } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { isDemo, store } from '../data'
import { DEMO_PASSWORD } from '../data/seed'
import { ROLE_LABEL, type Role } from '../lib/types'

const DEMO_USERS: { username: string; role: Role }[] = [
  { username: 'mouli', role: 'ceo' },
  { username: 'ops', role: 'ops_manager' },
  { username: 'manager', role: 'manager' },
  { username: 'frontdesk', role: 'front_desk' },
  { username: 'housekeeping', role: 'housekeeping' },
]

export function Login() {
  const { signIn, theme, toggleTheme } = useApp()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(u = username, p = password) {
    setBusy(true)
    setErr(null)
    try { await signIn(u, p) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-brand-400/25 blur-3xl dark:bg-brand-600/20" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-[480px] w-[480px] rounded-full bg-violet-400/20 blur-3xl dark:bg-violet-600/15" />
      <button className="btn-ghost btn-sm absolute right-4 top-4" onClick={toggleTheme} aria-label="Toggle theme">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-[20px] bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-black text-white shadow-lg">TP</div>
          <h1 className="text-[28px] font-bold tracking-tight">The Point Boutique Hotel</h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">Hotel operations · Johor Bahru</p>
        </div>
        <form className="card space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <label className="block">
            <span className="label">Username</span>
            <input className="input" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {err && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">{err}</div>}
          <button className="btn-primary w-full !py-3" disabled={busy}><LogIn size={17} />{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>

        {isDemo && (
          <div className="card mt-4 border-amber-300/60 p-5 dark:border-amber-500/30">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300"><KeyRound size={16} /> Demo mode · sample data only</div>
            <p className="mt-1 text-[13px] text-slate-600 dark:text-slate-300">
              This copy runs entirely in your browser with made-up data. Every demo account uses the password <code className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-100">{DEMO_PASSWORD}</code>. Real accounts will be created by the CEO when the live database is switched on.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {DEMO_USERS.map((u) => (
                <button key={u.username} type="button" className="btn-secondary btn-sm justify-between" onClick={() => submit(u.username, DEMO_PASSWORD)} disabled={busy}>
                  <span>@{u.username}</span><span className="text-[11.5px] font-medium text-slate-500">{ROLE_LABEL[u.role]}</span>
                </button>
              ))}
            </div>
            <button type="button" className="mt-3 text-xs text-slate-500 underline" onClick={async () => { await store.resetDemo?.(); location.reload() }}>Reset demo data</button>
          </div>
        )}
      </div>
    </div>
  )
}
