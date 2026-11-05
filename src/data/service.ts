import type { AlertItem, AppUser, Booking, CashCount, Db, Expense, FixedExpense, HkTask, PaymentMethod, Payment, Room, RoomBlock, RoomType } from '../lib/types'
import { can, isManagerPlus } from '../lib/permissions'
import { type BookingInput, isBelowFloor, missingHkTasks, nights, rangesOverlap, BLOCKING, validateBooking } from '../lib/logic'
import { todayKL } from '../lib/dates'
import { normRef, round2, uid } from '../lib/format'
import type { Store } from './store'

export class OpsError extends Error {}

function need(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new OpsError(msg)
}

/** Domain operations. Validation here is mirrored by database constraints/triggers in Supabase mode. */
export class OpsService {
  constructor(private store: Store, private db: Db, private user: AppUser) {}

  private now() { return new Date().toISOString() }

  private nextCode(): string {
    const max = this.db.bookings.reduce((m, b) => Math.max(m, Number(b.code.replace(/\D/g, '')) || 0), 1000)
    return `TP-${max + 1}`
  }

  private async alert(type: AlertItem['type'], title: string, message: string, bookingId: string | null) {
    if (this.store.serverAlerts) return
    await this.store.insert<AlertItem>('alerts', { id: uid(), type, title, message, bookingId, createdBy: this.user.id, createdAt: this.now(), readBy: [] })
  }

  private roomNo(roomId: string) { return this.db.rooms.find((r) => r.id === roomId)?.number ?? '?' }

  async createBooking(input: BookingInput, checkInNow: boolean): Promise<Booking> {
    need(can(this.user.role, 'bookings.create'), 'You cannot create bookings.')
    const today = todayKL()
    const errs = validateBooking(this.db, input, today)
    if (errs.length) throw new OpsError(errs.join('\n'))
    if (checkInNow) need(input.checkIn === today, 'Only bookings starting today can be checked in now.')
    const room = this.db.rooms.find((r) => r.id === input.roomId)!
    const type = this.db.roomTypes.find((t) => t.id === room.typeId)
    const now = this.now()
    const b: Booking = {
      id: uid(), code: this.nextCode(), type: input.type, pmsRef: normRef(input.pmsRef) || null, noPmsReason: normRef(input.pmsRef) ? null : (input.noPmsReason?.trim() || null),
      roomId: input.roomId, guestName: input.guestName.trim(), phone: input.phone.trim(), idNo: input.idNo?.trim() || null, pax: input.pax,
      checkIn: input.checkIn, checkOut: input.checkOut, rate: round2(input.rate), amount: round2(input.amount), paymentMethod: input.paymentMethod,
      status: checkInNow ? 'checked_in' : 'reserved', notes: input.notes?.trim() || null, belowFloor: isBelowFloor(input.rate, type), discountReason: input.discountReason?.trim() || null,
      statusReason: null, createdBy: this.user.id, createdAt: now, checkedInAt: checkInNow ? now : null, checkedInBy: checkInNow ? this.user.id : null,
      checkedOutAt: null, checkedOutBy: null, updatedAt: now,
    }
    const saved = await this.store.insert('bookings', b)
    if (input.amountPaid > 0) await this.addPayment(saved, input.amountPaid, input.paymentMethod, checkInNow ? 'Paid at check-in' : 'Deposit')
    const tag = b.pmsRef ? `PMS ${b.pmsRef}` : 'NO PMS REF'
    if (checkInNow) {
      await this.alert(b.type === 'walk_in' ? 'walk_in' : 'check_in', `${b.type === 'walk_in' ? 'Walk-in check-in' : 'Check-in'} · Room ${room.number}`, `${b.guestName} · ${b.code} · ${tag} · ${nights(b.checkIn, b.checkOut)}n · RM ${b.amount}`, saved.id)
      await this.store.update<Room>('rooms', room.id, { hkSeenOccupied: false })
    } else {
      await this.alert('advance', `Advance booking · Room ${room.number}`, `${b.guestName} · ${b.checkIn} → ${b.checkOut} · ${tag}`, saved.id)
    }
    if (b.belowFloor) await this.alert('flag', `Below rate floor · Room ${room.number}`, `${b.code} sold at RM ${b.rate}/night (floor RM ${type?.rateFloor}). Reason: ${b.discountReason}`, saved.id)
    return saved
  }

