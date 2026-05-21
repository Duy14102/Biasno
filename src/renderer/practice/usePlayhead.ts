// ─── Playhead RAF loop ───────────────────────────────────────────────────────
// Runs once per animation frame while playing.  Responsibilities:
//   • advance currentTime by the elapsed real-time delta × BPM multiplier
//   • freeze that advance during "wait mode" (practice modes pause at the
//     hit line when a blocking active note is on screen)
//   • honour the user-defined loop region (wrap to start when end is hit)
//   • detect end-of-song and wrap to -leadIn for the seamless next cycle
//   • derive note visual states (pending → active → missed) from current time
//   • derive activeKeys in view-listen mode (a per-frame snapshot of which
//     MIDI numbers are currently sounding)
//   • auto-confirm held notes when they reach 95 % of their duration
//
// Everything is driven from refs, not state, so the hook itself never causes
// a re-render — React state changes only happen via the setters we receive
// (and even then, the updaters are diffed to no-op when nothing changed).

import { useCallback, useEffect, useRef } from 'react'
import type { MidiNote, MidiFileData, LoopRegion, Hand } from '@/types'
import { audioEngine } from '@/audio'
import { LOOP_RESET_AFTER, FLASH_ANTICIPATE_S } from './constants'
import type { NoteState } from './noteState'

interface Args {
  midiFile:        MidiFileData | null
  isViewMode:      boolean
  leadIn:          number

  // Mutable refs — read every frame, written when state diverges.
  isPlayingRef:    React.MutableRefObject<boolean>
  currentTimeRef:  React.MutableRefObject<number>
  bpmMultRef:      React.MutableRefObject<number>
  lastRAFTime:     React.MutableRefObject<number>
  loopEnabledRef:  React.MutableRefObject<boolean>
  loopRegionRef:   React.MutableRefObject<LoopRegion | null>
  viewActiveRef:   React.MutableRefObject<string>
  pressedMidi:     React.MutableRefObject<Set<number>>
  holdingRef:      React.MutableRefObject<Map<string, number>>
  visibleNotesRef: React.MutableRefObject<MidiNote[]>
  noteStatesRef:   React.MutableRefObject<Map<string, NoteState>>

  // Setters that mutate React state.
  setCurrentTime:  React.Dispatch<React.SetStateAction<number>>
  setNoteStates:   React.Dispatch<React.SetStateAction<Map<string, NoteState>>>
  setActiveKeys:   React.Dispatch<React.SetStateAction<
    Map<number, { hand: Hand; hitState?: 'correct' | 'wrong'; time?: number }>
  >>

  triggerFlash:    (noteId: string, state: 'hit' | 'missed') => void

  // Scoring hooks. onMissed fires once when a note transitions to 'missed'
  // (active → missed after 0.5 s past its end without confirmation).
  // onSongEnd fires once at end-of-song in practice mode without active loop;
  // the engine then expects the page to pause playback and surface results.
  // onLoopWrap fires every time the loop region wraps back to start — the
  // page uses it to checkpoint the score for that iteration and reset the
  // live counter for the next pass.  Playback continues uninterrupted.
  onMissed?:       (noteId: string) => void
  onSongEnd?:      () => void
  onLoopWrap?:     () => void
}

