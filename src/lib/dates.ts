export const TZ = 'Asia/Kuala_Lumpur'

/** YYYY-MM-DD for "now" in hotel time zone */
export function todayKL(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function toDate(d: string): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}

export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(d: string, n: number): string {
  const x = toDate(d)
  x.setUTCDate(x.getUTCDate() + n)
  return fmtDate(x)
}

export function diffDays(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86400000)
}

export function daysInMonth(month: string): number {
  // month = YYYY-MM
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function monthOf(d: string): string {
  return d.slice(0, 7)
}

export function monthDays(month: string): string[] {
  const n = daysInMonth(month)
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
}

export function eachDay(from: string, toExclusive: string): string[] {
  const out: string[] = []
  for (let d = from; d < toExclusive; d = addDays(d, 1)) out.push(d)
  return out
}

/** Date part (KL) of an ISO timestamp */
export function dateOfTs(ts: string): string {
  return todayKL(new Date(ts))
}

export function prettyDate(d: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  return new Intl.DateTimeFormat('en-MY', { ...opts, timeZone: 'UTC' }).format(toDate(d))
}

export function prettyTs(ts: string): string {
  return new Intl.DateTimeFormat('en-MY', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ts))
}

export function weekday(d: string): string {
  return new Intl.DateTimeFormat('en-MY', { weekday: 'short', timeZone: 'UTC' }).format(toDate(d))
}
