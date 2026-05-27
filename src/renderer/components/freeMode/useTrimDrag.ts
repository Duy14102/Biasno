// Drag-state for the two trim handles.  Encapsulates the mousedown →
// window-mousemove/mouseup pump, the snap-to-playhead magnet, the minimum-
// gap clamp, and the active-side state so the component can render which
// handle is being held.  Commits live: each move calls `onDraft`, each
// release calls `onCommit` (so the editor's history only records a single
// entry per gesture).

import { useCallback, useEffect, useRef, useState } from 'react'

// How close a handle must be to the playhead to snap onto it.
const SNAP_MS = 120

export type TrimSide = 'start' | 'end'

interface Args {
  startMs:       number
  endMs:         number
  durationMs:    number
  minGapMs:      number
  msAtClientX:   (x: number) => number
  playbackMsRef: React.MutableRefObject<number | undefined>
  onDraft:       (side: TrimSide, ms: number) => void
  onCommit:      (side: TrimSide, ms: number) => void
}

export interface TrimDragApi {
  active:      TrimSide | null
  snappedSide: TrimSide | null
  begin:       (side: TrimSide) => (e: React.MouseEvent) => void
}

export function useTrimDrag({
  startMs, endMs, durationMs, minGapMs,
  msAtClientX, playbackMsRef,
  onDraft, onCommit,
}: Args): TrimDragApi {
  const [active, setActive] = useState<TrimSide | null>(null)
  const [snappedSide, setSnappedSide] = useState<TrimSide | null>(null)
  const activeRef = useRef<TrimSide | null>(null)
  useEffect(() => { activeRef.current = active }, [active])

  // Refs so the global listener closures see the latest bounds without
  // having to detach + reattach on every state change.
  const boundsRef = useRef({ startMs, endMs, durationMs, minGapMs })
  useEffect(() => {
    boundsRef.current = { startMs, endMs, durationMs, minGapMs }
  }, [startMs, endMs, durationMs, minGapMs])

  const snapToPlayhead = useCallback((ms: number): { ms: number; snapped: boolean } => {
    const p = playbackMsRef.current
    if (p === undefined) return { ms, snapped: false }
    if (Math.abs(ms - p) < SNAP_MS) return { ms: p, snapped: true }
    return { ms, snapped: false }
  }, [playbackMsRef])

  const clampSide = useCallback((side: TrimSide, ms: number): number => {
    const { startMs: s, endMs: e, durationMs: d, minGapMs: g } = boundsRef.current
    if (side === 'start') return Math.max(0, Math.min(ms, e - g))
    return                       Math.min(d, Math.max(ms, s + g))
  }, [])

  const onMove = useCallback((e: MouseEvent) => {
    const which = activeRef.current
    if (!which) return
    const raw = msAtClientX(e.clientX)
    const { ms, snapped } = snapToPlayhead(raw)
    setSnappedSide(snapped ? which : null)
    onDraft(which, clampSide(which, ms))
  }, [msAtClientX, snapToPlayhead, clampSide, onDraft])

  const onUp = useCallback((e: MouseEvent) => {
    const which = activeRef.current
    if (!which) return
    const raw = msAtClientX(e.clientX)
    const { ms } = snapToPlayhead(raw)
    onCommit(which, clampSide(which, ms))
    activeRef.current = null
    setActive(null)
    setSnappedSide(null)
  }, [msAtClientX, snapToPlayhead, clampSide, onCommit])

  useEffect(() => {
    if (!active) return
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [active, onMove, onUp])

  const begin = useCallback((side: TrimSide) => (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    activeRef.current = side
    setActive(side)
  }, [])

  return { active, snappedSide, begin }
}
