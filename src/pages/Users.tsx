import { useState } from 'react'
import { KeyRound, Plus, UserCheck, UserX } from 'lucide-react'
import { useData } from '../state/AppContext'
import { store } from '../data'
import { Badge, Field, Modal, PageHeader } from '../components/ui'
import { ROLE_LABEL, type AppUser, type Role } from '../lib/types'
import { ROLE_PERMS } from '../lib/permissions'
import { prettyDate } from '../lib/dates'

const ROLES: Role[] = ['ceo', 'ops_manager', 'manager', 'front_desk', 'housekeeping']
const ROLE_DESC: Record<Role, string> = {
  ceo: 'Everything, incl. P&L, audit log, users and settings',
  ops_manager: 'All operations, reconciliation, edits after check-out',
  manager: 'All operations, reconciliation, edits after check-out',
  front_desk: 'Bookings, check-in/out, payments, cash count',
  housekeeping: 'Housekeeping task list only',
}

export function Users() {
  const { db, user, toast, refresh } = useData()
  const [open, setOpen] = useState(false)
  const [pwFor, setPwFor] = useState<AppUser | null>(null)
  const [pw, setPw] = useState('')
  const [f, setF] = useState({ username: '', fullName: '', role: 'front_desk' as Role, password: '' })
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); await refresh(); toast({ title: msg, tone: 'success' }); return true } catch (e) { toast({ title: e instanceof Error ? e.message : String(e), tone: 'error' }); return false }
  }
  const create = () => act(async () => {
    if (!/^[a-z0-9._-]{3,30}$/.test(f.username)) throw new Error('Username: 3–30 lowercase letters, numbers, . _ -')
    if (f.fullName.trim().length < 2) throw new Error('Enter the full name.')
    if (f.password.length < 8) throw new Error('Password must be at least 8 characters.')
    if (db.users.some((u) => u.username === f.username)) throw new Error('That username is taken.')
    await store.createUser({ ...f, fullName: f.fullName.trim() })
  }, `User ${f.username} created`).then((ok) => ok && setOpen(false))

  return (
    <div>
      <PageHeader title="Users & roles" subtitle="Create staff logins, set what they can see, deactivate leavers"
        actions={<button className="btn-primary" onClick={() => { setF({ username: '', fullName: '', role: 'front_desk', password: '' }); setOpen(true) }}><Plus size={16} />New user</button>} />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead><tr><th className="th">Name</th><th className="th">Username</th><th className="th">Role</th><th className="th">Status</th><th className="th">Since</th><th className="th text-right">Actions</th></tr></thead>
          <tbody>
            {db.users.map((u) => (
              <tr key={u.id}>
                <td className="td font-medium">{u.fullName}{u.id === user.id && <span className="ml-1 text-xs text-slate-400">(you)</span>}</td>
                <td className="td font-mono text-sm">{u.username}</td>
                <td className="td">
                  <select className="input !w-auto !py-1 text-sm" value={u.role} disabled={u.id === user.id} onChange={(e) => act(() => store.updateUser(u.id, { role: e.target.value as Role }, 'Role changed'), `${u.fullName} is now ${ROLE_LABEL[e.target.value as Role]}`)}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </td>
                <td className="td">{u.active ? <Badge tone="green">Active</Badge> : <Badge tone="zinc">Deactivated</Badge>}</td>
                <td className="td text-sm text-slate-500">{prettyDate(u.createdAt.slice(0, 10))}</td>
                <td className="td text-right">
                  <div className="flex justify-end gap-1">
                    <button className="btn-ghost btn-sm" onClick={() => { setPw(''); setPwFor(u) }}><KeyRound size={14} />Password</button>
                    {u.id !== user.id && (u.active
                      ? <button className="btn-ghost btn-sm !text-rose-600" onClick={() => act(() => store.updateUser(u.id, { active: false }, 'Deactivated'), `${u.fullName} deactivated`)}><UserX size={14} />Deactivate</button>
                      : <button className="btn-ghost btn-sm" onClick={() => act(() => store.updateUser(u.id, { active: true }, 'Reactivated'), `${u.fullName} reactivated`)}><UserCheck size={14} />Reactivate</button>)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {ROLES.map((r) => <div key={r} className="card p-3"><div className="font-semibold">{ROLE_LABEL[r]}</div><div className="mt-1 text-xs text-slate-500">{ROLE_DESC[r]}</div><div className="mt-2 text-[11px] text-slate-400">{ROLE_PERMS[r].length} permissions</div></div>)}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New user"
        footer={<><button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" onClick={create}>Create user</button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name"><input className="input" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value, username: f.username || '' })} autoFocus /></Field>
          <Field label="Username" hint="lowercase, used to log in"><input className="input" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') })} placeholder={f.fullName.split(' ')[0]?.toLowerCase()} /></Field>
          <Field label="Role" className="sm:col-span-2">
            <div className="grid gap-1.5 sm:grid-cols-2">{ROLES.map((r) => (
              <button key={r} type="button" onClick={() => setF({ ...f, role: r })} className={`rounded-xl border p-2.5 text-left ${f.role === r ? 'border-brand-600 bg-brand-50 dark:bg-brand-500/15' : 'border-black/10 dark:border-white/10'}`}>
                <div className="text-sm font-semibold">{ROLE_LABEL[r]}</div><div className="text-xs text-slate-500">{ROLE_DESC[r]}</div>
              </button>))}
            </div>
          </Field>
          <Field label="Initial password" hint="At least 8 characters. Ask them to change it." className="sm:col-span-2"><input type="text" autoComplete="new-password" className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        </div>
      </Modal>
      <Modal open={!!pwFor} onClose={() => setPwFor(null)} title={`Set password · ${pwFor?.fullName}`}
        footer={<><button className="btn-secondary" onClick={() => setPwFor(null)}>Cancel</button><button className="btn-primary" onClick={() => act(async () => { if (pw.length < 8) throw new Error('At least 8 characters.'); await store.setPassword(pwFor!.id, pw) }, 'Password updated').then((ok) => ok && setPwFor(null))}>Save password</button></>}>
        <Field label="New password"><input type="text" autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></Field>
      </Modal>
    </div>
  )
}
