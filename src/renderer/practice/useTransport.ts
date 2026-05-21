// ─── Transport controls hook ────────────────────────────────────────────────
// All the playback verbs: play, pause, stop, seek, plus the four transport
// buttons in the header (play/pause, restart, rewind, fast-forward).
//
// Why the hook owns them: every action touches a tangle of refs (currentTime,
// scheduled flags, hold/press sets, active keys, etc.) AND needs to interact
// with the audio engine in a specific order.  Keeping them together makes
// the contract obvious — `seek(t)` does the same cleanup whether called from
// the rewind button, the progress bar drag, or the loop-wrap path.

import { useCallback } from 'react'
import type { MidiFileData, LoopRegion, Hand } from '../types'
import { audioEngine } from '../audio/AudioEngine'
import { REWIND_AMOUNT } from './constants'
import type { NoteState } from './noteState'

interface Args {
  midiFile:        MidiFileData | null
  isViewMode:      boolean
  leadIn:          number

  isPlayingRef:    React.MutableRefObject<boolean>
  currentTimeRef:  React.MutableRefObject<number>
  lastRAFTime:     React.MutableRefObject<number>
  loopEnabledRef:  React.MutableRefObject<boolean>
  loopRegionRef:   React.MutableRefObject<LoopRegion | null>
  pressedMidi:     React.MutableRefObject<Set<number>>
  holdingRef:      React.MutableRefObject<Map<string, number>>
  viewActiveRef:   React.MutableRefObject<string>
  noteStatesRef:   React.MutableRefObject<Map<string, NoteState>>

  setIsPlaying:    React.Dispatch<React.SetStateAction<boolean>>
  setCurrentTime:  React.Dispatch<React.SetStateAction<number>>
  setNoteStates:   React.Dispatch<React.SetStateAction<Map<string, NoteState>>>
  setActiveKeys:   React.Dispatch<React.SetStateAction<
    Map<number, { hand: Hand; hitState?: 'correct' | 'wrong'; time?: number }>
  >>

  scheduleAudio:   () => void
}

export interface Transport {
  /** Seek to an arbitrary song time.  Negative input ≤ 0 → reset to -leadIn
   *  (treated as "restart from top" with the ready-pause runway).  Other
   *  positive values land exactly where pointed. */
  seek:             (time: number) => void
  play:             () => void
  pause:            () => void
  stop:             () => void
  handlePlayPause:  () => void
  handleRestart:    () => void
  handleRewind:     () => void
  handleFastForward: () => void
}