  async updateBooking(id: string, input: BookingInput, reason: string): Promise<Booking> {
    const b = this.db.bookings.find((x) => x.id === id)
    need(!!b, 'Booking not found.')
    need(reason.trim().length >= 5, 'Give a reason for this change (at least 5 characters).')
    if (b.status === 'checked_out') need(can(this.user.role, 'bookings.edit_after_checkout'), 'Only a Manager or above can edit a booking after check-out.')
    else if (b.status === 'checked_in') need(isManagerPlus(this.user.role), 'Only a Manager or above can edit a booking after check-in.')
    else need(can(this.user.role, 'bookings.create'), 'You cannot edit bookings.')
    need(b.status !== 'void' && b.status !== 'cancelled', 'Cancelled/void bookings cannot be edited.')
    const errs = validateBooking(this.db, { ...input, type: b.type }, todayKL(), id)
    if (errs.length) throw new OpsError(errs.join('\n'))
    const room = this.db.rooms.find((r) => r.id === input.roomId)!
    const type = this.db.roomTypes.find((t) => t.id === room.typeId)
    return this.store.update<Booking>('bookings', id, {
      pmsRef: normRef(input.pmsRef) || null, noPmsReason: normRef(input.pmsRef) ? null : input.noPmsReason?.trim() || null, roomId: input.roomId,
      guestName: input.guestName.trim(), phone: input.phone.trim(), idNo: input.idNo?.trim() || null, pax: input.pax, checkIn: input.checkIn, checkOut: input.checkOut,
      rate: round2(input.rate), amount: round2(input.amount), paymentMethod: input.paymentMethod, belowFloor: isBelowFloor(input.rate, type), discountReason: input.discountReason?.trim() || null,
      notes: input.notes?.trim() || null,
    }, reason.trim())
  }

  async checkIn(id: string, payAmount: number, method: PaymentMethod): Promise<void> {
    need(can(this.user.role, 'bookings.checkin'), 'You cannot check guests in.')
    const b = this.db.bookings.find((x) => x.id === id)
    need(!!b && b.status === 'reserved', 'Only reserved bookings can be checked in.')
    const today = todayKL()
    need(b.checkIn <= today && today < b.checkOut, `This booking is for ${b.checkIn}. Edit the dates first if the guest arrived on a different day.`)
    need(!!b.pmsRef || !!b.noPmsReason, 'PMS ref no. is required before check-in.')
    const room = this.db.rooms.find((r) => r.id === b.roomId)!
    need(!room.outOfOrder, `Room ${room.number} is under maintenance. Move the guest to another room first.`)
    const clash = this.db.bookings.find((o) => o.id !== b.id && o.roomId === b.roomId && o.status === 'checked_in')
    need(!clash, `Room ${room.number} still has ${clash?.guestName} checked in. Check them out first.`)
    const now = this.now()
    await this.store.update<Booking>('bookings', id, { status: 'checked_in', checkedInAt: now, checkedInBy: this.user.id })
    await this.store.update<Room>('rooms', room.id, { hkSeenOccupied: false })
    if (payAmount > 0) await this.addPayment(b, payAmount, method, 'Paid at check-in')
    await this.alert('check_in', `Check-in · Room ${room.number}`, `${b.guestName} · ${b.code} · ${b.pmsRef ? 'PMS ' + b.pmsRef : 'NO PMS REF'} · by ${this.user.fullName}`, id)
  }

