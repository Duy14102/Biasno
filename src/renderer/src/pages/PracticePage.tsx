import React, {
  useState, useEffect, useRef, useCallback, useMemo
} from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext, modePrefsKey } from '../context/AppContext'
import { audioEngine } from '../audio/AudioEngine'
import { useAudioEngine } from '../hooks/useAudioEngine'
import { useMIDIDevice } from '../hooks/useMIDIDevice'
import PianoKeyboard from '../components/PianoKeyboard'
import FallingNotes, { type NoteRenderState } from '../components/FallingNotes'
import SheetMusic from '../components/SheetMusic'
import ProgressBar from '../components/ProgressBar'
import PracticeHeader from '../components/PracticeHeader'
import type { MidiNote, LoopRegion, Hand, NoteVisualState, PracticeMode } from '../types'
import { getActiveHands, requiresMelody, requiresRhythm } from '../utils/midiUtils'

// ─── Constants ────────────────────────────────────────────────────────────────
const TIMING_WINDOW_MS  = 220
const KEYBOARD_HEIGHT   = 200
const REWIND_AMOUNT     = 5

// Vietnamese label for the mode-switch flash overlay
const MODE_LABELS: Record<PracticeMode, string> = {
  'view-listen':           '👁️  Xem và nghe',
  'left-melody':           '🫲  Tay trái — Melody',
  'right-melody':          '🫱  Tay phải — Melody',
  'both-melody':           '🙌  Cả 2 tay — Melody',
  'left-rhythm':           '🫲  Tay trái — Rhythm',
  'right-rhythm':          '🫱  Tay phải — Rhythm',
  'both-rhythm':           '🙌  Cả 2 tay — Rhythm',
  'left-melody-rhythm':    '🫲  Tay trái — Melody + Rhythm',
  'right-melody-rhythm':   '🫱  Tay phải — Melody + Rhythm',
  'both-melody-rhythm':    '🙌  Cả 2 tay — Melody + Rhythm',
}

// View-swap animation between SheetMusic ↔ FallingNotes.
//
// Two stages, layered on top of each other:
//   • SHELL  — the outer container slides + fades (the "page" arriving)
//   • INNER  — the content (notes / staff) fades in slightly AFTER the
//              shell has finished sliding, giving a "stage curtain → reveal"
//              feel rather than a flat fade.
//
// Leave: content fades out first (~120 ms), then shell slides out to the left.
// Enter: shell slides in from the right, then content fades in once it has
//        settled (delay matches shell's fade-in mid-point).
//
// No `transform: scale(...)` on the shell — scale changes the visual size
// reported by getBoundingClientRect, which can lock the FallingNotes canvas
// at sub-full-size if the canvas was first sized mid-animation.  Pure
// translate avoids that class of bug.
const MODE_FLASH_STYLE = `
@keyframes modeFlash {
  0%   { opacity: 0; transform: translateY(8px) scale(0.92); }
  20%  { opacity: 1; transform: translateY(0)   scale(1);    }
  75%  { opacity: 1; transform: translateY(0)   scale(1);    }
  100% { opacity: 0; transform: translateY(-4px) scale(0.96); }
}

/* SHELL — the surrounding page slides + fades. */
@keyframes shellLeave {
  0%   { opacity: 1; transform: translateX(0); }
  100% { opacity: 0; transform: translateX(-7%); }
}
@keyframes shellEnter {
  0%   { opacity: 0; transform: translateX(7%); }
  100% { opacity: 1; transform: translateX(0); }
}

/* CONTENT — the notes/staff inside fade out first / fade in last.
   Intentionally NO filter blur here: a blurred filter forces the browser to
   rasterize the whole content area on every animation frame, which on slower
   GPUs caused occasional toggle stutters.  Pure opacity + translate is
   composited cheaply. */
@keyframes contentLeave {
  0%   { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-4px); }
}
@keyframes contentEnter {
  0%   { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: translateY(0); }
}

.shell-leaving  { animation: shellLeave   220ms cubic-bezier(0.4, 0, 1, 1) both; }
.shell-entering { animation: shellEnter   260ms cubic-bezier(0.16, 1, 0.3, 1) both; }

/* Inner content fade — independent timing so leave starts before the shell
   moves, and enter starts after the shell has settled. */
.content-leaving  { animation: contentLeave 140ms 0ms   cubic-bezier(0.4, 0, 1, 1) both; }
.content-entering { animation: contentEnter 320ms 140ms cubic-bezier(0.16, 1, 0.3, 1) both; }
`
// 300 ms is enough headroom for normal JS jitter; OSMD's render block is no
// longer a concern here because the sheet is pre-rendered on the home page.
const LOOKAHEAD_REAL_MS = 300
const NOTE_LOOK_AHEAD_S = 4.5   // must match FallingNotes PX_PER_SECOND / visible window
// Trigger the seamless loop the instant currentTime crosses the song end.
// Any positive offset here would mean the new cycle starts at `offset` seconds
// past time 0 — and any note whose start falls inside that offset window
// would be marked "missed" by the scheduler (delaySong < -0.15) and never
// played, so the song would loop with its first few notes silent.
const LOOP_RESET_AFTER  = 0

// "Ready" pause we ADD before the first note of the song / loop iteration
// when the MIDI doesn't already have at least this much silence at the top.
// MIDIs exported from notation software typically start at time 0 with no
// pickup, which means the first downbeat lands the instant playback begins
// — too sudden for a learner.  We compute leadIn = max(0, LEAD_IN_TARGET -
// firstNoteTime) per song, so a piece that already has, say, a 3 s intro
// gets no extra padding; one that opens dry gets ~1.25 s of breathing room.
const LEAD_IN_TARGET    = 1.25