export function useTransport({
  midiFile, isViewMode, leadIn,
  isPlayingRef, currentTimeRef, lastRAFTime,
  loopEnabledRef, loopRegionRef,
  pressedMidi, holdingRef, viewActiveRef, noteStatesRef,
  setIsPlaying, setCurrentTime, setNoteStates, setActiveKeys,
  scheduleAudio,
}: Args): Transport {

  // ─── Seek ─────────────────────────────────────────────────────────────────
  const seek = useCallback((time: number) => {
    const dur = midiFile?.duration ?? 0
    // Seeking to the start is treated as "restart from top" — the user gets
    // the same leadIn ready pause as initial play.  Covers progress drag to
    // the leftmost pixel, rewind clamping a negative target to 0, and our
    // own restart path passing -leadIn directly.
    const t = time <= 0 ? -leadIn : Math.min(dur, time)
    currentTimeRef.current = t
    setCurrentTime(t)
    lastRAFTime.current   = 0
    viewActiveRef.current = ''
    holdingRef.current.clear()

    // View-listen: stop pre-scheduled audio so it restarts from the new position.
    if (isPlayingRef.current && isViewMode) {
      audioEngine.stopAll()
      audioEngine.restoreVolume()
    }

    // Update the noteStates ref SYNCHRONOUSLY before scheduleAudio fires.
    //
    // Three buckets:
    //   • Future       (note.time >= t)              — reset to 'pending'
    //   • Mid-sustain  (started before t, still on)  — also reset to 'pending'
    //                  so the scheduler can resume audio from an offset AND
    //                  FallingNotes keeps drawing the bar.  Marking these
    //                  'hit' (the old behaviour) hid the falling bar while
    //                  the playhead's activeKeys still lit the key from raw
    //                  note.time/duration — visible mismatch on every seek.
    //   • Fully past   (ended before t)              — mark 'hit', scheduled.
    const next = new Map(noteStatesRef.current)
    next.forEach((ns, id) => {
      const noteEnd = ns.note.time + ns.note.duration
      if (ns.note.time >= t - 0.01 || noteEnd > t + 0.05) {
        next.set(id, { ...ns, scheduled: false, visual: 'pending', flashAlpha: 0 })
      } else {
        next.set(id, { ...ns, scheduled: true,  visual: 'hit',     flashAlpha: 0 })
      }
    })
    noteStatesRef.current = next
    setNoteStates(next)
    setActiveKeys(new Map())

    // Kick off scheduling immediately — don't wait for the 25 ms interval tick.
    if (isPlayingRef.current) requestAnimationFrame(() => scheduleAudio())
  }, [
    midiFile, isViewMode, leadIn,
    isPlayingRef, currentTimeRef, lastRAFTime, viewActiveRef, holdingRef, noteStatesRef,
    setCurrentTime, setNoteStates, setActiveKeys, scheduleAudio,
  ])

  // ─── Play / pause / stop ──────────────────────────────────────────────────
  const play = useCallback(() => {
    audioEngine.restoreVolume()
    setIsPlaying(true)
    isPlayingRef.current = true
    // Trigger scheduling immediately so mid-notes resume with < 5 ms gap
    // (instead of waiting up to 25 ms for the next interval tick).
    requestAnimationFrame(() => scheduleAudio())
  }, [setIsPlaying, isPlayingRef, scheduleAudio])

  const pause = useCallback(() => {
    audioEngine.stopAll()
    setIsPlaying(false)
    isPlayingRef.current = false
    lastRAFTime.current = 0
    pressedMidi.current.clear()
    holdingRef.current.clear()
    // Reset the scheduled flag on any unfinished notes, sync the ref so the
    // next play() sees fresh state without waiting for React's commit.
    const t = currentTimeRef.current
    setNoteStates((prev) => {
      const next = new Map(prev)
      let changed = false
      next.forEach((ns, id) => {
        if (ns.scheduled && (ns.note.time + ns.note.duration) > t) {
          next.set(id, { ...ns, scheduled: false, visual: ns.visual === 'playing' ? 'active' : ns.visual })
          changed = true
        }
      })
      if (changed) noteStatesRef.current = next
      return changed ? next : prev
    })
  }, [setIsPlaying, isPlayingRef, lastRAFTime, pressedMidi, holdingRef, currentTimeRef, noteStatesRef, setNoteStates])

  const stop = useCallback(() => { pause(); seek(0) }, [pause, seek])

  // ─── Header transport buttons ─────────────────────────────────────────────
  const handlePlayPause = useCallback(() => {
    if (isPlayingRef.current) pause(); else play()
  }, [isPlayingRef, play, pause])

  /** Restart from the leadIn runway, not raw 0 — same "ready" pause as a
   *  natural loop wrap. */
  const handleRestart = useCallback(() => {
    pause()
    seek(-leadIn)
    play()
  }, [pause, seek, play, leadIn])

  const handleRewind = useCallback(() => {
    const dur = midiFile?.duration ?? 0
    const [lo, hi] = loopEnabledRef.current && loopRegionRef.current
      ? [loopRegionRef.current.start * dur, loopRegionRef.current.end * dur]
      : [0, dur]
    seek(Math.min(hi, Math.max(lo, currentTimeRef.current - REWIND_AMOUNT)))
  }, [seek, midiFile, loopEnabledRef, loopRegionRef, currentTimeRef])

  const handleFastForward = useCallback(() => {
    const dur = midiFile?.duration ?? 0
    const [lo, hi] = loopEnabledRef.current && loopRegionRef.current
      ? [loopRegionRef.current.start * dur, loopRegionRef.current.end * dur]
      : [0, dur]
    seek(Math.min(hi, Math.max(lo, currentTimeRef.current + REWIND_AMOUNT)))
  }, [seek, midiFile, loopEnabledRef, loopRegionRef, currentTimeRef])

  return { seek, play, pause, stop, handlePlayPause, handleRestart, handleRewind, handleFastForward }
}
