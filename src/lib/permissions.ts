import type { Role } from './types'

export type Perm =
  | 'dashboard'
  | 'rooms.view'
  | 'rooms.manage' // out-of-order, blocks
  | 'bookings.view'
  | 'bookings.create'
  | 'bookings.checkin'
  | 'bookings.cancel_reserved'
  | 'bookings.void' // void / edit checked-in or past
  | 'bookings.edit_after_checkout'
  | 'housekeeping'
  | 'alerts'
  | 'reports.recon' // reconciliation, fraud flags
  | 'reports.pnl'
  | 'expenses.adhoc'
  | 'expenses.fixed'
  | 'cash.count'
  | 'audit'
  | 'users'
  | 'settings'

const ALL: Perm[] = [
  'dashboard', 'rooms.view', 'rooms.manage', 'bookings.view', 'bookings.create', 'bookings.checkin', 'bookings.cancel_reserved',
  'bookings.void', 'bookings.edit_after_checkout', 'housekeeping', 'alerts', 'reports.recon', 'reports.pnl', 'expenses.adhoc',
  'expenses.fixed', 'cash.count', 'audit', 'users', 'settings',
]

export const ROLE_PERMS: Record<Role, Perm[]> = {
  ceo: ALL,
  ops_manager: [
    'dashboard', 'rooms.view', 'rooms.manage', 'bookings.view', 'bookings.create', 'bookings.checkin', 'bookings.cancel_reserved',
    'bookings.void', 'bookings.edit_after_checkout', 'housekeeping', 'alerts', 'reports.recon', 'expenses.adhoc', 'cash.count',
  ],
  manager: [
    'dashboard', 'rooms.view', 'rooms.manage', 'bookings.view', 'bookings.create', 'bookings.checkin', 'bookings.cancel_reserved',
    'bookings.void', 'bookings.edit_after_checkout', 'housekeeping', 'alerts', 'reports.recon', 'expenses.adhoc', 'cash.count',
  ],
  front_desk: ['dashboard', 'rooms.view', 'bookings.view', 'bookings.create', 'bookings.checkin', 'bookings.cancel_reserved', 'cash.count'],
  housekeeping: ['housekeeping'],
}

export function can(role: Role | undefined, perm: Perm): boolean {
  if (!role) return false
  return ROLE_PERMS[role].includes(perm)
}

export const MANAGER_PLUS: Role[] = ['ceo', 'ops_manager', 'manager']
export const isManagerPlus = (r?: Role) => !!r && MANAGER_PLUS.includes(r)
