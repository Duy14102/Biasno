import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext, modePrefsKey } from '@/context'
import { LS } from '@/constants'
import { loadJSON, isPlainObject } from '@/utils'
import { audioEngine }          from '@/audio'
import { useAudioEngine }       from '@/hooks'
import { useAudioScheduler }    from '@/practice'
import { usePracticeInput }     from '@/practice'
import { useViewSwap }          from '@/practice'
import { useFlashTimer }        from '@/practice'
import { usePlayhead }          from '@/practice'
import { useTransport }         from '@/practice'
import { useModeChange }        from '@/practice'
import { useScoring }           from '@/practice'
import { addScore }             from '@/practice'
import { useChallengeEnabled }  from '@/practice'
import {
  KEYBOARD_HEIGHT, NOTE_LOOK_AHEAD_S,
  LEAD_IN_TARGET, PRACTICE_TRANSITION_STYLE,
} from '@/practice'
import { useLanguage } from '@/i18n'
import { MODE_FLASH_KEYS } from '@/i18n'
import type { NoteState } from '@/practice'
import { PianoKeyboard }  from '@/components/keyboard'
import { FallingNotes, type NoteRenderState } from '@/components/falling'
import { SheetMusic }     from '@/components/sheet'
import { ProgressBar }    from '@/components'
import { PracticeHeader } from '@/components/header'
import { PlayIcon } from '@/components/header'
import type { MidiNote, LoopRegion, Hand, PracticeMode } from '@/types'
import { getActiveHands, requiresMelody } from '@/practice'
import { KEY_COUNTS, detectKeyCountFromName, type KeyCount } from '@/utils'
import { useMidi } from '@/context'

