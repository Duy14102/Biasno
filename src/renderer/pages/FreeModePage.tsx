import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAudioEngine } from '@/hooks'
import { useLanguage } from '@/i18n'
import { useMidi } from '@/context'
import { audioEngine } from '@/audio'
import { useFreeMode } from '@/freeMode'
import { useFreePlayback } from '@/freeMode'
import { buildMidi, buildMusicXml, buildSheetHtml } from '@/freeMode'
import {
  listEntries, getEntry, createEntry, updateEntry, deleteEntry,
  type LibraryEntry,
} from '@/freeMode'
import { FreeModeHeader } from '@/components/freeMode'
import { RecorderPanel }  from '@/components/freeMode'
import { LibraryModal }   from '@/components/freeMode'
import { ClearConfirmModal } from '@/components/freeMode'
import { PianoKeyboard }  from '@/components/keyboard'
import { PlayIcon }       from '@/components/header'
import { KEY_COUNTS, detectKeyCountFromName, type KeyCount } from '@/utils'
import { KEYBOARD_HEIGHT } from '@/practice'
import type { Hand } from '@/types'
import type { FreeSnapshot } from '@/freeMode'

const DEFAULT_BPM = 120

const LS_COUNTDOWN     = 'freeCountdownEnabled'
const LS_METRONOME     = 'freeMetronomeEnabled'
const LS_MEASURE_LINES = 'freeMeasureLines'

const KEY_MAP: Record<string, number> = {
  'z': 48, 's': 49, 'x': 50, 'd': 51, 'c': 52,
  'v': 53, 'g': 54, 'b': 55, 'h': 56, 'n': 57,
  'j': 58, 'm': 59, ',': 60, 'l': 61, '.': 62,
  ';': 63, '/': 64,
  'q': 65, '2': 66, 'w': 67, '3': 68, 'e': 69,
  '4': 70, 'r': 71, 't': 72, '6': 73, 'y': 74,
  '7': 75, 'u': 76, 'i': 77, '9': 78, 'o': 79,
  '0': 80, 'p': 81,
}

function sanitizeFileName(s: string): string {
  const cleaned = s.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned || 'recording'
}

