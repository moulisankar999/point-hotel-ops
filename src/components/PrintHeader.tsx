import { useData } from '../state/AppContext'
import { HOTEL, LOGO_URL } from '../lib/hotel'

/** Letterhead that only appears on printed pages / PDFs (P&L, reports, any page printed from the browser). */
export function PrintHeader() {
  const { db } = useData()
  const s = db.settings
  const contact = [s.phone ?? HOTEL.phone, s.email ?? HOTEL.email, s.website ?? HOTEL.website].filter(Boolean).join(' · ')
  return (
    <div className="mb-5 hidden items-center gap-4 border-b border-black/20 pb-3 text-black print:flex" data-testid="print-header">
      <img src={LOGO_URL} alt="" className="h-16 w-auto" />
      <div className="leading-snug">
        <div className="text-lg font-bold">{s.hotelName || HOTEL.name}</div>
        <div className="text-xs">{s.address || HOTEL.address}</div>
        <div className="text-xs">{contact}</div>
      </div>
    </div>
  )
}
