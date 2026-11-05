import type { DisplayStatus } from '../lib/logic'
import type { BookingStatus } from '../lib/types'

export const STATUS_META: Record<DisplayStatus, { label: string; tile: string; dot: string }> = {
  available: { label: 'Available', tile: 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-100', dot: 'bg-emerald-500' },
  occupied: { label: 'Occupied', tile: 'bg-brand-50 border-brand-200 text-brand-900 dark:bg-brand-500/15 dark:border-brand-500/40 dark:text-brand-100', dot: 'bg-brand-600' },
  dirty: { label: 'Dirty', tile: 'bg-orange-50 border-orange-200 text-orange-900 dark:bg-orange-500/10 dark:border-orange-500/30 dark:text-orange-100', dot: 'bg-orange-500' },
  cleaning: { label: 'Cleaning', tile: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-100', dot: 'bg-amber-400' },
  clean: { label: 'Clean · to inspect', tile: 'bg-lime-50 border-lime-200 text-lime-900 dark:bg-lime-500/10 dark:border-lime-500/30 dark:text-lime-100', dot: 'bg-lime-500' },
  inspected: { label: 'Inspected · to release', tile: 'bg-teal-50 border-teal-200 text-teal-900 dark:bg-teal-500/10 dark:border-teal-500/30 dark:text-teal-100', dot: 'bg-teal-500' },
  maintenance: { label: 'Maintenance', tile: 'bg-zinc-100 border-zinc-300 text-zinc-700 dark:bg-zinc-500/15 dark:border-zinc-500/30 dark:text-zinc-200', dot: 'bg-zinc-500' },
  blocked: { label: 'Blocked', tile: 'bg-violet-50 border-violet-200 text-violet-900 dark:bg-violet-500/10 dark:border-violet-500/30 dark:text-violet-100', dot: 'bg-violet-500' },
}

export const BOOKING_STATUS: Record<BookingStatus, { label: string; tone: 'blue' | 'green' | 'slate' | 'rose' | 'amber' | 'zinc' }> = {
  reserved: { label: 'Reserved', tone: 'amber' },
  checked_in: { label: 'In house', tone: 'blue' },
  checked_out: { label: 'Checked out', tone: 'slate' },
  cancelled: { label: 'Cancelled', tone: 'rose' },
  no_show: { label: 'No-show', tone: 'rose' },
  void: { label: 'Void', tone: 'zinc' },
}
