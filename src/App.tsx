import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useApp } from './state/AppContext'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { ChangePassword } from './pages/ChangePassword'
import { Dashboard } from './pages/Dashboard'
import { Rooms } from './pages/Rooms'
import { Bookings } from './pages/Bookings'
import { Calendar } from './pages/Calendar'
import { Housekeeping } from './pages/Housekeeping'
import { Control } from './pages/Control'
import { PnLPage } from './pages/PnL'
import { Expenses } from './pages/Expenses'
import { Audit } from './pages/Audit'
import { Users } from './pages/Users'
import { Settings } from './pages/Settings'
import { can, type Perm } from './lib/permissions'

export default function App() {
  const { ready, user, db } = useApp()
  if (!ready) return <div className="grid min-h-screen place-items-center text-slate-400"><div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /></div>
  if (!user || !db) return <Login />
  if (user.mustChangePassword) return <ChangePassword />
  const home = can(user.role, 'dashboard') ? '/' : '/housekeeping'
  const G = ({ p, children }: { p: Perm; children: ReactNode }) => (can(user.role, p) ? <>{children}</> : <Navigate to={home} replace />)
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<G p="dashboard"><Dashboard /></G>} />
        <Route path="rooms" element={<G p="rooms.view"><Rooms /></G>} />
        <Route path="bookings" element={<G p="bookings.view"><Bookings /></G>} />
        <Route path="calendar" element={<G p="rooms.view"><Calendar /></G>} />
        <Route path="housekeeping" element={<G p="housekeeping"><Housekeeping /></G>} />
        <Route path="control" element={<G p="reports.recon"><Control /></G>} />
        <Route path="pnl" element={<G p="reports.pnl"><PnLPage /></G>} />
        <Route path="expenses" element={<G p="expenses.adhoc"><Expenses /></G>} />
        <Route path="audit" element={<G p="audit"><Audit /></G>} />
        <Route path="users" element={<G p="users"><Users /></G>} />
        <Route path="settings" element={<G p="settings"><Settings /></G>} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  )
}
