import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useData } from '../state/AppContext'
import { store } from '../data'

/** CEO-only reminder that the seeded rooms / room types / rates are examples. */
export function PlaceholderBanner({ onSettings = false }: { onSettings?: boolean }) {
  const { db, user, refresh, toast } = useData()
  if (!db.settings.roomsPlaceholder || user.role !== 'ceo') return null
  async function confirm() {
    if (!window.confirm('Confirm that the room numbers, room types and rates now match the real hotel?')) return
    try { await store.saveSettings({ ...db.settings, roomsPlaceholder: false }); await refresh(); toast({ title: 'Rooms confirmed', tone: 'success' }) } catch (e) { toast({ title: 'Could not save', body: (e as Error).message, tone: 'error' }) }
  }
  return (
    <div data-testid="placeholder-banner" className="card mb-4 flex flex-col gap-3 border-amber-300/70 bg-amber-50/80 p-4 sm:flex-row sm:items-center dark:border-amber-500/30 dark:bg-amber-500/10">
      <AlertTriangle className="shrink-0 text-amber-600" size={22} />
      <div className="flex-1 text-sm">
        <div className="font-semibold text-amber-800 dark:text-amber-200">Placeholder rooms — please edit</div>
        <div className="text-amber-900/80 dark:text-amber-100/80">The {db.rooms.length} rooms (101–512), {db.roomTypes.length} room types, rates and fixed monthly costs are examples set up at go-live. Change them to match The Point, then confirm.</div>
      </div>
      <div className="flex gap-2">
        {!onSettings && <Link to="/settings" className="btn-secondary btn-sm">Edit rooms</Link>}
        <button className="btn-primary btn-sm" onClick={confirm}><CheckCircle2 size={14} />Rooms are correct</button>
      </div>
    </div>
  )
}
