// ─── Practice-mode player input hook ─────────────────────────────────────────
// Wires three input sources (MIDI device, computer keyboard, on-screen
// PianoKeyboard clicks) into a single handleNoteInput callback, then maps
// each press to either a "correct" / "wrong" hit against the currently
// active notes.  View-listen mode short-circuits the whole thing — playback
// is automatic, no user input is accepted.
//
// Hold semantics: long notes must be held until ~95 % of their duration to
// count.  Releasing early reverts the note's visual state to 'active' so
// the player can re-attempt.
import { useCallback, useEffect } from 'react'
import type { Hand } from '@/types'
import { audioEngine } from '@/audio'
import { useMidi } from '@/context'
import type { NoteState } from './noteState'
import { TIMING_WINDOW_MS } from './constants'

interface Args {
  isViewMode:    boolean
  needsMelody:   boolean
  isPlayingRef:  React.MutableRefObject<boolean>
  currentTimeRef: React.MutableRefObject<number>
  noteStatesRef: React.MutableRefObject<Map<string, NoteState>>
  holdingRef:    React.MutableRefObject<Map<string, number>>
  setActiveKeys: React.Dispatch<React.SetStateAction<
    Map<number, { hand: Hand; hitState?: 'correct' | 'wrong'; time?: number }>
  >>
  setNoteStates: React.Dispatch<React.SetStateAction<Map<string, NoteState>>>
  setIsPlaying:  React.Dispatch<React.SetStateAction<boolean>>
  triggerFlash:  (noteId: string, state: 'hit' | 'missed') => void
  // Fires on every key-down (correct or wrong). Used to drive the idle-hint
  // timer at the page level — any press dismisses the hint and resets the clock.
  onInput?:      () => void
  // Scoring hook. onWrongPress fires on a non-matching key; the closest
  // active note (if any) is passed so the page can scale the penalty by
  // how deep into that note the player struck.  Correct hits are awarded
  // from the confirmed-hit path (useFlashTimer 'hit'), not on press, so a
  // press-then-early-release doesn't earn points.
  onWrongPress?: (now: number, activeNote: import('../types').MidiNote | null) => void
}

