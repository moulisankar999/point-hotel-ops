import type { Booking, BookingStatus, Db, HkTask, PaymentMethod, Room, RoomBlock, RoomType } from './types'
import { PAYMENT_METHODS } from './types'
import { addDays, dateOfTs, daysInMonth, diffDays, eachDay, monthDays } from './dates'
import { normRef, round2 } from './format'

/** Statuses that hold inventory (room-nights are sold) */
export const HOLDING: BookingStatus[] = ['reserved', 'checked_in', 'checked_out']
/** Statuses that can still clash with a new booking */
export const BLOCKING: BookingStatus[] = ['reserved', 'checked_in']

export function nights(checkIn: string, checkOut: string): number {
  return Math.max(0, diffDays(checkIn, checkOut))
}

/** Half-open date ranges [aFrom, aTo) and [bFrom, bTo) overlap */
export function rangesOverlap(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return aFrom < bTo && bFrom < aTo
}

export interface Conflict {
  kind: 'booking' | 'block'
  id: string
  from: string
  to: string
  label: string
}

export function roomConflicts(
  db: Pick<Db, 'bookings' | 'blocks'>,
  roomId: string,
  from: string,
  to: string,
  excludeBookingId?: string,
): Conflict[] {
  const out: Conflict[] = []
  for (const b of db.bookings) {
    if (b.roomId !== roomId || b.id === excludeBookingId) continue
    if (!BLOCKING.includes(b.status)) continue
    if (rangesOverlap(from, to, b.checkIn, b.checkOut)) out.push({ kind: 'booking', id: b.id, from: b.checkIn, to: b.checkOut, label: `${b.code} · ${b.guestName}` })
  }
  for (const k of db.blocks) {
    if (k.roomId !== roomId || !k.active) continue
    if (rangesOverlap(from, to, k.from, k.to)) out.push({ kind: 'block', id: k.id, from: k.from, to: k.to, label: `Blocked: ${k.reason}` })
  }
  return out
}

export function availableRooms(db: Pick<Db, 'rooms' | 'bookings' | 'blocks'>, from: string, to: string, typeId?: string, excludeBookingId?: string): Room[] {
  if (!(from < to)) return []
  return db.rooms
    .filter((r) => r.active && !r.outOfOrder && (!typeId || r.typeId === typeId))
    .filter((r) => roomConflicts(db, r.id, from, to, excludeBookingId).length === 0)
    .sort((a, b) => readinessScore(a) - readinessScore(b) || a.number.localeCompare(b.number, undefined, { numeric: true }))
}

function readinessScore(r: Room): number {
  return { ready: 0, inspected: 1, clean: 2, cleaning: 3, dirty: 4 }[r.hkStatus]
}

/** Booking counts as a sold room-night on `date` */
export function soldOn(b: Booking, date: string): boolean {
  return HOLDING.includes(b.status) && b.checkIn <= date && date < b.checkOut
}

export function nightlyRevenue(b: Booking): number {
  const n = nights(b.checkIn, b.checkOut)
  return n > 0 ? b.amount / n : 0
}

export function sellableRooms(db: Pick<Db, 'rooms'>): number {
  return db.rooms.filter((r) => r.active && !r.outOfOrder).length
}

export interface DayStats {
  date: string
  roomsSold: number
  roomsAvailable: number
  occupancy: number
  revenue: number
  revenueByMethod: Record<PaymentMethod, number>
  adr: number
  revpar: number
}

export function dayStats(db: Pick<Db, 'rooms' | 'bookings'>, date: string): DayStats {
  const roomsAvailable = sellableRooms(db)
  const byMethod = emptyByMethod()
  let roomsSold = 0
  let revenue = 0
  for (const b of db.bookings) {
    if (!soldOn(b, date)) continue
    roomsSold++
    const r = nightlyRevenue(b)
    revenue += r
    byMethod[b.paymentMethod] += r
  }
  for (const m of PAYMENT_METHODS) byMethod[m] = round2(byMethod[m])
  revenue = round2(revenue)
  return {
    date,
    roomsSold,
    roomsAvailable,
    occupancy: roomsAvailable ? roomsSold / roomsAvailable : 0,
    revenue,
    revenueByMethod: byMethod,
    adr: roomsSold ? round2(revenue / roomsSold) : 0,
    revpar: roomsAvailable ? round2(revenue / roomsAvailable) : 0,
  }
}

