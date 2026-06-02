// Capture-only recorder for Free Mode.  Listens to MidiContext + the
// keyboard / on-screen inputs (via playInput) and accumulates RecordedNotes.
// Knows nothing about clip editing, undo/redo or the library — those live in
// useEditor / useFreeMode.  On stop it emits a CaptureResult; the consumer
// decides whether to replace the current state with a fresh take or extend
// an existing one.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMidi } from '@/context'
import { audioEngine } from '@/audio'
import type { PedalEvent } from '@/types'
import type { FreeSnapshot, RecordedNote } from './types'

export interface CaptureResult {
  notes:       RecordedNote[]
  pedalEvents: PedalEvent[]
  durationMs:  number
  // True when the take was started with continueRecord, so the consumer
  // should preserve the prior trim / clips / etc. and only append the new
  // tail.  baseAtStart carries the snapshot the consumer was on when the
  // user pressed Continue (or null for a fresh take).
  continued:   boolean
  baseAtStart: FreeSnapshot | null
  hadNotes:    boolean
}

export interface RecorderApi {
  isRecording:    boolean
  startRecord:    () => void
  continueRecord: () => void
  stopRecord:     () => void
  playInput:      (midi: number, velocity: number, on: boolean, fromDevice?: boolean) => void
}

interface Options {
  // Reader for the current editor snapshot.  Pulled as a function so the
  // recorder never re-binds when the snapshot changes — avoids a stale-snap
  // problem when the user holds Continue while editing.
  readSnapshot: () => FreeSnapshot
  onStop:       (result: CaptureResult) => void
  // When true, notes from the connected MIDI device are captured but NOT
  // re-synthesised — the real piano already makes its own sound.
  suppressDeviceAudio?: boolean
}

export function useRecorder({ readSnapshot, onStop, suppressDeviceAudio }: Options): RecorderApi {
  const [isRecording, setIsRecording] = useState(false)

  const isRecordingRef = useRef(false)
  useEffect(() => { isRecordingRef.current = isRecording }, [isRecording])

  // Ref-mirror so toggling the setting doesn't re-bind playInput (which would
  // force a MIDI re-subscribe).
  const suppressRef = useRef(suppressDeviceAudio)
  useEffect(() => { suppressRef.current = suppressDeviceAudio }, [suppressDeviceAudio])

  const recStartRef   = useRef(0)
  const idRef         = useRef(0)
  const openRef       = useRef<Map<number, RecordedNote>>(new Map())
  const liveNotes     = useRef<RecordedNote[]>([])
  const livePedal     = useRef<PedalEvent[]>([])
  const continuedRef  = useRef(false)
  const baseAtStartRef = useRef<FreeSnapshot | null>(null)

  // ── start / continue / stop ───────────────────────────────────────────
  const startRecord = useCallback(() => {
    if (isRecordingRef.current) return
    liveNotes.current      = []
    livePedal.current      = []
    openRef.current.clear()
    idRef.current          = 0
    recStartRef.current    = performance.now()
    continuedRef.current   = false
    baseAtStartRef.current = null
    isRecordingRef.current = true
    setIsRecording(true)
  }, [])

  const continueRecord = useCallback(() => {
    if (isRecordingRef.current) return
    const base = readSnapshot()
    if (base.notes.length === 0 || base.durationMs === 0) {
      // Nothing meaningful to extend — fall through to a fresh take.
      startRecord()
      return
    }
    liveNotes.current      = base.notes.slice()
    livePedal.current      = base.pedalEvents ? base.pedalEvents.slice() : []
    openRef.current.clear()
    idRef.current          = base.notes.length
    // Offset the clock so `performance.now() - recStart` lines up with the
    // existing duration — the next keypress lands just after `durationMs`.
    recStartRef.current    = performance.now() - base.durationMs
    continuedRef.current   = true
    baseAtStartRef.current = base
    isRecordingRef.current = true
    setIsRecording(true)
  }, [readSnapshot, startRecord])

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
    const pedalEvents = livePedal.current.slice().sort((a, b) => a.time - b.time)

    const continued   = continuedRef.current
    const baseAtStart = baseAtStartRef.current
    continuedRef.current   = false
    baseAtStartRef.current = null

    onStop({ notes, pedalEvents, durationMs, continued, baseAtStart, hadNotes: notes.length > 0 })
  }, [onStop])

  // ── input ─────────────────────────────────────────────────────────────
  const playInput = useCallback((midi: number, velocity: number, on: boolean, fromDevice = false) => {
    // Real piano makes its own sound → capture the note but don't layer the
    // app's synth on top.  Only device input is gated; keyboard / clicks play.
    if (!(fromDevice && suppressRef.current)) {
      if (on) audioEngine.noteOn(midi, velocity)
      else    audioEngine.noteOff(midi)
    }

    if (!isRecordingRef.current) return
    const t = performance.now() - recStartRef.current

    if (on) {
      const prior = openRef.current.get(midi)
      if (prior) { prior.endMs = t; openRef.current.delete(midi) }
      const note: RecordedNote = {
        id:       `r${idRef.current++}`,
        midi, velocity,
        startMs:  t,
        endMs:    t,
      }
      openRef.current.set(midi, note)
      liveNotes.current.push(note)
    } else {
      const note = openRef.current.get(midi)
      if (note) {
        // Floor the note's length so a flicker-tap still draws as a bar.
        note.endMs = Math.max(note.startMs + 30, t)
        openRef.current.delete(midi)
      }
    }
  }, [])

  // Sustain pedal: always forward to the engine for live monitoring; while
  // recording, also capture the edge on the recording clock.
  const playPedal = useCallback((down: boolean) => {
    audioEngine.setSustainPedal(down)
    if (!isRecordingRef.current) return
    livePedal.current.push({ time: performance.now() - recStartRef.current, down })
  }, [])

  const { subscribe, subscribePedal } = useMidi()
  useEffect(
    () => subscribe((midi, velocity, on) => playInput(midi, velocity, on, true)),
    [subscribe, playInput],
  )
  useEffect(() => subscribePedal(playPedal), [subscribePedal, playPedal])

  return { isRecording, startRecord, continueRecord, stopRecord, playInput }
}
