import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAudioEngine } from '@/hooks'
import { useLanguage } from '@/i18n'
import { useMidi } from '@/context'
import { audioEngine } from '@/audio'
import { useRecorder } from '@/freeMode'
import { useFreePlayback } from '@/freeMode'
import { buildMidi, buildMusicXml, buildSheetHtml } from '@/freeMode'
import {
  listEntries, getEntry, createEntry, updateEntry, deleteEntry,
  type LibraryEntry,
} from '@/freeMode'
import { FreeModeHeader } from '@/components/freeMode'
import { RecorderPanel }  from '@/components/freeMode'
import { LibraryModal }   from '@/components/freeMode'
import { PianoKeyboard }  from '@/components/keyboard'
import { KEY_COUNTS, detectKeyCountFromName, type KeyCount } from '@/utils'
import { KEYBOARD_HEIGHT } from '@/practice'
import type { Hand } from '@/types'
import type { FreeSnapshot } from '@/freeMode'

const DEFAULT_BPM = 120

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
  // On stop: persist the take to the library so Clear can't lose it.  The
  // id is held in activeId — subsequent edits (trim, name, author) update
  // the same entry in place.
  const handleAfterStop = useCallback((snap: FreeSnapshot, hadNotes: boolean) => {
    if (!hadNotes) return
    const entry = createEntry({
      name: fileName,
      author,
      notes: snap.notes,
      durationMs: snap.durationMs,
      trimStartMs: snap.trimStartMs,
      trimEndMs:   snap.trimEndMs,
    })
    setActiveId(entry.id)
    refreshEntries()
  }, [fileName, author, refreshEntries])

  const handleAfterClear = useCallback(() => {
    // The library entry stays; just detach so future edits don't write back
    // to it.  User can reload from the Library button.
    setActiveId(null)
  }, [])

  const recorder = useRecorder({ onAfterStop: handleAfterStop, onAfterClear: handleAfterClear })
  const {
    isRecording, snapshot, canUndo, canRedo,
    startRecord, continueRecord, stopRecord, clear, playInput,
    setTrimStart, setTrimEnd, undo, redo, replaceSnapshot,
  } = recorder

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
        onRecord={startRecord}
        onContinue={continueRecord}
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
          setManualKeyCount((prev) => {
            const i = KEY_COUNTS.indexOf(prev)
            const next = KEY_COUNTS[(i + 1) % KEY_COUNTS.length]
            localStorage.setItem('keyCount', String(next))
            return next
          })
        }}
        title={`${keyCount} ${t('keys')}`}
        className="fixed bottom-3 right-3 px-2 py-1 rounded-md bg-slate-800/70 hover:bg-slate-700/80 text-white text-[10px] font-mono backdrop-blur-sm"
      >
        {keyCount}
      </button>

      {libraryOpen && (
        <LibraryModal
          entries={entries}
          activeId={activeId}
          onClose={() => setLibraryOpen(false)}
          onLoad={handleLoad}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