export function emptyByMethod(): Record<PaymentMethod, number> {
  return { cash: 0, card: 0, online: 0, transfer: 0 }
}

/** Fixed monthly expenses pro-rated to a single day */
export function fixedForDay(db: Pick<Db, 'fixedExpenses'>, date: string): { total: number; lines: { category: string; amount: number }[] } {
  const dim = daysInMonth(date.slice(0, 7))
  const lines = db.fixedExpenses.filter((f) => f.active && f.monthlyAmount > 0).map((f) => ({ category: f.category, amount: f.monthlyAmount / dim }))
  return { total: lines.reduce((s, l) => s + l.amount, 0), lines }
}

export interface PnL {
  from: string
  to: string // exclusive
  days: number
  roomsSold: number
  roomNightsAvailable: number
  occupancy: number
  revenue: number
  revenueByMethod: Record<PaymentMethod, number>
  adr: number
  revpar: number
  fixedLines: { category: string; amount: number }[]
  fixedTotal: number
  adhocLines: { category: string; amount: number }[]
  adhocTotal: number
  expensesTotal: number
  netProfit: number
  margin: number
  daily: DayStats[]
}

export function pnl(db: Pick<Db, 'rooms' | 'bookings' | 'fixedExpenses' | 'expenses'>, from: string, toExclusive: string): PnL {
  const days = eachDay(from, toExclusive)
  const daily = days.map((d) => dayStats(db, d))
  const byMethod = emptyByMethod()
  let revenue = 0, roomsSold = 0, avail = 0
  for (const s of daily) {
    revenue += s.revenue
    roomsSold += s.roomsSold
    avail += s.roomsAvailable
    for (const m of PAYMENT_METHODS) byMethod[m] += s.revenueByMethod[m]
  }
  const fixedMap = new Map<string, number>()
  for (const d of days) for (const l of fixedForDay(db, d).lines) fixedMap.set(l.category, (fixedMap.get(l.category) ?? 0) + l.amount)
  const fixedLines = [...fixedMap].map(([category, amount]) => ({ category, amount: round2(amount) }))
  const fixedTotal = round2([...fixedMap.values()].reduce((s, v) => s + v, 0))
  const adhocMap = new Map<string, number>()
  for (const e of db.expenses) if (e.date >= from && e.date < toExclusive) adhocMap.set(e.category, (adhocMap.get(e.category) ?? 0) + e.amount)
  const adhocLines = [...adhocMap].map(([category, amount]) => ({ category, amount: round2(amount) })).sort((a, b) => b.amount - a.amount)
  const adhocTotal = round2([...adhocMap.values()].reduce((s, v) => s + v, 0))
  revenue = round2(revenue)
  for (const m of PAYMENT_METHODS) byMethod[m] = round2(byMethod[m])
  const expensesTotal = round2(fixedTotal + adhocTotal)
  const netProfit = round2(revenue - expensesTotal)
  return {
    from, to: toExclusive, days: days.length, roomsSold, roomNightsAvailable: avail,
    occupancy: avail ? roomsSold / avail : 0, revenue, revenueByMethod: byMethod,
    adr: roomsSold ? round2(revenue / roomsSold) : 0, revpar: avail ? round2(revenue / avail) : 0,
    fixedLines, fixedTotal, adhocLines, adhocTotal, expensesTotal, netProfit, margin: revenue ? netProfit / revenue : 0, daily,
  }
}

export function monthPnl(db: Pick<Db, 'rooms' | 'bookings' | 'fixedExpenses' | 'expenses'>, month: string, upTo?: string): PnL {
  const days = monthDays(month)
  const last = upTo && upTo < addDays(days[days.length - 1], 1) ? addDays(upTo, 1) : addDays(days[days.length - 1], 1)
  return pnl(db, days[0], last)
}

export type DisplayStatus = 'occupied' | 'available' | 'dirty' | 'cleaning' | 'clean' | 'inspected' | 'maintenance' | 'blocked'

export function currentBooking(db: Pick<Db, 'bookings'>, roomId: string): Booking | undefined {
  return db.bookings.find((b) => b.roomId === roomId && b.status === 'checked_in')
}

