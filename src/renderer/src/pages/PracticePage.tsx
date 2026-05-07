import React, {
  useState, useEffect, useRef, useCallback, useMemo
} from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
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
const LOOKAHEAD_REAL_MS = 100
const NOTE_LOOK_AHEAD_S = 4.5   // must match FallingNotes PX_PER_SECOND / visible window
const LOOP_RESET_AFTER  = 0.3   // seconds past song end before seamless reset

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
  const { practiceSettings, resumePoint, setResumePoint } = useAppContext()
  useAudioEngine()

  const midiFile = practiceSettings?.midiFile ?? null

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
    Map<number, { hand: Hand; hitState?: 'correct' | 'wrong' }>
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
    setCurrentTime(0)
    currentTimeRef.current = 0
  }, [midiFile])

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

    // Seamless loop preview: when approaching song end, pre-render next-cycle notes
    // above the screen with time offset by +duration. Their pixel positions are
    // identical to what they'll be after the reset, so the transition is invisible.
    if (midiFile && currentTime > midiFile.duration - NOTE_LOOK_AHEAD_S) {
      visibleNotes.forEach((note) => {
        result.push({
          note: { ...note, id: note.id + '_next', time: note.time + midiFile.duration },
          state: 'pending',
          flashAlpha: 0,
        })
      })
    }

    return result
  }, [visibleNotes, noteStates, currentTime, midiFile])

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

      // Seamless loop: when LOOP_RESET_AFTER seconds past song end, subtract
      // duration from currentTime. Preview notes (rendered with +duration offset)
      // become the real notes at identical pixel positions → zero visual jump.
      if (currentTimeRef.current >= midiFile.duration + LOOP_RESET_AFTER) {
        const newTime = currentTimeRef.current - midiFile.duration
        currentTimeRef.current = newTime
        lastRAFTime.current = 0
        viewActiveRef.current = ''
        pressedMidi.current.clear()
        holdingRef.current.clear()
        setActiveKeys(new Map())
        // Reset note states relative to the new time position
        setNoteStates((prev) => {
          const next = new Map(prev)
          next.forEach((ns, id) => {
            const noteEnd = ns.note.time + ns.note.duration
            if (ns.note.time > newTime + 0.05) {
              // Future note — reset to pending
              next.set(id, { ...ns, scheduled: false, visual: 'pending', flashAlpha: 0 })
            } else if (noteEnd < newTime - 0.05) {
              // Already passed — mark as hit
              next.set(id, { ...ns, scheduled: true, visual: 'hit', flashAlpha: 0 })
            }
            // else: currently playing — leave scheduled, audio naturally decays
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
        const activeMap = new Map<number, { hand: Hand }>()
        for (const note of notes) {
          if (note.time <= now && note.time + note.duration > now) {
            activeMap.set(note.midi, { hand: note.hand })
          }
        }
        // Only update React state when the set actually changes
        const key = [...activeMap.keys()].sort().join(',')
        if (key !== viewActiveRef.current) {
          viewActiveRef.current = key
          setActiveKeys(activeMap)
        }
      }
    } else {
      lastRAFTime.current = 0
    }
    rafId.current = requestAnimationFrame(raf)
  }, [midiFile, isViewMode])

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
    const t = Math.max(0, Math.min(dur, time))
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

    // Apply resume point if present (seek before starting)
    if (resumePoint && resumePoint.mode === mode) {
      const t = findBestResumeTime(midiFile.notes, resumePoint.time)
      seek(t)
      setResumePoint(null)
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
  const handleRestart     = useCallback(() => { stop(); play() }, [stop, play])
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

    // If was playing, resume after React re-renders with new mode's scheduleAudio
    if (wasPlaying) {
      audioEngine.restoreVolume()
      setIsPlaying(true)
      isPlayingRef.current = true
      // The interval useEffect will restart scheduleAudio with new isViewMode automatically.
      // Also kick off immediately so there's no 25ms gap.
      setTimeout(() => { if (isPlayingRef.current) requestAnimationFrame(scheduleAudio) }, 0)
    }
  }, [mode, midiFile, scheduleAudio])

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

  const [showSheetMusic,   setShowSheetMusic]   = useState(false)
  const [showFallingNotes, setShowFallingNotes] = useState(true)

  const handleZoomChange          = useCallback((val: number) => setZoom(val), [])
  const handleMeasureLinesToggle  = useCallback(() => setMeasureLines(v => !v), [])
  const handleSheetMusicToggle    = useCallback(() => setShowSheetMusic(v => !v), [])
  const handleFallingNotesToggle  = useCallback(() => setShowFallingNotes(v => !v), [])

  const handleBack = useCallback(() => {
    setResumePoint({ time: currentTimeRef.current, mode })
    stop()
    audioEngine.stopMetronome()
    navigate('/mode')
  }, [stop, navigate, mode, setResumePoint])

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
        currentTime={currentTime}
        loopRegion={loopRegion}
        onSeek={seek}
        onLoopChange={handleLoopChange}
      />

      {/* Main content area: sheet music OR falling notes, plus countdown overlay */}
      <div className="relative flex-1 min-h-0 flex flex-col">
        {showSheetMusic ? (
          <SheetMusic
            notes={midiFile.notes}
            bpm={midiFile.bpm}
            timeSignature={midiFile.timeSignature}
            currentTime={currentTime}
            activeHands={activeHands}
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

      <PianoKeyboard
        activeKeys={activeKeys}
        onKeyDown={isViewMode ? undefined : (midi) => handleNoteInput(midi, 0.8, true)}
        onKeyUp={isViewMode ? undefined : (midi) => handleNoteInput(midi, 0, false)}
        height={KEYBOARD_HEIGHT}
      />
    </div>
  )
}
