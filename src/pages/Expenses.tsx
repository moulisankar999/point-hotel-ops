import { useMemo, useState } from 'react'
import { Plus, Save } from 'lucide-react'
import { useData } from '../state/AppContext'
import { Card, Empty, Field, Modal, PageHeader } from '../components/ui'
import { ADHOC_CATEGORIES } from '../data/seed'
import { daysInMonth, monthOf, prettyDate } from '../lib/dates'
import { rm } from '../lib/format'
import { can } from '../lib/permissions'
import type { FixedExpense } from '../lib/types'

export function Expenses() {
  const { db, user, today, run } = useData()
  const [month, setMonth] = useState(monthOf(today))
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ date: today, category: ADHOC_CATEGORIES[0], description: '', amount: 0 })
  const list = useMemo(() => db.expenses.filter((e) => e.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date)), [db, month])
  const total = list.reduce((s, e) => s + e.amount, 0)
  const staff = (id: string) => db.users.find((u) => u.id === id)?.fullName ?? '—'

  return (
    <div>
      <PageHeader title="Expenses" subtitle="Day-to-day spending and fixed monthly costs"
        actions={<>
          <input type="month" className="input !w-auto" value={month} onChange={(e) => setMonth(e.target.value || monthOf(today))} />
          <button className="btn-primary" onClick={() => { setF({ date: today, category: ADHOC_CATEGORIES[0], description: '', amount: 0 }); setOpen(true) }}><Plus size={16} />Add expense</button>
        </>} />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" title={`Other expenses · ${rm(total)}`}>
          {list.length === 0 ? <Empty title="No expenses this month" /> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr><th className="th">Date</th><th className="th">Category</th><th className="th">Description</th><th className="th text-right">Amount</th><th className="th">By</th></tr></thead>
                <tbody>{list.map((e) => (
                  <tr key={e.id}><td className="td whitespace-nowrap">{prettyDate(e.date, { day: 'numeric', month: 'short' })}</td><td className="td">{e.category}</td><td className="td">{e.description}</td><td className="td text-right tabular-nums">{rm(e.amount)}</td><td className="td text-sm text-slate-500">{staff(e.createdBy)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
        {can(user.role, 'expenses.fixed') ? <FixedCosts month={month} /> : <Card className="lg:col-span-2" title="Fixed monthly costs"><p className="text-sm text-slate-500">Only the CEO/GM can see and change fixed costs.</p></Card>}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Add expense"
        footer={<><button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" onClick={async () => { if (await run((o) => o.addExpense(f), 'Expense saved')) setOpen(false) }}>Save</button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date"><input type="date" className="input" max={today} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Amount (RM)"><input type="number" min={0} step="0.01" className="input" value={f.amount || ''} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} autoFocus /></Field>
          <Field label="Category" className="sm:col-span-2">
            <div className="flex flex-wrap gap-1.5">{ADHOC_CATEGORIES.map((c) => <button key={c} type="button" onClick={() => setF({ ...f, category: c })} className={`pill ${f.category === c ? 'pill-active' : ''}`}>{c}</button>)}</div>
          </Field>
          <Field label="Description" className="sm:col-span-2"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. Replace aircon capacitor room 214" /></Field>
        </div>
      </Modal>
    </div>
  )
}

function FixedCosts({ month }: { month: string }) {
  const { db, run } = useData()
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [newCat, setNewCat] = useState('')
  const items = db.fixedExpenses.filter((x) => x.active)
  const val = (x: FixedExpense) => draft[x.id] ?? x.monthlyAmount
  const total = items.reduce((s, x) => s + val(x), 0)
  const dirty = Object.keys(draft).filter((id) => draft[id] !== items.find((x) => x.id === id)?.monthlyAmount)
  async function save() {
    const ok = await run(async (o) => { for (const id of dirty) { const x = items.find((i) => i.id === id)!; await o.saveFixedExpense({ ...x, monthlyAmount: draft[id] }, false) } }, 'Fixed costs saved')
    if (ok) setDraft({})
  }
  return (
    <Card className="lg:col-span-2" title="Fixed monthly costs" action={dirty.length > 0 && <button className="btn-primary btn-sm" onClick={save}><Save size={14} />Save {dirty.length}</button>}>
      <p className="mb-3 text-xs text-slate-500">Enter the monthly amount. P&L spreads it evenly: ÷ {daysInMonth(month)} days this month.</p>
      <div className="space-y-1.5">
        {items.map((x) => (
          <div key={x.id} className="flex items-center gap-2">
            <span className="flex-1 truncate text-sm">{x.category}</span>
            <input type="number" min={0} step="1" aria-label={x.category} className="input !w-32 !py-1.5 text-right" value={val(x) || ''} placeholder="0" onChange={(e) => setDraft({ ...draft, [x.id]: Number(e.target.value) })} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-black/10 pt-3 font-semibold dark:border-white/10"><span>Total per month</span><span>{rm(total)}</span></div>
      <div className="text-right text-xs text-slate-500">≈ {rm(total / daysInMonth(month))} per day</div>
      <div className="mt-3 flex gap-2">
        <input className="input !py-1.5" placeholder="New category" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
        <button className="btn-secondary btn-sm" disabled={!newCat.trim()} onClick={async () => { if (await run((o) => o.saveFixedExpense({ id: '', category: newCat.trim(), monthlyAmount: 0, active: true }, true), 'Category added')) setNewCat('') }}>Add</button>
      </div>
    </Card>
  )
}
