import { useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck, DoorOpen, LogOut, CalendarPlus, TriangleAlert, Ban, Footprints } from 'lucide-react'
import { useData } from '../state/AppContext'
import { can } from '../lib/permissions'
import { store } from '../data'
import { prettyTs } from '../lib/dates'
import type { AlertType } from '../lib/types'

const ICON: Record<AlertType, JSX.Element> = {
  check_in: <DoorOpen size={16} className="text-brand-600" />,
  walk_in: <Footprints size={16} className="text-brand-600" />,
  check_out: <LogOut size={16} className="text-slate-500" />,
  advance: <CalendarPlus size={16} className="text-amber-600" />,
  cancel: <Ban size={16} className="text-rose-600" />,
  flag: <TriangleAlert size={16} className="text-rose-600" />,
}

export function AlertBell() {
  const { db, user, refresh } = useData()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  if (!can(user.role, 'alerts')) return null
  const alerts = [...db.alerts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 40)
  const unread = db.alerts.filter((a) => !a.readBy.includes(user.id))
  const staff = (id: string) => db.users.find((u) => u.id === id)?.fullName ?? 'Staff'
  return (
    <div className="relative" ref={ref}>
      <button className="btn-ghost btn-sm relative !p-2" onClick={() => setOpen((o) => !o)} aria-label={`Alerts (${unread.length} unread)`}>
        <Bell size={20} />
        {unread.length > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-rose-600 px-1 text-[10.5px] font-bold text-white">{unread.length > 99 ? '99+' : unread.length}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1a1c22]">
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 dark:border-white/10">
            <div className="font-semibold">Alerts</div>
            <button className="btn-ghost btn-sm" disabled={!unread.length} onClick={async () => { await store.markAlertsRead(unread.map((a) => a.id)); await refresh() }}><CheckCheck size={15} />Mark all read</button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {alerts.length === 0 && <div className="p-6 text-center text-sm text-slate-500">No alerts yet.</div>}
            {alerts.map((a) => (
              <div key={a.id} className={`flex gap-3 border-b border-black/[0.04] px-4 py-3 dark:border-white/5 ${a.readBy.includes(user.id) ? '' : 'bg-brand-50/60 dark:bg-brand-500/10'}`}>
                <div className="mt-0.5">{ICON[a.type]}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold">{a.title}</div>
                  <div className="text-[12.5px] text-slate-600 dark:text-slate-300">{a.message}</div>
                  <div className="mt-0.5 text-[11.5px] text-slate-400">{prettyTs(a.createdAt)} · {staff(a.createdBy)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