  async checkOut(id: string, payAmount: number, method: PaymentMethod): Promise<void> {
    need(can(this.user.role, 'bookings.checkin'), 'You cannot check guests out.')
    const b = this.db.bookings.find((x) => x.id === id)
    need(!!b && b.status === 'checked_in', 'Only checked-in guests can be checked out.')
    const today = todayKL()
    if (payAmount > 0) await this.addPayment(b, payAmount, method, 'Paid at check-out')
    const patch: Partial<Booking> = { status: 'checked_out', checkedOutAt: this.now(), checkedOutBy: this.user.id }
    let reason: string | null = null
    if (today < b.checkOut) {
      // early departure: shorten stay so the room returns to inventory
      const newOut = today > b.checkIn ? today : b.checkOut
      if (newOut !== b.checkOut) { patch.checkOut = newOut; reason = `Early check-out (was due ${b.checkOut})` }
    }
    await this.store.update<Booking>('bookings', id, patch, reason)
    await this.store.update<Room>('rooms', b.roomId, { hkStatus: 'dirty', hkSeenOccupied: false })
    const existing = this.db.hkTasks.find((t) => t.date === today && t.roomId === b.roomId && t.kind === 'checkout')
    if (!existing) await this.store.insert<HkTask>('hk_tasks', { id: uid(), date: today, roomId: b.roomId, kind: 'checkout', status: 'pending', assignee: null, note: null, doneAt: null, inspectedAt: null, updatedBy: this.user.id })
    const room = this.roomNo(b.roomId)
    await this.alert('check_out', `Check-out · Room ${room}`, `${b.guestName} · ${b.code} · RM ${b.amount} · by ${this.user.fullName}`, id)
  }

  async setStatus(id: string, status: 'cancelled' | 'void' | 'no_show', reason: string) {
    const b = this.db.bookings.find((x) => x.id === id)
    need(!!b, 'Booking not found.')
    need(reason.trim().length >= 5, 'A reason is required (at least 5 characters).')
    if (b.status === 'reserved') need(can(this.user.role, 'bookings.cancel_reserved'), 'You cannot cancel bookings.')
    else need(can(this.user.role, 'bookings.void'), 'Only a Manager or above can void a checked-in or completed booking.')
    need(!['cancelled', 'void'].includes(b.status), 'Already cancelled/void.')
    await this.store.update<Booking>('bookings', id, { status, statusReason: reason.trim() }, reason.trim())
    if (b.status === 'checked_in') await this.store.update<Room>('rooms', b.roomId, { hkStatus: 'dirty' })
    await this.alert('cancel', `${status === 'void' ? 'Voided' : status === 'no_show' ? 'No-show' : 'Cancelled'} · Room ${this.roomNo(b.roomId)}`, `${b.code} · ${b.guestName} · Reason: ${reason.trim()}`, id)
  }

  async addPayment(b: Booking, amount: number, method: PaymentMethod, note: string | null) {
    need(amount > 0, 'Amount must be more than 0.')
    await this.store.insert<Payment>('payments', { id: uid(), bookingId: b.id, date: todayKL(), method, amount: round2(amount), createdBy: this.user.id, createdAt: this.now(), note })
  }

  // ---------- rooms ----------
  async setOutOfOrder(roomId: string, on: boolean, reason: string) {
    need(can(this.user.role, 'rooms.manage'), 'Only managers can change maintenance status.')
    need(!on || reason.trim().length >= 3, 'Give a maintenance reason.')
    if (on) need(!this.db.bookings.some((b) => b.roomId === roomId && b.status === 'checked_in'), 'Room is occupied. Check the guest out or move them first.')
    await this.store.update<Room>('rooms', roomId, { outOfOrder: on, outOfOrderReason: on ? reason.trim() : null, hkStatus: on ? 'dirty' : this.db.rooms.find((r) => r.id === roomId)?.hkStatus }, reason || (on ? 'Out of order' : 'Back in service'))
  }

