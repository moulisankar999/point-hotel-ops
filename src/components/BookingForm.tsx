import { useEffect, useMemo, useState } from 'react'
import { Sparkles, TriangleAlert, UserCheck } from 'lucide-react'
import { useData } from '../state/AppContext'
import { Field, Modal, Segmented } from './ui'
import { availableRooms, nights, validateBooking, isBelowFloor, type BookingInput } from '../lib/logic'
import { addDays, prettyDate } from '../lib/dates'
import { normRef, rm, round2, cls } from '../lib/format'
import { PAYMENT_LABEL, PAYMENT_METHODS, type Booking, type BookingType, type PaymentMethod } from '../lib/types'

interface Props {
  open: boolean
  onClose: () => void
  edit?: Booking | null
  preset?: { type?: BookingType; roomId?: string; checkIn?: string; checkOut?: string }
}

export function BookingForm({ open, onClose, edit, preset }: Props) {
  if (!open) return null
  return <BookingFormInner onClose={onClose} edit={edit} preset={preset} />
}

function BookingFormInner({ onClose, edit, preset }: Omit<Props, 'open'>) {
  const { db, today, run } = useData()
  const [type, setType] = useState<BookingType>(edit?.type ?? preset?.type ?? 'walk_in')
  const [pmsRef, setPmsRef] = useState(edit?.pmsRef ?? '')
  const [noPms, setNoPms] = useState(!!edit && !edit.pmsRef)
  const [noPmsReason, setNoPmsReason] = useState(edit?.noPmsReason ?? '')
  const [checkIn, setCheckIn] = useState(edit?.checkIn ?? preset?.checkIn ?? today)
  const [checkOut, setCheckOut] = useState(edit?.checkOut ?? preset?.checkOut ?? addDays(preset?.checkIn ?? today, 1))
  const presetRoom = db.rooms.find((r) => r.id === (edit?.roomId ?? preset?.roomId))
  const [typeId, setTypeId] = useState<string>(presetRoom?.typeId ?? '')
  const [roomId, setRoomId] = useState(presetRoom?.id ?? '')
  const [guestName, setGuestName] = useState(edit?.guestName ?? '')
  const [phone, setPhone] = useState(edit?.phone ?? '')
  const [idNo, setIdNo] = useState(edit?.idNo ?? '')
  const [pax, setPax] = useState(edit?.pax ?? 1)
  const [rate, setRate] = useState<number>(edit?.rate ?? 0)
  const [amount, setAmount] = useState<number>(edit?.amount ?? 0)
  const [amountTouched, setAmountTouched] = useState(!!edit)
  const [method, setMethod] = useState<PaymentMethod>(edit?.paymentMethod ?? 'cash')
  const [paid, setPaid] = useState<number>(0)
  const [paidTouched, setPaidTouched] = useState(false)
  const [discountReason, setDiscountReason] = useState(edit?.discountReason ?? '')
  const [notes, setNotes] = useState(edit?.notes ?? '')
  const [checkInNow, setCheckInNow] = useState(!edit && (preset?.type ?? 'walk_in') === 'walk_in')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const n = nights(checkIn, checkOut)
  const room = db.rooms.find((r) => r.id === roomId)
  const rtype = db.roomTypes.find((t) => t.id === (room?.typeId ?? typeId))
  const avail = useMemo(() => availableRooms(db, checkIn, checkOut, typeId || undefined, edit?.id), [db, checkIn, checkOut, typeId, edit?.id])
  const roomStillFree = useMemo(() => !roomId || availableRooms(db, checkIn, checkOut, undefined, edit?.id).some((r) => r.id === roomId), [db, roomId, checkIn, checkOut, edit?.id])

  // walk-ins always start today
  useEffect(() => {
    if (type === 'walk_in' && !edit) { setCheckIn(today); if (checkOut <= today) setCheckOut(addDays(today, 1)) }
    if (type === 'advance' && !edit) setNoPms(false)
  }, [type]) // eslint-disable-line react-hooks/exhaustive-deps

  // auto-fill rate from room type
  useEffect(() => {
    if (edit && room?.id === edit.roomId) return
    if (rtype) setRate(rtype.baseRate)
  }, [rtype?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // auto-calc amount
  useEffect(() => {
    if (!amountTouched) setAmount(round2(rate * n))
  }, [rate, n, amountTouched])

  useEffect(() => {
    if (!paidTouched && !edit) setPaid(type === 'walk_in' || method === 'online' ? amount : 0)
  }, [amount, type, method, paidTouched, edit])

  // returning guest auto-fill by phone
  const returning = useMemo(() => {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 7 || edit) return null
    return [...db.bookings].reverse().find((b) => b.phone.replace(/\D/g, '').endsWith(digits.slice(-8)))
  }, [phone, db.bookings, edit])

  const dupRef = useMemo(() => {
    const r = normRef(pmsRef)
    if (!r) return null
    return db.bookings.find((b) => b.id !== edit?.id && normRef(b.pmsRef) === r && b.status !== 'void' && b.status !== 'cancelled') ?? null
  }, [pmsRef, db.bookings, edit?.id])

  const below = isBelowFloor(rate, rtype)

  const input: BookingInput = {
    type, pmsRef: noPms ? null : pmsRef, noPmsReason: noPms ? noPmsReason : null, roomId, guestName, phone, idNo: idNo || null, pax,
    checkIn, checkOut, rate, amount, paymentMethod: method, amountPaid: edit ? 0 : paid, discountReason: below ? discountReason : null, notes: notes || null,
  }

  async function submit() {
    const errs = validateBooking(db, input, today, edit?.id)
    if (edit && reason.trim().length < 5) errs.push('Give a reason for this change.')
    setErrors(errs)
    if (errs.length) return
    setBusy(true)
    const ok = edit
      ? await run((o) => o.updateBooking(edit.id, input, reason), 'Booking updated')
      : await run((o) => o.createBooking(input, checkInNow), checkInNow ? `Checked in · Room ${room?.number}` : 'Advance booking saved – dates blocked')
    setBusy(false)
    if (ok) onClose()
  }

  const canCheckInNow = !edit && checkIn === today

  return (
    <Modal open onClose={onClose} wide title={edit ? `Edit ${edit.code}` : 'New booking'}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : edit ? 'Save changes' : checkInNow && canCheckInNow ? 'Save & check in' : 'Save booking'}</button>
      </>}>
      <div className="space-y-5">
        {!edit && (
          <Segmented value={type} onChange={setType} options={[{ value: 'walk_in', label: 'Walk-in (today)' }, { value: 'advance', label: 'Advance booking' }]} />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={type === 'advance' ? 'PMS ref no. *' : 'PMS ref no.'} error={dupRef ? `Already used by ${dupRef.code} (${dupRef.guestName})` : null} hint="Reference number from the existing booking system">
            <input className={cls('input font-mono uppercase', dupRef && '!border-rose-500')} value={pmsRef} onChange={(e) => setPmsRef(e.target.value)} disabled={noPms} placeholder="e.g. PMS-248113" />
          </Field>
          {type === 'walk_in' && (
            <div>
              <label className="mt-7 flex items-center gap-2 text-sm"><input type="checkbox" checked={noPms} onChange={(e) => setNoPms(e.target.checked)} className="h-4 w-4" /> No PMS ref (flagged for review)</label>
              {noPms && <input className="input mt-2" placeholder="Reason – required" value={noPmsReason} onChange={(e) => setNoPmsReason(e.target.value)} />}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Check-in">
            <input type="date" className="input" value={checkIn} min={edit ? undefined : today} disabled={type === 'walk_in' && !edit} onChange={(e) => { setCheckIn(e.target.value); if (checkOut <= e.target.value) setCheckOut(addDays(e.target.value, 1)) }} />
          </Field>
          <Field label="Check-out" hint={<span className="flex gap-1">{[1, 2, 3, 7].map((k) => <button type="button" key={k} className="rounded-md bg-black/5 px-1.5 py-0.5 text-[11px] font-semibold dark:bg-white/10" onClick={() => setCheckOut(addDays(checkIn, k))}>{k}n</button>)}</span>}>
            <input type="date" className="input" value={checkOut} min={addDays(checkIn, 1)} onChange={(e) => setCheckOut(e.target.value)} />
          </Field>
          <Field label="Nights">
            <div className="input bg-black/[0.02] font-semibold dark:bg-white/5">{n} night{n === 1 ? '' : 's'}</div>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Room type">
            <select className="input" value={typeId} onChange={(e) => { setTypeId(e.target.value); setRoomId('') }}>
              <option value="">Any type</option>
              {db.roomTypes.map((t) => <option key={t.id} value={t.id}>{t.name} · RM {t.baseRate}</option>)}
            </select>
          </Field>
          <Field label="Room *" className="sm:col-span-2" error={!roomStillFree ? 'This room is not free for the chosen dates.' : null}>
            <select className="input" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">{avail.length} room{avail.length === 1 ? '' : 's'} free – choose…</option>
              {edit && room && !avail.some((r) => r.id === room.id) && <option value={room.id}>Room {room.number} (current)</option>}
              {avail.map((r) => <option key={r.id} value={r.id}>Room {r.number} · {db.roomTypes.find((t) => t.id === r.typeId)?.name} · floor {r.floor}{r.hkStatus !== 'ready' ? ` · ${r.hkStatus}` : ''}</option>)}
            </select>
          </Field>
        </div>
        {!roomId && avail.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-700 dark:text-brand-300"><Sparkles size={14} /> Suggested free rooms ({prettyDate(checkIn, { day: 'numeric', month: 'short' })} – {prettyDate(checkOut, { day: 'numeric', month: 'short' })})</div>
            <div className="flex flex-wrap gap-2">
              {avail.slice(0, 10).map((r) => (
                <button type="button" key={r.id} onClick={() => setRoomId(r.id)} className="rounded-xl border border-black/10 bg-white px-3 py-1.5 text-left text-[13px] hover:border-brand-500 dark:border-white/10 dark:bg-white/5">
                  <span className="font-bold">{r.number}</span> <span className="text-slate-500">{db.roomTypes.find((t) => t.id === r.typeId)?.code}{r.hkStatus !== 'ready' ? ' · ' + r.hkStatus : ''}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone *" hint={returning ? undefined : 'Returning guests are recognised by phone'}>
            <input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+60 12-345 6789" />
          </Field>
          <Field label="Guest name *">
            <input className="input" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
          </Field>
        </div>
        {returning && (returning.guestName !== guestName || (returning.idNo ?? '') !== idNo) && (
          <button type="button" onClick={() => { setGuestName(returning.guestName); setIdNo(returning.idNo ?? '') }} className="-mt-2 flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-[13px] text-brand-800 dark:bg-brand-500/15 dark:text-brand-100">
            <UserCheck size={15} /> Returning guest: <b>{returning.guestName}</b> (last stay {prettyDate(returning.checkIn)}) – tap to fill
          </button>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="IC / Passport (optional)"><input className="input" value={idNo} onChange={(e) => setIdNo(e.target.value)} /></Field>
          <Field label="Pax" hint={rtype ? `Max ${rtype.maxPax} for ${rtype.name}` : undefined}><input type="number" min={1} max={8} className="input" value={pax} onChange={(e) => setPax(Number(e.target.value))} /></Field>
          <Field label="Payment method">
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_LABEL[m]}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Rate / night (RM)" hint={rtype ? `Base RM ${rtype.baseRate} · floor RM ${rtype.rateFloor}` : 'Auto-filled from room type'}>
            <input type="number" min={0} step="0.01" className={cls('input', below && '!border-amber-500')} value={rate || ''} onChange={(e) => setRate(Number(e.target.value))} />
          </Field>
          <Field label="Total amount (RM)" hint={amountTouched ? <button type="button" className="underline" onClick={() => setAmountTouched(false)}>Reset to {rm(rate * n)}</button> : `${n} × RM ${rate || 0}`}>
            <input type="number" min={0} step="0.01" className="input font-semibold" value={amount || ''} onChange={(e) => { setAmount(Number(e.target.value)); setAmountTouched(true) }} />
          </Field>
          {!edit && (
            <Field label="Paid now (RM)" hint={type === 'advance' ? 'Deposit, if any' : 'Collected at check-in'}>
              <input type="number" min={0} step="0.01" className="input" value={paid || ''} onChange={(e) => { setPaid(Number(e.target.value)); setPaidTouched(true) }} />
            </Field>
          )}
        </div>
        {below && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200"><TriangleAlert size={15} /> Below rate floor – will be flagged to management</div>
            <input className="input mt-2" placeholder="Discount reason – required" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} />
          </div>
        )}
        <Field label="Notes (optional)"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>

        {canCheckInNow && (
          <label className="flex items-center gap-2 rounded-xl bg-black/[0.03] px-3 py-2.5 text-sm font-medium dark:bg-white/5">
            <input type="checkbox" className="h-4 w-4" checked={checkInNow} onChange={(e) => setCheckInNow(e.target.checked)} /> Guest is here – check in now
          </label>
        )}
        {edit && (
          <Field label="Reason for change *" hint={edit.status === 'checked_out' ? 'Editing after check-out needs Manager or above. Logged permanently.' : 'Logged permanently in the audit trail.'}>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
        {errors.length > 0 && (
          <ul className="space-y-1 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
            {errors.map((e) => <li key={e}>• {e}</li>)}
          </ul>
        )}
      </div>
    </Modal>
  )
}
