import { useState, type ReactNode } from 'react'
import { Ban, DoorOpen, LogOut, Pencil, Plus, TriangleAlert } from 'lucide-react'
import { useData } from '../state/AppContext'
import { Badge, Field, Modal, ReasonPrompt } from './ui'
import { BOOKING_STATUS } from './status'
import { BookingForm } from './BookingForm'
import { balanceDue, nights, paidFor } from '../lib/logic'
import { prettyDate, prettyTs } from '../lib/dates'
import { rm } from '../lib/format'
import { can, isManagerPlus } from '../lib/permissions'
import { PAYMENT_LABEL, PAYMENT_METHODS, type PaymentMethod } from '../lib/types'

export function BookingDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { db, user, run, today } = useData()
  const [edit, setEdit] = useState(false)
  const [prompt, setPrompt] = useState<null | 'cancelled' | 'no_show' | 'void'>(null)
  const [payOpen, setPayOpen] = useState<null | 'in' | 'out' | 'pay'>(null)
  const [payAmt, setPayAmt] = useState(0)
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash')
  const b = db.bookings.find((x) => x.id === id)
  if (!id || !b) return null
  const room = db.rooms.find((r) => r.id === b.roomId)
  const type = db.roomTypes.find((t) => t.id === room?.typeId)
  const staff = (uid: string | null) => (uid ? db.users.find((u) => u.id === uid)?.fullName ?? 'Unknown' : '—')
  const pays = db.payments.filter((p) => p.bookingId === b.id)
  const due = balanceDue(db, b)
  const history = db.audit.filter((a) => a.entityId === b.id)
  const canEdit = b.status === 'checked_out' ? can(user.role, 'bookings.edit_after_checkout') : b.status === 'checked_in' ? isManagerPlus(user.role) : b.status === 'reserved' && can(user.role, 'bookings.create')

  const openPay = (mode: 'in' | 'out' | 'pay') => { setPayAmt(Math.max(0, due)); setPayMethod(b.paymentMethod); setPayOpen(mode) }

  async function confirmPay() {
    let ok = false
    if (payOpen === 'in') ok = await run((o) => o.checkIn(b!.id, payAmt, payMethod), `Checked in · Room ${room?.number}`)
    else if (payOpen === 'out') ok = await run((o) => o.checkOut(b!.id, payAmt, payMethod), `Checked out · Room ${room?.number} marked dirty`)
    else ok = await run((o) => o.addPayment(b!, payAmt, payMethod, 'Additional payment'), 'Payment recorded')
    if (ok) setPayOpen(null)
  }

  const row = (k: string, v: ReactNode) => (
    <div className="flex justify-between gap-4 border-b border-black/[0.04] py-2 text-sm dark:border-white/5"><span className="text-slate-500 dark:text-slate-400">{k}</span><span className="text-right font-medium">{v}</span></div>
  )

  return (
    <>
      <Modal open={!edit && !prompt && !payOpen} onClose={onClose} wide title={<span className="flex items-center gap-2">{b.code} <Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge></span>}
        footer={<>
          {b.status === 'reserved' && can(user.role, 'bookings.checkin') && b.checkIn <= today && <button className="btn-primary" onClick={() => openPay('in')}><DoorOpen size={16} />Check in</button>}
          {b.status === 'checked_in' && can(user.role, 'bookings.checkin') && <button className="btn-primary" onClick={() => openPay('out')}><LogOut size={16} />Check out</button>}
          {(b.status === 'checked_in' || b.status === 'reserved' || b.status === 'checked_out') && due > 0 && can(user.role, 'bookings.checkin') && <button className="btn-secondary" onClick={() => openPay('pay')}><Plus size={16} />Payment</button>}
          {canEdit && <button className="btn-secondary" onClick={() => setEdit(true)}><Pencil size={15} />Edit</button>}
          {b.status === 'reserved' && can(user.role, 'bookings.cancel_reserved') && <>
            <button className="btn-secondary" onClick={() => setPrompt('no_show')}>No-show</button>
            <button className="btn-secondary !text-rose-600" onClick={() => setPrompt('cancelled')}><Ban size={15} />Cancel</button>
          </>}
          {(b.status === 'checked_in' || b.status === 'checked_out') && can(user.role, 'bookings.void') && <button className="btn-secondary !text-rose-600" onClick={() => setPrompt('void')}>Void</button>}
        </>}>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <div className="text-xl font-bold">{b.guestName}</div>
            <div className="text-sm text-slate-500">{b.phone}{b.idNo ? ` · ${b.idNo}` : ''} · {b.pax} pax</div>
            <div className="mt-3">
              {row('Room', `${room?.number} · ${type?.name}`)}
              {row('Stay', `${prettyDate(b.checkIn)} → ${prettyDate(b.checkOut)} (${nights(b.checkIn, b.checkOut)}n)`)}
              {row('Type', b.type === 'walk_in' ? 'Walk-in' : 'Advance booking')}
              {row('PMS ref', b.pmsRef ? <span className="font-mono">{b.pmsRef}</span> : <span className="text-rose-600">None – {b.noPmsReason}</span>)}
              {row('Rate', <>{rm(b.rate)} / night {b.belowFloor && <Badge tone="amber">Below floor</Badge>}</>)}
              {b.discountReason && row('Discount reason', b.discountReason)}
              {row('Total', rm(b.amount))}
              {row('Paid', rm(paidFor(db, b)))}
              {row('Balance', <span className={due > 0 ? 'text-rose-600' : 'text-emerald-600'}>{rm(due)}</span>)}
              {row('Payment method', PAYMENT_LABEL[b.paymentMethod])}
              {b.statusReason && row('Status reason', b.statusReason)}
              {b.notes && row('Notes', b.notes)}
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <div className="mb-1 text-[13px] font-semibold text-slate-500">Trail</div>
              {row('Entered', `${prettyTs(b.createdAt)} · ${staff(b.createdBy)}`)}
              {row('Checked in', b.checkedInAt ? `${prettyTs(b.checkedInAt)} · ${staff(b.checkedInBy)}` : '—')}
              {row('Checked out', b.checkedOutAt ? `${prettyTs(b.checkedOutAt)} · ${staff(b.checkedOutBy)}` : '—')}
            </div>
            <div>
              <div className="mb-1 text-[13px] font-semibold text-slate-500">Payments</div>
              {pays.length === 0 && <div className="text-sm text-slate-500">No payments yet.</div>}
              {pays.map((p) => row(`${prettyDate(p.date, { day: 'numeric', month: 'short' })} · ${PAYMENT_LABEL[p.method]}`, `${rm(p.amount)} · ${staff(p.createdBy)}`))}
            </div>
            {can(user.role, 'audit') && history.length > 0 && (
              <div>
                <div className="mb-1 text-[13px] font-semibold text-slate-500">Change history</div>
                <div className="space-y-1.5">
                  {history.map((h) => (
                    <div key={h.id} className="rounded-lg bg-black/[0.03] px-2.5 py-1.5 text-[12px] dark:bg-white/5">
                      <b>{h.action}</b> · {prettyTs(h.at)} · {h.userName}{h.reason ? <> · <i>{h.reason}</i></> : null}
                      {h.action === 'update' && <div className="truncate font-mono text-[11px] text-slate-500">{Object.keys((h.after ?? {}) as object).join(', ')}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal open={!!payOpen} onClose={() => setPayOpen(null)} title={payOpen === 'in' ? `Check in · Room ${room?.number}` : payOpen === 'out' ? `Check out · Room ${room?.number}` : 'Record payment'}
        footer={<><button className="btn-secondary" onClick={() => setPayOpen(null)}>Back</button><button className="btn-primary" onClick={confirmPay}>{payOpen === 'in' ? 'Confirm check-in' : payOpen === 'out' ? 'Confirm check-out' : 'Save payment'}</button></>}>
        <div className="space-y-4">
          <div className="rounded-xl bg-black/[0.03] p-3 text-sm dark:bg-white/5">{b.guestName} · total {rm(b.amount)} · paid {rm(paidFor(db, b))} · <b>balance {rm(due)}</b></div>
          {payOpen === 'out' && today < b.checkOut && <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"><TriangleAlert size={15} />Early departure – the stay will be shortened to today and the room released.</div>}
          {payOpen === 'in' && !b.pmsRef && <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">No PMS ref on this booking – it will be flagged.</div>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Collect now (RM)"><input type="number" min={0} step="0.01" className="input" value={payAmt || ''} onChange={(e) => setPayAmt(Number(e.target.value))} /></Field>
            <Field label="Method"><select className="input" value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_LABEL[m]}</option>)}</select></Field>
          </div>
        </div>
      </Modal>

      <BookingForm open={edit} onClose={() => setEdit(false)} edit={b} />
      <ReasonPrompt open={!!prompt} onClose={() => setPrompt(null)} danger
        title={prompt === 'void' ? `Void ${b.code}` : prompt === 'no_show' ? `Mark ${b.code} as no-show` : `Cancel ${b.code}`}
        label="Reason (required)" confirmLabel={prompt === 'void' ? 'Void booking' : prompt === 'no_show' ? 'Mark no-show' : 'Cancel booking'}
        onConfirm={async (r) => { if (await run((o) => o.setStatus(b.id, prompt!, r), 'Saved')) setPrompt(null) }} />
    </>
  )
}
