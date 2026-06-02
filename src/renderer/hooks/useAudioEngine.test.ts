import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const engine = vi.hoisted(() => ({
  ready: false,
  audioSourceLabel: '🎹 MusyngKite (HQ)',
  initialize: vi.fn<() => Promise<unknown>>(),
}))

vi.mock('@/audio', () => ({ audioEngine: engine }))

import { useAudioEngine } from './useAudioEngine'

beforeEach(() => {
  engine.ready = false
  engine.audioSourceLabel = '🎹 MusyngKite (HQ)'
  engine.initialize.mockReset()
})

describe('useAudioEngine', () => {
  it('reports ready immediately when the engine is already ready', () => {
    engine.ready = true
    engine.initialize.mockResolvedValue(undefined)
    const { result } = renderHook(() => useAudioEngine())
    expect(result.current.loadState).toBe('ready')
    expect(result.current.audioSourceLabel).toBe('🎹 MusyngKite (HQ)')
    expect(engine.initialize).not.toHaveBeenCalled()
    expect(result.current.engine).toBe(engine)
  })

  it('loads then becomes ready on successful initialize', async () => {
    engine.initialize.mockResolvedValue(undefined)
    const { result } = renderHook(() => useAudioEngine())
    expect(result.current.loadState).toBe('loading')
    await waitFor(() => expect(result.current.loadState).toBe('ready'))
    expect(engine.initialize).toHaveBeenCalledOnce()
    expect(result.current.audioSourceLabel).toBe('🎹 MusyngKite (HQ)')
  })

  it('enters error state with the error label when initialize rejects', async () => {
    engine.initialize.mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useAudioEngine())
    expect(result.current.loadState).toBe('loading')
    await waitFor(() => expect(result.current.loadState).toBe('error'))
    expect(result.current.audioSourceLabel).toBe('⚠ Lỗi')
  })
})
