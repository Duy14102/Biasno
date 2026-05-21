export function formatTimeSec(s: number): string {
  const total = Math.max(0, s)
  const m = Math.floor(total / 60)
  const sec = Math.floor(total % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function formatTimeMs(ms: number, opts: { decimals?: number } = {}): string {
  const total = Math.max(0, ms) / 1000
  const m = Math.floor(total / 60)
  const s = total - m * 60
  const decimals = opts.decimals ?? 0
  if (decimals > 0) {
    const padTotal = 3 + decimals
    return `${m}:${s.toFixed(decimals).padStart(padTotal, '0')}`
  }
  return `${m}:${Math.round(s).toString().padStart(2, '0')}`
}

export function formatShortDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      year: '2-digit', month: 'short', day: '2-digit',
    })
  } catch { return '—' }
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
