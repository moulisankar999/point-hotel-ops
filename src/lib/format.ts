export function rm(n: number, digits = 2): string {
  const v = Number.isFinite(n) && Math.abs(n) >= 0.5 * 10 ** -digits ? n : 0
  return 'RM ' + v.toLocaleString('en-MY', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
export function pct(n: number, digits = 1): string {
  return (Number.isFinite(n) ? n * 100 : 0).toFixed(digits) + '%'
}
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
export function uid(prefix = ''): string {
  const c = globalThis.crypto
  const id = c && 'randomUUID' in c ? c.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return prefix + id
}
export function normRef(ref: string | null | undefined): string {
  return (ref ?? '').trim().toUpperCase().replace(/\s+/g, '')
}
export function cls(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(' ')
}
