import { describe, expect, it } from 'vitest'
import { availableRooms, dayStats, monthPnl, nights, pnl, rangesOverlap, reconciliation, roomConflicts, validateBooking, type BookingInput } from './logic'
import type { Booking, Db, Room, RoomType } from './types'
import { seedDemoDb } from '../data/seed'

const types: RoomType[] = [{ id: 't1', code: 'STQ', name: 'Standard Queen', baseRate: 150, rateFloor: 120, maxPax: 2 }]
const room = (id: string, number: string, extra: Partial<Room> = {}): Room => ({ id, number, floor: 1, typeId: 't1', hkStatus: 'ready', outOfOrder: false, hkSeenOccupied: false, active: true, ...extra })
let n = 0
const bk = (roomId: string, checkIn: string, checkOut: string, extra: Partial<Booking> = {}): Booking => ({
  id: `b${++n}`, code: `TP-${n}`, type: 'advance', pmsRef: `PMS-${n}`, noPmsReason: null, roomId, guestName: 'Guest', phone: '0123456789', idNo: null, pax: 1,
  checkIn, checkOut, rate: 150, amount: 150 * nights(checkIn, checkOut), paymentMethod: 'cash', status: 'reserved', notes: null, belowFloor: false, discountReason: null,
  statusReason: null, createdBy: 'u', createdAt: '2026-01-01T00:00:00Z', checkedInAt: null, checkedInBy: null, checkedOutAt: null, checkedOutBy: null, updatedAt: '2026-01-01T00:00:00Z', ...extra,
})
const mkDb = (over: Partial<Db> = {}): Db => ({
  settings: { hotelName: 'T', city: 'JB', currency: 'RM', timezone: 'Asia/Kuala_Lumpur', checkInTime: '14:00', checkOutTime: '12:00' },
  users: [], roomTypes: types, rooms: [room('r1', '101'), room('r2', '102'), room('r3', '103'), room('r4', '104')], blocks: [], bookings: [], payments: [], alerts: [],
  hkTasks: [], fixedExpenses: [], expenses: [], cashCounts: [], audit: [], ...over,
})
const input = (over: Partial<BookingInput> = {}): BookingInput => ({
  type: 'advance', pmsRef: 'NEW-1', noPmsReason: null, roomId: 'r1', guestName: 'Ali', phone: '0123456789', idNo: null, pax: 2,
  checkIn: '2026-03-10', checkOut: '2026-03-12', rate: 150, amount: 300, paymentMethod: 'cash', amountPaid: 0, discountReason: null, notes: null, ...over,
})

describe('date ranges & overlap', () => {
  it('counts nights', () => {
    expect(nights('2026-02-27', '2026-03-02')).toBe(3)
    expect(nights('2026-03-02', '2026-03-02')).toBe(0)
  })
  it('treats ranges as half-open (same-day turnover is allowed)', () => {
    expect(rangesOverlap('2026-03-01', '2026-03-03', '2026-03-03', '2026-03-05')).toBe(false)
    expect(rangesOverlap('2026-03-01', '2026-03-04', '2026-03-03', '2026-03-05')).toBe(true)
    expect(rangesOverlap('2026-03-01', '2026-03-10', '2026-03-03', '2026-03-05')).toBe(true)
    expect(rangesOverlap('2026-03-05', '2026-03-06', '2026-03-01', '2026-03-05')).toBe(false)
  })
  it('detects room conflicts with active bookings and blocks only', () => {
    const db = mkDb({
      bookings: [bk('r1', '2026-03-01', '2026-03-05'), bk('r1', '2026-03-05', '2026-03-07', { status: 'cancelled' }), bk('r1', '2026-03-08', '2026-03-09', { status: 'checked_out' })],
      blocks: [{ id: 'k1', roomId: 'r1', from: '2026-03-20', to: '2026-03-22', reason: 'Owner', createdBy: 'u', createdAt: '', active: true }],
    })
    expect(roomConflicts(db, 'r1', '2026-03-04', '2026-03-06')).toHaveLength(1)
    expect(roomConflicts(db, 'r1', '2026-03-05', '2026-03-07')).toHaveLength(0) // cancelled frees the room
    expect(roomConflicts(db, 'r1', '2026-03-21', '2026-03-23')[0].kind).toBe('block')
    expect(roomConflicts(db, 'r1', '2026-03-02', '2026-03-03', db.bookings[0].id)).toHaveLength(0) // editing itself
  })
  it('lists only free, in-service rooms', () => {
    const db = mkDb({ rooms: [room('r1', '101'), room('r2', '102', { outOfOrder: true }), room('r3', '103', { hkStatus: 'dirty' }), room('r4', '104')], bookings: [bk('r4', '2026-03-01', '2026-03-03')] })
    expect(availableRooms(db, '2026-03-02', '2026-03-03').map((r) => r.id)).toEqual(['r1', 'r3'])
    expect(availableRooms(db, '2026-03-03', '2026-03-03')).toEqual([])
  })
})

