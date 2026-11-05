import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useData } from '../state/AppContext'
import { PageHeader } from '../components/ui'
import { STATUS_META } from '../components/status'
import { RoomPanel } from '../components/RoomPanel'
import { activeBlock, currentBooking, roomStatus, type DisplayStatus } from '../lib/logic'
import { prettyDate } from '../lib/dates'
import { cls } from '../lib/format'

export function Rooms() {
  const { db, today } = useData()
  const [filter, setFilter] = useState<DisplayStatus | 'all'>('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const rows = useMemo(() => db.rooms.filter((r) => r.active).map((r) => {
    const st = roomStatus(db, r, today)
    return { r, st, cur: currentBooking(db, r.id), type: db.roomTypes.find((t) => t.id === r.typeId), block: activeBlock(db, r.id, today) }
  }), [db, today])
  const counts = rows.reduce<Record<string, number>>((m, x) => ({ ...m, [x.st]: (m[x.st] ?? 0) + 1 }), {})
  const shown = rows.filter((x) => (filter === 'all' || x.st === filter) && (!q || x.r.number.includes(q) || x.cur?.guestName.toLowerCase().includes(q.toLowerCase())))
  const floors = [...new Set(shown.map((x) => x.r.floor))].sort()

  return (
    <div>
      <PageHeader title="Rooms" subtitle={`${rows.length} rooms · tap a room for details and actions`} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Room no. or guest" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button onClick={() => setFilter('all')} className={cls('pill whitespace-nowrap', filter === 'all' && 'pill-active')}>All {rows.length}</button>
          {(Object.keys(STATUS_META) as DisplayStatus[]).map((k) => (
            <button key={k} onClick={() => setFilter(k)} className={cls('pill whitespace-nowrap', filter === k && 'pill-active')}>
              <span className={`h-2 w-2 rounded-full ${STATUS_META[k].dot}`} />{STATUS_META[k].label} {counts[k] ?? 0}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-5">
        {floors.map((f) => (
          <div key={f}>
            <div className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-slate-500">Floor {f}</div>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
              {shown.filter((x) => x.r.floor === f).map(({ r, st, cur, type, block }) => (
                <button key={r.id} onClick={() => setOpen(r.id)} className={cls('relative rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-soft', STATUS_META[st].tile)}>
                  <div className="flex items-start justify-between">
                    <span className="text-lg font-bold leading-none">{r.number}</span>
                    <span className="text-[10px] font-semibold opacity-70">{type?.code}</span>
                  </div>
                  <div className="mt-2 truncate text-[12px] font-medium">{cur ? cur.guestName : block ? block.reason : STATUS_META[st].label}</div>
                  <div className="truncate text-[11px] opacity-70">{cur ? `out ${prettyDate(cur.checkOut, { day: 'numeric', month: 'short' })}` : r.outOfOrder ? r.outOfOrderReason : '\u00a0'}</div>
                  {r.hkSeenOccupied && !cur && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500 ring-2 ring-white" title="Seen in use" />}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <RoomPanel roomId={open} onClose={() => setOpen(null)} />
    </div>
  )
}
