// ─── Practice scoring ───────────────────────────────────────────────────────
// State machine for the live score during a practice session.
//
// Rules (from spec):
//   • Correct hit                                 → +1 point
//   • 5 consecutive correct hits triggers combo;  each combo hit (the 6th
//     onwards while the streak continues)         → +2 points (combo bonus)
//   • Wrong key while a note is active            → penalty linearly scaled
//                                                   from −1 at the note's
//                                                   onset to 0 at its end
//   • Missed note (scrolled past with no input)   → 0 points but counts
//                                                   as a miss; combo resets
//
// Score is clamped at 0 — wrong presses can't drive it below zero.

import { useCallback, useRef, useState } from 'react'
import type { MidiNote } from '@/types'

const COMBO_THRESHOLD = 5    // 5 consecutive hits, the next hit is combo bonus
const COMBO_BONUS     = 2    // points per combo-bonus hit
const HIT_POINTS      = 1
const WRONG_MAX       = 1    // maximum penalty for a fresh-onset wrong press

export interface ScoringState {
  score:      number
  success:    number
  missed:     number
  combosHits: number
  combo:      number     // current consecutive streak
  maxCombo:   number
}

const INITIAL: ScoringState = {
  score: 0, success: 0, missed: 0,
  combosHits: 0, combo: 0, maxCombo: 0,
}

export interface UseScoring {
  state:       ScoringState
  onHit:       (noteId: string) => void
  onMiss:      (noteId: string) => void
  onWrongAt:   (now: number, activeNote: MidiNote | null) => void
  reset:       () => void
}

export function useScoring(): UseScoring {
  const [state, setState] = useState<ScoringState>(INITIAL)

  // Dedup so the same note can't be scored twice (the playhead and the input
  // hook both call us in edge cases; the ref is the single source of truth).
  const countedHit  = useRef<Set<string>>(new Set())
  const countedMiss = useRef<Set<string>>(new Set())

  const onHit = useCallback((noteId: string) => {
    if (countedHit.current.has(noteId)) return
    countedHit.current.add(noteId)
    countedMiss.current.delete(noteId)   // a late hit cancels an earlier miss flag
    setState((prev) => {
      const combo = prev.combo + 1
      // Combo bonus kicks in once we cross the threshold — i.e. the 6th note
      // in a row earns +2, not +1.  Threshold itself still earns the base +1.
      const isComboHit = combo > COMBO_THRESHOLD
      const gained     = isComboHit ? COMBO_BONUS : HIT_POINTS
      return {
        ...prev,
        score:      prev.score + gained,
        success:    prev.success + 1,
        combo,
        combosHits: prev.combosHits + (isComboHit ? 1 : 0),
        maxCombo:   Math.max(prev.maxCombo, combo),
      }
    })
  }, [])

  const onMiss = useCallback((noteId: string) => {
    if (countedMiss.current.has(noteId)) return
    if (countedHit.current.has(noteId))  return
    countedMiss.current.add(noteId)
    setState((prev) => ({
      ...prev,
      missed: prev.missed + 1,
      combo:  0,   // miss breaks the streak
    }))
  }, [])

  const onWrongAt = useCallback((now: number, activeNote: MidiNote | null) => {
    // Penalty scales from 1 (note just started) down to 0 (note about to end).
    // No active note in the timing window → 0 penalty (random keystroke).
    let penalty = 0
    if (activeNote) {
      const elapsed = Math.max(0, now - activeNote.time)
      const frac    = activeNote.duration > 0
        ? Math.min(1, elapsed / activeNote.duration) : 1
      penalty = WRONG_MAX * (1 - frac)
    }

    // A wrong press on an active note ALSO marks that note as missed and
    // breaks the combo.  Wait-mode keeps the playhead pinned at the hit
    // line until the player gets it right, so the visual "scroll past →
    // miss" path basically never fires in practice mode — without this
    // bookkeeping the missed counter would stay at 0 even when the player
    // is hammering wrong keys.
    //
    // Dedup so a flurry of wrong presses on the same note still counts
    // as one miss.  If the player eventually plays the correct key, the
    // hit still scores (+1) but the miss stays on the record — the user
    // was wrong at some point during that note.
    const flaggedMiss =
      !!activeNote &&
      !countedHit.current.has(activeNote.id) &&
      !countedMiss.current.has(activeNote.id)
    if (flaggedMiss) countedMiss.current.add(activeNote!.id)

    if (penalty <= 0 && !flaggedMiss) return
    setState((prev) => ({
      ...prev,
      score:  Math.max(0, prev.score - penalty),
      missed: prev.missed + (flaggedMiss ? 1 : 0),
      combo:  flaggedMiss ? 0 : prev.combo,
    }))
  }, [])

  const reset = useCallback(() => {
    countedHit.current.clear()
    countedMiss.current.clear()
    setState(INITIAL)
  }, [])

  return { state, onHit, onMiss, onWrongAt, reset }
}