describe('booking validation', () => {
  it('blocks a double-booking', () => {
    const db = mkDb({ bookings: [bk('r1', '2026-03-11', '2026-03-13')] })
    expect(validateBooking(db, input(), '2026-03-01').join(' ')).toMatch(/not free/)
  })
  it('rejects a duplicate PMS ref (case/space-insensitive) but ignores cancelled ones', () => {
    const db = mkDb({ bookings: [bk('r2', '2026-04-01', '2026-04-02', { pmsRef: 'new-1' })] })
    expect(validateBooking(db, input({ pmsRef: ' NEW-1 ' }), '2026-03-01').join(' ')).toMatch(/already used/)
    db.bookings[0].status = 'cancelled'
    expect(validateBooking(db, input(), '2026-03-01')).toEqual([])
  })
  it('requires a PMS ref for advance bookings and a reason for walk-ins without one', () => {
    const db = mkDb()
    expect(validateBooking(db, input({ pmsRef: '' }), '2026-03-01').join(' ')).toMatch(/required for advance/)
    expect(validateBooking(db, input({ type: 'walk_in', pmsRef: null, checkIn: '2026-03-01', checkOut: '2026-03-02' }), '2026-03-01').join(' ')).toMatch(/reason/)
    expect(validateBooking(db, input({ type: 'walk_in', pmsRef: null, noPmsReason: 'PMS offline', checkIn: '2026-03-01', checkOut: '2026-03-02' }), '2026-03-01')).toEqual([])
  })
  it('needs a reason when selling below the rate floor', () => {
    const db = mkDb()
    expect(validateBooking(db, input({ rate: 100, amount: 200 }), '2026-03-01').join(' ')).toMatch(/below the Standard Queen floor/)
    expect(validateBooking(db, input({ rate: 100, amount: 200, discountReason: 'Corporate' }), '2026-03-01')).toEqual([])
  })
  it('rejects too many guests and zero-night stays', () => {
    const errs = validateBooking(mkDb(), input({ pax: 3, checkOut: '2026-03-10' }), '2026-03-01').join(' ')
    expect(errs).toMatch(/at most 2/)
    expect(errs).toMatch(/at least 1 night/)
  })
})

describe('occupancy', () => {
  it('counts sold rooms over sellable (out-of-order excluded) rooms', () => {
    const db = mkDb({
      rooms: [room('r1', '101'), room('r2', '102'), room('r3', '103'), room('r4', '104'), room('r5', '105', { outOfOrder: true })],
      bookings: [
        bk('r1', '2026-03-01', '2026-03-03', { status: 'checked_in', amount: 300 }),
        bk('r2', '2026-03-02', '2026-03-03', { status: 'checked_out', amount: 120, rate: 120 }),
        bk('r3', '2026-03-02', '2026-03-04', { status: 'cancelled' }),
        bk('r4', '2026-03-03', '2026-03-04'), // arrives tomorrow
      ],
    })
    const s = dayStats(db, '2026-03-02')
    expect(s.roomsAvailable).toBe(4)
    expect(s.roomsSold).toBe(2)
    expect(s.occupancy).toBe(0.5)
    expect(s.revenue).toBe(270) // 300/2 + 120
    expect(s.adr).toBe(135)
    expect(s.revpar).toBe(67.5)
  })
})

