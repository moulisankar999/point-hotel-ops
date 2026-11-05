import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { useApp } from '../state/AppContext'

export function Toasts() {
  const { toasts, dismiss } = useApp()
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 sm:right-4 sm:left-auto sm:items-end">
      {toasts.map((t) => (
        <div key={t.id} role="status" className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-black/5 bg-white/95 p-3.5 shadow-2xl backdrop-blur dark:border-white/10 dark:bg-[#1f2128]/95">
          <div className="mt-0.5">
            {t.tone === 'success' ? <CircleCheck size={18} className="text-emerald-600" /> : t.tone === 'error' || t.tone === 'warn' ? <TriangleAlert size={18} className={t.tone === 'error' ? 'text-rose-600' : 'text-amber-500'} /> : <Info size={18} className="text-brand-600" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{t.title}</div>
            {t.body && <div className="whitespace-pre-line text-[13px] text-slate-600 dark:text-slate-300">{t.body}</div>}
          </div>
          <button onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-600" aria-label="Dismiss"><X size={16} /></button>
        </div>
      ))}
    </div>
  )
}