  async addBlock(roomId: string, from: string, to: string, reason: string) {
    need(can(this.user.role, 'rooms.manage'), 'Only managers can block dates.')
    need(from < to, 'End date must be after start date.')
    need(reason.trim().length >= 3, 'Give a reason for the block.')
    const clash = this.db.bookings.find((b) => b.roomId === roomId && BLOCKING.includes(b.status) && rangesOverlap(from, to, b.checkIn, b.checkOut))
    need(!clash, `Room has booking ${clash?.code} (${clash?.guestName}) in that period.`)
    await this.store.insert<RoomBlock>('room_blocks', { id: uid(), roomId, from, to, reason: reason.trim(), createdBy: this.user.id, createdAt: this.now(), active: true })
  }

  async removeBlock(id: string, reason: string) {
    need(can(this.user.role, 'rooms.manage'), 'Only managers can remove blocks.')
    need(reason.trim().length >= 3, 'Give a reason.')
    await this.store.update<RoomBlock>('room_blocks', id, { active: false }, reason.trim())
  }

  async reportSeenOccupied(roomId: string, seen: boolean) {
    need(can(this.user.role, 'housekeeping') || isManagerPlus(this.user.role), 'Not allowed.')
    await this.store.update<Room>('rooms', roomId, { hkSeenOccupied: seen, hkSeenAt: seen ? this.now() : null, hkSeenBy: seen ? this.user.id : null }, seen ? 'Housekeeping saw guest/luggage in room' : 'Cleared housekeeping occupancy report')
    if (seen && !this.db.bookings.some((b) => b.roomId === roomId && b.status === 'checked_in')) {
      await this.alert('flag', `Ghost occupancy · Room ${this.roomNo(roomId)}`, `Housekeeping (${this.user.fullName}) saw the room in use, but no guest is checked in.`, null)
    }
  }

  // ---------- housekeeping ----------
  async ensureHkTasks(date: string) {
    if (!can(this.user.role, 'housekeeping')) return 0
    const missing = missingHkTasks(this.db, date)
    for (const t of missing) await this.store.insert<HkTask>('hk_tasks', { id: uid(), ...t, updatedBy: this.user.id })
    return missing.length
  }

  async addAdhocTask(roomId: string, date: string, note: string) {
    need(can(this.user.role, 'housekeeping'), 'Not allowed.')
    await this.store.insert<HkTask>('hk_tasks', { id: uid(), date, roomId, kind: 'adhoc', status: 'pending', assignee: null, note: note || null, doneAt: null, inspectedAt: null, updatedBy: this.user.id })
  }

  async assignTask(id: string, assignee: string) {
    need(can(this.user.role, 'housekeeping'), 'Not allowed.')
    await this.store.update<HkTask>('hk_tasks', id, { assignee: assignee.trim() || null, updatedBy: this.user.id })
  }

  /** Advance a housekeeping task one step and move the room through dirty -> cleaning -> clean -> inspected -> ready */
  async advanceTask(id: string) {
    need(can(this.user.role, 'housekeeping'), 'Not allowed.')
    const t = this.db.hkTasks.find((x) => x.id === id)
    need(!!t, 'Task not found.')
    const room = this.db.rooms.find((r) => r.id === t.roomId)!
    const occupied = this.db.bookings.some((b) => b.roomId === room.id && b.status === 'checked_in')
    const now = this.now()
    if (t.status === 'pending') {
      await this.store.update<HkTask>('hk_tasks', id, { status: 'in_progress', updatedBy: this.user.id })
      if (!occupied) await this.store.update<Room>('rooms', room.id, { hkStatus: 'cleaning' })
    } else if (t.status === 'in_progress') {
      await this.store.update<HkTask>('hk_tasks', id, { status: 'done', doneAt: now, updatedBy: this.user.id })
      if (!occupied) await this.store.update<Room>('rooms', room.id, { hkStatus: 'clean' })
    } else if (t.status === 'done') {
      await this.store.update<HkTask>('hk_tasks', id, { status: 'inspected', inspectedAt: now, updatedBy: this.user.id })
      if (!occupied) await this.store.update<Room>('rooms', room.id, { hkStatus: 'inspected' })
    }
  }

