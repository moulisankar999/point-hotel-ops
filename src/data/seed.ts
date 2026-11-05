import { HOTEL } from '../lib/hotel'
import type { AlertItem, AppUser, Booking, Db, FixedExpense, Payment, PaymentMethod, Room, RoomType, Expense, RoomBlock, AuditEntry, CashCount } from '../lib/types'
import { addDays, todayKL } from '../lib/dates'
import { round2 } from '../lib/format'

export const DEMO_PASSWORD = 'demo1234'

export const FIXED_EXPENSE_CATEGORIES = [
  'Salaries & wages', 'EPF / SOCSO / EIS', 'Rent / loan instalment', 'Electricity (TNB)', 'Water (Ranhill SAJ)', 'Internet & TV',
  'Laundry & linen', 'Guest amenities', 'OTA commissions', 'Maintenance contract', 'Insurance', 'Licences & permits (MBJB, tourism tax admin)',
  'Marketing & ads', 'PMS / software subscriptions', 'Security', 'Cleaning supplies', 'Pest control', 'Accounting & audit', 'Bank & card fees', 'Assessment & quit rent',
]

export const ADHOC_CATEGORIES = ['Repairs', 'Supplies', 'Food & beverage', 'Transport', 'Refund', 'Staff welfare', 'Utilities (extra)', 'Other']

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ts = (date: string, hh: number, mm = 0) => new Date(`${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+08:00`).toISOString()

const FIRST = ['Ahmad', 'Siti', 'Tan', 'Lim', 'Raj', 'Priya', 'Nurul', 'Wong', 'Lee', 'Kumar', 'Aina', 'Daniel', 'Mei Ling', 'Hafiz', 'Sarah', 'Arjun', 'Chong', 'Farid', 'Grace', 'Zul']
const LAST = ['Abdullah', 'Tan', 'Lim', 'Ramasamy', 'Wong', 'Ng', 'Ismail', 'Lee', 'Chua', 'Hassan', 'Goh', 'Pillai', 'Rahman', 'Teo', 'Yusof']

export function seedUsers(now: string): AppUser[] {
  const u = (id: string, username: string, fullName: string, role: AppUser['role']): AppUser => ({ id, username, fullName, role, active: true, createdAt: now })
  return [
    u('u-ceo', 'mouli', 'Mouli Sankar', 'ceo'),
    u('u-ops', 'ops', 'Aisyah Rahman', 'ops_manager'),
    u('u-mgr', 'manager', 'Kumar Pillai', 'manager'),
    u('u-fd', 'frontdesk', 'Farah Lim', 'front_desk'),
    u('u-hk', 'housekeeping', 'Siti Aminah', 'housekeeping'),
  ]
}

export function seedRoomTypes(): RoomType[] {
  return [
    { id: 'rt-stq', code: 'STQ', name: 'Standard Queen', baseRate: 159, rateFloor: 129, maxPax: 2 },
    { id: 'rt-dlk', code: 'DLK', name: 'Deluxe King', baseRate: 199, rateFloor: 169, maxPax: 2 },
    { id: 'rt-twn', code: 'TWN', name: 'Deluxe Twin', baseRate: 189, rateFloor: 159, maxPax: 2 },
    { id: 'rt-fam', code: 'FAM', name: 'Family Room', baseRate: 259, rateFloor: 219, maxPax: 4 },
    { id: 'rt-ste', code: 'STE', name: 'Point Suite', baseRate: 359, rateFloor: 299, maxPax: 3 },
  ]
}

export function seedRooms(): Room[] {
  const rooms: Room[] = []
  const pattern = ['rt-stq', 'rt-stq', 'rt-stq', 'rt-stq', 'rt-dlk', 'rt-dlk', 'rt-dlk', 'rt-twn', 'rt-twn', 'rt-twn', 'rt-fam', 'rt-ste']
  for (let floor = 1; floor <= 5; floor++) {
    for (let i = 1; i <= 12; i++) {
      rooms.push({ id: `r-${floor}${String(i).padStart(2, '0')}`, number: `${floor}${String(i).padStart(2, '0')}`, floor, typeId: pattern[i - 1], hkStatus: 'ready', outOfOrder: false, outOfOrderReason: null, hkSeenOccupied: false, hkSeenAt: null, hkSeenBy: null, active: true })
    }
  }
  return rooms
}

