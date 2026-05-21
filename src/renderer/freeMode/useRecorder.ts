// Recording capture + trim-edit undo/redo for Free Mode.
//
// Listens to MidiContext (real piano) and the on-screen keyboard via a
// returned `playInput` callback.  Computer-keyboard fallback piggy-backs on
// the same shared listener that PracticePage uses — wired in FreeModePage.
//
// History scope: trim-start / trim-end commits only.  Stop-record and clear
// REPLACE the snapshot without history (each is its own "session boundary"),
// so Undo right after Stop won't wipe the take, and Undo after Clear isn't
// meaningful since the cleared recording is preserved in the library anyway.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMidi } from '@/context'
import { audioEngine } from '@/audio'
import type { FreeSnapshot, RecordedNote } from './types'

const EMPTY: FreeSnapshot = {
  notes: [], durationMs: 0, trimStartMs: 0, trimEndMs: 0,
}

export interface RecorderApi {
  // State
  isRecording:  boolean
  snapshot:     FreeSnapshot
  canUndo:      boolean
  canRedo:      boolean
  // Capture
  startRecord:    () => void
  // Append onto the existing recording: keeps current notes intact and lines
  // up the timer so the next keypress lands just after `durationMs`.
  continueRecord: () => void
  stopRecord:     () => void
  clear:          () => void
  // Drives the keyboard's live-feedback colours during recording / preview.
  playInput:    (midi: number, velocity: number, on: boolean) => void
  // Trim editing (history-tracked on commit)
  setTrimStart: (ms: number) => void
  setTrimEnd:   (ms: number) => void
  // History
  undo: () => void
  redo: () => void
  // Replace the working draft from an external source (e.g. library load).
  // Resets history stacks; does NOT fire onAfterStop.
  replaceSnapshot: (snap: FreeSnapshot) => void
}

interface Options {
  // Fires immediately after a recording is stopped, with the just-captured
  // snapshot.  hadNotes is false when nothing was actually played.
  // continued = the take was started via continueRecord (extends an existing
  // library entry); false = fresh take that should land as a new entry.
  onAfterStop?: (snap: FreeSnapshot, hadNotes: boolean, continued: boolean) => void
  // Fires when the working draft is wiped via clear().
  onAfterClear?: () => void
}

