import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cls } from '../lib/format'

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight sm:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cls('card', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 px-5 pt-4">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

export function Stat({ label, value, hint, icon, tone = 'slate' }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'slate' | 'blue' | 'green' | 'amber' | 'rose' | 'violet' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
    blue: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
  }
  return (
    <div className="card flex items-start gap-3 p-4">
      {icon && <div className={cls('hidden h-10 w-10 shrink-0 place-items-center rounded-xl sm:grid', tones[tone])}>{icon}</div>}
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-slate-500 dark:text-slate-400">{label}</div>
        <div className="mt-0.5 truncate text-[20px] font-bold sm:text-[22px] tracking-tight">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
      </div>
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={onClose} role="dialog" aria-modal="true">
      <div className={cls('flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-[#16181d] sm:rounded-3xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-4 dark:border-white/10">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button className="btn-ghost btn-sm !p-1.5" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-black/5 px-5 py-3 dark:border-white/10">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, children, hint, error, className }: { label: string; children: ReactNode; hint?: ReactNode; error?: string | null; className?: string }) {
  return (
    <label className={cls('block', className)}>
      <span className="label">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span> : null}
    </label>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-xl bg-black/[0.05] p-1 dark:bg-white/[0.07]">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} className={cls('rounded-lg px-3 py-1.5 text-[13px] font-semibold transition', value === o.value ? 'bg-white text-slate-900 shadow-sm dark:bg-white/15 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Empty({ icon, title, body }: { icon?: ReactNode; title: string; body?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center text-slate-500 dark:text-slate-400">
      {icon && <div className="mb-2 text-slate-300 dark:text-slate-600">{icon}</div>}
      <div className="font-semibold text-slate-700 dark:text-slate-200">{title}</div>
      {body && <div className="mt-1 text-sm">{body}</div>}
    </div>
  )
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'blue' | 'green' | 'amber' | 'rose' | 'violet' | 'orange' | 'zinc' }) {
  const t = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200',
    blue: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
    orange: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-200',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200',
    zinc: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-500/20 dark:text-zinc-200',
  }
  return <span className={cls('chip', t[tone])}>{children}</span>
}

export function ReasonPrompt({ open, title, label, confirmLabel, danger, onClose, onConfirm }: { open: boolean; title: string; label: string; confirmLabel: string; danger?: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={(e) => { e.preventDefault(); const r = new FormData(e.currentTarget).get('reason') as string; onConfirm(r) }}>
        <Field label={label} hint="Saved permanently in the audit log.">
          <textarea name="reason" className="input min-h-[90px]" required minLength={5} autoFocus />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Back</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'}>{confirmLabel}</button>
        </div>
      </form>
    </Modal>
  )
}