export function seedDemoDb(today = todayKL()): Db {
  const R = rng(20261105)
  const now = new Date().toISOString()
  const users = seedUsers(ts(addDays(today, -60), 9))
  const roomTypes = seedRoomTypes()
  const rooms = seedRooms()
  const typeOf = (r: Room) => roomTypes.find((t) => t.id === r.typeId)!
  const staff = ['u-fd', 'u-fd', 'u-fd', 'u-mgr', 'u-ops']
  const bookings: Booking[] = []
  const payments: Payment[] = []
  let seq = 1000
  const methods: PaymentMethod[] = ['cash', 'cash', 'card', 'card', 'online', 'online', 'online', 'transfer']
  const start = addDays(today, -45)

  for (const room of rooms) {
    const t = typeOf(room)
    let d = addDays(start, Math.floor(R() * 3))
    while (d < addDays(today, 30)) {
      const future = d > today
      // advance pickup thins out further ahead
      const daysAhead = Math.max(0, Math.round((new Date(d).getTime() - new Date(today).getTime()) / 86400000))
      if (future && R() < 0.35 + daysAhead / 30) { d = addDays(d, 1 + Math.floor(R() * 3)); continue }
      const n = 1 + Math.floor(R() * (R() < 0.7 ? 2 : 4))
      const checkIn = d
      const checkOut = addDays(d, n)
      const isWalk = !future && R() < 0.25
      const method = methods[Math.floor(R() * methods.length)]
      const discount = R() < 0.06
      const rate = discount ? t.rateFloor - 10 - Math.floor(R() * 20) : t.baseRate + (R() < 0.3 ? 20 : 0)
      const amount = round2(rate * n)
      const by = staff[Math.floor(R() * staff.length)]
      const g = `${FIRST[Math.floor(R() * FIRST.length)]} ${LAST[Math.floor(R() * LAST.length)]}`
      let status: Booking['status'] = 'reserved'
      let checkedInAt: string | null = null
      let checkedOutAt: string | null = null
      if (checkOut <= today) {
        status = checkOut === today && R() < 0.55 ? 'checked_in' : 'checked_out'
      } else if (checkIn < today) status = 'checked_in'
      else if (checkIn === today) status = R() < 0.5 ? 'checked_in' : 'reserved'
      const cancelled = future && R() < 0.05
      if (cancelled) status = 'cancelled'
      if (status !== 'reserved' && status !== 'cancelled') checkedInAt = ts(checkIn, 14 + Math.floor(R() * 7), Math.floor(R() * 60))
      if (status === 'checked_out') checkedOutAt = ts(checkOut, 9 + Math.floor(R() * 3), Math.floor(R() * 60))
      const createdAt = isWalk || !checkedInAt ? (checkedInAt ?? ts(addDays(checkIn, -1 - Math.floor(R() * 10)), 10 + Math.floor(R() * 8))) : ts(addDays(checkIn, -1 - Math.floor(R() * 14)), 10 + Math.floor(R() * 8))
      const noPms = isWalk && R() < 0.3
      const id = `b-${seq}`
      const b: Booking = {
        id, code: `TP-${seq++}`, type: isWalk ? 'walk_in' : 'advance',
        pmsRef: noPms ? null : `PMS-${(240000 + seq * 7) % 999999}`,
        noPmsReason: noPms ? (R() < 0.5 ? 'PMS was slow/offline at the time' : 'Guest paid cash, PMS entry pending') : null,
        roomId: room.id, guestName: g, phone: `+60 1${Math.floor(R() * 9)}-${Math.floor(1000000 + R() * 8999999)}`, idNo: R() < 0.5 ? null : `${800000 + Math.floor(R() * 199999)}-01-${1000 + Math.floor(R() * 8999)}`,
        pax: Math.min(t.maxPax, 1 + Math.floor(R() * t.maxPax)), checkIn, checkOut, rate, amount, paymentMethod: method, status,
        notes: null, belowFloor: discount, discountReason: discount ? 'Repeat corporate guest' : null, statusReason: cancelled ? 'Guest cancelled by phone' : null,
        createdBy: by, createdAt, checkedInAt, checkedInBy: checkedInAt ? by : null, checkedOutAt, checkedOutBy: checkedOutAt ? 'u-fd' : null, updatedAt: checkedOutAt ?? checkedInAt ?? createdAt,
      }
      bookings.push(b)
      if (checkedInAt) {
        const paid = status === 'checked_in' && R() < 0.2 ? round2(amount / 2) : amount
        payments.push({ id: `p-${id}`, bookingId: id, date: checkIn, method, amount: paid, createdBy: by, createdAt: checkedInAt, note: null })
      } else if (method === 'online' && status === 'reserved') {
        payments.push({ id: `p-${id}`, bookingId: id, date: createdAt.slice(0, 10) <= today ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date(createdAt)) : today, method, amount, createdBy: by, createdAt, note: 'Prepaid online' })
      }
      d = addDays(checkOut, R() < 0.55 ? 0 : 1 + Math.floor(R() * 2))
    }
  }

  // Housekeeping state for rooms vacated today
  for (const b of bookings) {
    if (b.status === 'checked_out' && b.checkOut === today) {
      const r = rooms.find((x) => x.id === b.roomId)!
      const occupiedNow = bookings.some((o) => o.roomId === r.id && o.status === 'checked_in')
      if (!occupiedNow) r.hkStatus = (['dirty', 'cleaning', 'clean', 'inspected'] as const)[Math.floor(R() * 4)]
    }
  }
  // Maintenance & ghost occupancy examples
  const vacant = rooms.filter((r) => !bookings.some((b) => b.roomId === r.id && b.status === 'checked_in'))
  const ooo = vacant.find((r) => r.number === '312') ?? vacant[0]
  ooo.outOfOrder = true
  ooo.outOfOrderReason = 'Aircon compressor replacement'
  const ghosts = vacant.filter((r) => r !== ooo && r.hkStatus === 'ready' && !bookings.some((b) => b.roomId === r.id && b.status === 'reserved' && b.checkIn <= addDays(today, 3))).slice(2, 4)
  for (const g of ghosts) { g.hkSeenOccupied = true; g.hkSeenAt = ts(today, 10, 15); g.hkSeenBy = 'u-hk' }

  // A future block (owner use / renovation)
  const blockRoom = rooms.find((r) => r.number === '512')!
  const blocks: RoomBlock[] = []
  const freeFrom = (roomId: string, from: string, len: number) => {
    let s = from
    for (let i = 0; i < 40; i++) {
      const e = addDays(s, len)
      if (!bookings.some((b) => b.roomId === roomId && (b.status === 'reserved' || b.status === 'checked_in') && b.checkIn < e && s < b.checkOut)) return s
      s = addDays(s, 1)
    }
    return null
  }
  const bf = freeFrom(blockRoom.id, addDays(today, 5), 3)
  if (bf) blocks.push({ id: 'blk-1', roomId: blockRoom.id, from: bf, to: addDays(bf, 3), reason: 'Owner hold – VIP guests', createdBy: 'u-ceo', createdAt: ts(addDays(today, -2), 11), active: true })
  const bf2 = freeFrom('r-208', addDays(today, 9), 4)
  if (bf2) blocks.push({ id: 'blk-2', roomId: 'r-208', from: bf2, to: addDays(bf2, 4), reason: 'Carpet replacement', createdBy: 'u-ops', createdAt: ts(addDays(today, -1), 15), active: true })

  const fixedExpenses: FixedExpense[] = FIXED_EXPENSE_CATEGORIES.map((c, i) => ({ id: `fx-${i + 1}`, category: c, monthlyAmount: 0, active: true }))
  const expenses: Expense[] = [
    { id: 'e-1', date: addDays(today, -3), category: 'Repairs', description: 'Shower mixer replacement, room 207', amount: 180, createdBy: 'u-mgr', createdAt: ts(addDays(today, -3), 16) },
    { id: 'e-2', date: addDays(today, -1), category: 'Supplies', description: 'Bottled water (40 cartons)', amount: 236, createdBy: 'u-ops', createdAt: ts(addDays(today, -1), 12) },
    { id: 'e-3', date: today, category: 'Transport', description: 'Grab for linen pickup', amount: 24.5, createdBy: 'u-fd', createdAt: ts(today, 9, 40) },
  ]
  const cashCounts: CashCount[] = [
    { id: 'cc-1', date: addDays(today, -1), amount: round2(payments.filter((p) => p.date === addDays(today, -1) && p.method === 'cash').reduce((s, p) => s + p.amount, 0) - 150), note: 'Night audit count', createdBy: 'u-fd', createdAt: ts(addDays(today, -1), 23, 30) },
  ]

  const alerts: AlertItem[] = []
  const recent = bookings
    .flatMap((b) => [b.checkedInAt ? { b, at: b.checkedInAt, kind: 'check_in' as const } : null, b.checkedOutAt ? { b, at: b.checkedOutAt, kind: 'check_out' as const } : null])
    .filter((x): x is NonNullable<typeof x> => !!x && x.at >= ts(addDays(today, -1), 0))
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 14)
  for (const x of recent) {
    const room = rooms.find((r) => r.id === x.b.roomId)!
    alerts.push({
      id: `al-${x.b.id}-${x.kind}`, type: x.kind, bookingId: x.b.id, createdBy: x.kind === 'check_in' ? x.b.checkedInBy! : x.b.checkedOutBy!, createdAt: x.at, readBy: [],
      title: x.kind === 'check_in' ? `Check-in · Room ${room.number}` : `Check-out · Room ${room.number}`,
      message: `${x.b.guestName} · ${x.b.code}${x.b.pmsRef ? ' · ' + x.b.pmsRef : ' · NO PMS REF'}`,
    })
  }
  const audit: AuditEntry[] = [
    { id: 'a-0', at: now, userId: null, userName: 'System', entity: 'system', entityId: '-', action: 'insert', reason: 'Demo data seeded', before: null, after: { rooms: rooms.length, bookings: bookings.length } },
  ]

  return {
    settings: { hotelName: 'The Point Boutique Hotel', city: 'Johor Bahru', currency: 'RM', timezone: 'Asia/Kuala_Lumpur', checkInTime: '15:00', checkOutTime: '12:00', address: HOTEL.address, phone: HOTEL.phone, email: HOTEL.email, website: HOTEL.website, starRating: HOTEL.starRating },
    users, roomTypes, rooms, blocks, bookings, payments, alerts, hkTasks: [], fixedExpenses, expenses, cashCounts, audit,
  }
}
