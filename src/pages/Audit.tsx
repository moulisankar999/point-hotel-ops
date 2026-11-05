import { useMemo, useState } from 'react'
import { Search, ShieldCheck } from 'lucide-react'
import { useData } from '../state/AppContext'
import { Badge, Empty, PageHeader } from '../components/ui'
import { prettyTs } from '../lib/dates'
import { cls } from '../lib/format'

const TONE = { insert: 'green', update: 'amber', delete: 'rose', login: 'blue', logout: 'slate' } as const

function diff(before: unknown, after: unknown): string {
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return ''
  const b = before as Record<string, unknown>, a = after as Record<string, unknown>
  return Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => `${k}: ${fmt(b[k])} → ${fmt(a[k])}`).join(' · ')
}
const fmt = (v: unknown) => (v == null ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v)).slice(0, 40)

export function Audit() {
  const { db } = useData()
  const [q, setQ] = useState('')
  const [entity, setEntity] = useState('')
  const [who, setWho] = useState('')
  const [limit, setLimit] = useState(200)
  const entities = [...new Set(db.audit.map((a) => a.entity))].sort()
  const list = useMemo(() => db.audit.filter((a) => (!entity || a.entity === entity) && (!who || a.userId === who) && (!q || JSON.stringify(a).toLowerCase().includes(q.toLowerCase()))).sort((a, b) => b.at.localeCompare(a.at)), [db, q, entity, who])

  return (
    <div>
      <PageHeader title="Audit log" subtitle={<span className="flex items-center gap-1.5"><ShieldCheck size={15} />Append-only record of every change, who made it and when. Entries cannot be edited or deleted.</span>} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative sm:w-72"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input pl-9" placeholder="Search booking code, name, reason…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="input sm:!w-48" value={entity} onChange={(e) => setEntity(e.target.value)}><option value="">All records</option>{entities.map((e) => <option key={e}>{e}</option>)}</select>
        <select className="input sm:!w-48" value={who} onChange={(e) => setWho(e.target.value)}><option value="">All staff</option>{db.users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</select>
      </div>
      {list.length === 0 ? <div className="card"><Empty title="No entries" /></div> : (
        <div className="card divide-y divide-black/5 dark:divide-white/5">
          {list.slice(0, limit).map((a) => {
            const d = a.action === 'update' ? diff(a.before, a.after) : ''
            const label = (a.after as { code?: string; number?: string; guestName?: string } | null)
            return (
              <div key={a.id} className="flex gap-3 px-4 py-2.5 text-sm">
                <div className="w-28 shrink-0 text-xs text-slate-500">{prettyTs(a.at)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5"><Badge tone={TONE[a.action]}>{a.action}</Badge><b>{a.entity}</b><span className="text-slate-500">{label?.code ?? label?.number ?? ''} {label?.guestName ?? ''}</span><span className="text-slate-400">by</span><span className="font-medium">{a.userName}</span></div>
                  {a.reason && <div className="mt-0.5 text-[13px] italic text-slate-600 dark:text-slate-300">“{a.reason}”</div>}
                  {d && <div className={cls('mt-0.5 break-words font-mono text-[11px] text-slate-500')}>{d}</div>}
                </div>
              </div>
            )
          })}
          {list.length > limit && <button className="w-full py-3 text-sm font-semibold text-brand-600" onClick={() => setLimit(limit + 300)}>Show more ({list.length - limit} older)</button>}
        </div>
      )}
    </div>
  )
}