describe('P&L', () => {
  it('pro-rates fixed costs by days in month and nets ad-hoc expenses', () => {
    const db = mkDb({
      bookings: [bk('r1', '2026-02-27', '2026-03-02', { status: 'checked_out', amount: 600, paymentMethod: 'card' })], // 200/night: 2 nights Feb, 1 night Mar
      fixedExpenses: [{ id: 'f1', category: 'Rent', monthlyAmount: 2800, active: true }, { id: 'f2', category: 'Unused', monthlyAmount: 0, active: true }],
      expenses: [{ id: 'e1', date: '2026-02-10', category: 'Repairs', description: 'x', amount: 50, createdBy: 'u', createdAt: '' }, { id: 'e2', date: '2026-03-01', category: 'Repairs', description: 'y', amount: 99, createdBy: 'u', createdAt: '' }],
    })
    const feb = monthPnl(db, '2026-02')
    expect(feb.days).toBe(28)
    expect(feb.revenue).toBe(400)
    expect(feb.revenueByMethod.card).toBe(400)
    expect(feb.fixedTotal).toBe(2800)
    expect(feb.adhocTotal).toBe(50)
    expect(feb.netProfit).toBe(400 - 2850)
    expect(feb.roomsSold).toBe(2)
    expect(feb.adr).toBe(200)

    const day = pnl(db, '2026-02-15', '2026-02-16')
    expect(day.fixedTotal).toBe(100) // 2800 / 28
    expect(day.revenue).toBe(0)
    expect(day.netProfit).toBe(-100)

    const mar = monthPnl(db, '2026-03')
    expect(mar.revenue).toBe(200)
    expect(mar.fixedTotal).toBeCloseTo(2800, 2) // 31 × 2800/31
    expect(mar.adhocTotal).toBe(99)
    expect(mar.roomNightsAvailable).toBe(4 * 31)
  })
  it('month-to-date stops at the given day', () => {
    const db = mkDb({ fixedExpenses: [{ id: 'f1', category: 'Rent', monthlyAmount: 3000, active: true }] })
    const mtd = monthPnl(db, '2026-04', '2026-04-10')
    expect(mtd.days).toBe(10)
    expect(mtd.fixedTotal).toBe(1000)
  })
})

describe('reconciliation', () => {
  it('compares collected cash with counted cash', () => {
    const b = bk('r1', '2026-03-01', '2026-03-02', { status: 'checked_out' })
    const db = mkDb({
      bookings: [b],
      payments: [
        { id: 'p1', bookingId: b.id, date: '2026-03-01', amount: 100, method: 'cash', note: null, createdBy: 'u', createdAt: '' },
        { id: 'p2', bookingId: b.id, date: '2026-03-01', amount: 50, method: 'card', note: null, createdBy: 'u', createdAt: '' },
      ],
      cashCounts: [{ id: 'c1', date: '2026-03-01', amount: 80, note: null, createdBy: 'u', createdAt: '' }],
    })
    const r = reconciliation(db, '2026-03-01')
    expect(r.collectedTotal).toBe(150)
    expect(r.cashVariance).toBe(-20)
    expect(r.roomsSold).toBe(1)
  })
})

describe('demo seed', () => {
  it('has no overlapping active bookings and no duplicate PMS refs', () => {
    const db = seedDemoDb()
    expect(db.rooms.filter((r) => r.active).length).toBeGreaterThanOrEqual(50)
    const live = db.bookings.filter((b) => ['reserved', 'checked_in', 'checked_out'].includes(b.status))
    for (const a of live) for (const c of live) if (a.id < c.id && a.roomId === c.roomId) expect(rangesOverlap(a.checkIn, a.checkOut, c.checkIn, c.checkOut), `${a.code} vs ${c.code}`).toBe(false)
    const refs = db.bookings.map((b) => b.pmsRef?.toUpperCase()).filter(Boolean)
    expect(new Set(refs).size).toBe(refs.length)
  })
})
