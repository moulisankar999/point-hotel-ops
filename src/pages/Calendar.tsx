import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useData } from '../state/AppContext'
import { PageHeader } from '../components/ui'
import { BookingForm } from '../components/BookingForm'
import { BookingDetail } from '../components/BookingDetail'
import { RoomPanel } from '../components/RoomPanel'
import { addDays, diffDays, eachDay, prettyDate, weekday } from '../lib/dates'
import { dayStats } from '../lib/logic'
import { cls } from '../lib/format'
import { can } from '../lib/permissions'

const W = 44
const COLORS: Record<string, string> = {
  reserved: 'bg-brand-500 text-white',
  checked_in: 'bg-emerald-500 text-white',
  checked_out: 'bg-slate-300 text-slate-700 dark:bg-slate-600 dark:text-slate-100',
}

export function Calendar() {
  const { db, user, today } = useData()
  const [start, setStart] = useState(addDays(today, -3))
  const [span, setSpan] = useState(21)
  const [typeId, setTypeId] = useState('')
  const [preset, setPreset] = useState<{ roomId: string; checkIn: string } | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [room, setRoom] = useState<string | null>(null)
  const end = addDays(start, span)
  const days = eachDay(start, end)
  const rooms = db.rooms.filter((r) => r.active && (!typeId || r.typeId === typeId))
  const occ = useMemo(() => days.map((d) => dayStats(db, d).occupancy), [db, start, span])
  const clip = (from: string, to: string) => {
    const a = from < start ? start : from
    const b = to > end ? end : to
    return a < b ? { left: diffDays(start, a) * W, width: diffDays(a, b) * W } : null
  }

  return (
    <div>
      <PageHeader title="Calendar" subtitle="Bookings and blocked dates per room. Tap an empty day to book it."
        actions={<div className="flex items-center gap-2">
          <select className="input !w-auto" value={typeId} onChange={(e) => setTypeId(e.target.value)}><option value="">All types</option>{db.roomTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select className="input !w-auto" value={span} onChange={(e) => setSpan(Number(e.target.value))}><option value={14}>2 weeks</option><option value={21}>3 weeks</option><option value={31}>1 month</option><option value={62}>2 months</option></select>
          <button className="btn-secondary btn-sm" aria-label="Previous" onClick={() => setStart(addDays(start, -7))}><ChevronLeft size={16} /></button>
          <button className="btn-secondary btn-sm" onClick={() => setStart(addDays(today, -3))}>Today</button>
          <button className="btn-secondary btn-sm" aria-label="Next" onClick={() => setStart(addDays(start, 7))}><ChevronRight size={16} /></button>
        </div>} />
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-brand-500" />Advance booking</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-emerald-500" />In house</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-slate-300" />Checked out</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-stripes bg-violet-400" />Blocked</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-amber-400" />Maintenance</span>
      </div>
      <div className="card overflow-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
        <div style={{ width: 72 + days.length * W }} className="relative">
          <div className="sticky top-0 z-20 flex border-b border-black/5 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-slate-900/95">
            <div className="sticky left-0 z-10 w-[72px] shrink-0 bg-inherit px-2 py-2 text-xs font-semibold text-slate-500">Room</div>
            {days.map((d, i) => (
              <div key={d} style={{ width: W }} className={cls('shrink-0 py-1.5 text-center text-[11px]', d === today && 'bg-brand-50 font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300', (weekday(d) === 'Sat' || weekday(d) === 'Sun') && d !== today && 'bg-black/[0.02] dark:bg-white/[0.03]')}>
                <div className="text-slate-400">{weekday(d).slice(0, 2)}</div>
                <div className="font-semibold">{prettyDate(d, { day: 'numeric' })}</div>
                <div className="text-[9px] text-slate-400">{Math.round(occ[i] * 100)}%</div>
              </div>
            ))}
          </div>
          {rooms.map((r) => {
            const bs = db.bookings.filter((b) => b.roomId === r.id && ['reserved', 'checked_in', 'checked_out'].includes(b.status) && b.checkIn < end && b.checkOut > start)
            const blocks = db.blocks.filter((k) => k.roomId === r.id && k.active && k.from < end && k.to > start)
            return (
              <div key={r.id} className="flex border-b border-black/[0.04] dark:border-white/5">
                <button onClick={() => setRoom(r.id)} className="sticky left-0 z-10 w-[72px] shrink-0 bg-white px-2 py-2 text-left text-sm font-semibold hover:text-brand-600 dark:bg-slate-900">
                  {r.number}<span className="ml-1 text-[10px] font-medium text-slate-400">{db.roomTypes.find((t) => t.id === r.typeId)?.code}</span>
                </button>
                <div className="relative h-10" style={{ width: days.length * W }}>
                  <div className="absolute inset-0 flex">
                    {days.map((d) => (
                      <button key={d} style={{ width: W }} aria-label={`Book ${r.number} on ${d}`} disabled={!can(user.role, 'bookings.create') || d < today}
                        onClick={() => setPreset({ roomId: r.id, checkIn: d })}
                        className={cls('h-full shrink-0 border-r border-black/[0.03] dark:border-white/[0.04]', d === today && 'bg-brand-50/60 dark:bg-brand-500/10', d >= today && 'hover:bg-brand-100/60 dark:hover:bg-brand-500/20')} />
                    ))}
                  </div>
                  {r.outOfOrder && (() => { const c = clip(today, end); return c && <div className="absolute top-1.5 h-7 rounded-md bg-amber-400/80 px-2 text-[11px] font-semibold leading-7 text-amber-950" style={{ left: c.left + 1, width: c.width - 2 }}>{r.outOfOrderReason}</div> })()}
                  {blocks.map((k) => { const c = clip(k.from, k.to); return c && (
                    <div key={k.id} title={k.reason} className="bg-stripes absolute top-1.5 h-7 truncate rounded-md bg-violet-400 px-2 text-[11px] font-semibold leading-7 text-white" style={{ left: c.left + 1, width: c.width - 2 }}>{k.reason}</div>
                  ) })}
                  {bs.map((b) => { const c = clip(b.checkIn, b.checkOut); return c && (
                    <button key={b.id} onClick={() => setDetail(b.id)} title={`${b.guestName} · ${b.code}`}
                      className={cls('absolute top-1.5 h-7 truncate rounded-md px-2 text-left text-[11px] font-semibold leading-7 shadow-sm hover:brightness-110', COLORS[b.status], !b.pmsRef && 'ring-2 ring-rose-500')}
                      style={{ left: c.left + 2, width: c.width - 4 }}>{b.guestName}</button>
                  ) })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <BookingForm open={!!preset} onClose={() => setPreset(null)} preset={preset ? { type: preset.checkIn === today ? 'walk_in' : 'advance', roomId: preset.roomId, checkIn: preset.checkIn, checkOut: addDays(preset.checkIn, 1) } : undefined} />
      <BookingDetail id={detail} onClose={() => setDetail(null)} />
      <RoomPanel roomId={room} onClose={() => setRoom(null)} />
    </div>
  )
}