export function useRecorder(opts: Options = {}): RecorderApi {
  const { onAfterStop, onAfterClear } = opts

  const [snapshot,    setSnapshot]    = useState<FreeSnapshot>(EMPTY)
  const [isRecording, setIsRecording] = useState(false)

  const pastRef   = useRef<FreeSnapshot[]>([])
  const futureRef = useRef<FreeSnapshot[]>([])
  // The "clean" baseline — set by stopRecord and replaceSnapshot.  When the
  // user trims and then returns to the baseline values, history is wiped so
  // Undo / Redo go inactive instead of staying lit at a no-op state.
  const baselineRef = useRef<FreeSnapshot | null>(null)
  const [, forceHistoryVersion] = useState(0)
  const bumpHistory = useCallback(() => forceHistoryVersion(v => v + 1), [])

  // Two snapshots match for the purposes of "are we at the baseline" when the
  // trim window is identical.  Notes / durationMs are immutable for the life
  // of a take, so trim is the only axis that ever changes.
  const matchesBaseline = (s: FreeSnapshot): boolean => {
    const b = baselineRef.current
    return !!b
        && b.notes === s.notes
        && b.trimStartMs === s.trimStartMs
        && b.trimEndMs   === s.trimEndMs
  }

  // Mid-recording state in refs so MIDI listener closures stay fresh.
  const recStartRef = useRef<number>(0)
  const openRef     = useRef<Map<number, RecordedNote>>(new Map())
  const liveNotes   = useRef<RecordedNote[]>([])
  const isRecordingRef = useRef(false)
  const idRef = useRef(0)
  // Tracks whether the current take is an extension (continueRecord) or a
  // fresh start (startRecord) — read by stopRecord so the page can decide
  // whether to update the existing library entry or create a new one.
  const continuedRef = useRef(false)

  useEffect(() => { isRecordingRef.current = isRecording }, [isRecording])

  // ─── Trim history (the only thing undo/redo affects) ──────────────────
  const commit = useCallback((next: FreeSnapshot) => {
    pastRef.current.push(snapshot)
    futureRef.current = []
    setSnapshot(next)
    // If the user just edited back to the recording's baseline (e.g. dragged
    // a trim handle and then returned it to its original position), the
    // undo/redo stack would technically have entries but executing them
    // would feel pointless.  Wipe the stack so Undo/Redo grey out.
    if (matchesBaseline(next)) {
      pastRef.current   = []
      futureRef.current = []
    }
    bumpHistory()
  }, [snapshot, bumpHistory])

  const undo = useCallback(() => {
    const prev = pastRef.current.pop()
    if (!prev) return
    futureRef.current.push(snapshot)
    setSnapshot(prev)
    if (matchesBaseline(prev)) {
      // Reached the baseline via Undo — same logic as above.  Drop the
      // remaining history so we don't have a "Redo that does nothing" trap.
      pastRef.current   = []
      futureRef.current = []
    }
    bumpHistory()
  }, [snapshot, bumpHistory])

  const redo = useCallback(() => {
    const next = futureRef.current.pop()
    if (!next) return
    pastRef.current.push(snapshot)
    setSnapshot(next)
    if (matchesBaseline(next)) {
      pastRef.current   = []
      futureRef.current = []
    }
    bumpHistory()
  }, [snapshot, bumpHistory])

  // ─── Capture ─────────────────────────────────────────────────────────
  const startRecord = useCallback(() => {
    if (isRecordingRef.current) return
    liveNotes.current = []
    openRef.current.clear()
    idRef.current = 0
    recStartRef.current = performance.now()
    isRecordingRef.current = true
    continuedRef.current = false
    setIsRecording(true)
  }, [])

  // Continue an existing take.  Existing notes are preserved at their
  // recorded times; the clock is offset so `performance.now() - recStart`
  // equals the take's current durationMs, and the first new keypress lands
  // immediately after it.  Falls back to a fresh recording if there's
  // nothing to continue from.
  const continueRecord = useCallback(() => {
    if (isRecordingRef.current) return
    if (snapshot.notes.length === 0 || snapshot.durationMs === 0) {
      // Nothing to continue — defer to the regular path.
      liveNotes.current = []
      openRef.current.clear()
      idRef.current = 0
      recStartRef.current = performance.now()
      isRecordingRef.current = true
      continuedRef.current = false
      setIsRecording(true)
      return
    }
    liveNotes.current = snapshot.notes.slice()
    openRef.current.clear()
    idRef.current = snapshot.notes.length
    recStartRef.current = performance.now() - snapshot.durationMs
    isRecordingRef.current = true
    continuedRef.current = true
    setIsRecording(true)
  }, [snapshot])

  const stopRecord = useCallback(() => {
    if (!isRecordingRef.current) return
    isRecordingRef.current = false
    setIsRecording(false)

    const now = performance.now()
    openRef.current.forEach((note) => {
      note.endMs = Math.max(note.endMs, now - recStartRef.current)
    })
    openRef.current.clear()

    const notes = liveNotes.current.slice().sort((a, b) => a.startMs - b.startMs)
    const durationMs = notes.length === 0 ? 0
      : Math.max(...notes.map(n => n.endMs))

    const next: FreeSnapshot = { notes, durationMs, trimStartMs: 0, trimEndMs: durationMs }
    pastRef.current   = []
    futureRef.current = []
    baselineRef.current = next
    setSnapshot(next)
    bumpHistory()
    const wasContinuing = continuedRef.current
    continuedRef.current = false
    onAfterStop?.(next, notes.length > 0, wasContinuing)
  }, [bumpHistory, onAfterStop])

  const clear = useCallback(() => {
    if (isRecordingRef.current) stopRecord()
    pastRef.current   = []
    futureRef.current = []
    baselineRef.current = null
    setSnapshot(EMPTY)
    bumpHistory()
    onAfterClear?.()
  }, [stopRecord, bumpHistory, onAfterClear])

  const replaceSnapshot = useCallback((snap: FreeSnapshot) => {
    pastRef.current   = []
    futureRef.current = []
    baselineRef.current = snap
    setSnapshot(snap)
    bumpHistory()
  }, [bumpHistory])

  // ─── Input ───────────────────────────────────────────────────────────
  const playInput = useCallback((midi: number, velocity: number, on: boolean) => {
    if (on) audioEngine.noteOn(midi, velocity)
    else    audioEngine.noteOff(midi)

    if (!isRecordingRef.current) return
    const t = performance.now() - recStartRef.current

    if (on) {
      const prior = openRef.current.get(midi)
      if (prior) { prior.endMs = t; openRef.current.delete(midi) }
      const note: RecordedNote = {
        id: `r${idRef.current++}`, midi, velocity, startMs: t, endMs: t,
      }
      openRef.current.set(midi, note)
      liveNotes.current.push(note)
    } else {
      const note = openRef.current.get(midi)
      if (note) {
        note.endMs = Math.max(note.startMs + 30, t)
        openRef.current.delete(midi)
      }
    }
  }, [])

  const { subscribe } = useMidi()
  useEffect(() => subscribe((midi, vel, on) => playInput(midi, vel, on)), [subscribe, playInput])

  // ─── Trim edits ──────────────────────────────────────────────────────
  const setTrimStart = useCallback((ms: number) => {
    const clamped = Math.max(0, Math.min(ms, snapshot.trimEndMs - 50))
    if (clamped === snapshot.trimStartMs) return
    commit({ ...snapshot, trimStartMs: clamped })
  }, [snapshot, commit])

  const setTrimEnd = useCallback((ms: number) => {
    const clamped = Math.min(snapshot.durationMs, Math.max(ms, snapshot.trimStartMs + 50))
    if (clamped === snapshot.trimEndMs) return
    commit({ ...snapshot, trimEndMs: clamped })
  }, [snapshot, commit])

  return {
    isRecording,
    snapshot,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    startRecord, continueRecord, stopRecord, clear,
    playInput,
    setTrimStart, setTrimEnd,
    undo, redo,
    replaceSnapshot,
  }
}
