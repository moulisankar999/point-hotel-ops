import { useMemo, useState, type ReactNode } from 'react'
import { Ghost, TriangleAlert, Wallet, Ban, Banknote } from 'lucide-react'
import { useData } from '../state/AppContext'
import { Badge, Card, Empty, Field, Modal, PageHeader } from '../components/ui'
import { BookingDetail } from '../components/BookingDetail'
import { addDays, dateOfTs, eachDay, prettyDate, prettyTs } from '../lib/dates'
import { ghostRooms, reconciliation } from '../lib/logic'
import { cls, pct, rm } from '../lib/format'
import { PAYMENT_LABEL, PAYMENT_METHODS } from '../lib/types'

export function Control() {
  const { db, today, run } = useData()
  const [date, setDate] = useState(today)
  const [detail, setDetail] = useState<string | null>(null)
  const [cashOpen, setCashOpen] = useState(false)
  const [cash, setCash] = useState({ amount: 0, note: '' })
  const r = useMemo(() => reconciliation(db, date), [db, date])
  const hist = useMemo(() => eachDay(addDays(today, -13), addDays(today, 1)).reverse().map((d) => reconciliation(db, d)), [db, today])
  const ghosts = ghostRooms(db)
  const since = addDays(today, -30)
  const recent = db.bookings.filter((b) => dateOfTs(b.createdAt) >= since)
  const below = recent.filter((b) => b.belowFloor && b.status !== 'void')
  const noRef = recent.filter((b) => !b.pmsRef && b.status !== 'void')
  const cancelled = db.bookings.filter((b) => ['cancelled', 'void', 'no_show'].includes(b.status) && b.checkIn >= since)
  const roomNo = (id: string) => db.rooms.find((x) => x.id === id)?.number
  const staff = (id: string | null | undefined) => db.users.find((u) => u.id === id)?.fullName ?? '—'
  const counts = db.cashCounts.filter((c) => c.date === date)

  return (
    <div>
      <PageHeader title="Control & reconciliation" subtitle="Rooms sold vs revenue vs cash – and everything that looks off"
        actions={<>
          <input type="date" className="input !w-auto" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
          <button className="btn-primary" onClick={() => { setCash({ amount: 0, note: '' }); setCashOpen(true) }}><Banknote size={16} />Count cash</button>
        </>} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={`Daily reconciliation · ${prettyDate(date)}`} className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <Box label="Rooms sold" value={`${r.roomsSold} / ${r.roomsAvailable}`} sub={pct(r.roomsAvailable ? r.roomsSold / r.roomsAvailable : 0, 0) + ' occupancy'} />
            <Box label="Room revenue (accrued)" value={rm(r.roomRevenue)} sub={`${r.checkIns} check-ins · ${r.checkOuts} check-outs`} />
            <Box label="Collected today" value={rm(r.collectedTotal)} sub={`${r.walkIns} walk-ins entered`} />
          </div>
          <table className="mt-4 w-full">
            <thead><tr><th className="th">Method</th><th className="th text-right">Collected</th></tr></thead>
            <tbody>
              {PAYMENT_METHODS.map((m) => <tr key={m}><td className="td">{PAYMENT_LABEL[m]}</td><td className="td text-right tabular-nums">{rm(r.collectedByMethod[m])}</td></tr>)}
            </tbody>
          </table>
          <div className={cls('mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl p-3', r.cashVariance == null ? 'bg-black/[0.03] dark:bg-white/5' : Math.abs(r.cashVariance) < 1 ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200' : 'bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200')}>
            <span className="text-sm font-medium">Cash in drawer {r.cashCounted == null ? 'not counted yet' : `counted ${rm(r.cashCounted)} vs expected ${rm(r.collectedByMethod.cash)}`}</span>
            {r.cashVariance != null && <span className="text-lg font-bold">{r.cashVariance > 0 ? '+' : ''}{rm(r.cashVariance)}</span>}
          </div>
          {counts.length > 0 && <div className="mt-2 space-y-1 text-xs text-slate-500">{counts.map((c) => <div key={c.id}>{prettyTs(c.createdAt)} · {staff(c.createdBy)} counted {rm(c.amount)}{c.note ? ` – ${c.note}` : ''}</div>)}</div>}
        </Card>
        <Card title="Flags">
          <div className="space-y-2.5">
            <FlagRow icon={<Ghost size={16} />} label="Ghost occupancy now" n={r.ghost} />
            <FlagRow icon={<TriangleAlert size={16} />} label="Entered without PMS ref" n={r.noPmsRef} />
            <FlagRow icon={<Wallet size={16} />} label="Below rate floor" n={r.belowFloor} />
            <FlagRow icon={<Ghost size={16} />} label="Rooms HK saw in use" n={r.hkObservedOccupied} />
          </div>
        </Card>
      </div>

      <Card className="mt-4" title={<span className="flex items-center gap-2"><Ghost size={17} />Ghost occupancy report</span>}>
        <p className="mb-3 text-sm text-slate-500">Rooms housekeeping reported as in use (guest, luggage or a slept-in bed) while no guest is checked in. This usually means someone was put in a room without being recorded.</p>
        {ghosts.length === 0 ? <Empty title="No ghost occupancy detected" /> : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ghosts.map((g) => (
              <div key={g.id} className="rounded-xl bg-rose-50 p-3 text-sm dark:bg-rose-500/10">
                <div className="font-bold">Room {g.number}</div>
                <div className="text-slate-600 dark:text-slate-300">Seen in use by {staff(g.hkSeenBy)} {g.hkSeenAt ? prettyTs(g.hkSeenAt) : ''}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <BookingList title="Sold below rate floor (30 days)" items={below} onOpen={setDetail} roomNo={roomNo} extra={(b) => `${rm(b.rate, 0)}/night · ${b.discountReason ?? ''} · by ${staff(b.createdBy)}`} />
        <BookingList title="No PMS reference (30 days)" items={noRef} onOpen={setDetail} roomNo={roomNo} extra={(b) => `${b.noPmsReason ?? ''} · by ${staff(b.createdBy)}`} />
      </div>
      <div className="mt-4">
        <BookingList title={<span className="flex items-center gap-2"><Ban size={16} />Cancelled, void & no-show (30 days)</span>} items={cancelled} onOpen={setDetail} roomNo={roomNo} extra={(b) => `${b.status.replace('_', '-')} · ${b.statusReason ?? ''}`} />
      </div>

      <Card className="mt-4" title="Last 14 days">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead><tr><th className="th">Date</th><th className="th text-right">Sold</th><th className="th text-right">Revenue</th><th className="th text-right">Collected</th><th className="th text-right">Cash</th><th className="th text-right">Counted</th><th className="th text-right">Variance</th><th className="th text-right">No ref</th><th className="th text-right">Below floor</th></tr></thead>
            <tbody>
              {hist.map((h) => (
                <tr key={h.date} onClick={() => setDate(h.date)} className={cls('cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.03]', h.date === date && 'bg-brand-50/60 dark:bg-brand-500/10')}>
                  <td className="td">{prettyDate(h.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                  <td className="td text-right">{h.roomsSold}</td>
                  <td className="td text-right">{rm(h.roomRevenue, 0)}</td>
                  <td className="td text-right">{rm(h.collectedTotal, 0)}</td>
                  <td className="td text-right">{rm(h.collectedByMethod.cash, 0)}</td>
                  <td className="td text-right">{h.cashCounted == null ? '—' : rm(h.cashCounted, 0)}</td>
                  <td className={cls('td text-right font-semibold', h.cashVariance != null && Math.abs(h.cashVariance) >= 1 && 'text-rose-600')}>{h.cashVariance == null ? '—' : rm(h.cashVariance, 0)}</td>
                  <td className={cls('td text-right', h.noPmsRef > 0 && 'text-rose-600')}>{h.noPmsRef}</td>
                  <td className={cls('td text-right', h.belowFloor > 0 && 'text-amber-600')}>{h.belowFloor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={cashOpen} onClose={() => setCashOpen(false)} title={`Cash count · ${prettyDate(date)}`}
        footer={<><button className="btn-secondary" onClick={() => setCashOpen(false)}>Cancel</button><button className="btn-primary" onClick={async () => { if (await run((o) => o.addCashCount(date, cash.amount, cash.note), 'Cash count saved')) setCashOpen(false) }}>Save count</button></>}>
        <div className="space-y-3">
          <div className="rounded-xl bg-black/[0.03] p-3 text-sm dark:bg-white/5">Expected cash from payments recorded on this day: <b>{rm(r.collectedByMethod.cash)}</b></div>
          <Field label="Cash actually in drawer (RM)"><input type="number" min={0} step="0.01" className="input" value={cash.amount || ''} onChange={(e) => setCash({ ...cash, amount: Number(e.target.value) })} autoFocus /></Field>
          <Field label="Note (optional)"><input className="input" value={cash.note} onChange={(e) => setCash({ ...cash, note: e.target.value })} placeholder="e.g. Night shift handover" /></Field>
        </div>
      </Modal>
      <BookingDetail id={detail} onClose={() => setDetail(null)} />
    </div>
  )
}

function Box({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="rounded-xl bg-black/[0.03] p-3 dark:bg-white/5"><div className="text-[13px] text-slate-500">{label}</div><div className="mt-0.5 text-xl font-bold">{value}</div><div className="text-xs text-slate-500">{sub}</div></div>
}
function FlagRow({ icon, label, n }: { icon: ReactNode; label: string; n: number }) {
  return <div className={cls('flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm', n ? 'bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200' : 'bg-black/[0.03] dark:bg-white/5')}>{icon}<span className="flex-1">{label}</span><b>{n}</b></div>
}
function BookingList({ title, items, onOpen, roomNo, extra }: { title: ReactNode; items: import('../lib/types').Booking[]; onOpen: (id: string) => void; roomNo: (id: string) => string | undefined; extra: (b: import('../lib/types').Booking) => string }) {
  return (
    <Card title={<span className="flex items-center gap-2">{title}<Badge tone={items.length ? 'rose' : 'slate'}>{items.length}</Badge></span>}>
      {items.length === 0 ? <div className="text-sm text-slate-500">None.</div> : (
        <div className="max-h-80 divide-y divide-black/5 overflow-y-auto dark:divide-white/5">
          {items.map((b) => (
            <button key={b.id} onClick={() => onOpen(b.id)} className="flex w-full items-center gap-3 py-2 text-left text-sm hover:opacity-80">
              <span className="w-10 font-bold">{roomNo(b.roomId)}</span>
              <span className="min-w-0 flex-1"><span className="font-medium">{b.guestName}</span> <span className="text-xs text-slate-500">{b.code} · {prettyDate(b.checkIn, { day: 'numeric', month: 'short' })}</span><div className="truncate text-xs text-slate-500">{extra(b)}</div></span>
              <span className="tabular-nums">{rm(b.amount, 0)}</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}