interface NoteState {
  note: MidiNote
  visual: NoteVisualState
  flashAlpha: number
  scheduled: boolean
}

function findBestResumeTime(notes: MidiNote[], t: number): number {
  let best = 0
  for (const note of notes) {
    if (note.time <= t && note.time > best) best = note.time
  }
  return best
}

export default function PracticePage(): React.JSX.Element {
  const navigate = useNavigate()
  const { practiceSettings, resumePoints, setResumePoint, modePrefs, setModePrefs } = useAppContext()
  useAudioEngine()

  const midiFile = practiceSettings?.midiFile ?? null

  // How many seconds of silent "ready" we add at the very start of the song
  // and at every loop wrap.  Zero for songs whose first note is already at
  // least LEAD_IN_TARGET seconds in — those have their own intro and don't
  // need padding.  Notes are sorted by time inside parseMidiBuffer, so notes[0]
  // is the earliest.
  const leadIn = useMemo(() => {
    if (!midiFile || midiFile.notes.length === 0) return 0
    return Math.max(0, LEAD_IN_TARGET - midiFile.notes[0].time)
  }, [midiFile])

  // ─── ALL HOOKS FIRST ──────────────────────────────────────────────────────
  // Mode as local state so it can be changed mid-session without navigating back
  const [mode, setMode]       = useState<PracticeMode>(() => practiceSettings?.mode ?? 'view-listen')
  const isViewMode  = mode === 'view-listen'
  const activeHands = useMemo(() => getActiveHands(mode), [mode])
  const needsMelody = useMemo(() => requiresMelody(mode), [mode])

  const [isPlaying, setIsPlaying]         = useState(false)
  const [currentTime, setCurrentTime]     = useState(0)
  const [bpmMult, setBpmMult]             = useState(1.0)
  const [metronomeOn, setMetronomeOn]     = useState(false)
  const [loopRegion, setLoopRegion]       = useState<LoopRegion | null>(null)
  const [loopEnabled, setLoopEnabled]     = useState(false)
  const [countdownEnabled, setCountdownEnabled] = useState(
    () => localStorage.getItem('countdownEnabled') === 'true'
  )
  const [countdown, setCountdown]         = useState<number | null>(null)

  const [noteStates, setNoteStates] = useState<Map<string, NoteState>>(() => {
    const map = new Map<string, NoteState>()
    midiFile?.notes.forEach((n) => {
      map.set(n.id, { note: n, visual: 'pending', flashAlpha: 0, scheduled: false })
    })
    return map
  })

  const [activeKeys, setActiveKeys] = useState<
    Map<number, { hand: Hand; hitState?: 'correct' | 'wrong'; time?: number }>
  >(() => new Map())

  // Refs for RAF / interval closures
  const isPlayingRef        = useRef(false)
  const currentTimeRef      = useRef(0)
  const bpmMultRef          = useRef(1.0)
  const loopRegionRef       = useRef<LoopRegion | null>(null)
  const loopEnabledRef      = useRef(false)
  const countdownEnabledRef = useRef(localStorage.getItem('countdownEnabled') === 'true')
  const noteStatesRef       = useRef(noteStates)
  const visibleNotesRef     = useRef<MidiNote[]>([])
  const lastRAFTime         = useRef(0)
  const rafId               = useRef(0)
  const audioTimerRef       = useRef(0)
  const flashTimers         = useRef<Map<string, number>>(new Map())
  const pressedMidi         = useRef<Set<number>>(new Set())
  // noteId → midi: notes the player is currently holding (long notes require holding to end)
  const holdingRef          = useRef<Map<string, number>>(new Map())
  // Tracks active midi keys in view-listen mode (by-ref for RAF comparison)
  const viewActiveRef       = useRef('')

  // Sync refs
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
  useEffect(() => { bpmMultRef.current = bpmMult }, [bpmMult])
  useEffect(() => { loopRegionRef.current = loopRegion }, [loopRegion])
  useEffect(() => { loopEnabledRef.current = loopEnabled }, [loopEnabled])
  useEffect(() => { countdownEnabledRef.current = countdownEnabled }, [countdownEnabled])
  useEffect(() => { noteStatesRef.current = noteStates }, [noteStates])

  useEffect(() => {
    if (!practiceSettings) navigate('/')
  }, [practiceSettings, navigate])

  useEffect(() => {
    if (!midiFile) return
    const map = new Map<string, NoteState>()
    midiFile.notes.forEach((n) => {
      map.set(n.id, { note: n, visual: 'pending', flashAlpha: 0, scheduled: false })
    })
    setNoteStates(map)
    // Start at -leadIn so the playhead has a silent "ready" runway before the
    // first note.  ProgressBar clamps the displayed value to ≥ 0 so the user
    // sees "0:00" during the runway; FallingNotes / SheetMusic treat negative
    // time as "before the song" naturally (notes still off-stage, cursor at
    // the very start).
    setCurrentTime(-leadIn)
    currentTimeRef.current = -leadIn
  }, [midiFile, leadIn])

  // ─── Visible notes ─────────────────────────────────────────────────────────
  const visibleNotes = useMemo(() => {
    if (!midiFile) return []
    return midiFile.notes.filter((n) =>
      n.hand === 'unknown' || activeHands.includes(n.hand as 'left' | 'right')
    )
  }, [midiFile, activeHands])

  useEffect(() => { visibleNotesRef.current = visibleNotes }, [visibleNotes])

  // ─── Render list ──────────────────────────────────────────────────────────
  const renderNotes = useMemo((): NoteRenderState[] => {
    const result: NoteRenderState[] = visibleNotes.map((note) => {
      const ns = noteStates.get(note.id)
      return { note, state: ns?.visual ?? 'pending', flashAlpha: ns?.flashAlpha ?? 0 }
    })

    // Seamless loop preview: when approaching song end, pre-render next-cycle
    // notes above the screen with their time offset by (duration + leadIn) so
    // their pixel positions line up perfectly with the real notes once the
    // wrap fires.
    //
    // Why duration + leadIn (not just duration):
    //   • Without leadIn: wrap takes currentTime from `duration` → `0`.
    //     Preview note position at currentTime=duration  = (T + duration - duration) * pps = T * pps
    //     Real    note position at currentTime=0          = T * pps                          ✓
    //   • With leadIn:   wrap takes currentTime from `duration` → `-leadIn`.
    //     Preview note position at currentTime=duration  = (T + duration + leadIn - duration) * pps = (T + leadIn) * pps
    //     Real    note position at currentTime=-leadIn   = (T - (-leadIn)) * pps             = (T + leadIn) * pps  ✓
    //
    // So the preview notes descend continuously into the leadIn runway, no
    // empty gap and no "jerk" at the wrap moment.
    if (midiFile && currentTime > midiFile.duration - NOTE_LOOK_AHEAD_S) {
      const offset = midiFile.duration + leadIn
      visibleNotes.forEach((note) => {
        result.push({
          note: { ...note, id: note.id + '_next', time: note.time + offset },
          state: 'pending',
          flashAlpha: 0,
        })
      })
    }

    return result
  }, [visibleNotes, noteStates, currentTime, midiFile, leadIn])

  // ─── Flash ────────────────────────────────────────────────────────────────
  const triggerFlash = useCallback((noteId: string, state: 'hit' | 'missed') => {
    const existing = flashTimers.current.get(noteId)
    if (existing) clearInterval(existing)

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
          flashTimers.current.delete(noteId)
          return next
        }
        next.set(noteId, { ...ns, flashAlpha: alpha })
        return next
      })
    }, 28)
    flashTimers.current.set(noteId, id)
  }, [])

  // ─── Audio scheduler (fires every ~25ms) ─────────────────────────────────
  const scheduleAudio = useCallback(() => {
    if (!isPlayingRef.current || !midiFile || !isViewMode) return

    const now            = currentTimeRef.current
    const bpm            = bpmMultRef.current
    const lookaheadSongS = (LOOKAHEAD_REAL_MS / 1000) * bpm
    const toneNow        = audioEngine.currentTime

    // Work on a SINGLE copy of the state map for this scheduler run.
    // Update it synchronously as we schedule notes, then flush to React once.
    // This prevents double-scheduling when the RAF and the 25ms interval both
    // fire before the async setNoteStates updater has committed to the ref.
    let stateChanged = false
    const next = new Map(noteStatesRef.current)

    visibleNotesRef.current.forEach((note) => {
      const ns = next.get(note.id)
      if (!ns || ns.scheduled) return         // already scheduled in this run

      const delaySong = note.time - now

      // Fully missed note
      if (delaySong < -0.15 && ns.visual === 'pending') {
        next.set(note.id, { ...ns, scheduled: true, visual: 'missed' })
        stateChanged = true
        return
      }

      // Mid-note resume: play remaining portion from buffer offset (no re-attack)
      const remainingSong = delaySong + note.duration
      if (delaySong < 0 && remainingSong > 0.05) {
        const elapsedReal   = (-delaySong) / bpm
        const remainingReal = remainingSong / bpm
        audioEngine.noteAtTimeWithOffset(note.midi, toneNow + 0.005, elapsedReal, remainingReal, note.velocity)
        next.set(note.id, { ...ns, scheduled: true })
        stateChanged = true
        return
      }

      if (delaySong < 0 || delaySong > lookaheadSongS + 2.0) return

      // Upcoming note within lookahead window
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
  }, [midiFile, isViewMode])

  // ─── RAF: advance currentTime ─────────────────────────────────────────────
  const raf = useCallback((timestamp: number) => {
    if (midiFile && isPlayingRef.current) {
      const delta = lastRAFTime.current > 0
        ? (timestamp - lastRAFTime.current) / 1000 : 0
      lastRAFTime.current = timestamp

      // Wait mode: freeze time when any VISIBLE note is blocking at the hit line
      const visibleIds = new Set(visibleNotesRef.current.map(n => n.id))
      const hasBlockingNote = !isViewMode &&
        Array.from(noteStatesRef.current.values())
          .some(ns => ns.visual === 'active' && visibleIds.has(ns.note.id))

      if (!hasBlockingNote) {
        currentTimeRef.current += delta * bpmMultRef.current
      }

      // Loop
      if (loopEnabledRef.current && loopRegionRef.current) {
        const loopEnd   = loopRegionRef.current.end   * midiFile.duration
        const loopStart = loopRegionRef.current.start * midiFile.duration
        if (currentTimeRef.current >= loopEnd) {
          currentTimeRef.current = loopStart
          holdingRef.current.clear()
          setNoteStates((prev) => {
            const next = new Map(prev)
            next.forEach((ns, id) => {
              if (ns.note.time >= loopStart - 0.01)
                next.set(id, { ...ns, scheduled: false, visual: 'pending', flashAlpha: 0 })
              else
                next.set(id, { ...ns, scheduled: true,  visual: 'hit',     flashAlpha: 0 })
            })
            noteStatesRef.current = next
            return next
          })
        }
      }

      // End of song reached → wrap to the start of the next iteration.
      // newTime is -leadIn (negative) when the song doesn't have a natural
      // intro, so the user gets a brief "ready" pause before the first note
      // plays again.  For songs that DO have their own intro, leadIn = 0 and
      // we wrap straight to time 0, preserving the seamless-loop preview.
      if (currentTimeRef.current >= midiFile.duration + LOOP_RESET_AFTER) {
        const newTime = -leadIn
        currentTimeRef.current = newTime
        lastRAFTime.current = 0
        viewActiveRef.current = ''
        pressedMidi.current.clear()
        holdingRef.current.clear()
        setActiveKeys(new Map())
        // Reset EVERY note to pending so the new cycle re-schedules from the
        // top.  The old cycle's previously-scheduled audio is queued in Tone.js
        // and decays naturally; the scheduler's per-note range filters
        // (delaySong / lookahead) keep us from re-attacking notes that are
        // far in the future of newTime, so flattening everything here is
        // both safe and the only reliable way to make sure the first beat
        // plays again — the previous 3-branch reset left near-time-0 notes
        // stuck on `scheduled: true, visual: 'hit'` from the last cycle.
        setNoteStates((prev) => {
          const next = new Map(prev)
          next.forEach((ns, id) => {
            next.set(id, { ...ns, scheduled: false, visual: 'pending', flashAlpha: 0 })
          })
          noteStatesRef.current = next
          return next
        })
        // No stopAll — let ending notes decay naturally; new notes will schedule normally
        audioEngine.restoreVolume()
        rafId.current = requestAnimationFrame(raf)
        return
      }

      setCurrentTime(currentTimeRef.current)

      // Confirm held notes that have reached their end while key still pressed
      if (!isViewMode && holdingRef.current.size > 0) {
        const t = currentTimeRef.current
        holdingRef.current.forEach((_, noteId) => {
          const ns = noteStatesRef.current.get(noteId)
          if (!ns) { holdingRef.current.delete(noteId); return }
          // Auto-confirm when 95% of note duration has passed while still holding
          const tolerance = Math.max(0.03, ns.note.duration * 0.05)
          if (t >= ns.note.time + ns.note.duration - tolerance) {
            holdingRef.current.delete(noteId)
            triggerFlash(noteId, 'hit')
          }
        })
      }

      // Update note visual states (only for visible notes)
      const now = currentTimeRef.current
      const vIds = new Set(visibleNotesRef.current.map(n => n.id))
      setNoteStates((prev) => {
        let changed = false
        const next = new Map(prev)
        next.forEach((ns, id) => {
          if (!vIds.has(id)) return
          const d = ns.note.time - now
          // Activate: view-listen uses broad window; practice triggers right at hit line
          const trigger = isViewMode ? (d >= -0.08 && d <= 0.08) : (d <= 0.03 && d >= -2.0)
          if (ns.visual === 'pending' && trigger) {
            next.set(id, { ...ns, visual: 'active' }); changed = true
          } else if (!isViewMode && ns.visual === 'active' && now > ns.note.time + ns.note.duration + 0.5) {
            // Note end has passed by 0.5s without being confirmed — mark as missed
            next.set(id, { ...ns, visual: 'missed' }); changed = true
          }
        })
        return changed ? next : prev
      })

      // View-listen: derive active keys from current song time (RAF-based, seek-safe)
      if (isViewMode) {
        const notes = visibleNotesRef.current
        const activeMap = new Map<number, { hand: Hand; time: number }>()
        for (const note of notes) {
          if (note.time <= now && note.time + note.duration > now) {
            // For same MIDI in a chord keep the most-recent start time
            const existing = activeMap.get(note.midi)
            if (!existing || note.time > existing.time) {
              activeMap.set(note.midi, { hand: note.hand, time: note.time })
            }
          }
        }
        // Key includes note.time so that same-pitch repeated notes (E4→E4)
        // trigger a state update even though the MIDI number hasn't changed.
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
  }, [midiFile, isViewMode, leadIn])

  useEffect(() => {
    rafId.current = requestAnimationFrame(raf)
    return () => cancelAnimationFrame(rafId.current)
  }, [raf])

  useEffect(() => {
    audioTimerRef.current = window.setInterval(scheduleAudio, 25)
    return () => clearInterval(audioTimerRef.current)
  }, [scheduleAudio])

  // ─── Seek ─────────────────────────────────────────────────────────────────
  const seek = useCallback((time: number) => {
    const dur = midiFile?.duration ?? 0
    // Seeking to the start of the song is treated as "restart from the
    // top" — the user gets the same leadIn ready pause as the initial play.
    // This covers:
    //   • dragging the progress bar all the way to the leftmost pixel
    //   • the rewind button when it clamps a negative target to 0
    //   • internal callers (handleRestart) passing -leadIn directly
    // Any positive target lands exactly where the user pointed — no leadIn
    // when they're just scrubbing inside the song.
    const t = time <= 0
      ? -leadIn
      : Math.min(dur, time)
    currentTimeRef.current = t
    setCurrentTime(t)
    lastRAFTime.current = 0
    viewActiveRef.current = ''
    holdingRef.current.clear()

    // In view-listen mode, stop pre-scheduled audio so it restarts from new position
    if (isPlayingRef.current && isViewMode) {
      audioEngine.stopAll()
      audioEngine.restoreVolume()
    }

    // Compute new note states and update ref SYNCHRONOUSLY before scheduleAudio fires
    const next = new Map(noteStatesRef.current)
    next.forEach((ns, id) => {
      if (ns.note.time >= t - 0.01) {
        // At or after seek position — reset to pending (RAF will activate at the right moment)
        next.set(id, { ...ns, scheduled: false, visual: 'pending', flashAlpha: 0 })
      } else {
        // Started before seek position — treat as already played
        next.set(id, { ...ns, scheduled: true,  visual: 'hit',     flashAlpha: 0 })
      }
    })
    noteStatesRef.current = next   // sync update — scheduleAudio sees correct state immediately
    setNoteStates(next)
    setActiveKeys(new Map())

    // Kick off scheduling immediately without waiting for the 25ms interval
    if (isPlayingRef.current) requestAnimationFrame(() => scheduleAudio())
  }, [midiFile, isViewMode, scheduleAudio])

  // ─── Transport ────────────────────────────────────────────────────────────
  const play  = useCallback(() => {
    audioEngine.restoreVolume()
    setIsPlaying(true); isPlayingRef.current = true
    // Trigger scheduling immediately — don't wait for the 25ms interval
    // so mid-notes resume with minimal gap (< 5ms instead of up to 50ms)
    requestAnimationFrame(() => scheduleAudio())
  }, [scheduleAudio])
  const pause = useCallback(() => {
    audioEngine.stopAll()
    setIsPlaying(false); isPlayingRef.current = false; lastRAFTime.current = 0
    pressedMidi.current.clear()
    holdingRef.current.clear()
    // Reset scheduled flags for ALL notes that haven't fully ended yet.
    // Also update the ref SYNCHRONOUSLY so scheduleAudio sees fresh state
    // immediately when play() triggers it (before React re-render cycle).
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
      if (changed) noteStatesRef.current = next   // sync ref update — no render-cycle wait
      return changed ? next : prev
    })
  }, [])
  const stop  = useCallback(() => { pause(); seek(0) }, [pause, seek])

  // ─── Auto-play on mount (with optional countdown) ─────────────────────────
  useEffect(() => {
    if (!midiFile) return

    // Apply resume point if present — scoped per song so the bookmark from
    // a different MIDI doesn't leak in.
    const rp = resumePoints[midiFile.name]
    if (rp && rp.mode === mode) {
      const t = findBestResumeTime(midiFile.notes, rp.time)
      seek(t)
      setResumePoint(midiFile.name, null)
    }

    if (countdownEnabledRef.current) {
      let n = 3
      setCountdown(n)
      const interval = setInterval(() => {
        n--
        if (n > 0) {
          setCountdown(n)
        } else {
          clearInterval(interval)
          setCountdown(null)
          play()
        }
      }, 1000)
      return () => clearInterval(interval)
    } else {
      const t = setTimeout(() => play(), 300)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // mount only

  // ─── Player input ─────────────────────────────────────────────────────────
  const handleNoteInput = useCallback((midi: number, velocity: number, on: boolean) => {
    // View-listen mode: all input is blocked — song plays automatically only
    if (isViewMode) return

    if (on) {
      const now = currentTimeRef.current
      let bestMatch: NoteState | null = null
      let bestDelta = Infinity

      noteStatesRef.current.forEach((ns) => {
        if (ns.visual !== 'active' && ns.visual !== 'holding') return
        if (needsMelody && ns.note.midi !== midi) return
        const dMs = Math.abs(ns.note.time - now) * 1000
        // Accept: within timing window at note START, OR anywhere within note duration
        // (re-press after early release needs the second condition since time advanced)
        const withinDuration = now >= ns.note.time - 0.1 && now < ns.note.time + ns.note.duration
        if ((dMs < TIMING_WINDOW_MS || withinDuration) && dMs < bestDelta) {
          bestDelta = dMs; bestMatch = ns
        }
      })

      if (bestMatch) {
        const m = bestMatch as NoteState
        // Correct key — play at full velocity
        audioEngine.noteOn(midi, velocity)
        setActiveKeys((prev) => {
          const next = new Map(prev)
          next.set(midi, { hand: m.note.hand, hitState: 'correct' })
          return next
        })
        // All notes require holding until end — show 'holding' (green) while pressed,
        // only transition to confirmed 'hit' when released at/after 95% of duration
        holdingRef.current.set(m.note.id, midi)
        const next = new Map(noteStatesRef.current)
        next.set(m.note.id, { ...m, visual: 'holding', flashAlpha: 0 })
        noteStatesRef.current = next
        setNoteStates(next)
      } else {
        // Wrong key — play quietly so global volume is unaffected
        audioEngine.noteOn(midi, velocity * 0.25)
        setActiveKeys((prev) => {
          const next = new Map(prev)
          next.set(midi, { hand: 'unknown', hitState: 'wrong' })
          return next
        })
      }
    } else {
      audioEngine.noteOff(midi)
      setActiveKeys((prev) => {
        const next = new Map(prev)
        next.delete(midi)
        return next
      })

      // Check if releasing a held long note
      holdingRef.current.forEach((heldMidi, noteId) => {
        if (heldMidi !== midi) return
        holdingRef.current.delete(noteId)
        const ns = noteStatesRef.current.get(noteId)
        if (!ns) return
        const noteEnd   = ns.note.time + ns.note.duration
        const t         = currentTimeRef.current
        const tolerance = Math.max(0.03, ns.note.duration * 0.05)
        if (t < noteEnd - tolerance) {
          // Released too early (before 95% of note) → revert back to active
          const next = new Map(noteStatesRef.current)
          next.set(noteId, { ...ns, visual: 'active', flashAlpha: 0, scheduled: false })
          noteStatesRef.current = next
          setNoteStates(next)
        } else {
          // Released at/after note end → confirm hit
          triggerFlash(noteId, 'hit')
        }
      })
    }
  }, [isViewMode, needsMelody, triggerFlash])

  useMIDIDevice(handleNoteInput)

  // Computer keyboard → piano (C4 = A key)
  useEffect(() => {
    const KEY_MAP: Record<string, number> = {
      'a':60,'w':61,'s':62,'e':63,'d':64,'f':65,'t':66,
      'g':67,'y':68,'h':69,'u':70,'j':71,'k':72,'o':73,
      'l':74,'p':75,';':76
    }
    const pressed = new Set<string>()
    const onDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return
      const midi = KEY_MAP[e.key.toLowerCase()]
      if (midi !== undefined && !pressed.has(e.key)) {
        pressed.add(e.key); handleNoteInput(midi, 0.8, true)
      }
      if (e.key === ' ') {
        e.preventDefault()
        setIsPlaying((p) => { isPlayingRef.current = !p; return !p })
      }
    }
    const onUp = (e: KeyboardEvent) => {
      const midi = KEY_MAP[e.key.toLowerCase()]
      if (midi !== undefined) { pressed.delete(e.key); handleNoteInput(midi, 0, false) }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [handleNoteInput])

  // ─── Transport handlers ───────────────────────────────────────────────────
  // Restart from the leadIn runway, not from raw 0 — gives the user the same
  // "ready" pause the natural-loop wrap does.
  const handleRestart     = useCallback(() => {
    pause()
    seek(-leadIn)
    play()
  }, [pause, seek, play, leadIn])
  const handlePlayPause   = useCallback(() => { isPlaying ? pause() : play() }, [isPlaying, play, pause])
  const handleRewind      = useCallback(() => {
    const dur = midiFile?.duration ?? 0
    const [lo, hi] = loopEnabledRef.current && loopRegionRef.current
      ? [loopRegionRef.current.start * dur, loopRegionRef.current.end * dur]
      : [0, dur]
    seek(Math.min(hi, Math.max(lo, currentTimeRef.current - REWIND_AMOUNT)))
  }, [seek, midiFile])
  const handleFastForward = useCallback(() => {
    const dur = midiFile?.duration ?? 0
    const [lo, hi] = loopEnabledRef.current && loopRegionRef.current
      ? [loopRegionRef.current.start * dur, loopRegionRef.current.end * dur]
      : [0, dur]
    seek(Math.min(hi, Math.max(lo, currentTimeRef.current + REWIND_AMOUNT)))
  }, [seek, midiFile])
  const handleBpmChange = useCallback((val: number) => {
    setBpmMult(val)
    bpmMultRef.current = val

    if (isPlayingRef.current && isViewMode) {
      // Stop only nodes that haven't started yet (future notes at old BPM timing).
      // Currently-playing notes continue uninterrupted — no re-attack, no double.
      audioEngine.stopFutureNodes()

      // Reset scheduled flag only for notes that haven't started yet so they
      // get re-scheduled with new BPM timing by the next scheduleAudio tick.
      const t = currentTimeRef.current
      const next = new Map(noteStatesRef.current)
      let changed = false
      next.forEach((ns, id) => {
        if (ns.scheduled && ns.note.time > t + 0.02) {
          next.set(id, { ...ns, scheduled: false })
          changed = true
        }
      })
      if (changed) {
        noteStatesRef.current = next
        setNoteStates(next)
      }
    }

    // Update metronome tempo without restarting (restart causes double-click glitch)
    if (metronomeOn && midiFile) {
      audioEngine.updateMetronomeBpm(midiFile.bpm * val)
    }
  }, [isViewMode, metronomeOn, midiFile])

  const handleMetronome = useCallback(() => {
    setMetronomeOn((prev) => {
      if (!prev && midiFile) {
        audioEngine.startMetronome(midiFile.bpm * bpmMult, midiFile.timeSignature.numerator)
      } else {
        audioEngine.stopMetronome()
      }
      return !prev
    })
  }, [midiFile, bpmMult])

  const handleLoopToggle = useCallback(() => {
    setLoopEnabled((prev) => {
      if (prev) {
        // Turning OFF: clear region too
        setLoopRegion(null)
        loopRegionRef.current = null
        loopEnabledRef.current = false
        return false
      } else {
        // Turning ON: create region around current position
        if (!loopRegion && midiFile) {
          const start = Math.max(0, (currentTimeRef.current - 5) / midiFile.duration)
          const end   = Math.min(1, (currentTimeRef.current + 15) / midiFile.duration)
          setLoopRegion({ start, end })
          loopRegionRef.current = { start, end }
        }
        loopEnabledRef.current = true
        return true
      }
    })
  }, [loopRegion, midiFile])

  const handleLoopChange = useCallback((region: LoopRegion | null) => {
    setLoopRegion(region); loopRegionRef.current = region
    if (!region) { setLoopEnabled(false); loopEnabledRef.current = false }
  }, [])

  const handleCountdownToggle = useCallback(() => {
    setCountdownEnabled((prev) => {
      const next = !prev
      countdownEnabledRef.current = next
      localStorage.setItem('countdownEnabled', String(next))
      return next
    })
  }, [])

  // ─── Mode-switch transition state ─────────────────────────────────────────
  // Tracks the 200 ms fade-out → mode swap → fade-in animation that runs
  // when the user picks a different practice mode from the header.
  const [modeTransitioning, setModeTransitioning] = useState(false)
  const [modeFlash, setModeFlash]                 = useState<PracticeMode | null>(null)

  // ─── Mode switch mid-session ─────────────────────────────────────────────
  const handleModeChange = useCallback((newMode: PracticeMode) => {
    if (newMode === mode) return
    const wasPlaying = isPlayingRef.current

    // Stop all audio immediately
    audioEngine.stopAll()
    isPlayingRef.current = false
    lastRAFTime.current  = 0
    pressedMidi.current.clear()
    holdingRef.current.clear()

    // Find the start of the most recently started note that is still playing.
    // Seek back to it so the user can play it (avoids gap in practice mode).
    // Cap at 3 s to avoid a jarring rewind for very long notes.
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

    // Reset note states relative to seekTarget (same rule as seek)
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

    // Commit new mode — isViewMode, activeHands, scheduleAudio all update via re-render
    setMode(newMode)

    // Restore toggle state for this (song, mode) pair if it has been touched
    // before, else fall back to defaults.  Matches the home-page → practice
    // rule: each (song, mode) pair has its own prefs.
    const np = midiFile ? modePrefs[modePrefsKey(midiFile.name, newMode)] : undefined
    setShowSheetMusic(np?.showSheetMusic ?? false)
    setShowFallingNotes(np?.showFallingNotes ?? true)

    // ── Animation: fade-out → swap → fade-in + brief mode label flash ────────
    setModeTransitioning(true)
    setModeFlash(newMode)
    // Let the fade-in finish then drop the transition flag
    setTimeout(() => setModeTransitioning(false), 260)
    // Mode-label flash stays a bit longer for emphasis
    setTimeout(() => setModeFlash(null), 1100)

    // If was playing, resume after React re-renders with new mode's scheduleAudio
    if (wasPlaying) {
      audioEngine.restoreVolume()
      setIsPlaying(true)
      isPlayingRef.current = true
      // The interval useEffect will restart scheduleAudio with new isViewMode automatically.
      // Also kick off immediately so there's no 25ms gap.
      setTimeout(() => { if (isPlayingRef.current) requestAnimationFrame(scheduleAudio) }, 0)
    }
  }, [mode, midiFile, scheduleAudio, modePrefs])

  // ─── Volume / Zoom / Measure lines ───────────────────────────────────────
  const [volume, setVolume]           = useState(() => audioEngine.getVolume())
  const prevVolumeRef                 = useRef(audioEngine.getVolume())
  const [zoom, setZoom]               = useState(1.0)
  const [measureLines, setMeasureLines] = useState(true)

  const handleVolumeChange = useCallback((val: number) => {
    setVolume(val)
    audioEngine.setVolume(val)
  }, [])

  const handleVolumeMute = useCallback(() => {
    setVolume((prev) => {
      if (prev > 0) {
        prevVolumeRef.current = prev
        audioEngine.setVolume(0)
        return 0
      }
      const restored = prevVolumeRef.current || 0.85
      audioEngine.setVolume(restored)
      return restored
    })
  }, [])

  // Per-(song, mode) UI toggles.  Scoped this tight so a freshly imported
  // song doesn't inherit the previous song's sheet-on choice — each
  // (song, mode) pair has its own state.  Session-only; not persisted.
  const initialPrefs = (practiceSettings && midiFile)
    ? modePrefs[modePrefsKey(midiFile.name, practiceSettings.mode)]
    : undefined
  const [showSheetMusic, setShowSheetMusic] = useState(
    () => initialPrefs?.showSheetMusic ?? false
  )
  const [showFallingNotes, setShowFallingNotes] = useState(
    () => initialPrefs?.showFallingNotes ?? true
  )

  // View-swap animation between SheetMusic ↔ FallingNotes.
  //   idle      → no animation, content visible normally
  //   leaving   → current view runs the exit keyframes
  //   entering  → next view runs the enter keyframes (after swap)
  type SwapPhase = 'idle' | 'leaving' | 'entering'
  const [swapPhase, setSwapPhase] = useState<SwapPhase>('idle')
  const pendingSwapRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (swapPhase === 'leaving') {
      // Match the longest "leaving" animation in MODE_FLASH_STYLE (shellLeave 220 ms).
      const t = setTimeout(() => {
        // Run the queued mutation (toggle showSheetMusic), then switch the
        // animation class so the new view animates in.
        pendingSwapRef.current?.()
        pendingSwapRef.current = null
        setSwapPhase('entering')
      }, 220)
      return () => clearTimeout(t)
    }
    if (swapPhase === 'entering') {
      // Match the longest "entering" animation (contentEnter 140 ms delay + 320 ms duration).
      const t = setTimeout(() => setSwapPhase('idle'), 460)
      return () => clearTimeout(t)
    }
    return
  }, [swapPhase])

  const handleZoomChange         = useCallback((val: number) => setZoom(val), [])
  const handleMeasureLinesToggle = useCallback(() => setMeasureLines(v => !v), [])
  const handleSheetMusicToggle   = useCallback(() => {
    if (swapPhase !== 'idle') return  // ignore rapid re-toggle while animating
    pendingSwapRef.current = () => {
      setShowSheetMusic((v) => {
        const next = !v
        if (midiFile) setModePrefs(modePrefsKey(midiFile.name, mode), { showSheetMusic: next })
        return next
      })
    }
    setSwapPhase('leaving')
  }, [swapPhase, mode, midiFile, setModePrefs])
  const handleFallingNotesToggle = useCallback(() => {
    setShowFallingNotes(v => {
      const next = !v
      if (midiFile) setModePrefs(modePrefsKey(midiFile.name, mode), { showFallingNotes: next })
      return next
    })
  }, [mode, midiFile, setModePrefs])

  const handleBack = useCallback(() => {
    if (midiFile) setResumePoint(midiFile.name, { time: currentTimeRef.current, mode })
    stop()
    audioEngine.stopMetronome()
    navigate('/mode')
  }, [stop, navigate, mode, midiFile, setResumePoint])

  // Cleanup
  useEffect(() => () => {
    flashTimers.current.forEach((id) => clearInterval(id))
    audioEngine.stopMetronome()
  }, [])

  // ─── Guard (all hooks above) ──────────────────────────────────────────────
  if (!practiceSettings || !midiFile) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400">
        Đang chuyển hướng...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-slate-950 overflow-hidden">
      <style>{MODE_FLASH_STYLE}</style>
      <PracticeHeader
        songName={midiFile.name}
        isPlaying={isPlaying}
        bpmMultiplier={bpmMult}
        originalBpm={midiFile.bpm}
        metronomeOn={metronomeOn}
        loopOn={loopEnabled}
        countdownEnabled={countdownEnabled}
        showSheetMusic={showSheetMusic}
        showFallingNotes={showFallingNotes}
        mode={mode}
        volume={volume}
        zoom={zoom}
        measureLines={measureLines}
        onBack={handleBack}
        onPlayPause={handlePlayPause}
        onRestart={handleRestart}
        onRewind={handleRewind}
        onFastForward={handleFastForward}
        onBpmChange={handleBpmChange}
        onMetronomeToggle={handleMetronome}
        onLoopToggle={handleLoopToggle}
        onCountdownToggle={handleCountdownToggle}
        onSheetMusicToggle={handleSheetMusicToggle}
        onFallingNotesToggle={handleFallingNotesToggle}
        onVolumeChange={handleVolumeChange}
        onVolumeMute={handleVolumeMute}
        onZoomChange={handleZoomChange}
        onMeasureLinesToggle={handleMeasureLinesToggle}
        onModeChange={handleModeChange}
      />

      <ProgressBar
        duration={midiFile.duration}
        // Clamp to ≥ 0 so the bar reads "0:00" / empty fill during the leadIn
        // runway — the user perceives "the song is paused at the very start"
        // rather than a negative time.
        currentTime={Math.max(0, currentTime)}
        loopRegion={loopRegion}
        onSeek={seek}
        onLoopChange={handleLoopChange}
      />

      {/* Main content area: sheet music OR falling notes, plus countdown overlay */}
      <div className="relative flex-1 min-h-0 flex flex-col">
        {/* Two-layer view-swap animation:
              SHELL  — slides in/out (translateX only, no scale — see notes in
                       MODE_FLASH_STYLE for why scale would break the canvas).
              CONTENT— fades + blurs slightly, with timing offset from the shell
                       so the "container appears first, then the notes resolve"
                       feel comes through.
            Also layered: the mode-switch dim (modeTransitioning) which just
            briefly dims everything so a mid-session mode change reads as an
            intentional event.  Children DON'T unmount during mode-switch dim
            — they keep state (e.g. the sheet's cached OSMD instance). */}
        <div
          className={[
            'flex-1 min-h-0 flex flex-col transition-opacity duration-200 ease-out',
            modeTransitioning ? 'opacity-0' : 'opacity-100',
            swapPhase === 'leaving'  ? 'shell-leaving'  : '',
            swapPhase === 'entering' ? 'shell-entering' : '',
          ].join(' ')}
        >
          <div
            className={[
              'flex-1 min-h-0 flex flex-col',
              swapPhase === 'leaving'  ? 'content-leaving'  : '',
              swapPhase === 'entering' ? 'content-entering' : '',
            ].join(' ')}
          >
            {showSheetMusic ? (
              <SheetMusic
                midiFile={midiFile}
                currentTimeRef={currentTimeRef}
                activeKeys={activeKeys}
                highlightMode={showFallingNotes}
              />
            ) : (
              showFallingNotes && (
                <FallingNotes
                  notes={renderNotes}
                  currentTime={currentTime}
                  keyboardHeight={KEYBOARD_HEIGHT}
                  practiceMode={!isViewMode}
                  zoom={zoom}
                  showLaneLines={measureLines}
                />
              )
            )}
          </div>
        </div>

        {/* Mode-switch flash label — shows the new mode briefly in the centre. */}
        {modeFlash !== null && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              key={modeFlash}
              className="px-6 py-3 rounded-2xl bg-slate-900/80 backdrop-blur border border-blue-400/30 shadow-2xl text-white text-lg font-semibold select-none"
              style={{
                animation: 'modeFlash 1.0s cubic-bezier(0.16,1,0.3,1) forwards',
                boxShadow: '0 0 40px rgba(80,140,255,0.45)',
              }}
            >
              {MODE_LABELS[modeFlash] ?? modeFlash}
            </div>
          </div>
        )}

        {/* Countdown overlay */}
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-white font-bold select-none"
              style={{ fontSize: 120, lineHeight: 1, textShadow: '0 0 60px rgba(100,160,255,0.8), 0 0 20px rgba(100,160,255,0.5)' }}>
              {countdown > 0 ? countdown : '▶'}
            </div>
          </div>
        )}
      </div>

      {/* Decorative separator between content and keyboard.
            • A 1px hairline gradient (the "string" itself)
            • A short downward glow that fades into the keyboard's top edge
          Together they read as a stage rim where the falling notes land,
          without taking visible vertical space (height 0, glow projected down). */}
      <div className="relative h-0 pointer-events-none select-none z-10">
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-blue-400/70 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-blue-500/25 via-blue-500/5 to-transparent" />
      </div>

      <PianoKeyboard
        activeKeys={activeKeys}
        onKeyDown={isViewMode ? undefined : (midi) => handleNoteInput(midi, 0.8, true)}
        onKeyUp={isViewMode ? undefined : (midi) => handleNoteInput(midi, 0, false)}
        height={KEYBOARD_HEIGHT}
      />
    </div>
  )
}
