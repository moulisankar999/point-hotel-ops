import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BedDouble, CalendarPlus, DoorOpen, Footprints, Ghost, LogOut, Percent, SprayCan, TrendingUp, TriangleAlert, Wallet, Wrench } from 'lucide-react'
import { useData } from '../state/AppContext'
import { PlaceholderBanner } from '../components/PlaceholderBanner'
import { Card, Empty, PageHeader, Stat, Badge } from '../components/ui'
import { Bars, Meter } from '../components/Charts'
import { BookingForm } from '../components/BookingForm'
import { BookingDetail } from '../components/BookingDetail'
import { STATUS_META } from '../components/status'
import { addDays, prettyDate, weekday, dateOfTs } from '../lib/dates'
import { arrivalsOn, balanceDue, dayStats, departuresOn, ghostRooms, roomStatus, type DisplayStatus } from '../lib/logic'
import { pct, rm, normRef } from '../lib/format'
import { can } from '../lib/permissions'
import type { BookingType } from '../lib/types'

export function Dashboard() {
  const { db, user, today } = useData()
  const [form, setForm] = useState<BookingType | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const money = can(user.role, 'reports.recon')
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kuala_Lumpur' }).format(new Date()))

  const s = useMemo(() => dayStats(db, today), [db, today])
  const statuses = useMemo(() => {
    const c: Record<DisplayStatus, number> = { occupied: 0, available: 0, dirty: 0, cleaning: 0, clean: 0, inspected: 0, maintenance: 0, blocked: 0 }
    for (const r of db.rooms.filter((x) => x.active)) c[roomStatus(db, r, today)]++
    return c
  }, [db, today])
  const inHouse = db.bookings.filter((b) => b.status === 'checked_in')
  const arrivals = arrivalsOn(db, today).filter((b) => b.status !== 'cancelled')
  const pendingArr = arrivals.filter((b) => b.status === 'reserved')
  const deps = departuresOn(db, today)
  const dueOut = deps.filter((b) => b.status === 'checked_in')
  const trend = useMemo(() => Array.from({ length: 21 }, (_, i) => addDays(today, i - 13)).map((d) => ({ d, s: dayStats(db, d) })), [db, today])
  const ghosts = ghostRooms(db)
  const todays = db.bookings.filter((b) => dateOfTs(b.createdAt) === today && b.status !== 'void')
  const noRef = todays.filter((b) => !normRef(b.pmsRef))
  const below = todays.filter((b) => b.belowFloor)
  const unpaidOut = db.bookings.filter((b) => b.status === 'checked_out' && b.checkedOutAt && dateOfTs(b.checkedOutAt) >= addDays(today, -7) && balanceDue(db, b) > 0.009)
  const roomNo = (id: string) => db.rooms.find((r) => r.id === id)?.number

  return (
    <div>
      <PageHeader
        title={`Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, ${user.fullName.split(' ')[0]}`}
        subtitle={`${weekday(today)}, ${prettyDate(today, { day: 'numeric', month: 'long', year: 'numeric' })} · ${db.settings.hotelName}`}
        actions={can(user.role, 'bookings.create') && <>
          <button className="btn-primary" onClick={() => setForm('walk_in')}><Footprints size={16} />Walk-in</button>
          <button className="btn-secondary" onClick={() => setForm('advance')}><CalendarPlus size={16} />Advance booking</button>
        </>}
      />
      <PlaceholderBanner />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card col-span-2 p-5 md:row-span-2">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[13px] font-medium text-slate-500">Occupancy tonight</div>
              <div className="mt-1 text-[40px] font-bold leading-none tracking-tight">{pct(s.occupancy, 0)}</div>
              <div className="mt-1 text-sm text-slate-500">{s.roomsSold} of {s.roomsAvailable} sellable rooms sold</div>
            </div>
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><Percent size={20} /></div>
          </div>
          <Meter value={s.occupancy} className="mt-4" />
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
            <div><div className="text-lg font-bold">{inHouse.length}</div><div className="text-xs text-slate-500">In house</div></div>
            <div><div className="text-lg font-bold">{pendingArr.length}<span className="text-sm font-medium text-slate-400">/{arrivals.length}</span></div><div className="text-xs text-slate-500">Arrivals pending</div></div>
            <div><div className="text-lg font-bold">{dueOut.length}<span className="text-sm font-medium text-slate-400">/{deps.length}</span></div><div className="text-xs text-slate-500">Departures due</div></div>
          </div>
        </div>
        <Stat label="Available now" value={statuses.available} hint="Clean & released" icon={<BedDouble size={19} />} tone="green" />
        <Stat label="Housekeeping" value={statuses.dirty + statuses.cleaning + statuses.clean + statuses.inspected} hint={`${statuses.dirty} dirty · ${statuses.cleaning} cleaning`} icon={<SprayCan size={19} />} tone="amber" />
        {money ? <>
          <Stat label="Room revenue tonight" value={rm(s.revenue, 0)} hint="Accrued from stays" icon={<Wallet size={19} />} tone="blue" />
          <Stat label="ADR · RevPAR" value={`${rm(s.adr, 0)}`} hint={`RevPAR ${rm(s.revpar, 0)}`} icon={<TrendingUp size={19} />} tone="violet" />
        </> : <>
          <Stat label="Maintenance" value={statuses.maintenance} icon={<Wrench size={19} />} />
          <Stat label="Blocked today" value={statuses.blocked} icon={<CalendarPlus size={19} />} tone="violet" />
        </>}
      </div>

      {money && (ghosts.length + noRef.length + below.length + unpaidOut.length > 0) && (
        <Card className="mt-4 border-rose-200 dark:border-rose-500/30" title={<span className="flex items-center gap-2 text-rose-700 dark:text-rose-300"><TriangleAlert size={17} />Needs your attention</span>} action={<Link to="/control" className="text-sm font-semibold text-brand-600">Open control →</Link>}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Flag icon={<Ghost size={16} />} n={ghosts.length} label="Ghost occupancy" body={ghosts.map((r) => r.number).join(', ') || 'None'} />
            <Flag icon={<TriangleAlert size={16} />} n={noRef.length} label="Entered today without PMS ref" body={noRef.map((b) => b.code).join(', ') || 'None'} />
            <Flag icon={<Wallet size={16} />} n={below.length} label="Sold below rate floor today" body={below.map((b) => `${b.code} @RM${b.rate}`).join(', ') || 'None'} />
            <Flag icon={<LogOut size={16} />} n={unpaidOut.length} label="Checked out with balance (7d)" body={unpaidOut.slice(0, 4).map((b) => `${b.code} ${rm(balanceDue(db, b), 0)}`).join(', ') || 'None'} />
          </div>
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Occupancy · last 2 weeks & next 7 days" action={<Link to="/calendar" className="text-sm font-semibold text-brand-600">Calendar →</Link>}>
          <Bars data={trend.map(({ d, s }) => ({ label: d, value: Math.round(s.occupancy * 100), sub: prettyDate(d, { day: 'numeric', month: 'short' }) }))} format={(v) => v + '%'} highlight={today} height={160} />
          <div className="mt-2 flex justify-between text-[11px] text-slate-400"><span>{prettyDate(trend[0].d, { day: 'numeric', month: 'short' })}</span><span className="font-semibold text-brand-600">Today</span><span>{prettyDate(trend[trend.length - 1].d, { day: 'numeric', month: 'short' })}</span></div>
        </Card>
        <Card title="Room status" action={<Link to="/rooms" className="text-sm font-semibold text-brand-600">All rooms →</Link>}>
          <div className="space-y-2">
            {(Object.keys(statuses) as DisplayStatus[]).map((k) => (
              <div key={k} className="flex items-center gap-3 text-sm">
                <span className={`h-2.5 w-2.5 rounded-full ${STATUS_META[k].dot}`} />
                <span className="flex-1 text-slate-600 dark:text-slate-300">{STATUS_META[k].label}</span>
                <span className="font-semibold tabular-nums">{statuses[k]}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><DoorOpen size={17} />Arrivals today</span>}>
          {arrivals.length === 0 ? <Empty title="No arrivals today" /> : (
            <div className="divide-y divide-black/5 dark:divide-white/5">
              {arrivals.sort((a, b) => (a.status === 'reserved' ? -1 : 1) - (b.status === 'reserved' ? -1 : 1)).map((b) => (
                <button key={b.id} onClick={() => setDetail(b.id)} className="flex w-full items-center gap-3 py-2.5 text-left hover:opacity-80">
                  <div className="grid h-10 w-12 place-items-center rounded-lg bg-black/[0.04] font-bold dark:bg-white/10">{roomNo(b.roomId)}</div>
                  <div className="min-w-0 flex-1"><div className="truncate font-medium">{b.guestName}</div><div className="text-xs text-slate-500">{b.code} · {b.pmsRef ?? 'no PMS ref'}</div></div>
                  {b.status === 'reserved' ? <Badge tone="amber">Expected</Badge> : <Badge tone="blue">Arrived</Badge>}
                </button>
              ))}
            </div>
          )}
        </Card>
        <Card title={<span className="flex items-center gap-2"><LogOut size={17} />Departures today</span>}>
          {deps.length === 0 ? <Empty title="No departures today" /> : (
            <div className="divide-y divide-black/5 dark:divide-white/5">
              {deps.sort((a) => (a.status === 'checked_in' ? -1 : 1)).map((b) => (
                <button key={b.id} onClick={() => setDetail(b.id)} className="flex w-full items-center gap-3 py-2.5 text-left hover:opacity-80">
                  <div className="grid h-10 w-12 place-items-center rounded-lg bg-black/[0.04] font-bold dark:bg-white/10">{roomNo(b.roomId)}</div>
                  <div className="min-w-0 flex-1"><div className="truncate font-medium">{b.guestName}</div><div className="text-xs text-slate-500">{b.code}{b.checkOut < today ? ' · OVERDUE' : ''}</div></div>
                  {b.status === 'checked_in' ? <Badge tone={b.checkOut < today ? 'rose' : 'amber'}>Due out</Badge> : <Badge>Left</Badge>}
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <BookingForm open={!!form} onClose={() => setForm(null)} preset={{ type: form ?? 'walk_in' }} />
      <BookingDetail id={detail} onClose={() => setDetail(null)} />
    </div>
  )
}

function Flag({ icon, n, label, body }: { icon: ReactNode; n: number; label: string; body: string }) {
  return (
    <div className={`rounded-xl p-3 ${n ? 'bg-rose-50 dark:bg-rose-500/10' : 'bg-black/[0.03] dark:bg-white/5'}`}>
      <div className="flex items-center gap-2 text-[13px] font-semibold">{icon}{label}<span className="ml-auto text-lg">{n}</span></div>
      <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{body}</div>
    </div>
  )
}