export default function FreeModePage(): React.JSX.Element {
  useAudioEngine()
  const { t } = useLanguage()
  const navigate = useNavigate()

  // ─── Library state ─────────────────────────────────────────────────
  const [entries, setEntries]     = useState<LibraryEntry[]>(() => listEntries())
  const [activeId, setActiveId]   = useState<string | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const refreshEntries = useCallback(() => setEntries(listEntries()), [])

  const [fileName, setFileName] = useState('recording')
  const [author,   setAuthor]   = useState('')
  const [busyExport, setBusyExport] = useState<null | 'midi' | 'xml' | 'pdf'>(null)
  const [activeKeys, setActiveKeys] = useState<Map<number, { hand: Hand; time?: number }>>(() => new Map())
  const [speed, setSpeed] = useState(1)

  // ─── Recorder ──────────────────────────────────────────────────────
  // On stop: persist the take to the library so Clear can't lose it.
  // Continue extends the active entry in place (one library row per piece);
  // a fresh Record creates a new entry — the previous take stays preserved.
  // activeIdRef so the callback sees the latest id without needing it in deps
  // (which would re-bind the callback on every entry update).
  const activeIdRef = useRef<string | null>(null)
  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  const handleAfterStop = useCallback((snap: FreeSnapshot, hadNotes: boolean, continued: boolean) => {
    if (!hadNotes) return
    const currentId = activeIdRef.current
    if (continued && currentId) {
      updateEntry(currentId, {
        name: fileName,
        author,
        notes: snap.notes,
        durationMs: snap.durationMs,
        trimStartMs: snap.trimStartMs,
        trimEndMs:   snap.trimEndMs,
        clips:       snap.clips,
      })
      refreshEntries()
      return
    }
    const entry = createEntry({
      name: fileName,
      author,
      notes: snap.notes,
      durationMs: snap.durationMs,
      trimStartMs: snap.trimStartMs,
      trimEndMs:   snap.trimEndMs,
      clips:       snap.clips,
    })
    setActiveId(entry.id)
    refreshEntries()
  }, [fileName, author, refreshEntries])

  const handleAfterClear = useCallback(() => {
    // The library entry stays; just detach so future edits don't write back
    // to it.  User can reload from the Library button.
    setActiveId(null)
  }, [])

  const freeMode = useFreeMode({ onAfterStop: handleAfterStop, onAfterClear: handleAfterClear })
  const {
    isRecording, snapshot, canUndo, canRedo,
    startRecord, continueRecord, stopRecord, clear, playInput,
    setTrimStart, setTrimEnd, undo, redo, replaceSnapshot,
    splitClipAt, deleteClipAt, setClipVolumeAt, toggleLockAt,
    setClipCommentAt, copyClipAt, pasteClipAt, moveClipTo, clipboard,
  } = freeMode

  // When the bar has no splits (clips.length ≤ 1, including the implicit
  // default), a Delete from the context menu means "wipe the whole
  // recording" — same as the trash button outside the bar.  Confirm via a
  // modal before calling clear(); otherwise just remove that one clip.
  const [pendingWholeDelete, setPendingWholeDelete] = useState(false)
  const handleClipDelete = useCallback((atMs: number) => {
    if (snapshot.clips.length <= 1) {
      setPendingWholeDelete(true)
    } else {
      deleteClipAt(atMs)
    }
  }, [snapshot.clips.length, deleteClipAt])

  const clipActions = useMemo(() => ({
    onSplit:      splitClipAt,
    onCopy:       copyClipAt,
    onPaste:      pasteClipAt,
    onDelete:     handleClipDelete,
    onSetComment: setClipCommentAt,
    onSetVolume:  setClipVolumeAt,
    onToggleLock: toggleLockAt,
  }), [splitClipAt, copyClipAt, pasteClipAt, handleClipDelete, setClipCommentAt, setClipVolumeAt, toggleLockAt])

  // ─── Live-update library entry on field / trim changes ─────────────
  // Skips the very first render after a load — that's how we avoid
  // immediately bumping updatedAt for entries the user just opened.
  const skipNextWriteRef = useRef(false)
  useEffect(() => {
    if (activeId === null) return
    if (skipNextWriteRef.current) { skipNextWriteRef.current = false; return }
    updateEntry(activeId, {
      name: fileName, author,
      notes: snapshot.notes,
      durationMs: snapshot.durationMs,
      trimStartMs: snapshot.trimStartMs,
      trimEndMs:   snapshot.trimEndMs,
      clips:       snapshot.clips,
    })
    refreshEntries()
  }, [activeId, fileName, author, snapshot, refreshEntries])

  // ─── Trim drag state ───────────────────────────────────────────────
  // Local drafts so dragging is smooth and the history only records on commit.
  const [draftStart, setDraftStart] = useState(snapshot.trimStartMs)
  const [draftEnd,   setDraftEnd]   = useState(snapshot.trimEndMs)
  useEffect(() => { setDraftStart(snapshot.trimStartMs) }, [snapshot.trimStartMs])
  useEffect(() => { setDraftEnd  (snapshot.trimEndMs)   }, [snapshot.trimEndMs])

  // ─── Live duration counter during recording ────────────────────────
  const [liveRecordMs, setLiveRecordMs] = useState(0)
  const recordStartedAtRef = useRef(0)
  useEffect(() => {
    if (!isRecording) { setLiveRecordMs(0); return }
    recordStartedAtRef.current = performance.now()
    const id = setInterval(() => {
      setLiveRecordMs(performance.now() - recordStartedAtRef.current)
    }, 100)
    return () => clearInterval(id)
  }, [isRecording])

  // ─── Playback ──────────────────────────────────────────────────────
  const onActive = useCallback((live: Set<number>) => {
    setActiveKeys((prev) => {
      const next = new Map<number, { hand: Hand; time?: number }>()
      live.forEach((midi) => {
        next.set(midi, {
          hand: midi < 60 ? 'left' : 'right',
          time: prev.get(midi)?.time ?? performance.now() / 1000,
        })
      })
      return next
    })
  }, [])

  const playback = useFreePlayback({ snapshot, speed, onActive })

  const handleInput = useCallback((midi: number, velocity: number, on: boolean) => {
    playInput(midi, velocity, on)
    setActiveKeys((prev) => {
      const next = new Map(prev)
      if (on) next.set(midi, { hand: midi < 60 ? 'left' : 'right', time: performance.now() / 1000 })
      else    next.delete(midi)
      return next
    })
  }, [playInput])

  useEffect(() => {
    const pressed = new Set<string>()
    const onDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return
      if (playback.isPlaying) return
      const midi = KEY_MAP[e.key.toLowerCase()]
      if (midi !== undefined && !pressed.has(e.key)) {
        pressed.add(e.key)
        handleInput(midi, 0.8, true)
      }
    }
    const onUp = (e: KeyboardEvent) => {
      const midi = KEY_MAP[e.key.toLowerCase()]
      if (midi !== undefined) {
        pressed.delete(e.key)
        handleInput(midi, 0, false)
      }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup',   onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup',   onUp)
    }
  }, [handleInput, playback.isPlaying])

  // ─── Keyboard size ─────────────────────────────────────────────────
  const { connectedId, devices } = useMidi()
  const [manualKeyCount, setManualKeyCount] = useState<KeyCount>(() => {
    const raw = localStorage.getItem('keyCount')
    const n = Number(raw)
    return (KEY_COUNTS as number[]).includes(n) ? (n as KeyCount) : 88
  })
  const connectedDeviceName = useMemo(
    () => (connectedId ? devices.find(d => d.id === connectedId)?.name ?? null : null),
    [connectedId, devices],
  )
  const keyCount: KeyCount = connectedId !== null
    ? detectKeyCountFromName(connectedDeviceName)
    : manualKeyCount
  const handleKeyCountChange = useCallback((n: KeyCount) => {
    setManualKeyCount(n)
    localStorage.setItem('keyCount', String(n))
  }, [])

  // ─── Settings (persisted) ─────────────────────────────────────────
  const [countdownEnabled, setCountdownEnabled] = useState<boolean>(
    () => localStorage.getItem(LS_COUNTDOWN) === 'true',
  )
  const [metronomeEnabled, setMetronomeEnabled] = useState<boolean>(
    () => localStorage.getItem(LS_METRONOME) === 'true',
  )
  const [measureLinesEnabled, setMeasureLinesEnabled] = useState<boolean>(
    () => localStorage.getItem(LS_MEASURE_LINES) !== 'false', // default on
  )

  const handleCountdownToggle = useCallback(() => {
    setCountdownEnabled((prev) => {
      const next = !prev
      localStorage.setItem(LS_COUNTDOWN, String(next))
      return next
    })
  }, [])

  const handleMetronomeToggle = useCallback(() => {
    setMetronomeEnabled((prev) => {
      const next = !prev
      localStorage.setItem(LS_METRONOME, String(next))
      if (next) audioEngine.startMetronome(DEFAULT_BPM, 4)
      else      audioEngine.stopMetronome()
      return next
    })
  }, [])

  const handleMeasureLinesToggle = useCallback(() => {
    setMeasureLinesEnabled((prev) => {
      const next = !prev
      localStorage.setItem(LS_MEASURE_LINES, String(next))
      return next
    })
  }, [])

  // ─── Countdown before recording ───────────────────────────────────
  const [countdown, setCountdown] = useState<number | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    setCountdown(null)
  }, [])

  const beginRecordWithCountdown = useCallback((startFn: () => void) => {
    if (!countdownEnabled) { startFn(); return }
    cancelCountdown()
    let n = 3
    setCountdown(n)
    countdownTimerRef.current = setInterval(() => {
      n--
      if (n > 0) {
        setCountdown(n)
      } else {
        cancelCountdown()
        startFn()
      }
    }, 1000)
  }, [countdownEnabled, cancelCountdown])

  const handleStartRecord  = useCallback(() => beginRecordWithCountdown(startRecord),    [beginRecordWithCountdown, startRecord])
  const handleContinueRec  = useCallback(() => beginRecordWithCountdown(continueRecord), [beginRecordWithCountdown, continueRecord])

  // Stop the metronome + any pending countdown on unmount so they don't leak
  // off-page.
  useEffect(() => () => {
    audioEngine.stopMetronome()
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
  }, [])

  // ─── Library actions ───────────────────────────────────────────────
  const handleLoad = useCallback((id: string) => {
    const entry = getEntry(id)
    if (!entry) return
    skipNextWriteRef.current = true   // avoid bumping updatedAt on the very next effect tick
    replaceSnapshot({
      notes: entry.notes,
      durationMs: entry.durationMs,
      trimStartMs: entry.trimStartMs,
      trimEndMs:   entry.trimEndMs,
      clips:       entry.clips ?? [],
    })
    setFileName(entry.name)
    setAuthor(entry.author)
    setActiveId(entry.id)
    setLibraryOpen(false)
    playback.stop()
  }, [replaceSnapshot, playback])

  const handleDelete = useCallback((id: string) => {
    deleteEntry(id)
    if (activeId === id) {
      setActiveId(null)
    }
    refreshEntries()
  }, [activeId, refreshEntries])

  // ─── Export ────────────────────────────────────────────────────────
  const onExportMidi = useCallback(async () => {
    if (busyExport) return
    setBusyExport('midi')
    try {
      const buf = buildMidi(snapshot, DEFAULT_BPM)
      await window.electronAPI.saveBuffer(sanitizeFileName(fileName) + '.mid', 'mid', buf)
    } catch (e) {
      console.error('[freeMode] MIDI export failed', e)
      alert(t('freeExportFailed'))
    } finally { setBusyExport(null) }
  }, [snapshot, fileName, busyExport, t])

  const onExportXml = useCallback(async () => {
    if (busyExport) return
    setBusyExport('xml')
    try {
      const xml = buildMusicXml(snapshot, DEFAULT_BPM)
      if (!xml) return
      await window.electronAPI.saveText(sanitizeFileName(fileName) + '.musicxml', 'musicxml', xml)
    } catch (e) {
      console.error('[freeMode] MusicXML export failed', e)
      alert(t('freeExportFailed'))
    } finally { setBusyExport(null) }
  }, [snapshot, fileName, busyExport, t])

  const onExportPdf = useCallback(async () => {
    if (busyExport) return
    setBusyExport('pdf')
    try {
      const title = sanitizeFileName(fileName)
      const html  = await buildSheetHtml(snapshot, title, author.trim(), DEFAULT_BPM)
      if (!html) { alert(t('freeExportFailed')); return }
      await window.electronAPI.savePdfFromHtml(title + '.pdf', html)
    } catch (e) {
      console.error('[freeMode] PDF export failed', e)
      alert(t('freeExportFailed'))
    } finally { setBusyExport(null) }
  }, [snapshot, fileName, author, busyExport, t])

  // ─── Cleanup ───────────────────────────────────────────────────────
  const handleBack = useCallback(() => {
    playback.stop()
    if (isRecording) stopRecord()
    navigate('/')
  }, [playback, isRecording, stopRecord, navigate])

  // Restore the master gain on mount — PracticePage's stopAll() (called when
  // the user navigates away from a song) deliberately leaves it at 0 with
  // the expectation that the next page will restore.  Without this, the
  // first key press / Play in Free Mode after Practice produces no sound.
  useEffect(() => { audioEngine.restoreVolume() }, [])

  useEffect(() => () => {
    audioEngine.stopAll()
    audioEngine.restoreVolume()
  }, [])

  return (
    <div className="flex flex-col h-screen bg-slate-200 dark:bg-slate-950 overflow-hidden">
      <FreeModeHeader
        onBack={handleBack}
        onOpenLibrary={() => setLibraryOpen(true)}
        libraryCount={entries.length}
        keyCount={keyCount}
        keyCountLocked={connectedId !== null}
        onKeyCountChange={handleKeyCountChange}
        countdownEnabled={countdownEnabled}
        onCountdownToggle={handleCountdownToggle}
        metronomeEnabled={metronomeEnabled}
        onMetronomeToggle={handleMetronomeToggle}
        measureLinesEnabled={measureLinesEnabled}
        onMeasureLinesToggle={handleMeasureLinesToggle}
      />

      <RecorderPanel
        isRecording={isRecording}
        isPlaying={playback.isPlaying}
        snapshot={snapshot}
        fileName={fileName}
        setFileName={setFileName}
        author={author}
        setAuthor={setAuthor}
        canUndo={canUndo}
        canRedo={canRedo}
        onRecord={handleStartRecord}
        onContinue={handleContinueRec}
        onStop={stopRecord}
        onPlay={playback.play}
        onPlayStop={playback.stop}
        playbackMs={playback.headMs}
        onSeek={playback.seek}
        speed={speed}
        onSpeedChange={setSpeed}
        onClear={clear}
        onUndo={undo}
        onRedo={redo}
        onDraftStart={setDraftStart}
        onDraftEnd={setDraftEnd}
        onCommitStart={setTrimStart}
        onCommitEnd={setTrimEnd}
        draftStartMs={draftStart}
        draftEndMs={draftEnd}
        onExportMidi={onExportMidi}
        onExportXml={onExportXml}
        onExportPdf={onExportPdf}
        liveRecordMs={liveRecordMs}
        busyExport={busyExport}
        hasClipboard={clipboard !== null}
        clipActions={clipActions}
        onMoveClip={moveClipTo}
        sessionKey={activeId ?? 'draft'}
        showMeasureLines={measureLinesEnabled}
      />

      <div className="relative h-0 pointer-events-none select-none z-10">
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-blue-400/70 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-blue-500/25 via-blue-500/5 to-transparent" />
      </div>

      <PianoKeyboard
        activeKeys={activeKeys}
        onKeyDown={(midi) => handleInput(midi, 0.8, true)}
        onKeyUp={(midi)   => handleInput(midi, 0, false)}
        height={KEYBOARD_HEIGHT}
        keyCount={keyCount}
      />

      <button
        onClick={() => {
          if (connectedId !== null) return
          const i = KEY_COUNTS.indexOf(manualKeyCount)
          handleKeyCountChange(KEY_COUNTS[(i + 1) % KEY_COUNTS.length])
        }}
        title={`${keyCount} ${t('keys')}`}
        className="fixed bottom-3 right-3 px-2 py-1 rounded-md bg-slate-800/70 hover:bg-slate-700/80 text-white text-[10px] font-mono backdrop-blur-sm"
      >
        {keyCount}
      </button>

      {countdown !== null && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
          <div
            className="text-slate-900 dark:text-white font-bold select-none flex items-center justify-center"
            style={{ fontSize: 120, lineHeight: 1, textShadow: '0 0 60px rgba(100,160,255,0.8), 0 0 20px rgba(100,160,255,0.5)' }}
          >
            {countdown > 0 ? countdown : <PlayIcon className="w-[110px] h-[110px]" />}
          </div>
        </div>
      )}

      {libraryOpen && (
        <LibraryModal
          entries={entries}
          activeId={activeId}
          onClose={() => setLibraryOpen(false)}
          onLoad={handleLoad}
          onDelete={handleDelete}
        />
      )}

      {pendingWholeDelete && (
        <ClearConfirmModal
          name={fileName}
          onCancel={() => setPendingWholeDelete(false)}
          onConfirm={() => { setPendingWholeDelete(false); clear() }}
        />
      )}
    </div>
  )
}
