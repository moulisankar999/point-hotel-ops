import { useState } from 'react'
import { Plus, RotateCcw, Save } from 'lucide-react'
import { useData } from '../state/AppContext'
import { store, isDemo } from '../data'
import { Card, Field, Modal, PageHeader } from '../components/ui'
import type { Room, RoomType, Settings as S } from '../lib/types'
import { rm } from '../lib/format'
import { PlaceholderBanner } from '../components/PlaceholderBanner'

export function Settings() {
  const { db, run, toast, refresh } = useData()
  const [s, setS] = useState<S>(db.settings)
  const [rt, setRt] = useState<{ t: RoomType; isNew: boolean } | null>(null)
  const [room, setRoom] = useState<{ r: Pick<Room, 'id' | 'number' | 'floor' | 'typeId' | 'active'>; isNew: boolean } | null>(null)
  const activeRooms = db.rooms.filter((r) => r.active)

  return (
    <div>
      <PageHeader title="Settings" subtitle="Hotel details, room types, rates and rooms" />
      <PlaceholderBanner onSettings />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Hotel" action={<button className="btn-primary btn-sm" onClick={async () => { try { await store.saveSettings(s); await refresh(); toast({ title: 'Settings saved', tone: 'success' }) } catch (e) { toast({ title: String((e as Error).message), tone: 'error' }) } }}><Save size={14} />Save</button>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Hotel name" className="sm:col-span-2"><input className="input" value={s.hotelName} onChange={(e) => setS({ ...s, hotelName: e.target.value })} /></Field>
            <Field label="Address" className="sm:col-span-2"><textarea className="input" rows={2} value={s.address ?? ''} onChange={(e) => setS({ ...s, address: e.target.value })} /></Field>
            <Field label="Phone"><input className="input" value={s.phone ?? ''} onChange={(e) => setS({ ...s, phone: e.target.value })} /></Field>
            <Field label="Email"><input type="email" className="input" value={s.email ?? ''} onChange={(e) => setS({ ...s, email: e.target.value })} /></Field>
            <Field label="Website" className="sm:col-span-2"><input className="input" value={s.website ?? ''} onChange={(e) => setS({ ...s, website: e.target.value })} /></Field>
            <Field label="Star rating"><select className="input" value={s.starRating ?? ''} onChange={(e) => setS({ ...s, starRating: e.target.value ? Number(e.target.value) : null })}><option value="">–</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} star{n > 1 ? 's' : ''}</option>)}</select></Field>
            <Field label="City"><input className="input" value={s.city} onChange={(e) => setS({ ...s, city: e.target.value })} /></Field>
            <Field label="Currency"><input className="input" value={s.currency} disabled /></Field>
            <Field label="Check-in time"><input type="time" className="input" value={s.checkInTime} onChange={(e) => setS({ ...s, checkInTime: e.target.value })} /></Field>
            <Field label="Check-out time"><input type="time" className="input" value={s.checkOutTime} onChange={(e) => setS({ ...s, checkOutTime: e.target.value })} /></Field>
            <Field label="Time zone" className="sm:col-span-2"><input className="input" value={s.timezone} disabled /></Field>
          </div>
        </Card>
        <Card title="Room types & rate floors" action={<button className="btn-secondary btn-sm" onClick={() => setRt({ t: { id: '', code: '', name: '', baseRate: 150, rateFloor: 120, maxPax: 2 }, isNew: true })}><Plus size={14} />Add</button>}>
          <table className="w-full">
            <thead><tr><th className="th">Type</th><th className="th text-right">Rate</th><th className="th text-right">Floor</th><th className="th text-right">Pax</th><th className="th text-right">Rooms</th></tr></thead>
            <tbody>{db.roomTypes.map((t) => (
              <tr key={t.id} className="cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.03]" onClick={() => setRt({ t, isNew: false })}>
                <td className="td"><b>{t.code}</b> · {t.name}</td><td className="td text-right">{rm(t.baseRate)}</td><td className="td text-right">{rm(t.rateFloor)}</td><td className="td text-right">{t.maxPax}</td><td className="td text-right">{activeRooms.filter((r) => r.typeId === t.id).length}</td>
              </tr>))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">Selling below the floor requires a reason and is flagged to management.</p>
        </Card>
      </div>
      <Card className="mt-4" title={`Rooms · ${activeRooms.length} in use · ${db.rooms.length - activeRooms.length} retired`} action={<button className="btn-secondary btn-sm" disabled={activeRooms.length >= 100} onClick={() => setRoom({ r: { id: '', number: '', floor: 1, typeId: db.roomTypes[0]?.id ?? '', active: true }, isNew: true })}><Plus size={14} />Add room</button>}>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-10">
          {db.rooms.map((r) => (
            <button key={r.id} onClick={() => setRoom({ r, isNew: false })} className={`rounded-xl border px-2 py-2 text-left text-sm ${r.active ? 'border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5' : 'border-dashed border-black/10 opacity-50'}`}>
              <div className="font-bold">{r.number}</div><div className="text-[11px] text-slate-500">{db.roomTypes.find((t) => t.id === r.typeId)?.code}{!r.active && ' · off'}</div>
            </button>
          ))}
        </div>
      </Card>
      {isDemo && store.resetDemo && (
        <Card className="mt-4" title="Demo data">
          <p className="mb-3 text-sm text-slate-500">This site is running on demo data stored only in this browser. Reset restores the original sample bookings and users.</p>
          <button className="btn-secondary !text-rose-600" onClick={async () => { if (confirm('Reset all demo data in this browser?')) { await store.resetDemo!(); location.reload() } }}><RotateCcw size={15} />Reset demo data</button>
        </Card>
      )}

      <Modal open={!!rt} onClose={() => setRt(null)} title={rt?.isNew ? 'New room type' : `Edit ${rt?.t.name}`}
        footer={<><button className="btn-secondary" onClick={() => setRt(null)}>Cancel</button><button className="btn-primary" onClick={async () => { if (await run((o) => o.saveRoomType(rt!.t, rt!.isNew), 'Room type saved')) setRt(null) }}>Save</button></>}>
        {rt && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code"><input className="input" value={rt.t.code} onChange={(e) => setRt({ ...rt, t: { ...rt.t, code: e.target.value.toUpperCase() } })} /></Field>
          <Field label="Name"><input className="input" value={rt.t.name} onChange={(e) => setRt({ ...rt, t: { ...rt.t, name: e.target.value } })} /></Field>
          <Field label="Rack rate (RM)"><input type="number" step="0.01" className="input" value={rt.t.baseRate} onChange={(e) => setRt({ ...rt, t: { ...rt.t, baseRate: Number(e.target.value) } })} /></Field>
          <Field label="Rate floor (RM)"><input type="number" step="0.01" className="input" value={rt.t.rateFloor} onChange={(e) => setRt({ ...rt, t: { ...rt.t, rateFloor: Number(e.target.value) } })} /></Field>
          <Field label="Max guests"><input type="number" className="input" value={rt.t.maxPax} onChange={(e) => setRt({ ...rt, t: { ...rt.t, maxPax: Number(e.target.value) } })} /></Field>
        </div>}
      </Modal>
      <Modal open={!!room} onClose={() => setRoom(null)} title={room?.isNew ? 'New room' : `Room ${room?.r.number}`}
        footer={<><button className="btn-secondary" onClick={() => setRoom(null)}>Cancel</button><button className="btn-primary" onClick={async () => { if (await run((o) => o.saveRoom(room!.r, room!.isNew), 'Room saved')) setRoom(null) }}>Save</button></>}>
        {room && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Room number"><input className="input" value={room.r.number} onChange={(e) => setRoom({ ...room, r: { ...room.r, number: e.target.value } })} /></Field>
          <Field label="Floor"><input type="number" className="input" value={room.r.floor} onChange={(e) => setRoom({ ...room, r: { ...room.r, floor: Number(e.target.value) } })} /></Field>
          <Field label="Type" className="sm:col-span-2"><select className="input" value={room.r.typeId} onChange={(e) => setRoom({ ...room, r: { ...room.r, typeId: e.target.value } })}>{db.roomTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          {!room.isNew && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={room.r.active} onChange={(e) => setRoom({ ...room, r: { ...room.r, active: e.target.checked } })} />Room in use (untick to retire it)</label>}
        </div>}
      </Modal>
    </div>
  )
}
