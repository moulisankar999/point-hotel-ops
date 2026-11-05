import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useState, type ReactNode } from 'react'
import { BedDouble, CalendarDays, ChartColumn, ClipboardList, LayoutDashboard, LogOut, Moon, ScrollText, Settings, ShieldCheck, SprayCan, Sun, Users, Wallet, Menu, X } from 'lucide-react'
import { useData } from '../state/AppContext'
import { can, type Perm } from '../lib/permissions'
import { ROLE_LABEL } from '../lib/types'
import { cls } from '../lib/format'
import { isDemo } from '../data'
import { AlertBell } from './AlertBell'
import { HOTEL, LOGO_MARK_URL } from '../lib/hotel'
import { PrintHeader } from './PrintHeader'

interface NavItem { to: string; label: string; icon: ReactNode; perm: Perm; mobile?: boolean }

export const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={19} />, perm: 'dashboard', mobile: true },
  { to: '/rooms', label: 'Rooms', icon: <BedDouble size={19} />, perm: 'rooms.view', mobile: true },
  { to: '/bookings', label: 'Bookings', icon: <ClipboardList size={19} />, perm: 'bookings.view', mobile: true },
  { to: '/calendar', label: 'Calendar', icon: <CalendarDays size={19} />, perm: 'rooms.view' },
  { to: '/housekeeping', label: 'Housekeeping', icon: <SprayCan size={19} />, perm: 'housekeeping', mobile: true },
  { to: '/control', label: 'Control & recon', icon: <ShieldCheck size={19} />, perm: 'reports.recon' },
  { to: '/pnl', label: 'P&L', icon: <ChartColumn size={19} />, perm: 'reports.pnl', mobile: true },
  { to: '/expenses', label: 'Expenses', icon: <Wallet size={19} />, perm: 'expenses.adhoc' },
  { to: '/audit', label: 'Audit log', icon: <ScrollText size={19} />, perm: 'audit' },
  { to: '/users', label: 'Users', icon: <Users size={19} />, perm: 'users' },
  { to: '/settings', label: 'Settings', icon: <Settings size={19} />, perm: 'settings' },
]

export function Layout() {
  const { user, db, signOut, theme, toggleTheme } = useData()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const items = NAV.filter((n) => can(user.role, n.perm))
  const mobileItems = items.filter((n) => n.mobile).slice(0, 4)

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {items.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={() => setOpen(false)} className={({ isActive }) => cls('flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] font-medium transition', isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10')}>
          {n.icon}
          {n.label}
        </NavLink>
      ))}
    </nav>
  )

  const brand = (
    <div className="flex items-center gap-2.5 px-2">
      <img src={LOGO_MARK_URL} alt="" className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain p-1 shadow-sm ring-1 ring-black/5" data-testid="sidebar-logo" />
      <div className="leading-tight">
        <div className="text-[14.5px] font-bold">{db.settings.hotelName || HOTEL.name}</div>
        <div className="text-[11.5px] text-slate-500 dark:text-slate-400">Hotel Ops · {db.settings.city}</div>
      </div>
    </div>
  )

  const userBox = (
    <div className="rounded-2xl bg-black/[0.03] p-3 dark:bg-white/5">
      <div className="text-sm font-semibold">{user.fullName}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{ROLE_LABEL[user.role]} · @{user.username}</div>
      <div className="mt-2 flex gap-1">
        <button className="btn-ghost btn-sm flex-1" onClick={toggleTheme} aria-label="Toggle theme">{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}{theme === 'dark' ? 'Light' : 'Dark'}</button>
        <button className="btn-ghost btn-sm flex-1" onClick={signOut}><LogOut size={15} />Sign out</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-5 border-r border-black/5 bg-white/70 p-4 backdrop-blur-xl dark:border-white/10 dark:bg-[#111317]/80 lg:flex">
        {brand}
        <div className="flex-1 overflow-y-auto">{nav}</div>
        {userBox}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="no-print fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col gap-5 bg-white p-4 dark:bg-[#111317]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">{brand}<button className="btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
            <div className="flex-1 overflow-y-auto">{nav}</div>
            {userBox}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-black/5 bg-[#f5f5f7]/80 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-[#0b0c0f]/80 sm:px-6">
          <button className="btn-ghost btn-sm !p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <img src={LOGO_MARK_URL} alt="" className="h-7 w-7 object-contain lg:hidden" />
          <div className="text-[15px] font-semibold lg:hidden">{items.find((n) => (n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to)))?.label ?? 'The Point'}</div>
          <div className="flex-1" />
          {isDemo && <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">DEMO DATA</span>}
          <AlertBell />
        </header>
        <main className="print-full mx-auto max-w-[1400px] px-4 pb-28 pt-5 sm:px-6 lg:pb-10">
          <PrintHeader />
          <Outlet />
        </main>
      </div>

      {/* Mobile tab bar */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid border-t border-black/5 bg-white/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl dark:border-white/10 dark:bg-[#111317]/90 lg:hidden" style={{ gridTemplateColumns: `repeat(${mobileItems.length + 1}, minmax(0, 1fr))` }}>
        {mobileItems.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cls('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-brand-600 dark:text-brand-300' : 'text-slate-500')}>
            {n.icon}
            {n.label}
          </NavLink>
        ))}
        <button className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500" onClick={() => setOpen(true)}><Menu size={19} />More</button>
      </nav>
    </div>
  )
}
