export function loadJSON<T>(key: string, fallback: T, isValid?: (v: unknown) => boolean): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (isValid && !isValid(parsed)) return fallback
    return parsed as T
  } catch { return fallback }
}

export function saveJSON(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* quota */ }
}

export function removeKey(key: string): void {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}

export function isPlainObject(v: unknown): boolean {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
