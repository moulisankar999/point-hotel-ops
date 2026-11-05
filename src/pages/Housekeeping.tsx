import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Ghost, Plus, Sparkles, SprayCan, BadgeCheck, DoorOpen } from 'lucide-react'
import { useData } from '../state/AppContext'
import { Badge, Card, Empty, Field, Modal, PageHeader, Stat } from '../components/ui'
import { missingHkTasks, currentBooking } from '../lib/logic'
import { prettyDate, prettyTs } from '../lib/dates'
import { cls } from '../lib/format'
import type { HkTask } from '../lib/types'

const STEP: Record<HkTask['status'], { label: string; next: string | null; tone: 'rose' | 'amber' | 'blue' | 'green' }> = {
  pending: { label: 'To do', next: 'Start cleaning', tone: 'rose' },
  in_progress: { label: 'Cleaning', next: 'Mark clean', tone: 'amber' },
  done: { label: 'Clean', next: 'Inspected', tone: 'blue' },
  inspected: { label: 'Inspected', next: null, tone: 'green' },
}

export function Housekeeping() {
  const { db, today, run, ops } = useData()
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const [adhoc, setAdhoc] = useState(false)
  const [adhocRoom, setAdhocRoom] = useState('')
  const [adhocNote, setAdhocNote] = useState('')
  const [seen, setSeen] = useState(false)
  const generated = useRef(false)

  useEffect(() => {
    if (generated.current) return
    generated.current = true
    if (missingHkTasks(db, today).length) run((o) => o.ensureHkTasks(today))
  }, [db, today, run, ops])

  const tasks = useMemo(() => db.hkTasks.filter((t) => t.date === today).sort((a, b) => {
    const key = (t: HkTask) => (t.kind === 'checkout' ? (currentBooking(db, t.roomId) ? 2 : 0) : t.kind === 'adhoc' ? 1 : 3)
    return key(a) - key(b) || Number(db.rooms.find((r) => r.id === a.roomId)?.number) - Number(db.rooms.find((r) => r.id === b.roomId)?.number)
  }), [db, today])
  const shown = filter === 'open' ? tasks.filter((t) => t.status !== 'inspected' || db.rooms.find((r) => r.id === t.roomId)?.hkStatus === 'inspected') : tasks
  const staff = db.users.filter((u) => u.active && (u.role === 'housekeeping' || u.role === 'front_desk' || u.role === 'manager'))
  const roomOf = (id: string) => db.rooms.find((r) => r.id === id)!
  const vacant = db.rooms.filter((r) => r.active && !currentBooking(db, r.id))
  const n = (s: HkTask['status']) => tasks.filter((t) => t.status === s).length

  return (
    <div>
      <PageHeader title="Housekeeping" subtitle={`${prettyDate(today, { weekday: 'long', day: 'numeric', month: 'long' })} · tasks are created automatically from check-outs and stayovers`}
        actions={<>
          <button className="btn-secondary" onClick={() => setSeen(true)}><Ghost size={16} />Report room in use</button>
          <button className="btn-primary" onClick={() => setAdhoc(true)}><Plus size={16} />Extra task</button>
        </>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="To do" value={n('pending')} icon={<SprayCan size={19} />} tone="rose" />
        <Stat label="Cleaning" value={n('in_progress')} icon={<Sparkles size={19} />} tone="amber" />
        <Stat label="Clean · awaiting inspection" value={n('done')} icon={<CheckCircle2 size={19} />} tone="blue" />
        <Stat label="Inspected" value={n('inspected')} icon={<BadgeCheck size={19} />} tone="green" />
      </div>
      <div className="mt-4 mb-3 flex gap-1.5">
        <button className={cls('pill', filter === 'open' && 'pill-active')} onClick={() => setFilter('open')}>Open</button>
        <button className={cls('pill', filter === 'all' && 'pill-active')} onClick={() => setFilter('all')}>All today ({tasks.length})</button>
      </div>
      {shown.length === 0 ? <div className="card"><Empty icon={<CheckCircle2 size={28} />} title="All done" body="No open housekeeping tasks for today." /></div> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((t) => {
            const r = roomOf(t.roomId)
            const st = STEP[t.status]
            const occupied = !!currentBooking(db, r.id)
            return (
              <div key={t.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-12 w-14 shrink-0 place-items-center rounded-xl bg-black/[0.04] text-lg font-bold dark:bg-white/10">{r.number}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={t.kind === 'checkout' ? 'orange' : t.kind === 'adhoc' ? 'violet' : 'slate'}>{t.kind === 'checkout' ? 'Check-out clean' : t.kind === 'adhoc' ? 'Extra' : 'Stayover'}</Badge>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {occupied && <Badge tone="blue">Guest in room</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{db.roomTypes.find((x) => x.id === r.typeId)?.name}{t.note ? ` · ${t.note}` : ''}{t.doneAt ? ` · cleaned ${prettyTs(t.doneAt)}` : ''}</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <select className="input !py-1.5 text-sm" value={t.assignee ?? ''} onChange={(e) => run((o) => o.assignTask(t.id, e.target.value), e.target.value ? `Assigned to ${e.target.value}` : 'Unassigned')} aria-label="Assign">
                    <option value="">Unassigned</option>
                    {staff.map((u) => <option key={u.id} value={u.fullName}>{u.fullName}</option>)}
                    {t.assignee && !staff.some((u) => u.fullName === t.assignee) && <option value={t.assignee}>{t.assignee}</option>}
                  </select>
                  {st.next && t.kind === 'checkout' && occupied && t.status === 'pending' ? <button className="btn-secondary btn-sm shrink-0" disabled>Guest not out yet</button> : st.next && <button className="btn-primary btn-sm shrink-0" onClick={() => run((o) => o.advanceTask(t.id), `Room ${r.number}: ${st.next}`)}>{st.next}</button>}
                  {t.status === 'inspected' && r.hkStatus === 'inspected' && <button className="btn-primary btn-sm shrink-0 !bg-emerald-600" onClick={() => run((o) => o.releaseRoom(r.id), `Room ${r.number} is available`)}><DoorOpen size={15} />Release</button>}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <Card className="mt-4" title="Rooms waiting for housekeeping">
        <div className="flex flex-wrap gap-2">
          {db.rooms.filter((r) => r.active && r.hkStatus !== 'ready' && !currentBooking(db, r.id)).map((r) => (
            <span key={r.id} className="pill"><b>{r.number}</b>{r.hkStatus}</span>
          ))}
          {db.rooms.every((r) => r.hkStatus === 'ready' || currentBooking(db, r.id)) && <span className="text-sm text-slate-500">None – all vacant rooms are ready.</span>}
        </div>
      </Card>

      <Modal open={adhoc} onClose={() => setAdhoc(false)} title="Extra housekeeping task"
        footer={<><button className="btn-secondary" onClick={() => setAdhoc(false)}>Cancel</button><button className="btn-primary" disabled={!adhocRoom} onClick={async () => { if (await run((o) => o.addAdhocTask(adhocRoom, today, adhocNote), 'Task added')) { setAdhoc(false); setAdhocNote('') } }}>Add task</button></>}>
        <div className="space-y-3">
          <Field label="Room"><select className="input" value={adhocRoom} onChange={(e) => setAdhocRoom(e.target.value)}><option value="">Choose room</option>{db.rooms.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.number}</option>)}</select></Field>
          <Field label="What needs doing?"><input className="input" value={adhocNote} onChange={(e) => setAdhocNote(e.target.value)} placeholder="e.g. Deep clean, change curtains" /></Field>
        </div>
      </Modal>
      <Modal open={seen} onClose={() => setSeen(false)} title="Report a room in use">
        <p className="mb-3 text-sm text-slate-500">Seen a guest, luggage or a used bed in a room that should be empty? Tap it – management is alerted immediately.</p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {vacant.map((r) => (
            <button key={r.id} onClick={async () => { if (await run((o) => o.reportSeenOccupied(r.id, !r.hkSeenOccupied), r.hkSeenOccupied ? 'Report cleared' : `Room ${r.number} reported`)) setSeen(false) }}
              className={cls('rounded-xl border px-2 py-2.5 text-sm font-semibold', r.hkSeenOccupied ? 'border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-500/15' : 'border-black/10 hover:bg-black/5 dark:border-white/10')}>{r.number}</button>
          ))}
        </div>
      </Modal>
    </div>
  )
}
