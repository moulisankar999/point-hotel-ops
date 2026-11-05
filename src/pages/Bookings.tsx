import { useMemo, useState } from 'react'
import { CalendarPlus, Footprints, Search } from 'lucide-react'
import { useData } from '../state/AppContext'
import { Badge, Empty, PageHeader } from '../components/ui'
import { BOOKING_STATUS } from '../components/status'
import { BookingForm } from '../components/BookingForm'
import { BookingDetail } from '../components/BookingDetail'
import { addDays, dateOfTs, prettyDate } from '../lib/dates'
import { balanceDue } from '../lib/logic'
import { cls, rm } from '../lib/format'
import { can } from '../lib/permissions'
import { PAYMENT_LABEL, type BookingType } from '../lib/types'

type View = 'inhouse' | 'upcoming' | 'today' | 'recent' | 'all' | 'flagged'

export function Bookings() {
  const { db, user, today } = useData()
  const [view, setView] = useState<View>('inhouse')
  const [q, setQ] = useState('')
  const [form, setForm] = useState<BookingType | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const roomNo = (id: string) => db.rooms.find((r) => r.id === id)?.number ?? '?'
  const staff = (id: string) => db.users.find((u) => u.id === id)?.fullName.split(' ')[0] ?? '?'

  const list = useMemo(() => {
    let l = db.bookings
    if (view === 'inhouse') l = l.filter((b) => b.status === 'checked_in')
    else if (view === 'upcoming') l = l.filter((b) => b.status === 'reserved')
    else if (view === 'today') l = l.filter((b) => dateOfTs(b.createdAt) === today || b.checkIn === today || b.checkOut === today)
    else if (view === 'recent') l = l.filter((b) => b.checkOut >= addDays(today, -14) && b.checkIn <= today)
    else if (view === 'flagged') l = l.filter((b) => b.belowFloor || !b.pmsRef || ['void', 'cancelled', 'no_show'].includes(b.status))
    if (q) {
      const s = q.toLowerCase()
      l = l.filter((b) => [b.guestName, b.phone, b.pmsRef ?? '', b.code, roomNo(b.roomId), b.idNo ?? ''].some((v) => v.toLowerCase().includes(s)))
    }
    return [...l].sort((a, b) => (view === 'upcoming' ? a.checkIn.localeCompare(b.checkIn) : b.createdAt.localeCompare(a.createdAt)))
  }, [db, view, q, today])

  const views: [View, string][] = [['inhouse', 'In house'], ['upcoming', 'Upcoming'], ['today', 'Today'], ['recent', 'Last 14 days'], ['flagged', 'Flagged'], ['all', 'All']]

  return (
    <div>
      <PageHeader title="Bookings" subtitle="Every walk-in, advance booking, check-in and check-out"
        actions={can(user.role, 'bookings.create') && <>
          <button className="btn-primary" onClick={() => setForm('walk_in')}><Footprints size={16} />Walk-in</button>
          <button className="btn-secondary" onClick={() => setForm('advance')}><CalendarPlus size={16} />Advance</button>
        </>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Name, phone, PMS ref, room…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {views.map(([k, l]) => <button key={k} onClick={() => setView(k)} className={cls('pill whitespace-nowrap', view === k && 'pill-active')}>{l}</button>)}
        </div>
      </div>
      {list.length === 0 ? <div className="card"><Empty title="Nothing here" body="Try another filter or search." /></div> : (
        <>
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full">
              <thead><tr><th className="th">Code</th><th className="th">Guest</th><th className="th">Room</th><th className="th">Stay</th><th className="th">PMS ref</th><th className="th text-right">Rate</th><th className="th text-right">Amount</th><th className="th text-right">Balance</th><th className="th">Status</th><th className="th">By</th></tr></thead>
              <tbody>
                {list.slice(0, 300).map((b) => {
                  const due = balanceDue(db, b)
                  return (
                    <tr key={b.id} onClick={() => setDetail(b.id)} className="cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                      <td className="td font-mono text-xs">{b.code}</td>
                      <td className="td"><div className="font-medium">{b.guestName}</div><div className="text-xs text-slate-500">{b.phone}</div></td>
                      <td className="td font-semibold">{roomNo(b.roomId)}</td>
                      <td className="td whitespace-nowrap text-sm">{prettyDate(b.checkIn, { day: 'numeric', month: 'short' })} → {prettyDate(b.checkOut, { day: 'numeric', month: 'short' })}</td>
                      <td className="td">{b.pmsRef ? <span className="font-mono text-xs">{b.pmsRef}</span> : <Badge tone="rose">None</Badge>}</td>
                      <td className="td text-right">{rm(b.rate, 0)}{b.belowFloor && <span className="ml-1 text-amber-500" title="Below rate floor">●</span>}</td>
                      <td className="td text-right">{rm(b.amount, 0)}<div className="text-[11px] text-slate-500">{PAYMENT_LABEL[b.paymentMethod]}</div></td>
                      <td className={cls('td text-right', due > 0.009 && b.status !== 'cancelled' && b.status !== 'void' ? 'text-rose-600' : 'text-slate-400')}>{rm(due, 0)}</td>
                      <td className="td"><Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge></td>
                      <td className="td text-sm text-slate-500">{staff(b.createdBy)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 md:hidden">
            {list.slice(0, 150).map((b) => (
              <button key={b.id} onClick={() => setDetail(b.id)} className="card flex w-full items-center gap-3 p-3 text-left">
                <div className="grid h-11 w-12 shrink-0 place-items-center rounded-xl bg-black/[0.04] font-bold dark:bg-white/10">{roomNo(b.roomId)}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{b.guestName}</div>
                  <div className="truncate text-xs text-slate-500">{prettyDate(b.checkIn, { day: 'numeric', month: 'short' })} → {prettyDate(b.checkOut, { day: 'numeric', month: 'short' })} · {rm(b.amount, 0)} · {b.pmsRef ?? 'no PMS ref'}</div>
                </div>
                <Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge>
              </button>
            ))}
          </div>
          {list.length > 300 && <div className="mt-2 text-center text-xs text-slate-500">Showing first 300 – search to narrow down.</div>}
        </>
      )}
      <BookingForm open={!!form} onClose={() => setForm(null)} preset={{ type: form ?? 'walk_in' }} />
      <BookingDetail id={detail} onClose={() => setDetail(null)} />
    </div>
  )
}