export function activeBlock(db: Pick<Db, 'blocks'>, roomId: string, date: string): RoomBlock | undefined {
  return db.blocks.find((k) => k.active && k.roomId === roomId && k.from <= date && date < k.to)
}

export function roomStatus(db: Pick<Db, 'bookings' | 'blocks'>, room: Room, today: string): DisplayStatus {
  if (room.outOfOrder) return 'maintenance'
  if (currentBooking(db, room.id)) return 'occupied'
  if (activeBlock(db, room.id, today)) return 'blocked'
  if (room.hkStatus === 'ready') return 'available'
  return room.hkStatus
}

export function arrivalsOn(db: Pick<Db, 'bookings'>, date: string): Booking[] {
  return db.bookings.filter((b) => b.checkIn === date && (b.status === 'reserved' || (b.status === 'checked_in' || b.status === 'checked_out')))
}

export function departuresOn(db: Pick<Db, 'bookings'>, date: string): Booking[] {
  return db.bookings.filter(
    (b) => (b.status === 'checked_in' && b.checkOut <= date) || (b.status === 'checked_out' && b.checkedOutAt != null && dateOfTs(b.checkedOutAt) === date),
  )
}

export function isBelowFloor(rate: number, type: RoomType | undefined): boolean {
  return !!type && rate < type.rateFloor
}

/** Rooms housekeeping saw occupied but with no checked-in booking */
export function ghostRooms(db: Pick<Db, 'rooms' | 'bookings'>): Room[] {
  return db.rooms.filter((r) => r.active && r.hkSeenOccupied && !currentBooking(db, r.id))
}

export interface BookingInput {
  type: Booking['type']
  pmsRef: string | null
  noPmsReason: string | null
  roomId: string
  guestName: string
  phone: string
  idNo: string | null
  pax: number
  checkIn: string
  checkOut: string
  rate: number
  amount: number
  paymentMethod: PaymentMethod
  amountPaid: number
  discountReason: string | null
  notes: string | null
}

export function validateBooking(db: Pick<Db, 'rooms' | 'roomTypes' | 'bookings' | 'blocks'>, input: BookingInput, today: string, excludeBookingId?: string): string[] {
  const errs: string[] = []
  const room = db.rooms.find((r) => r.id === input.roomId)
  const type = room ? db.roomTypes.find((t) => t.id === room.typeId) : undefined
  if (!input.guestName.trim()) errs.push('Guest name is required.')
  if (!/^[+\d][\d\s-]{6,}$/.test(input.phone.trim())) errs.push('A valid phone number is required.')
  if (!room) errs.push('Choose a room.')
  if (!input.checkIn || !input.checkOut || !(input.checkIn < input.checkOut)) errs.push('Check-out must be after check-in (at least 1 night).')
  if (input.type === 'walk_in' && input.checkIn !== today && !excludeBookingId) errs.push('Walk-ins must check in today.')
  if (input.type === 'advance' && input.checkIn < today && !excludeBookingId) errs.push('Advance bookings cannot start in the past.')
  if (!(input.pax >= 1)) errs.push('Pax must be at least 1.')
  if (type && input.pax > type.maxPax) errs.push(`${type.name} takes at most ${type.maxPax} guests.`)
  if (!(input.rate > 0)) errs.push('Nightly rate must be more than 0.')
  if (!(input.amount >= 0)) errs.push('Amount cannot be negative.')
  if (input.amountPaid < 0) errs.push('Amount paid cannot be negative.')
  const ref = normRef(input.pmsRef)
  if (input.type === 'advance' && !ref) errs.push('PMS ref no. is required for advance bookings.')
  if (input.type === 'walk_in' && !ref && !(input.noPmsReason ?? '').trim()) errs.push('Enter the PMS ref no., or give a reason why there is none.')
  if (ref) {
    const dup = db.bookings.find((b) => b.id !== excludeBookingId && normRef(b.pmsRef) === ref && b.status !== 'void' && b.status !== 'cancelled')
    if (dup) errs.push(`PMS ref ${ref} is already used by booking ${dup.code} (${dup.guestName}).`)
  }
  if (type && isBelowFloor(input.rate, type) && !(input.discountReason ?? '').trim()) errs.push(`Rate is below the ${type.name} floor (RM ${type.rateFloor}). A discount reason is required.`)
  if (room && room.outOfOrder) errs.push(`Room ${room.number} is under maintenance.`)
  if (room && input.checkIn < input.checkOut) {
    const c = roomConflicts(db, room.id, input.checkIn, input.checkOut, excludeBookingId)
    if (c.length) errs.push(`Room ${room.number} is not free for these dates (${c.map((x) => x.label).join('; ')}).`)
  }
  return errs
}

