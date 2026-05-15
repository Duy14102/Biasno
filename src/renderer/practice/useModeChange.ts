// ─── Mode-switch handler ────────────────────────────────────────────────────
// Encapsulates everything that has to happen when the user picks a different
// practice mode from the header dropdown:
//
//   1. Stop all audio + reset transport refs (no carry-over from old mode).
//   2. Seek back to the start of the most recent note still sounding (cap
//      3 s) so the user has something to grab in the new mode.
//   3. Rebuild noteStates relative to that seek target.
//   4. Commit setMode(newMode).
//   5. Restore the per-(song, newMode) UI toggles from modePrefs (or default).
//   6. Trigger the dim + label-flash animation.
//   7. Resume playback if we were playing.

import { useState, useCallback } from 'react'
import type { Hand, MidiFileData, PracticeMode } from '../types'
import { audioEngine } from '../audio/AudioEngine'
import { modePrefsKey, type ModePrefs } from '../context/AppContext'
import type { NoteState } from './noteState'

interface Args {
  mode:           PracticeMode
  setMode:        React.Dispatch<React.SetStateAction<PracticeMode>>
  midiFile:       MidiFileData | null
  modePrefs:      Partial<Record<string, ModePrefs>>
  isPlayingRef:   React.MutableRefObject<boolean>
  currentTimeRef: React.MutableRefObject<number>
  lastRAFTime:    React.MutableRefObject<number>
  pressedMidi:    React.MutableRefObject<Set<number>>
  holdingRef:     React.MutableRefObject<Map<string, number>>
  noteStatesRef:  React.MutableRefObject<Map<string, NoteState>>

  setIsPlaying:        React.Dispatch<React.SetStateAction<boolean>>
  setCurrentTime:      React.Dispatch<React.SetStateAction<number>>
  setNoteStates:       React.Dispatch<React.SetStateAction<Map<string, NoteState>>>
  setActiveKeys:       React.Dispatch<React.SetStateAction<
    Map<number, { hand: Hand; hitState?: 'correct' | 'wrong'; time?: number }>
  >>
  setShowSheetMusic:   React.Dispatch<React.SetStateAction<boolean>>
  setShowFallingNotes: React.Dispatch<React.SetStateAction<boolean>>

  scheduleAudio:  () => void
}

export function useModeChange({
  mode, setMode, midiFile, modePrefs,
  isPlayingRef, currentTimeRef, lastRAFTime, pressedMidi, holdingRef, noteStatesRef,
  setIsPlaying, setCurrentTime, setNoteStates, setActiveKeys,
  setShowSheetMusic, setShowFallingNotes,
  scheduleAudio,
}: Args): {
  modeTransitioning: boolean
  modeFlash:         PracticeMode | null
  handleModeChange:  (newMode: PracticeMode) => void
} {
  const [modeTransitioning, setModeTransitioning] = useState(false)
  const [modeFlash,         setModeFlash]         = useState<PracticeMode | null>(null)

  const handleModeChange = useCallback((newMode: PracticeMode) => {
    if (newMode === mode) return
    const wasPlaying = isPlayingRef.current

    audioEngine.stopAll()
    isPlayingRef.current = false
    lastRAFTime.current  = 0
    pressedMidi.current.clear()
    holdingRef.current.clear()

    // Seek back to the start of the most recent note still playing (cap 3 s),
    // so the user has something to grab in the new practice mode.
    const t = currentTimeRef.current
    let seekTarget = t
    if (midiFile) {
      let latestStart = -Infinity
      for (const n of midiFile.notes) {
        if (n.time < t - 0.01 && n.time + n.duration > t && n.time > latestStart && n.time >= t - 3.0) {
          latestStart = n.time
        }
      }
      if (latestStart > -Infinity) seekTarget = latestStart
    }
    currentTimeRef.current = seekTarget
    setCurrentTime(seekTarget)

    // Rebuild noteStates relative to the new playhead.
    const next = new Map<string, NoteState>()
    midiFile?.notes.forEach((n) => {
      if (n.time >= seekTarget - 0.01)
        next.set(n.id, { note: n, visual: 'pending', flashAlpha: 0, scheduled: false })
      else
        next.set(n.id, { note: n, visual: 'hit',     flashAlpha: 0, scheduled: true  })
    })
    noteStatesRef.current = next
    setNoteStates(next)
    setActiveKeys(new Map())

    setMode(newMode)

    // Restore toggle state for this (song, newMode) pair; else defaults.
    const np = midiFile ? modePrefs[modePrefsKey(midiFile.name, newMode)] : undefined
    setShowSheetMusic(np?.showSheetMusic   ?? false)
    setShowFallingNotes(np?.showFallingNotes ?? true)

    // Brief dim + label flash so the change reads as intentional.
    setModeTransitioning(true)
    setModeFlash(newMode)
    setTimeout(() => setModeTransitioning(false), 260)
    setTimeout(() => setModeFlash(null), 1100)

    if (wasPlaying) {
      audioEngine.restoreVolume()
      setIsPlaying(true)
      isPlayingRef.current = true
      setTimeout(() => { if (isPlayingRef.current) requestAnimationFrame(scheduleAudio) }, 0)
    }
  }, [
    mode, setMode, midiFile, modePrefs, scheduleAudio,
    isPlayingRef, currentTimeRef, lastRAFTime, pressedMidi, holdingRef, noteStatesRef,
    setIsPlaying, setCurrentTime, setNoteStates, setActiveKeys,
    setShowSheetMusic, setShowFallingNotes,
  ])

  return { modeTransitioning, modeFlash, handleModeChange }
}
