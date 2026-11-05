import { useState } from 'react'
import { KeyRound, LogOut } from 'lucide-react'
import { useApp } from '../state/AppContext'

/** Shown after sign-in while the account still has a temporary password. */
export function ChangePassword() {
  const { user, changeOwnPassword, signOut } = useApp()
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setErr(null)
    if (p1.length < 10) return setErr('Use at least 10 characters.')
    if (p1 !== p2) return setErr('The two passwords do not match.')
    setBusy(true)
    try { await changeOwnPassword(p1) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <form className="card w-full max-w-md space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <div className="flex items-center gap-2 text-lg font-bold"><KeyRound size={20} /> Choose your own password</div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Hi {user?.fullName.split(' ')[0]}, you signed in with a temporary password. Set a new one only you know before continuing.
        </p>
        <label className="block">
          <span className="label">New password</span>
          <input className="input" type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} required autoFocus />
        </label>
        <label className="block">
          <span className="label">Repeat new password</span>
          <input className="input" type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} required />
        </label>
        {err && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">{err}</div>}
        <button className="btn-primary w-full !py-3" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
        <button type="button" className="btn-ghost btn-sm w-full" onClick={() => signOut()}><LogOut size={14} />Sign out</button>
      </form>
    </div>
  )
}
