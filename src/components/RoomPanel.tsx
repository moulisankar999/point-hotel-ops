import { useState } from 'react'
import { CalendarPlus, Ghost, Wrench, Footprints, Trash2 } from 'lucide-react'
import { useData } from '../state/AppContext'
import { Badge, Field, Modal } from './ui'
import { STATUS_META, BOOKING_STATUS } from './status'
import { BookingForm } from './BookingForm'
import { BookingDetail } from './BookingDetail'
import { currentBooking, roomStatus } from '../lib/logic'
import { addDays, prettyDate, prettyTs } from '../lib/dates'
import { can } from '../lib/permissions'
import type { BookingType } from '../lib/types'

export function RoomPanel({ roomId, onClose }: { roomId: string | null; onClose: () => void }) {
  const { db, user, today, run } = useData()
  const [form, setForm] = useState<BookingType | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [blockOpen, setBlockOpen] = useState(false)
  const [oooOpen, setOooOpen] = useState(false)
  const [bf, setBf] = useState({ from: addDays(today, 1), to: addDays(today, 2), reason: '' })
  const [oooReason, setOooReason] = useState('')
  const room = db.rooms.find((r) => r.id === roomId)
  if (!room) return null
  const type = db.roomTypes.find((t) => t.id === room.typeId)
  const st = roomStatus(db, room, today)
  const cur = currentBooking(db, room.id)
  const upcoming = db.bookings.filter((b) => b.roomId === room.id && b.status === 'reserved').sort((a, b) => a.checkIn.localeCompare(b.checkIn))
  const blocks = db.blocks.filter((k) => k.roomId === room.id && k.active && k.to > today)
  const manage = can(user.role, 'rooms.manage')
  const hidden = !!form || !!detail || blockOpen || oooOpen

  return (
    <>
      <Modal open={!hidden} onClose={onClose} title={<span className="flex items-center gap-2">Room {room.number} <span className="text-sm font-medium text-slate-500">· {type?.name} · Floor {room.floor}</span></span>}>
        <div className="space-y-4">
          <div className={`flex items-center justify-between rounded-2xl border p-3 ${STATUS_META[st].tile}`}>
            <span className="font-semibold">{STATUS_META[st].label}</span>
            {room.outOfOrder && <span className="text-sm">{room.outOfOrderReason}</span>}
          </div>
          {room.hkSeenOccupied && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200"><Ghost size={16} />Housekeeping saw this room in use {room.hkSeenAt ? prettyTs(room.hkSeenAt) : ''}{!cur && ' – but no guest is checked in.'}</div>
          )}
          {cur ? (
            <button onClick={() => setDetail(cur.id)} className="w-full rounded-2xl bg-black/[0.03] p-3 text-left dark:bg-white/5">
              <div className="text-xs font-semibold text-slate-500">IN HOUSE</div>
              <div className="font-semibold">{cur.guestName}</div>
              <div className="text-sm text-slate-500">{cur.code} · until {prettyDate(cur.checkOut)} · {cur.pmsRef ?? 'no PMS ref'}</div>
            </button>
          ) : null}
          <div>
            <div className="mb-1.5 text-[13px] font-semibold text-slate-500">Upcoming ({upcoming.length})</div>
            {upcoming.length === 0 && <div className="text-sm text-slate-500">No advance bookings.</div>}
            <div className="space-y-1.5">
              {upcoming.slice(0, 6).map((b) => (
                <button key={b.id} onClick={() => setDetail(b.id)} className="flex w-full items-center justify-between rounded-xl bg-black/[0.03] px-3 py-2 text-left text-sm dark:bg-white/5">
                  <span><b>{prettyDate(b.checkIn, { day: 'numeric', month: 'short' })} → {prettyDate(b.checkOut, { day: 'numeric', month: 'short' })}</b> · {b.guestName}</span>
                  <Badge tone={BOOKING_STATUS[b.status].tone}>{b.code}</Badge>
                </button>
              ))}
            </div>
          </div>
          {blocks.length > 0 && (
            <div>
              <div className="mb-1.5 text-[13px] font-semibold text-slate-500">Blocked dates</div>
              {blocks.map((k) => (
                <div key={k.id} className="flex items-center justify-between rounded-xl bg-violet-50 px-3 py-2 text-sm dark:bg-violet-500/10">
                  <span>{prettyDate(k.from, { day: 'numeric', month: 'short' })} → {prettyDate(k.to, { day: 'numeric', month: 'short' })} · {k.reason}</span>
                  {manage && <button className="text-rose-600" aria-label="Remove block" onClick={() => { const r = prompt('Reason for removing this block?'); if (r) run((o) => o.removeBlock(k.id, r), 'Block removed') }}><Trash2 size={15} /></button>}
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2 border-t border-black/5 pt-4 dark:border-white/10">
            {can(user.role, 'bookings.create') && !cur && !room.outOfOrder && <button className="btn-primary btn-sm" onClick={() => setForm('walk_in')}><Footprints size={15} />Walk-in here</button>}
            {can(user.role, 'bookings.create') && !room.outOfOrder && <button className="btn-secondary btn-sm" onClick={() => setForm('advance')}><CalendarPlus size={15} />Advance booking</button>}
            {manage && <button className="btn-secondary btn-sm" onClick={() => setBlockOpen(true)}>Block dates</button>}
            {manage && (room.outOfOrder
              ? <button className="btn-secondary btn-sm" onClick={() => run((o) => o.setOutOfOrder(room.id, false, 'Back in service'), 'Room back in service')}><Wrench size={15} />End maintenance</button>
              : !cur && <button className="btn-secondary btn-sm" onClick={() => setOooOpen(true)}><Wrench size={15} />Under maintenance</button>)}
            {(can(user.role, 'housekeeping')) && (room.hkSeenOccupied
              ? <button className="btn-ghost btn-sm" onClick={() => run((o) => o.reportSeenOccupied(room.id, false), 'Cleared')}>Clear "seen in use"</button>
              : !cur && <button className="btn-ghost btn-sm !text-rose-600" onClick={() => run((o) => o.reportSeenOccupied(room.id, true), 'Reported to management')}><Ghost size={15} />Seen in use</button>)}
          </div>
        </div>
      </Modal>

      <BookingForm open={!!form} onClose={() => setForm(null)} preset={{ type: form ?? 'advance', roomId: room.id, checkIn: form === 'advance' ? (cur ? cur.checkOut : today) : today }} />
      <BookingDetail id={detail} onClose={() => setDetail(null)} />
      <Modal open={blockOpen} onClose={() => setBlockOpen(false)} title={`Block dates · Room ${room.number}`}
        footer={<><button className="btn-secondary" onClick={() => setBlockOpen(false)}>Cancel</button><button className="btn-primary" onClick={async () => { if (await run((o) => o.addBlock(room.id, bf.from, bf.to, bf.reason), 'Dates blocked')) setBlockOpen(false) }}>Block</button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From"><input type="date" className="input" value={bf.from} onChange={(e) => setBf({ ...bf, from: e.target.value })} /></Field>
          <Field label="Until (not incl.)"><input type="date" className="input" value={bf.to} onChange={(e) => setBf({ ...bf, to: e.target.value })} /></Field>
          <Field label="Reason" className="sm:col-span-2"><input className="input" value={bf.reason} onChange={(e) => setBf({ ...bf, reason: e.target.value })} placeholder="e.g. Owner use, renovation" /></Field>
        </div>
      </Modal>
      <Modal open={oooOpen} onClose={() => setOooOpen(false)} title={`Maintenance · Room ${room.number}`}
        footer={<><button className="btn-secondary" onClick={() => setOooOpen(false)}>Cancel</button><button className="btn-primary" onClick={async () => { if (await run((o) => o.setOutOfOrder(room.id, true, oooReason), 'Room set under maintenance')) setOooOpen(false) }}>Set under maintenance</button></>}>
        <Field label="What's wrong?"><input className="input" value={oooReason} onChange={(e) => setOooReason(e.target.value)} placeholder="e.g. Aircon leaking" autoFocus /></Field>
      </Modal>
    </>
  )
}