export default function PracticePage(): React.JSX.Element {
  const navigate = useNavigate()
  const { practiceSettings, resumePoints, setResumePoint, modePrefs, setModePrefs } = useAppContext()
  const { t } = useLanguage()
  useAudioEngine()

  const midiFile = practiceSettings?.midiFile ?? null

  // How many seconds of silent "ready" we add at the very start of the song
  // and at every loop wrap.  Zero for songs whose first note is already at
  // least LEAD_IN_TARGET seconds in — they have their own intro.
  const leadIn = useMemo(() => {
    if (!midiFile || midiFile.notes.length === 0) return 0
    return Math.max(0, LEAD_IN_TARGET - midiFile.notes[0].time)
  }, [midiFile])

  // ─── State / refs ─────────────────────────────────────────────────────────
  const [mode, setMode] = useState<PracticeMode>(() => practiceSettings?.mode ?? 'view-listen')
  const isViewMode  = mode === 'view-listen'
  const activeHands = useMemo(() => getActiveHands(mode), [mode])
  const needsMelody = useMemo(() => requiresMelody(mode), [mode])

  const [isPlaying,        setIsPlaying]        = useState(false)
  const [currentTime,      setCurrentTime]      = useState(0)
  const [bpmMult,          setBpmMult]          = useState(1.0)
  const [metronomeOn,      setMetronomeOn]      = useState(false)
  const [loopRegion,       setLoopRegion]       = useState<LoopRegion | null>(null)
  const [loopEnabled,      setLoopEnabled]      = useState(false)
  const [countdownEnabled, setCountdownEnabled] = useState(
    () => localStorage.getItem('countdownEnabled') === 'true'
  )
  const [countdown, setCountdown] = useState<number | null>(null)

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

  // Idle-hint: if the user hasn't pressed any key for IDLE_HINT_MS while
  // playing in a practice mode, pulse the keys they should press next.  Any
  // input, pause, seek, or mode change dismisses the hint and restarts the clock.
  const IDLE_HINT_MS = 3000
  const lastInputAtRef            = useRef<number>(performance.now())
  const [hintKeys, setHintKeys]   = useState<Set<number>>(() => new Set())

  // Refs the playback engine reads/writes every frame.
  const isPlayingRef        = useRef(false)
  const currentTimeRef      = useRef(0)
  const bpmMultRef          = useRef(1.0)
  const loopRegionRef       = useRef<LoopRegion | null>(null)
  const loopEnabledRef      = useRef(false)
  const countdownEnabledRef = useRef(localStorage.getItem('countdownEnabled') === 'true')
  const noteStatesRef       = useRef(noteStates)
  const visibleNotesRef     = useRef<MidiNote[]>([])
  const lastRAFTime         = useRef(0)
  const pressedMidi         = useRef<Set<number>>(new Set())
  const holdingRef          = useRef<Map<string, number>>(new Map())   // noteId → midi
  const viewActiveRef       = useRef('')

  // Sync the reactive twins.
  useEffect(() => { isPlayingRef.current        = isPlaying        }, [isPlaying])
  useEffect(() => { bpmMultRef.current          = bpmMult          }, [bpmMult])
  useEffect(() => { loopRegionRef.current       = loopRegion       }, [loopRegion])
  useEffect(() => { loopEnabledRef.current      = loopEnabled      }, [loopEnabled])
  useEffect(() => { countdownEnabledRef.current = countdownEnabled }, [countdownEnabled])
  useEffect(() => { noteStatesRef.current       = noteStates       }, [noteStates])

  useEffect(() => {
    if (!practiceSettings) navigate('/')
  }, [practiceSettings, navigate])

  // Reset song state whenever the midi or its lead-in changes.
  useEffect(() => {
    if (!midiFile) return
    const map = new Map<string, NoteState>()
    midiFile.notes.forEach((n) => {
      map.set(n.id, { note: n, visual: 'pending', flashAlpha: 0, scheduled: false })
    })
    setNoteStates(map)
    // Start at -leadIn so the playhead has a silent runway before the first
    // note.  ProgressBar clamps the displayed value to ≥ 0.
    setCurrentTime(-leadIn)
    currentTimeRef.current = -leadIn
  }, [midiFile, leadIn])

  // ─── Derived note lists ───────────────────────────────────────────────────
  const visibleNotes = useMemo(() => {
    if (!midiFile) return []
    return midiFile.notes.filter((n) =>
      n.hand === 'unknown' || activeHands.includes(n.hand as 'left' | 'right')
    )
  }, [midiFile, activeHands])

  useEffect(() => { visibleNotesRef.current = visibleNotes }, [visibleNotes])

  const renderNotes = useMemo((): NoteRenderState[] => {
    const result: NoteRenderState[] = visibleNotes.map((note) => {
      const ns = noteStates.get(note.id)
      return { note, state: ns?.visual ?? 'pending', flashAlpha: ns?.flashAlpha ?? 0 }
    })

    // Seamless loop preview: in the last NOTE_LOOK_AHEAD_S seconds of the
    // song, render next-cycle notes above the screen with their time offset
    // by (duration + leadIn).  Their pixel positions then line up exactly
    // with the real notes' positions once the wrap fires — no empty gap and
    // no jerk at the wrap moment.
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

  // ─── Per-(song, mode) UI toggles ──────────────────────────────────────────
  // Each (song, mode) pair has its own sheet/falling toggle state — scoped
  // tight so a freshly imported song doesn't inherit the previous song's
  // choice.  Session-only; not persisted.
  const initialPrefs = (practiceSettings && midiFile)
    ? modePrefs[modePrefsKey(midiFile.name, practiceSettings.mode)]
    : undefined
  const [showSheetMusic,   setShowSheetMusic]   = useState(() => initialPrefs?.showSheetMusic   ?? false)
  const [showFallingNotes, setShowFallingNotes] = useState(() => initialPrefs?.showFallingNotes ?? true)

  // ─── Scoring ──────────────────────────────────────────────────────────────
  // View-listen / demo never counts.  When challenge is on, every full
  // playthrough AND every loop iteration silently appends a score entry to
  // the leaderboard — no result modal interrupts the flow.  The user reads
  // their progress from the leaderboard popover in the header.
  const [challengeEnabled, setChallengeEnabled] = useChallengeEnabled(midiFile?.name ?? null)
  const scoringActive = !isViewMode && challengeEnabled

  const scoring = useScoring()

  // Total scoreable notes for the current (song, mode) pair — accuracy basis.
  const totalNotes = visibleNotes.length

  // Snapshot the just-finished playthrough.  Fires once at song wrap; we
  // save then reset the live counter so the next cycle starts from zero.
  // No-op if nothing scoreable happened.
  const handleSongEnd = useCallback(() => {
    if (!scoringActive || !midiFile) return
    const total = totalNotes
    if (total === 0) { scoring.reset(); return }
    const s        = scoring.state
    if (s.success === 0 && s.missed === 0 && s.score === 0) {
      // Silent skip — playhead reached end with zero interaction (e.g. user
      // fast-forwarded the whole song without playing).  Nothing to record.
      return
    }
    const accuracy = s.success / total
    const score    = Math.round(s.score)
    addScore(midiFile.name, {
      score, success: s.success, missed: s.missed,
      combosHits: s.combosHits, maxCombo: s.maxCombo,
      totalNotes: total, accuracy,
      mode, date: Date.now(),
    })
    setScoreVersion((n) => n + 1)
    scoring.reset()
    // Song played all the way through — the bookmark for resume-on-next-open
    // is no longer meaningful.
    setResumePoint(midiFile.name, null)
  }, [scoringActive, midiFile, mode, scoring, totalNotes, setResumePoint])

  // Loop-iteration checkpoint: same shape as handleSongEnd, but bounded to
  // the active loop region (totalNotes counts only notes inside it).
  const handleLoopWrap = useCallback(() => {
    if (!scoringActive || !midiFile) return
    const region = loopRegionRef.current
    if (!region) return
    const startSec = region.start * midiFile.duration
    const endSec   = region.end   * midiFile.duration
    const inRange = visibleNotes.filter(
      (n) => n.time >= startSec - 0.001 && n.time < endSec - 0.001
    )
    const total = inRange.length
    if (total === 0) { scoring.reset(); return }
    const s        = scoring.state
    if (s.success === 0 && s.missed === 0 && s.score === 0) return
    const accuracy = s.success / total
    const score    = Math.round(s.score)
    addScore(midiFile.name, {
      score, success: s.success, missed: s.missed,
      combosHits: s.combosHits, maxCombo: s.maxCombo,
      totalNotes: total, accuracy,
      mode, date: Date.now(),
      loopRegion: { startSec, endSec },
    })
    setScoreVersion((n) => n + 1)
    scoring.reset()
  }, [scoringActive, midiFile, mode, scoring, visibleNotes])

  // Turning challenge off mid-session wipes any in-progress score so the
  // counter doesn't bleed across the toggle.
  useEffect(() => {
    if (challengeEnabled) return
    scoring.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeEnabled])

  // ─── Hooks: playback engine ───────────────────────────────────────────────
  const { triggerFlash } = useFlashTimer({
    setNoteStates,
    onHit:    scoringActive ? scoring.onHit  : undefined,
    onMissed: scoringActive ? scoring.onMiss : undefined,
  })

  const { scheduleAudio } = useAudioScheduler({
    midiFile, isViewMode,
    isPlayingRef, currentTimeRef, bpmMultRef,
    visibleNotesRef, noteStatesRef, setNoteStates,
  })

  usePlayhead({
    midiFile, isViewMode, leadIn,
    isPlayingRef, currentTimeRef, bpmMultRef, lastRAFTime,
    loopEnabledRef, loopRegionRef, viewActiveRef, pressedMidi, holdingRef,
    visibleNotesRef, noteStatesRef,
    setCurrentTime, setNoteStates, setActiveKeys,
    triggerFlash,
    onMissed:   scoringActive ? scoring.onMiss : undefined,
    onSongEnd:  scoringActive ? handleSongEnd  : undefined,
    onLoopWrap: scoringActive ? handleLoopWrap : undefined,
  })

  const transport = useTransport({
    midiFile, isViewMode, leadIn,
    isPlayingRef, currentTimeRef, lastRAFTime,
    loopEnabledRef, loopRegionRef,
    pressedMidi, holdingRef, viewActiveRef, noteStatesRef,
    setIsPlaying, setCurrentTime, setNoteStates, setActiveKeys,
    scheduleAudio,
  })

  const handleInputBeat = useCallback(() => {
    lastInputAtRef.current = performance.now()
    setHintKeys((prev) => (prev.size ? new Set() : prev))
  }, [])

  const { handleNoteInput } = usePracticeInput({
    isViewMode, needsMelody,
    isPlayingRef, currentTimeRef, noteStatesRef, holdingRef,
    setActiveKeys, setNoteStates, setIsPlaying, triggerFlash,
    onInput: handleInputBeat,
    onWrongPress: scoringActive ? scoring.onWrongAt : undefined,
  })

  // Reset the idle clock when the user pauses/resumes or switches mode.  Same
  // intent as any other input: we don't want a stale 5-second-old clock to
  // immediately re-trigger the hint when play resumes.
  useEffect(() => {
    lastInputAtRef.current = performance.now()
    setHintKeys((prev) => (prev.size ? new Set() : prev))
  }, [isPlaying, mode])

  // Tick the idle check.  Cheap (one Map walk every 250 ms, only when playing
  // a practice mode), and cleared in view-listen since input is blocked.
  useEffect(() => {
    if (isViewMode) {
      setHintKeys((prev) => (prev.size ? new Set() : prev))
      return
    }
    const id = setInterval(() => {
      if (!isPlayingRef.current) return
      if (performance.now() - lastInputAtRef.current < IDLE_HINT_MS) return
      const next = new Set<number>()
      noteStatesRef.current.forEach((ns) => {
        if (ns.visual === 'active') next.add(ns.note.midi)
      })
      setHintKeys((prev) => {
        if (prev.size === next.size && [...next].every((m) => prev.has(m))) return prev
        return next
      })
    }, 250)
    return () => clearInterval(id)
  }, [isViewMode])

  const { modeTransitioning, modeFlash, handleModeChange } = useModeChange({
    mode, setMode, midiFile, modePrefs,
    isPlayingRef, currentTimeRef, lastRAFTime, pressedMidi, holdingRef, noteStatesRef,
    setIsPlaying, setCurrentTime, setNoteStates, setActiveKeys,
    setShowSheetMusic, setShowFallingNotes,
    scheduleAudio,
  })

  const swap = useViewSwap()

  // ─── Auto-play on mount (with optional countdown) ─────────────────────────
  useEffect(() => {
    if (!midiFile) return

    // Apply resume point if present — scoped per song so a bookmark from a
    // different MIDI doesn't leak in.
    const rp = resumePoints[midiFile.name]
    if (rp && rp.mode === mode) {
      // Round to the nearest preceding note onset so the resume lands cleanly.
      let best = 0
      for (const note of midiFile.notes) {
        if (note.time <= rp.time && note.time > best) best = note.time
      }
      transport.seek(best)
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
          transport.play()
        }
      }, 1000)
      return () => clearInterval(interval)
    } else {
      const t = setTimeout(() => transport.play(), 300)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // mount only

  // ─── Misc handlers (BPM, metronome, loop, countdown, view toggles) ────────
  const handleBpmChange = useCallback((val: number) => {
    setBpmMult(val)
    bpmMultRef.current = val

    if (isPlayingRef.current && isViewMode) {
      // Only stop future-scheduled nodes; currently-playing notes continue
      // uninterrupted (no re-attack, no double).
      audioEngine.stopFutureNodes()

      // Reset scheduled flag on future notes so the next scheduleAudio tick
      // re-schedules them at the new BPM.
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

    // Update metronome tempo without restarting (restart causes a double-click).
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
        setLoopRegion(null)
        loopRegionRef.current = null
        loopEnabledRef.current = false
        return false
      }
      if (!loopRegion && midiFile) {
        const start = Math.max(0, (currentTimeRef.current - 5)  / midiFile.duration)
        const end   = Math.min(1, (currentTimeRef.current + 15) / midiFile.duration)
        setLoopRegion({ start, end })
        loopRegionRef.current = { start, end }
      }
      loopEnabledRef.current = true
      return true
    })
  }, [loopRegion, midiFile])

  const handleLoopChange = useCallback((region: LoopRegion | null) => {
    setLoopRegion(region)
    loopRegionRef.current = region
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

  // ─── Volume / Zoom / Measure lines ────────────────────────────────────────
  const [volume,       setVolume]       = useState(() => audioEngine.getVolume())
  const prevVolumeRef                   = useRef(audioEngine.getVolume())
  const [zoom,         setZoom]         = useState(1.0)
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
  const handleZoomChange         = useCallback((val: number) => setZoom(val), [])
  const handleMeasureLinesToggle = useCallback(() => setMeasureLines(v => !v), [])

  // Keyboard size — cycles 88 → 76 → 61 → 88.  Default 88 (full piano).
  // When a real MIDI piano is connected, lock the size to whatever we can
  // infer from the device name (digits "88" / "76" / "61"); otherwise stay
  // on the user's last manual choice.  Persisted to localStorage so the
  // setting survives song changes (PracticePage unmount) and app restarts.
  const [manualKeyCount, setManualKeyCount] = useState<KeyCount>(() => {
    const raw = localStorage.getItem('keyCount')
    const n = Number(raw)
    return (KEY_COUNTS as number[]).includes(n) ? (n as KeyCount) : 88
  })
  const { connectedId, devices } = useMidi()
  const connectedDeviceName = useMemo(
    () => (connectedId ? devices.find(d => d.id === connectedId)?.name ?? null : null),
    [connectedId, devices],
  )
  const keyCountLocked = connectedId !== null
  const keyCount: KeyCount = keyCountLocked
    ? detectKeyCountFromName(connectedDeviceName)
    : manualKeyCount
  const handleKeyCountChange = useCallback(() => {
    setManualKeyCount((prev) => {
      const i = KEY_COUNTS.indexOf(prev)
      const next = KEY_COUNTS[(i + 1) % KEY_COUNTS.length]
      localStorage.setItem('keyCount', String(next))
      return next
    })
  }, [])

  // ─── View-swap toggles (animated sheet ↔ falling notes) ───────────────────
  const handleSheetMusicToggle = useCallback(() => {
    swap.beginSwap(() => {
      setShowSheetMusic((v) => {
        const next = !v
        if (midiFile) setModePrefs(modePrefsKey(midiFile.name, mode), { showSheetMusic: next })
        return next
      })
    })
  }, [swap, mode, midiFile, setModePrefs])
  const handleFallingNotesToggle = useCallback(() => {
    setShowFallingNotes((v) => {
      const next = !v
      if (midiFile) setModePrefs(modePrefsKey(midiFile.name, mode), { showFallingNotes: next })
      return next
    })
  }, [mode, midiFile, setModePrefs])

  const handleBack = useCallback(() => {
    if (midiFile) setResumePoint(midiFile.name, { time: currentTimeRef.current, mode })
    transport.stop()
    audioEngine.stopMetronome()
    navigate('/mode')
  }, [transport, navigate, mode, midiFile, setResumePoint])

  // Bumped after each score save (end-of-song or loop wrap) so popovers /
  // child views know to refetch from the leaderboard store.
  const [scoreVersion, setScoreVersion] = useState(0)

  // Header restart counts as a "new attempt" — wipe the live counter so
  // the rerun starts from zero.  The save already happened on the prior
  // song wrap, so there's nothing to commit here.
  const handleHeaderRestart = useCallback(() => {
    if (scoringActive) scoring.reset()
    transport.handleRestart()
  }, [scoringActive, scoring, transport])

  // Mode switch rebuilds note states and changes which notes count toward the
  // score — reset the live counter so the new mode starts from 0.
  useEffect(() => {
    scoring.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Cleanup on unmount — flash timers cleaned by useFlashTimer itself.
  useEffect(() => () => { audioEngine.stopMetronome() }, [])

  // Save current playhead to localStorage on window close.  React state updates
  // won't flush during `beforeunload`, so we write straight to localStorage
  // using the same key AppContext owns.
  useEffect(() => {
    if (!midiFile) return
    const flush = (): void => {
      const prev = loadJSON<Record<string, unknown>>(LS.RESUME_POINTS, {}, isPlainObject)
      const next = { ...prev, [midiFile.name]: { time: currentTimeRef.current, mode } }
      try { localStorage.setItem(LS.RESUME_POINTS, JSON.stringify(next)) } catch { /* quota */ }
    }
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide',     flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('pagehide',     flush)
    }
  }, [midiFile, mode])

  // ─── Guard (all hooks must run before this) ───────────────────────────────
  if (!practiceSettings || !midiFile) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500 dark:bg-slate-950 dark:text-slate-400">
        {t('redirecting')}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-slate-200 dark:bg-slate-950 overflow-hidden">
      <style>{PRACTICE_TRANSITION_STYLE}</style>

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
        keyCount={keyCount}
        keyCountLocked={keyCountLocked}
        challengeEnabled={isViewMode ? undefined : challengeEnabled}
        scoreVersion={scoreVersion}
        onBack={handleBack}
        onPlayPause={transport.handlePlayPause}
        onRestart={handleHeaderRestart}
        onRewind={transport.handleRewind}
        onFastForward={transport.handleFastForward}
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
        onKeyCountChange={handleKeyCountChange}
        onChallengeToggle={isViewMode ? undefined : () => setChallengeEnabled(!challengeEnabled)}
      />

      <ProgressBar
        duration={midiFile.duration}
        // Clamp to ≥ 0 so the bar reads "0:00" during the leadIn runway —
        // the user perceives "paused at the start" rather than negative time.
        currentTime={Math.max(0, currentTime)}
        loopRegion={loopRegion}
        onSeek={transport.seek}
        onLoopChange={handleLoopChange}
      />

      {/* Main content — sheet music OR falling notes + transition overlays. */}
      <div className="relative flex-1 min-h-0 flex flex-col">
        {/* Two animation layers:
              SHELL  — slides on view swap (translateX only; scale would
                       break FallingNotes' canvas resize).
              CONTENT— fades slightly later than the shell.
            On top: mode-switch dim — children DON'T unmount, so SheetMusic
            keeps its cached OSMD instance through the transition. */}
        <div
          className={[
            'flex-1 min-h-0 flex flex-col transition-opacity duration-200 ease-out',
            modeTransitioning ? 'opacity-0' : 'opacity-100',
            swap.phase === 'leaving'  ? 'shell-leaving'  : '',
            swap.phase === 'entering' ? 'shell-entering' : '',
          ].join(' ')}
        >
          <div
            className={[
              'flex-1 min-h-0 flex flex-col',
              swap.phase === 'leaving'  ? 'content-leaving'  : '',
              swap.phase === 'entering' ? 'content-entering' : '',
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
                  keyCount={keyCount}
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
              className="px-6 py-3 rounded-2xl bg-white/90 text-slate-900 dark:bg-slate-900/80 dark:text-white backdrop-blur border border-blue-400/30 shadow-2xl text-lg font-semibold select-none"
              style={{
                animation: 'modeFlash 1.0s cubic-bezier(0.16,1,0.3,1) forwards',
                boxShadow: '0 0 40px rgba(80,140,255,0.45)',
              }}
            >
              {MODE_FLASH_KEYS[modeFlash] ? t(MODE_FLASH_KEYS[modeFlash]) : modeFlash}
            </div>
          </div>
        )}

        {/* Countdown overlay (3-2-1 → play) */}
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className="text-slate-900 dark:text-white font-bold select-none flex items-center justify-center"
              style={{ fontSize: 120, lineHeight: 1, textShadow: '0 0 60px rgba(100,160,255,0.8), 0 0 20px rgba(100,160,255,0.5)' }}
            >
              {countdown > 0 ? countdown : <PlayIcon className="w-[110px] h-[110px]" />}
            </div>
          </div>
        )}
      </div>

      {/* Decorative separator above the keyboard. */}
      <div className="relative h-0 pointer-events-none select-none z-10">
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-blue-400/70 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-blue-500/25 via-blue-500/5 to-transparent" />
      </div>

      <PianoKeyboard
        activeKeys={activeKeys}
        hintKeys={hintKeys}
        onKeyDown={isViewMode ? undefined : (midi) => handleNoteInput(midi, 0.8, true)}
        onKeyUp={isViewMode   ? undefined : (midi) => handleNoteInput(midi, 0, false)}
        height={KEYBOARD_HEIGHT}
        keyCount={keyCount}
      />

    </div>
  )
}
