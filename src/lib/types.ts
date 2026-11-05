export type Role = 'ceo' | 'ops_manager' | 'manager' | 'front_desk' | 'housekeeping'

export const ROLE_LABEL: Record<Role, string> = {
  ceo: 'CEO / GM',
  ops_manager: 'Operations Manager',
  manager: 'Manager',
  front_desk: 'Front Desk',
  housekeeping: 'Housekeeping Supervisor',
}

export interface AppUser {
  id: string
  username: string
  fullName: string
  role: Role
  active: boolean
  createdAt: string
  /** set on new / reset logins; the app forces a new password before anything else */
  mustChangePassword?: boolean
}

export interface Settings {
  hotelName: string
  city: string
  currency: string
  timezone: string
  checkInTime: string
  checkOutTime: string
  /** true until the CEO confirms the seeded rooms / room types match the real hotel */
  roomsPlaceholder?: boolean
}

export interface RoomType {
  id: string
  code: string
  name: string
  baseRate: number
  /** Lowest nightly rate staff may sell without a flag */
  rateFloor: number
  maxPax: number
}

/** Housekeeping cycle: dirty -> cleaning -> clean -> inspected -> ready (available) */
export type HkStatus = 'dirty' | 'cleaning' | 'clean' | 'inspected' | 'ready'

export interface Room {
  id: string
  number: string
  floor: number
  typeId: string
  hkStatus: HkStatus
  outOfOrder: boolean
  outOfOrderReason?: string | null
  /** Housekeeping reported a guest/luggage seen in the room */
  hkSeenOccupied: boolean
  hkSeenAt?: string | null
  hkSeenBy?: string | null
  active: boolean
}

export interface RoomBlock {
  id: string
  roomId: string
  from: string // inclusive date
  to: string // exclusive date
  reason: string
  createdBy: string
  createdAt: string
  active: boolean
}

export type BookingType = 'advance' | 'walk_in'
export type BookingStatus = 'reserved' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show' | 'void'
export type PaymentMethod = 'cash' | 'card' | 'online' | 'transfer'
export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'online', 'transfer']
export const PAYMENT_LABEL: Record<PaymentMethod, string> = { cash: 'Cash', card: 'Card', online: 'Online / OTA', transfer: 'Bank transfer' }

export interface Booking {
  id: string
  code: string
  type: BookingType
  pmsRef: string | null
  noPmsReason: string | null
  roomId: string
  guestName: string
  phone: string
  idNo: string | null
  pax: number
  checkIn: string // date
  checkOut: string // date (exclusive)
  rate: number // nightly rate charged
  amount: number // total charged
  paymentMethod: PaymentMethod
  status: BookingStatus
  notes: string | null
  belowFloor: boolean
  discountReason: string | null
  statusReason: string | null
  createdBy: string
  createdAt: string
  checkedInAt: string | null
  checkedInBy: string | null
  checkedOutAt: string | null
  checkedOutBy: string | null
  updatedAt: string
}

export interface Payment {
  id: string
  bookingId: string
  date: string
  method: PaymentMethod
  amount: number
  createdBy: string
  createdAt: string
  note: string | null
}

export type AlertType = 'check_in' | 'check_out' | 'walk_in' | 'advance' | 'cancel' | 'flag'
export interface AlertItem {
  id: string
  type: AlertType
  title: string
  message: string
  bookingId: string | null
  createdBy: string
  createdAt: string
  readBy: string[]
}

export type HkTaskKind = 'checkout' | 'stayover' | 'adhoc'
export type HkTaskStatus = 'pending' | 'in_progress' | 'done' | 'inspected'
export interface HkTask {
  id: string
  date: string
  roomId: string
  kind: HkTaskKind
  status: HkTaskStatus
  assignee: string | null
  note: string | null
  doneAt: string | null
  inspectedAt: string | null
  updatedBy: string | null
}

export interface FixedExpense {
  id: string
  category: string
  monthlyAmount: number
  active: boolean
}

export interface Expense {
  id: string
  date: string
  category: string
  description: string
  amount: number
  createdBy: string
  createdAt: string
}

export interface CashCount {
  id: string
  date: string
  amount: number
  note: string | null
  createdBy: string
  createdAt: string
}

export interface AuditEntry {
  id: string
  at: string
  userId: string | null
  userName: string
  entity: string
  entityId: string
  action: 'insert' | 'update' | 'delete' | 'login' | 'logout'
  reason: string | null
  before: unknown
  after: unknown
}

export interface Db {
  settings: Settings
  users: AppUser[]
  roomTypes: RoomType[]
  rooms: Room[]
  blocks: RoomBlock[]
  bookings: Booking[]
  payments: Payment[]
  alerts: AlertItem[]
  hkTasks: HkTask[]
  fixedExpenses: FixedExpense[]
  expenses: Expense[]
  cashCounts: CashCount[]
  audit: AuditEntry[]
}
