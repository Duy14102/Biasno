import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext, modePrefsKey } from '../context/AppContext'
import { audioEngine }          from '../audio/AudioEngine'
import { useAudioEngine }       from '../hooks/useAudioEngine'
import { useAudioScheduler }    from '../practice/useAudioScheduler'
import { usePracticeInput }     from '../practice/usePracticeInput'
import { useViewSwap }          from '../practice/useViewSwap'
import { useFlashTimer }        from '../practice/useFlashTimer'
import { usePlayhead }          from '../practice/usePlayhead'
import { useTransport }         from '../practice/useTransport'
import { useModeChange }        from '../practice/useModeChange'
import {
  KEYBOARD_HEIGHT, NOTE_LOOK_AHEAD_S,
  LEAD_IN_TARGET, PRACTICE_TRANSITION_STYLE,
} from '../practice/constants'
import { useLanguage } from '../i18n/LanguageContext'
import { MODE_FLASH_KEYS } from '../i18n/modeFlashKey'
import type { NoteState } from '../practice/noteState'
import PianoKeyboard  from '../components/keyboard/PianoKeyboard'
import FallingNotes, { type NoteRenderState } from '../components/falling/FallingNotes'
import SheetMusic     from '../components/sheet/SheetMusic'
import ProgressBar    from '../components/ProgressBar'
import PracticeHeader from '../components/header/PracticeHeader'
import type { MidiNote, LoopRegion, Hand, PracticeMode } from '../types'
import { getActiveHands, requiresMelody } from '../utils/midiUtils'

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

  // ─── Hooks: playback engine ───────────────────────────────────────────────
  const { triggerFlash } = useFlashTimer({ setNoteStates })

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
  })

  const transport = useTransport({
    midiFile, isViewMode, leadIn,
    isPlayingRef, currentTimeRef, lastRAFTime,
    loopEnabledRef, loopRegionRef,
    pressedMidi, holdingRef, viewActiveRef, noteStatesRef,
    setIsPlaying, setCurrentTime, setNoteStates, setActiveKeys,
    scheduleAudio,
  })

  const { handleNoteInput } = usePracticeInput({
    isViewMode, needsMelody,
    isPlayingRef, currentTimeRef, noteStatesRef, holdingRef,
    setActiveKeys, setNoteStates, setIsPlaying, triggerFlash,
  })

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

  // Cleanup on unmount — flash timers cleaned by useFlashTimer itself.
  useEffect(() => () => { audioEngine.stopMetronome() }, [])

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
        onBack={handleBack}
        onPlayPause={transport.handlePlayPause}
        onRestart={transport.handleRestart}
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

        {/* Countdown overlay (3-2-1 → ▶) */}
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className="text-slate-900 dark:text-white font-bold select-none"
              style={{ fontSize: 120, lineHeight: 1, textShadow: '0 0 60px rgba(100,160,255,0.8), 0 0 20px rgba(100,160,255,0.5)' }}
            >
              {countdown > 0 ? countdown : '▶'}
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
        onKeyDown={isViewMode ? undefined : (midi) => handleNoteInput(midi, 0.8, true)}
        onKeyUp={isViewMode   ? undefined : (midi) => handleNoteInput(midi, 0, false)}
        height={KEYBOARD_HEIGHT}
      />
    </div>
  )
}
