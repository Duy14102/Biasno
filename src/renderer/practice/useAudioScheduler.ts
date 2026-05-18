// ─── Audio scheduler hook ────────────────────────────────────────────────────
// Owns the setInterval that flips notes from "pending" to "scheduled" by
// pushing them into the audio engine ahead of time.  Two interesting cases:
//
//   • Mid-note resume: when the user seeks / loops INTO a note that's already
//     started, we play from a buffer offset (no re-attack) so they hear the
//     correct remaining tail.
//   • Lookahead: any note whose start falls within LOOKAHEAD_REAL_MS of "now"
//     gets pre-scheduled in Web Audio time, which is what makes the playback
//     survive the main thread blocking briefly (e.g. during OSMD render).
//
// The hook also returns the scheduleAudio callback so play() can kick a
// scheduling pass immediately on transport changes, avoiding the up-to-25 ms
// wait for the next interval tick.

import { useCallback, useEffect, useRef } from 'react'
import type { MidiNote, MidiFileData } from '../types'
import { audioEngine } from '../audio/AudioEngine'
import { LOOKAHEAD_REAL_MS } from './constants'
import type { NoteState } from './noteState'

interface Args {
  midiFile:        MidiFileData | null
  isViewMode:      boolean
  isPlayingRef:    React.MutableRefObject<boolean>
  currentTimeRef:  React.MutableRefObject<number>
  bpmMultRef:      React.MutableRefObject<number>
  visibleNotesRef: React.MutableRefObject<MidiNote[]>
  noteStatesRef:   React.MutableRefObject<Map<string, NoteState>>
  setNoteStates:   React.Dispatch<React.SetStateAction<Map<string, NoteState>>>
}

export function useAudioScheduler({
  midiFile, isViewMode, isPlayingRef, currentTimeRef, bpmMultRef,
  visibleNotesRef, noteStatesRef, setNoteStates,
}: Args): { scheduleAudio: () => void } {
  const timerRef = useRef(0)

  const scheduleAudio = useCallback(() => {
    if (!isPlayingRef.current || !midiFile || !isViewMode) return

    const now            = currentTimeRef.current
    const bpm            = bpmMultRef.current
    const lookaheadSongS = (LOOKAHEAD_REAL_MS / 1000) * bpm
    const toneNow        = audioEngine.currentTime

    // Work on a SINGLE copy of the state map for this scheduler run.  Update
    // it synchronously as we schedule notes, then flush to React once.  This
    // prevents double-scheduling when the RAF and the 25 ms interval both
    // fire before the async setNoteStates updater has committed to the ref.
    let stateChanged = false
    const next = new Map(noteStatesRef.current)

    visibleNotesRef.current.forEach((note) => {
      const ns = next.get(note.id)
      if (!ns || ns.scheduled) return

      const delaySong     = note.time - now
      const remainingSong = delaySong + note.duration

      // Fully missed: note start is too far in the past AND the note has
      // already fully ended.  The remainingSong guard is required so a seek
      // that lands mid-sustain (note started > 150 ms before t but is still
      // ringing) doesn't get marked 'missed' here before the mid-note resume
      // branch below can play its remaining tail.
      if (delaySong < -0.15 && remainingSong < 0.05 && ns.visual === 'pending') {
        next.set(note.id, { ...ns, scheduled: true, visual: 'missed' })
        stateChanged = true
        return
      }

      // Mid-note resume: play remaining portion from a buffer offset (no re-attack).
      if (delaySong < 0 && remainingSong > 0.05) {
        const elapsedReal   = (-delaySong) / bpm
        const remainingReal = remainingSong / bpm
        audioEngine.noteAtTimeWithOffset(note.midi, toneNow + 0.005, elapsedReal, remainingReal, note.velocity)
        next.set(note.id, { ...ns, scheduled: true })
        stateChanged = true
        return
      }

      if (delaySong < 0 || delaySong > lookaheadSongS + 2.0) return

      // Upcoming note within lookahead window — schedule normally.
      if (delaySong <= lookaheadSongS) {
        const startTime = toneNow + delaySong / bpm
        const scaledDur = note.duration / bpm
        next.set(note.id, { ...ns, scheduled: true })
        stateChanged = true
        audioEngine.noteAtTime(note.midi, startTime, scaledDur, note.velocity)
      }
    })

    if (stateChanged) {
      noteStatesRef.current = next   // sync — prevents double-schedule on next call
      setNoteStates(next)            // async — drives visual rendering
    }
  }, [midiFile, isViewMode, isPlayingRef, currentTimeRef, bpmMultRef, visibleNotesRef, noteStatesRef, setNoteStates])

  useEffect(() => {
    timerRef.current = window.setInterval(scheduleAudio, 25)
    return () => clearInterval(timerRef.current)
  }, [scheduleAudio])

  return { scheduleAudio }
}
