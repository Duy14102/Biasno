import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// Pixels per ms at "natural" zoom — used as the floor so very short
// recordings stay legible even when their container is huge.
const PX_PER_MS_FLOOR = 0.1

// Resolve px-per-ms once on first non-empty measurement and HOLD it across
// subsequent extensions (paste / clone / continue-record / drag-insert).
// Existing bars then stay at the same pixel size; the timeline grows in
// width and the scroll container picks up the overflow.
//
// • Container grows via window resize → recompute up so we use the extra
//   room.  Shrinks → leave the lock alone (scroll appears earlier).
// • max drops to 0 (Clear) → drop the lock.  The next non-empty render
//   relocks against the new baseline.
// • Different recording loaded (library load) → parent should re-key the
//   timeline so this hook resets cleanly.
export interface TimelineScale {
  pxPerMs: number       // effective px/ms (uses floor until locked)
  trackPx: number       // total timeline pixel width
  scaledMinWidth: string  // CSS value for `min-width`
  containerRef: React.RefObject<HTMLDivElement>
}

export function useTimelineScale(range: number, max: number): TimelineScale {
  const containerRef = useRef<HTMLDivElement>(null!)
  const [pxPerMs, setPxPerMs] = useState<number | null>(null)
  const baselineRangeRef = useRef(0)

  useLayoutEffect(() => {
    if (max <= 0) {
      if (pxPerMs !== null) setPxPerMs(null)
      baselineRangeRef.current = 0
      return
    }
    if (pxPerMs !== null) return
    const w = containerRef.current?.clientWidth ?? 0
    if (w <= 0) return
    baselineRangeRef.current = range
    setPxPerMs(Math.max(PX_PER_MS_FLOOR, w / range))
  }, [max, pxPerMs, range])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (pxPerMs === null) return
      const base = baselineRangeRef.current
      if (base <= 0) return
      const desired = el.clientWidth / base
      if (desired > pxPerMs) setPxPerMs(desired)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [pxPerMs])

  const eff = pxPerMs ?? PX_PER_MS_FLOOR
  const trackPx = pxPerMs !== null ? range * pxPerMs : 0
  return {
    pxPerMs: eff,
    trackPx,
    scaledMinWidth: trackPx > 0 ? `${trackPx}px` : '100%',
    containerRef,
  }
}
