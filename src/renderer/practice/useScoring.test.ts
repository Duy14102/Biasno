import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScoring } from './useScoring'
import type { MidiNote } from '../types'

const note = (id: string, time: number, duration = 1, midi = 60): MidiNote => ({
  id, midi, time, duration, velocity: 0.8, name: 'C4', track: 0, hand: 'right', channel: 0,
})

describe('useScoring — hits', () => {
  it('starts at zero', () => {
    const { result } = renderHook(() => useScoring())
    expect(result.current.state).toEqual({
      score: 0, success: 0, missed: 0, combosHits: 0, combo: 0, maxCombo: 0,
    })
  })

  it('awards +1 per correct hit (no combo yet)', () => {
    const { result } = renderHook(() => useScoring())
    act(() => { result.current.onHit('n1') })
    act(() => { result.current.onHit('n2') })
    expect(result.current.state.score).toBe(2)
    expect(result.current.state.success).toBe(2)
    expect(result.current.state.combo).toBe(2)
    expect(result.current.state.combosHits).toBe(0)
  })

  it('hit #6 earns +2 combo bonus (5 threshold + 1 over)', () => {
    const { result } = renderHook(() => useScoring())
    for (let i = 1; i <= 6; i++) {
      act(() => { result.current.onHit(`n${i}`) })
    }
    // 5 base hits (5pt) + 1 combo hit (2pt) = 7
    expect(result.current.state.score).toBe(7)
    expect(result.current.state.combo).toBe(6)
    expect(result.current.state.combosHits).toBe(1)
    expect(result.current.state.maxCombo).toBe(6)
  })

  it('dedups same noteId — second onHit is a no-op', () => {
    const { result } = renderHook(() => useScoring())
    act(() => { result.current.onHit('n1') })
    act(() => { result.current.onHit('n1') })
    expect(result.current.state.score).toBe(1)
    expect(result.current.state.success).toBe(1)
  })

  it('maxCombo tracks longest streak across resets', () => {
    const { result } = renderHook(() => useScoring())
    for (let i = 1; i <= 4; i++) act(() => { result.current.onHit(`n${i}`) })
    act(() => { result.current.onMiss('miss1') })
    expect(result.current.state.combo).toBe(0)
    expect(result.current.state.maxCombo).toBe(4)
    act(() => { result.current.onHit('n5') })
    expect(result.current.state.maxCombo).toBe(4)
  })
})

describe('useScoring — misses', () => {
  it('increments missed and breaks combo', () => {
    const { result } = renderHook(() => useScoring())
    act(() => { result.current.onHit('n1') })
    act(() => { result.current.onMiss('m1') })
    expect(result.current.state.missed).toBe(1)
    expect(result.current.state.combo).toBe(0)
  })

  it('dedups: same miss twice = one increment', () => {
    const { result } = renderHook(() => useScoring())
    act(() => { result.current.onMiss('m1') })
    act(() => { result.current.onMiss('m1') })
    expect(result.current.state.missed).toBe(1)
  })

  it('miss is ignored if the same note was already hit', () => {
    const { result } = renderHook(() => useScoring())
    act(() => { result.current.onHit('n1') })
    act(() => { result.current.onMiss('n1') })
    expect(result.current.state.missed).toBe(0)
    expect(result.current.state.success).toBe(1)
  })
})

describe('useScoring — wrong presses', () => {
  it('no penalty when there is no active note', () => {
    const { result } = renderHook(() => useScoring())
    act(() => { result.current.onHit('n1') })
    act(() => { result.current.onWrongAt(0, null) })
    expect(result.current.state.score).toBe(1)
    expect(result.current.state.missed).toBe(0)
  })

  it('full −1 penalty at the note onset', () => {
    const { result } = renderHook(() => useScoring())
    act(() => { result.current.onHit('n0') })   // +1 → score=1
    act(() => { result.current.onWrongAt(5.0, note('n1', 5.0, 1)) })
    expect(result.current.state.score).toBe(0)
    expect(result.current.state.missed).toBe(1)
    expect(result.current.state.combo).toBe(0)
  })

  it('half-way through the note → ~0.5 penalty', () => {
    const { result } = renderHook(() => useScoring())
    // bank some points first so we can see the penalty without clamping
    for (let i = 0; i < 3; i++) act(() => { result.current.onHit(`n${i}`) })
    expect(result.current.state.score).toBe(3)
    act(() => { result.current.onWrongAt(5.5, note('w1', 5.0, 1)) })
    expect(result.current.state.score).toBeCloseTo(2.5, 5)
  })

  it('clamps score at zero — no negative scores', () => {
    const { result } = renderHook(() => useScoring())
    act(() => { result.current.onWrongAt(5.0, note('w1', 5.0, 1)) })
    expect(result.current.state.score).toBe(0)
  })

  it('flurry of wrong presses on the same note counts as one miss', () => {
    const { result } = renderHook(() => useScoring())
    const active = note('n1', 5.0, 1)
    act(() => { result.current.onWrongAt(5.0, active) })
    act(() => { result.current.onWrongAt(5.1, active) })
    act(() => { result.current.onWrongAt(5.2, active) })
    expect(result.current.state.missed).toBe(1)
  })

  it('correct hit after wrong presses still scores +1, miss stays on record', () => {
    const { result } = renderHook(() => useScoring())
    const active = note('n1', 5.0, 1)
    act(() => { result.current.onWrongAt(5.0, active) })
    act(() => { result.current.onHit('n1') })
    expect(result.current.state.success).toBe(1)
    expect(result.current.state.missed).toBe(1)
  })
})

describe('useScoring — reset', () => {
  it('clears all counters AND the dedup sets', () => {
    const { result } = renderHook(() => useScoring())
    act(() => { result.current.onHit('n1') })
    act(() => { result.current.onMiss('m1') })
    act(() => { result.current.reset() })
    expect(result.current.state).toEqual({
      score: 0, success: 0, missed: 0, combosHits: 0, combo: 0, maxCombo: 0,
    })
    // After reset, the same id can score again.
    act(() => { result.current.onHit('n1') })
    expect(result.current.state.success).toBe(1)
  })
})
