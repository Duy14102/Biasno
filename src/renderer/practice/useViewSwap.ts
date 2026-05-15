// ─── View-swap animation hook ────────────────────────────────────────────────
// Three-phase state machine that drives the SheetMusic ↔ FallingNotes flip
// animation in PracticePage:
//
//   idle  ──beginSwap(mutation)──▶  leaving  ──220 ms──▶  entering  ──460 ms──▶  idle
//                                                  │
//                                                  └▶ runs the queued mutation
//                                                     (e.g. flips showSheetMusic)
//                                                     just before the new view
//                                                     starts animating in.
//
// Decoupling the mutation from the animation lets the parent own the visual
// state (which view is shown) while this hook only owns the timing.
import { useState, useRef, useEffect, useCallback } from 'react'

export type SwapPhase = 'idle' | 'leaving' | 'entering'

export interface UseViewSwap {
  phase:     SwapPhase
  /** Queue a mutation and start the leave-swap-enter sequence.  No-op if a
   *  swap is already in flight. */
  beginSwap: (mutation: () => void) => void
}

export function useViewSwap(): UseViewSwap {
  const [phase, setPhase] = useState<SwapPhase>('idle')
  const pendingRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (phase === 'leaving') {
      // Match the longest "leaving" keyframe duration (shellLeave 220 ms).
      const t = setTimeout(() => {
        pendingRef.current?.()
        pendingRef.current = null
        setPhase('entering')
      }, 220)
      return () => clearTimeout(t)
    }
    if (phase === 'entering') {
      // Longest "entering" keyframe (contentEnter 140 ms delay + 320 ms duration).
      const t = setTimeout(() => setPhase('idle'), 460)
      return () => clearTimeout(t)
    }
    return
  }, [phase])

  const beginSwap = useCallback((mutation: () => void) => {
    if (phase !== 'idle') return
    pendingRef.current = mutation
    setPhase('leaving')
  }, [phase])

  return { phase, beginSwap }
}
