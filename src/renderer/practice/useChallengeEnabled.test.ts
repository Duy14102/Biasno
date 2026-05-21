import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChallengeEnabled } from './useChallengeEnabled'

describe('useChallengeEnabled', () => {
  beforeEach(() => { localStorage.clear() })

  it('defaults to false for an unknown song', () => {
    const { result } = renderHook(() => useChallengeEnabled('song.mid'))
    expect(result.current[0]).toBe(false)
  })

  it('setter flips the value and persists per-song', () => {
    const { result } = renderHook(() => useChallengeEnabled('song.mid'))
    act(() => { result.current[1](true) })
    expect(result.current[0]).toBe(true)
    const stored = JSON.parse(localStorage.getItem('biasno.challengeBySong') ?? '{}')
    expect(stored).toEqual({ 'song.mid': true })
  })

  it('returns false and ignores writes when songName is null', () => {
    const { result } = renderHook(() => useChallengeEnabled(null))
    expect(result.current[0]).toBe(false)
    act(() => { result.current[1](true) })
    expect(result.current[0]).toBe(false)
  })

  it('each song keeps an independent flag', () => {
    const a = renderHook(() => useChallengeEnabled('a.mid'))
    act(() => { a.result.current[1](true) })
    const b = renderHook(() => useChallengeEnabled('b.mid'))
    expect(b.result.current[0]).toBe(false)
    expect(a.result.current[0]).toBe(true)
  })
})
