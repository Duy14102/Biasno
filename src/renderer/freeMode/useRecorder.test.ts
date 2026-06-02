import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const engine = vi.hoisted(() => ({
  noteOn: vi.fn(), noteOff: vi.fn(), setSustainPedal: vi.fn(),
}))
const midi = vi.hoisted(() => ({
  noteCb: null as null | ((m: number, v: number, on: boolean) => void),
  pedalCb: null as null | ((d: boolean) => void),
}))
vi.mock('@/audio', () => ({ audioEngine: engine }))
vi.mock('@/context', () => ({
  useMidi: () => ({
    subscribe: (cb: (m: number, v: number, on: boolean) => void) => { midi.noteCb = cb; return () => { midi.noteCb = null } },
    subscribePedal: (cb: (d: boolean) => void) => { midi.pedalCb = cb; return () => { midi.pedalCb = null } },
  }),
}))

import { useRecorder, type CaptureResult } from './useRecorder'
import type { FreeSnapshot } from './types'

let now = 0
beforeEach(() => {
  now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  engine.noteOn.mockClear(); engine.noteOff.mockClear(); engine.setSustainPedal.mockClear()
})
afterEach(() => vi.restoreAllMocks())

const emptySnap: FreeSnapshot = { notes: [], durationMs: 0, trimStartMs: 0, trimEndMs: 0, clips: [] }

function setup(readSnapshot: () => FreeSnapshot = () => emptySnap, suppressDeviceAudio = false) {
  const onStop = vi.fn<(r: CaptureResult) => void>()
  const { result } = renderHook(() => useRecorder({ readSnapshot, onStop, suppressDeviceAudio }))
  return { result, onStop }
}

describe('useRecorder', () => {
  it('startRecord flips isRecording on', () => {
    const { result } = setup()
    act(() => result.current.startRecord())
    expect(result.current.isRecording).toBe(true)
  })

  it('playInput always forwards to the engine, recording or not', () => {
    const { result } = setup()
    act(() => result.current.playInput(60, 0.5, true))
    expect(engine.noteOn).toHaveBeenCalledWith(60, 0.5)
    act(() => result.current.playInput(60, 0, false))
    expect(engine.noteOff).toHaveBeenCalledWith(60)
  })

  it('captures a note pair and emits it sorted on stop', () => {
    const { result, onStop } = setup()
    act(() => result.current.startRecord())
    now = 100; act(() => result.current.playInput(60, 0.8, true))
    now = 400; act(() => result.current.playInput(60, 0, false))
    now = 500; act(() => result.current.stopRecord())
    expect(result.current.isRecording).toBe(false)
    const res = onStop.mock.calls[0][0]
    expect(res.notes).toHaveLength(1)
    expect(res.notes[0]).toMatchObject({ midi: 60, startMs: 100, endMs: 400 })
    expect(res.durationMs).toBe(400)
    expect(res.hadNotes).toBe(true)
    expect(res.continued).toBe(false)
  })

  it('floors a flicker-tap note to a 30ms minimum length', () => {
    const { result, onStop } = setup()
    act(() => result.current.startRecord())
    now = 100; act(() => result.current.playInput(62, 1, true))
    now = 105; act(() => result.current.playInput(62, 0, false)) // 5ms tap
    now = 200; act(() => result.current.stopRecord())
    expect(onStop.mock.calls[0][0].notes[0].endMs).toBe(130) // 100 + 30
  })

  it('closes still-open notes at stop time', () => {
    const { result, onStop } = setup()
    act(() => result.current.startRecord())
    now = 0;   act(() => result.current.playInput(64, 1, true))
    now = 250; act(() => result.current.stopRecord()) // never released
    expect(onStop.mock.calls[0][0].notes[0].endMs).toBe(250)
  })

  it('emits an empty result when nothing was captured', () => {
    const { result, onStop } = setup()
    act(() => result.current.startRecord())
    act(() => result.current.stopRecord())
    expect(onStop.mock.calls[0][0]).toMatchObject({ notes: [], durationMs: 0, hadNotes: false })
  })

  it('continueRecord with an empty snapshot falls back to a fresh take', () => {
    const { result, onStop } = setup(() => emptySnap)
    act(() => result.current.continueRecord())
    expect(result.current.isRecording).toBe(true)
    now = 50; act(() => result.current.playInput(60, 1, true))
    now = 80; act(() => result.current.playInput(60, 0, false))
    act(() => result.current.stopRecord())
    expect(onStop.mock.calls[0][0].continued).toBe(false)
  })

  it('continueRecord extends an existing take, carrying its notes and flagging continued', () => {
    const base: FreeSnapshot = {
      notes: [{ id: 'r0', midi: 60, velocity: 1, startMs: 0, endMs: 200 }],
      durationMs: 200, trimStartMs: 0, trimEndMs: 200, clips: [],
    }
    const { result, onStop } = setup(() => base)
    now = 1000
    act(() => result.current.continueRecord())
    // recStart offset to (now - durationMs) so the next press lands after 200ms
    now = 1300; act(() => result.current.playInput(67, 1, true))
    now = 1400; act(() => result.current.playInput(67, 0, false))
    act(() => result.current.stopRecord())
    const res = onStop.mock.calls[0][0]
    expect(res.continued).toBe(true)
    expect(res.notes).toHaveLength(2)
    expect(res.baseAtStart).toBe(base)
  })

  it('ignores playInput when not recording (no note captured)', () => {
    const { result, onStop } = setup()
    act(() => result.current.playInput(60, 1, true))
    act(() => result.current.startRecord())
    act(() => result.current.stopRecord())
    expect(onStop.mock.calls[0][0].notes).toHaveLength(0)
  })

  it('suppresses device audio but still captures the note', () => {
    const { result, onStop } = setup(() => emptySnap, true)
    act(() => result.current.startRecord())
    now = 100; act(() => midi.noteCb?.(60, 0.8, true))   // device input → fromDevice
    now = 300; act(() => midi.noteCb?.(60, 0, false))
    now = 400; act(() => result.current.stopRecord())
    expect(engine.noteOn).not.toHaveBeenCalled()
    expect(engine.noteOff).not.toHaveBeenCalled()
    expect(onStop.mock.calls[0][0].notes[0]).toMatchObject({ midi: 60, startMs: 100, endMs: 300 })
  })

  it('still plays computer-keyboard / on-screen input even when device audio is suppressed', () => {
    const { result } = setup(() => emptySnap, true)
    act(() => result.current.playInput(60, 0.8, true))   // no fromDevice flag
    expect(engine.noteOn).toHaveBeenCalledWith(60, 0.8)
  })

  it('forwards pedal edges to the engine and captures them while recording', () => {
    const { result, onStop } = setup()
    act(() => result.current.startRecord())
    now = 10; act(() => midi.pedalCb?.(true))
    now = 90; act(() => midi.pedalCb?.(false))
    act(() => result.current.stopRecord())
    expect(engine.setSustainPedal).toHaveBeenCalledWith(true)
    expect(engine.setSustainPedal).toHaveBeenCalledWith(false)
    expect(onStop.mock.calls[0][0].pedalEvents).toEqual([
      { time: 10, down: true }, { time: 90, down: false },
    ])
  })
})