/** Housekeeping tasks that should exist for a date (does not include ones already created) */
export function missingHkTasks(db: Pick<Db, 'bookings' | 'hkTasks' | 'rooms'>, date: string): Omit<HkTask, 'id'>[] {
  const want: Omit<HkTask, 'id'>[] = []
  const has = (roomId: string, kind: HkTask['kind']) => db.hkTasks.some((t) => t.date === date && t.roomId === roomId && t.kind === kind)
  const seen = new Set<string>()
  for (const b of db.bookings) {
    const isCheckout =
      (b.status === 'checked_out' && b.checkedOutAt && dateOfTs(b.checkedOutAt) === date) || ((b.status === 'checked_in' || b.status === 'reserved') && b.checkOut === date && b.checkIn < date)
    const isStay = b.status === 'checked_in' && b.checkIn < date && date < b.checkOut
    const kind = isCheckout ? 'checkout' : isStay ? 'stayover' : null
    if (!kind) continue
    if (b.status === 'reserved') continue
    const key = b.roomId + kind
    if (seen.has(key) || has(b.roomId, kind)) continue
    seen.add(key)
    want.push({ date, roomId: b.roomId, kind, status: 'pending', assignee: null, note: null, doneAt: null, inspectedAt: null, updatedBy: null })
  }
  return want
}

export interface Recon {
  date: string
  roomsSold: number
  roomsAvailable: number
  checkIns: number
  checkOuts: number
  walkIns: number
  noPmsRef: number
  belowFloor: number
  roomRevenue: number
  collectedByMethod: Record<PaymentMethod, number>
  collectedTotal: number
  cashCounted: number | null
  cashVariance: number | null
  ghost: number
  hkObservedOccupied: number
}

export function reconciliation(db: Db, date: string): Recon {
  const s = dayStats(db, date)
  const collected = emptyByMethod()
  for (const p of db.payments) if (p.date === date) collected[p.method] += p.amount
  for (const m of PAYMENT_METHODS) collected[m] = round2(collected[m])
  const collectedTotal = round2(PAYMENT_METHODS.reduce((t, m) => t + collected[m], 0))
  const counts = db.cashCounts.filter((c) => c.date === date)
  const cashCounted = counts.length ? round2(counts.reduce((t, c) => t + c.amount, 0)) : null
  const created = db.bookings.filter((b) => dateOfTs(b.createdAt) === date && b.status !== 'void')
  return {
    date,
    roomsSold: s.roomsSold,
    roomsAvailable: s.roomsAvailable,
    checkIns: db.bookings.filter((b) => b.checkedInAt && dateOfTs(b.checkedInAt) === date).length,
    checkOuts: db.bookings.filter((b) => b.checkedOutAt && dateOfTs(b.checkedOutAt) === date).length,
    walkIns: created.filter((b) => b.type === 'walk_in').length,
    noPmsRef: created.filter((b) => !normRef(b.pmsRef)).length,
    belowFloor: created.filter((b) => b.belowFloor).length,
    roomRevenue: s.revenue,
    collectedByMethod: collected,
    collectedTotal,
    cashCounted,
    cashVariance: cashCounted == null ? null : round2(cashCounted - collected.cash),
    ghost: ghostRooms(db).length,
    hkObservedOccupied: db.rooms.filter((r) => r.hkSeenOccupied).length,
  }
}

export function balanceDue(db: Pick<Db, 'payments'>, b: Booking): number {
  const paid = db.payments.filter((p) => p.bookingId === b.id).reduce((s, p) => s + p.amount, 0)
  return round2(b.amount - paid)
}

export function paidFor(db: Pick<Db, 'payments'>, b: Booking): number {
  return round2(db.payments.filter((p) => p.bookingId === b.id).reduce((s, p) => s + p.amount, 0))
}