export function usePracticeInput({
  isViewMode, needsMelody,
  isPlayingRef, currentTimeRef, noteStatesRef, holdingRef,
  setActiveKeys, setNoteStates, setIsPlaying, triggerFlash,
  onInput, onWrongPress,
}: Args): { handleNoteInput: (midi: number, velocity: number, on: boolean) => void } {
  const handleNoteInput = useCallback((midi: number, velocity: number, on: boolean) => {
    if (isViewMode) return   // view-listen blocks all input

    if (on) {
      onInput?.()
      const now = currentTimeRef.current
      let bestMatch: NoteState | null = null
      let bestDelta = Infinity

      noteStatesRef.current.forEach((ns) => {
        if (ns.visual !== 'active' && ns.visual !== 'holding') return
        if (needsMelody && ns.note.midi !== midi) return
        const dMs = Math.abs(ns.note.time - now) * 1000
        // Accept within timing window at note START, OR anywhere within the
        // note's duration (re-press after early release lands inside duration).
        const withinDuration = now >= ns.note.time - 0.1 && now < ns.note.time + ns.note.duration
        if ((dMs < TIMING_WINDOW_MS || withinDuration) && dMs < bestDelta) {
          bestDelta = dMs
          bestMatch = ns
        }
      })

      // Unique-per-press timestamp.  PianoKeyboard uses it as a React `key` on
      // its flash overlay so the animation replays on every press — even when
      // two state updates batch into a single render and the overlay would
      // otherwise stay mounted.
      const pressTime = performance.now() / 1000

      if (bestMatch) {
        const m = bestMatch as NoteState
        audioEngine.noteOn(midi, velocity)
        setActiveKeys((prev) => {
          const next = new Map(prev)
          next.set(midi, { hand: m.note.hand, hitState: 'correct', time: pressTime })
          return next
        })
        // All notes require holding until end — show 'holding' (green) while
        // pressed, only transition to confirmed 'hit' on release at/after 95 %.
        holdingRef.current.set(m.note.id, midi)
        const next = new Map(noteStatesRef.current)
        next.set(m.note.id, { ...m, visual: 'holding', flashAlpha: 0 })
        noteStatesRef.current = next
        setNoteStates(next)
      } else {
        // Wrong key — quiet velocity so global volume isn't shouted at.
        audioEngine.noteOn(midi, velocity * 0.25)
        setActiveKeys((prev) => {
          const next = new Map(prev)
          next.set(midi, { hand: 'unknown', hitState: 'wrong', time: pressTime })
          return next
        })
        // Find the nearest active/holding note (regardless of pitch) to scale
        // the penalty.  No active note in flight → onWrongPress gets null and
        // the scoring layer treats it as a 0-cost stray press.
        let nearest: NoteState | null = null
        let bestD = Infinity
        noteStatesRef.current.forEach((ns) => {
          if (ns.visual !== 'active' && ns.visual !== 'holding') return
          const d = Math.abs(ns.note.time - now)
          if (d < bestD) { bestD = d; nearest = ns }
        })
        onWrongPress?.(now, nearest ? (nearest as NoteState).note : null)
      }
    } else {
      audioEngine.noteOff(midi)
      setActiveKeys((prev) => {
        const next = new Map(prev)
        next.delete(midi)
        return next
      })

      // Releasing a long note we were holding?
      holdingRef.current.forEach((heldMidi, noteId) => {
        if (heldMidi !== midi) return
        holdingRef.current.delete(noteId)
        const ns = noteStatesRef.current.get(noteId)
        if (!ns) return
        const noteEnd   = ns.note.time + ns.note.duration
        const t         = currentTimeRef.current
        const tolerance = Math.max(0.03, ns.note.duration * 0.05)
        if (t < noteEnd - tolerance) {
          // Released too early (< 95 % of note) → revert to active for retry.
          const next = new Map(noteStatesRef.current)
          next.set(noteId, { ...ns, visual: 'active', flashAlpha: 0, scheduled: false })
          noteStatesRef.current = next
          setNoteStates(next)
        } else {
          triggerFlash(noteId, 'hit')
        }
      })
    }
  }, [isViewMode, needsMelody, currentTimeRef, noteStatesRef, holdingRef, setActiveKeys, setNoteStates, triggerFlash, onInput, onWrongPress])

  // ─── MIDI device input ────────────────────────────────────────────────────
  // Subscribe to the shared MIDI connection from MidiContext. The connection
  // itself is owned at App level, so hot-plugging a piano mid-session is
  // transparent here — auto-connect attaches the new device to the dispatcher
  // and our subscriber keeps receiving notes without re-mounting.
  const { subscribe } = useMidi()
  useEffect(() => subscribe(handleNoteInput), [subscribe, handleNoteInput])

  // ─── Computer keyboard → piano (C3 = Z, F4 = Q, A5 = P) ──────────────────
  // Two stacked octaves so the computer-keyboard fallback covers a useful
  // chunk of the 88-note range when no MIDI piano is available:
  //   • Lower octave (Z-row whites + A-row blacks)  → C3 D3 E3 … E4
  //   • Upper octave (Q-row whites + number blacks) → F4 G4 A4 … A5
  // The two halves are contiguous (E4 → F4), so playing across both rows is
  // a single uninterrupted run from C3 (MIDI 48) to A5 (MIDI 81).
  useEffect(() => {
    const KEY_MAP: Record<string, number> = {
      // Lower octave
      'z': 48, 's': 49, 'x': 50, 'd': 51, 'c': 52,
      'v': 53, 'g': 54, 'b': 55, 'h': 56, 'n': 57,
      'j': 58, 'm': 59, ',': 60, 'l': 61, '.': 62,
      ';': 63, '/': 64,
      // Upper octave
      'q': 65, '2': 66, 'w': 67, '3': 68, 'e': 69,
      '4': 70, 'r': 71, 't': 72, '6': 73, 'y': 74,
      '7': 75, 'u': 76, 'i': 77, '9': 78, 'o': 79,
      '0': 80, 'p': 81,
    }
    const pressed = new Set<string>()
    const onDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return
      const midi = KEY_MAP[e.key.toLowerCase()]
      if (midi !== undefined && !pressed.has(e.key)) {
        pressed.add(e.key)
        handleNoteInput(midi, 0.8, true)
      }
      if (e.key === ' ') {
        e.preventDefault()
        setIsPlaying((p) => { isPlayingRef.current = !p; return !p })
      }
    }
    const onUp = (e: KeyboardEvent) => {
      const midi = KEY_MAP[e.key.toLowerCase()]
      if (midi !== undefined) {
        pressed.delete(e.key)
        handleNoteInput(midi, 0, false)
      }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup',   onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup',   onUp)
    }
  }, [handleNoteInput, isPlayingRef, setIsPlaying])

  return { handleNoteInput }
}
