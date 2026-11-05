import { cls } from '../lib/format'

export function Bars({ data, height = 140, format, highlight }: { data: { label: string; value: number; sub?: string }[]; height?: number; format?: (v: number) => string; highlight?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
          <div className={cls('w-full rounded-t-md transition-all', d.label === highlight ? 'bg-brand-600' : 'bg-brand-300/80 group-hover:bg-brand-500 dark:bg-brand-500/50')} style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 3 : 0 }} />
          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white group-hover:block">
            {d.sub ?? d.label}: {format ? format(d.value) : d.value}
          </div>
        </div>
      ))}
    </div>
  )
}

export function Donut({ parts, size = 120 }: { parts: { label: string; value: number; color: string }[]; size?: number }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  let acc = 0
  const r = 15.9155
  return (
    <svg viewBox="0 0 42 42" width={size} height={size} className="-rotate-90">
      <circle cx="21" cy="21" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-black/5 dark:text-white/10" />
      {parts.map((p) => {
        const len = (p.value / total) * 100
        const el = <circle key={p.label} cx="21" cy="21" r={r} fill="none" stroke={p.color} strokeWidth="6" strokeDasharray={`${len} ${100 - len}`} strokeDashoffset={-acc} />
        acc += len
        return el
      })}
    </svg>
  )
}

export function Meter({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cls('h-2 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10', className)}>
      <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  )
}
