import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useEscape } from './useEscape'

const press = (key: string): void => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }))
}

describe('useEscape', () => {
  it('fires on Escape', () => {
    const onEsc = vi.fn()
    renderHook(() => useEscape(onEsc))
    press('Escape')
    expect(onEsc).toHaveBeenCalledTimes(1)
  })

  it('ignores other keys', () => {
    const onEsc = vi.fn()
    renderHook(() => useEscape(onEsc))
    press('Enter')
    press('a')
    press(' ')
    expect(onEsc).not.toHaveBeenCalled()
  })

  it('detaches the listener on unmount', () => {
    const onEsc = vi.fn()
    const { unmount } = renderHook(() => useEscape(onEsc))
    unmount()
    press('Escape')
    expect(onEsc).not.toHaveBeenCalled()
  })

  it('updates the listener when callback changes', () => {
    const a = vi.fn()
    const b = vi.fn()
    const { rerender } = renderHook(({ cb }) => useEscape(cb), {
      initialProps: { cb: a },
    })
    press('Escape')
    expect(a).toHaveBeenCalledTimes(1)
    rerender({ cb: b })
    press('Escape')
    expect(b).toHaveBeenCalledTimes(1)
    expect(a).toHaveBeenCalledTimes(1)
  })
})
