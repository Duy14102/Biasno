// ─── Per-note flash timer ────────────────────────────────────────────────────
// Drives the green-flash-on-hit / red-flash-on-miss animation on FallingNotes.
// Each call sets the target note's visual to `state` and its flashAlpha to
// 1.0, then ticks the alpha down to 0 over ~280 ms via a 28-ms setInterval.
// We keep one interval per note id and cancel any in-flight interval on
// re-trigger so rapid replays don't pile up alphas.

import { useRef, useCallback, useEffect } from 'react'
import type { NoteState } from './noteState'

interface Args {
  setNoteStates: React.Dispatch<React.SetStateAction<Map<string, NoteState>>>
  // Scoring hooks — fired once per call.  Kept here (rather than at each
  // call site) so confirmed-hit / confirmed-miss is a single funnel.
  onHit?:        (noteId: string) => void
  onMissed?:     (noteId: string) => void
}

export function useFlashTimer({ setNoteStates, onHit, onMissed }: Args): {
  triggerFlash: (noteId: string, state: 'hit' | 'missed') => void
} {
  const timers = useRef<Map<string, number>>(new Map())

  const triggerFlash = useCallback((noteId: string, state: 'hit' | 'missed') => {
    const existing = timers.current.get(noteId)
    if (existing) clearInterval(existing)

    if (state === 'hit')    onHit?.(noteId)
    if (state === 'missed') onMissed?.(noteId)

    setNoteStates((prev) => {
      const next = new Map(prev)
      const ns = next.get(noteId)
      if (ns) next.set(noteId, { ...ns, visual: state, flashAlpha: 1.0 })
      return next
    })

    let alpha = 1.0
    const id = window.setInterval(() => {
      alpha -= 0.1
      setNoteStates((prev) => {
        const next = new Map(prev)
        const ns = next.get(noteId)
        if (!ns) { clearInterval(id); return prev }
        if (alpha <= 0) {
          next.set(noteId, { ...ns, flashAlpha: 0 })
          clearInterval(id)
          timers.current.delete(noteId)
          return next
        }
        next.set(noteId, { ...ns, flashAlpha: alpha })
        return next
      })
    }, 28)
    timers.current.set(noteId, id)
  }, [setNoteStates, onHit, onMissed])

  // Cleanup on unmount: kill every running interval.
  useEffect(() => () => { timers.current.forEach((id) => clearInterval(id)) }, [])

  return { triggerFlash }
}
