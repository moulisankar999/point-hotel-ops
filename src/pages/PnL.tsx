import { useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { useData } from '../state/AppContext'
import { Card, PageHeader, Segmented } from '../components/ui'
import { Bars } from '../components/Charts'
import { addDays, monthOf, prettyDate } from '../lib/dates'
import { monthPnl, pnl } from '../lib/logic'
import { cls, pct, rm } from '../lib/format'
import { PAYMENT_LABEL, PAYMENT_METHODS } from '../lib/types'

export function PnLPage() {
  const { db, today } = useData()
  const [mode, setMode] = useState<'day' | 'month'>('month')
  const [day, setDay] = useState(today)
  const [month, setMonth] = useState(monthOf(today))
  const p = useMemo(() => (mode === 'day' ? pnl(db, day, addDays(day, 1)) : monthPnl(db, month)), [db, mode, day, month])
  const toDate = mode === 'month' && month === monthOf(today) ? monthPnl(db, month, today) : null
  const period = mode === 'day' ? prettyDate(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : new Date(month + '-01T00:00:00Z').toLocaleDateString('en-MY', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const fixedSet = db.fixedExpenses.filter((f) => f.active && f.monthlyAmount > 0).length

  return (
    <div className="print:text-black">
      <PageHeader title="Profit & Loss" subtitle={`${db.settings.hotelName} · ${period}`}
        actions={<div className="no-print flex flex-wrap items-center gap-2">
          <Segmented value={mode} onChange={setMode} options={[{ value: 'day', label: 'Daily' }, { value: 'month', label: 'Monthly' }]} />
          {mode === 'day' ? <input type="date" className="input !w-auto" value={day} onChange={(e) => setDay(e.target.value || today)} /> : <input type="month" className="input !w-auto" value={month} onChange={(e) => setMonth(e.target.value || monthOf(today))} />}
          <button className="btn-secondary" onClick={() => window.print()}><Printer size={16} />Print / PDF</button>
        </div>} />
      {fixedSet === 0 && <div className="no-print mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">Fixed monthly costs are all RM 0. Fill them in under <b>Expenses → Fixed monthly costs</b> to see true profit.</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Room revenue" value={rm(p.revenue, 0)} />
        <Kpi label="Occupancy" value={pct(p.occupancy, 1)} sub={`${p.roomsSold} of ${p.roomNightsAvailable} room-nights`} />
        <Kpi label="ADR" value={rm(p.adr)} sub="Avg rate per sold room" />
        <Kpi label="RevPAR" value={rm(p.revpar)} sub="Revenue per available room" />
        <Kpi label="Net profit" value={rm(p.netProfit, 0)} sub={`Margin ${pct(p.margin, 1)}`} tone={p.netProfit >= 0 ? 'pos' : 'neg'} />
      </div>
      {toDate && <div className="mt-2 text-xs text-slate-500">Month to date (to {prettyDate(today, { day: 'numeric', month: 'short' })}): revenue {rm(toDate.revenue, 0)} · costs {rm(toDate.expensesTotal, 0)} · net {rm(toDate.netProfit, 0)}. Full month figures include advance bookings already on the books.</div>}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Statement">
          <table className="w-full">
            <tbody>
              <Section title="Revenue by payment method" />
              {PAYMENT_METHODS.map((m) => <Line key={m} label={PAYMENT_LABEL[m]} v={p.revenueByMethod[m]} />)}
              <Total label="Total revenue" v={p.revenue} />
              <Section title={`Fixed costs ${mode === 'day' ? '(monthly ÷ days in month)' : '(pro-rated daily)'}`} />
              {p.fixedLines.filter((l) => l.amount > 0).map((l) => <Line key={l.category} label={l.category} v={-l.amount} />)}
              {p.fixedLines.every((l) => l.amount === 0) && <tr><td colSpan={2} className="td text-sm text-slate-400">No fixed costs entered</td></tr>}
              <Total label="Total fixed" v={-p.fixedTotal} />
              <Section title="Other expenses" />
              {p.adhocLines.map((l) => <Line key={l.category} label={l.category} v={-l.amount} />)}
              {p.adhocLines.length === 0 && <tr><td colSpan={2} className="td text-sm text-slate-400">None recorded</td></tr>}
              <Total label="Total other" v={-p.adhocTotal} />
              <tr className="border-t-2 border-slate-900 dark:border-white"><td className="py-3 text-base font-bold">Net profit</td><td className={cls('py-3 text-right text-base font-bold tabular-nums', p.netProfit < 0 ? 'text-rose-600' : 'text-emerald-600')}>{rm(p.netProfit)}</td></tr>
            </tbody>
          </table>
        </Card>
        {mode === 'month' ? (
          <Card title="Daily revenue">
            <Bars data={p.daily.map((d) => ({ label: d.date, value: d.revenue, sub: prettyDate(d.date, { day: 'numeric', month: 'short' }) }))} format={(v) => rm(v, 0)} highlight={today} height={200} />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr><th className="th">Day</th><th className="th text-right">Sold</th><th className="th text-right">Occ.</th><th className="th text-right">Revenue</th><th className="th text-right">ADR</th></tr></thead>
                <tbody>
                  {p.daily.map((d) => (
                    <tr key={d.date} className={cls(d.date === today && 'bg-brand-50/60 dark:bg-brand-500/10', d.date > today && 'text-slate-400')}>
                      <td className="td !py-1.5">{prettyDate(d.date, { weekday: 'short', day: 'numeric' })}</td>
                      <td className="td !py-1.5 text-right">{d.roomsSold}</td>
                      <td className="td !py-1.5 text-right">{pct(d.occupancy, 0)}</td>
                      <td className="td !py-1.5 text-right tabular-nums">{rm(d.revenue, 0)}</td>
                      <td className="td !py-1.5 text-right tabular-nums">{rm(d.adr, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card title="Notes">
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
              <li>Revenue is recognised per night stayed: booking amount ÷ nights.</li>
              <li>Fixed monthly costs are spread evenly over the days of the month.</li>
              <li>Cancelled, void and no-show bookings are excluded.</li>
              <li>For cash actually collected see Control & reconciliation.</li>
            </ul>
          </Card>
        )}
      </div>
      <div className="mt-6 hidden text-xs text-slate-500 print:block">Printed {new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })} · {db.settings.hotelName} Hotel Ops</div>
    </div>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'pos' | 'neg' }) {
  return <div className="card p-4"><div className="text-[13px] text-slate-500">{label}</div><div className={cls('mt-1 text-2xl font-bold tracking-tight', tone === 'pos' && 'text-emerald-600', tone === 'neg' && 'text-rose-600')}>{value}</div>{sub && <div className="text-xs text-slate-500">{sub}</div>}</div>
}
function Section({ title }: { title: string }) {
  return <tr><td colSpan={2} className="pb-1 pt-4 text-[12px] font-semibold uppercase tracking-wide text-slate-500">{title}</td></tr>
}
function Line({ label, v }: { label: string; v: number }) {
  return <tr><td className="py-1 text-sm">{label}</td><td className="py-1 text-right text-sm tabular-nums">{rm(v)}</td></tr>
}
function Total({ label, v }: { label: string; v: number }) {
  return <tr className="border-t border-black/10 dark:border-white/10"><td className="py-1.5 text-sm font-semibold">{label}</td><td className="py-1.5 text-right text-sm font-semibold tabular-nums">{rm(v)}</td></tr>
}