  async releaseRoom(roomId: string) {
    need(can(this.user.role, 'housekeeping'), 'Not allowed.')
    const room = this.db.rooms.find((r) => r.id === roomId)!
    need(room.hkStatus === 'inspected', 'Room must be inspected before it is released as available.')
    await this.store.update<Room>('rooms', roomId, { hkStatus: 'ready' })
  }

  async setRoomHk(roomId: string, hkStatus: Room['hkStatus'], reason: string) {
    need(can(this.user.role, 'housekeeping'), 'Not allowed.')
    await this.store.update<Room>('rooms', roomId, { hkStatus }, reason)
  }

  // ---------- money ----------
  async addExpense(e: Omit<Expense, 'id' | 'createdBy' | 'createdAt'>) {
    need(can(this.user.role, 'expenses.adhoc'), 'Not allowed.')
    need(e.amount > 0, 'Amount must be more than 0.')
    need(!!e.category && !!e.description.trim(), 'Category and description are required.')
    await this.store.insert<Expense>('expenses', { ...e, id: uid(), amount: round2(e.amount), description: e.description.trim(), createdBy: this.user.id, createdAt: this.now() })
  }

  async saveFixedExpense(f: FixedExpense, isNew: boolean) {
    need(can(this.user.role, 'expenses.fixed'), 'Only the CEO/GM can change fixed expenses.')
    need(f.category.trim().length > 1, 'Category name is required.')
    need(f.monthlyAmount >= 0, 'Amount cannot be negative.')
    if (isNew) await this.store.insert<FixedExpense>('fixed_expenses', { ...f, id: uid(), monthlyAmount: round2(f.monthlyAmount) })
    else await this.store.update<FixedExpense>('fixed_expenses', f.id, { category: f.category.trim(), monthlyAmount: round2(f.monthlyAmount), active: f.active })
  }

  async addCashCount(date: string, amount: number, note: string) {
    need(can(this.user.role, 'cash.count'), 'Not allowed.')
    need(amount >= 0, 'Amount cannot be negative.')
    await this.store.insert<CashCount>('cash_counts', { id: uid(), date, amount: round2(amount), note: note.trim() || null, createdBy: this.user.id, createdAt: this.now() })
  }

  // ---------- setup ----------
  async saveRoomType(t: RoomType, isNew: boolean) {
    need(can(this.user.role, 'settings'), 'Only the CEO/GM can change room types.')
    need(t.name.trim().length > 1 && t.code.trim().length > 0, 'Name and code are required.')
    need(t.baseRate > 0 && t.rateFloor > 0 && t.rateFloor <= t.baseRate, 'Rate floor must be between 0 and the base rate.')
    if (isNew) await this.store.insert<RoomType>('room_types', { ...t, id: uid() })
    else await this.store.update<RoomType>('room_types', t.id, { code: t.code, name: t.name, baseRate: t.baseRate, rateFloor: t.rateFloor, maxPax: t.maxPax })
  }

  async saveRoom(r: Pick<Room, 'id' | 'number' | 'floor' | 'typeId' | 'active'>, isNew: boolean) {
    need(can(this.user.role, 'settings'), 'Only the CEO/GM can change rooms.')
    need(!!r.number.trim(), 'Room number is required.')
    need(!this.db.rooms.some((x) => x.number === r.number.trim() && x.id !== r.id), `Room ${r.number} already exists.`)
    if (isNew) {
      need(this.db.rooms.filter((x) => x.active).length < 100, 'Maximum 100 rooms.')
      await this.store.insert<Room>('rooms', { id: uid(), number: r.number.trim(), floor: r.floor, typeId: r.typeId, active: true, hkStatus: 'ready', outOfOrder: false, outOfOrderReason: null, hkSeenOccupied: false, hkSeenAt: null, hkSeenBy: null })
    } else {
      if (!r.active) need(!this.db.bookings.some((b) => b.roomId === r.id && BLOCKING.includes(b.status)), 'Room has current or future bookings.')
      await this.store.update<Room>('rooms', r.id, { number: r.number.trim(), floor: r.floor, typeId: r.typeId, active: r.active })
    }
  }
}