export function usePlayhead({
  midiFile, isViewMode, leadIn,
  isPlayingRef, currentTimeRef, bpmMultRef, lastRAFTime,
  loopEnabledRef, loopRegionRef, viewActiveRef, pressedMidi, holdingRef,
  visibleNotesRef, noteStatesRef,
  setCurrentTime, setNoteStates, setActiveKeys,
  triggerFlash, onMissed, onSongEnd, onLoopWrap,
}: Args): void {
  const rafId = useRef(0)

  const raf = useCallback((timestamp: number) => {
    if (midiFile && isPlayingRef.current) {
      const delta = lastRAFTime.current > 0
        ? (timestamp - lastRAFTime.current) / 1000 : 0
      lastRAFTime.current = timestamp

      // Wait mode: freeze time when any VISIBLE note is blocking at the hit line.
      const visibleIds = new Set(visibleNotesRef.current.map(n => n.id))
      const hasBlockingNote = !isViewMode &&
        Array.from(noteStatesRef.current.values())
          .some(ns => ns.visual === 'active' && visibleIds.has(ns.note.id))

      if (!hasBlockingNote) {
        currentTimeRef.current += delta * bpmMultRef.current
      }

      // User-defined loop region.
      if (loopEnabledRef.current && loopRegionRef.current) {
        const loopEnd   = loopRegionRef.current.end   * midiFile.duration
        const loopStart = loopRegionRef.current.start * midiFile.duration
        if (currentTimeRef.current >= loopEnd) {
          // Fire BEFORE the rest of the wrap so the page can snapshot the
          // score that belongs to the iteration we just finished.  The
          // counter then resets and the next pass starts at 0.
          onLoopWrap?.()
          currentTimeRef.current = loopStart
          holdingRef.current.clear()
          setNoteStates((prev) => {
            const next = new Map(prev)
            next.forEach((ns, id) => {
              const noteEnd = ns.note.time + ns.note.duration
              // Mid-sustain notes that bridge loopStart are reset to 'pending'
              // (same reasoning as useTransport.seek) so they're re-scheduled
              // from offset and stay visible in FallingNotes.
              if (ns.note.time >= loopStart - 0.01 || noteEnd > loopStart + 0.05)
                next.set(id, { ...ns, scheduled: false, visual: 'pending', flashAlpha: 0 })
              else
                next.set(id, { ...ns, scheduled: true,  visual: 'hit',     flashAlpha: 0 })
            })
            noteStatesRef.current = next
            return next
          })
        }
      }

      // End of song reached.  Fire onSongEnd (if wired) BEFORE the wrap so
      // the page can snapshot the playthrough's score — then continue with
      // the seamless wrap to -leadIn.  We never pause here anymore: the user
      // keeps playing, and the score quietly lands in the leaderboard like
      // each loop iteration does.
      if (currentTimeRef.current >= midiFile.duration + LOOP_RESET_AFTER) {
        const looping = loopEnabledRef.current && loopRegionRef.current !== null
        if (onSongEnd && !isViewMode && !looping) onSongEnd()
        const newTime = -leadIn
        currentTimeRef.current = newTime
        lastRAFTime.current = 0
        viewActiveRef.current = ''
        pressedMidi.current.clear()
        holdingRef.current.clear()
        setActiveKeys(new Map())
        // Reset EVERY note to pending so the new cycle re-schedules from the
        // top.  The old cycle's pre-scheduled audio is queued in Tone.js and
        // decays naturally; the scheduler's range filters keep us from re-
        // attacking far-future notes.  Flattening everything is the only
        // reliable way to get the near-time-0 notes to play again.
        setNoteStates((prev) => {
          const next = new Map(prev)
          next.forEach((ns, id) => {
            next.set(id, { ...ns, scheduled: false, visual: 'pending', flashAlpha: 0 })
          })
          noteStatesRef.current = next
          return next
        })
        audioEngine.restoreVolume()
        rafId.current = requestAnimationFrame(raf)
        return
      }

      setCurrentTime(currentTimeRef.current)

      // Confirm held notes that reached their end while still pressed.
      if (!isViewMode && holdingRef.current.size > 0) {
        const t = currentTimeRef.current
        holdingRef.current.forEach((_, noteId) => {
          const ns = noteStatesRef.current.get(noteId)
          if (!ns) { holdingRef.current.delete(noteId); return }
          const tolerance = Math.max(0.03, ns.note.duration * 0.05)
          if (t >= ns.note.time + ns.note.duration - tolerance) {
            holdingRef.current.delete(noteId)
            triggerFlash(noteId, 'hit')
          }
        })
      }

      // Update note visual states (visible notes only).
      const now = currentTimeRef.current
      const vIds = new Set(visibleNotesRef.current.map(n => n.id))
      setNoteStates((prev) => {
        let changed = false
        const next = new Map(prev)
        next.forEach((ns, id) => {
          if (!vIds.has(id)) return
          const d = ns.note.time - now
          // View-listen: broad activation window.  Practice: trigger right at hit line.
          const trigger = isViewMode ? (d >= -0.08 && d <= 0.08) : (d <= 0.03 && d >= -2.0)
          if (ns.visual === 'pending' && trigger) {
            next.set(id, { ...ns, visual: 'active' }); changed = true
          } else if (!isViewMode && ns.visual === 'active' && now > ns.note.time + ns.note.duration + 0.5) {
            // Note end passed by 0.5 s without confirmation — mark as missed.
            next.set(id, { ...ns, visual: 'missed' }); changed = true
            onMissed?.(id)
          }
        })
        return changed ? next : prev
      })

      // View-listen: derive active keys from current song time.  Notes are
      // included up to FLASH_ANTICIPATE_S BEFORE their onset so the key-flash
      // animation has time to build to its peak by the time the falling note
      // visually touches the keyboard — see PianoKeyboard's flash keyframes,
      // which rise from 0 to peak over the same window.
      if (isViewMode) {
        const notes = visibleNotesRef.current
        const activeMap = new Map<number, { hand: Hand; time: number }>()
        for (const note of notes) {
          if (note.time <= now + FLASH_ANTICIPATE_S && note.time + note.duration > now) {
            const existing = activeMap.get(note.midi)
            if (!existing || note.time > existing.time) {
              activeMap.set(note.midi, { hand: note.hand, time: note.time })
            }
          }
        }
        // Key includes note.time so same-pitch repeats (E4 → E4) still trigger
        // a state update even though the MIDI number is unchanged.
        const key = [...activeMap.entries()]
          .map(([m, v]) => `${m}@${Math.round(v.time * 1000)}`)
          .sort().join(',')
        if (key !== viewActiveRef.current) {
          viewActiveRef.current = key
          setActiveKeys(activeMap)
        }
      }
    } else {
      lastRAFTime.current = 0
    }
    rafId.current = requestAnimationFrame(raf)
  }, [
    midiFile, isViewMode, leadIn, triggerFlash,
    isPlayingRef, currentTimeRef, bpmMultRef, lastRAFTime,
    loopEnabledRef, loopRegionRef, viewActiveRef, pressedMidi, holdingRef,
    visibleNotesRef, noteStatesRef,
    setCurrentTime, setNoteStates, setActiveKeys,
    onMissed, onSongEnd, onLoopWrap,
  ])

  useEffect(() => {
    rafId.current = requestAnimationFrame(raf)
    return () => cancelAnimationFrame(rafId.current)
  }, [raf])
}
