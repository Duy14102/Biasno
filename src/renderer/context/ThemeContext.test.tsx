import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import React from 'react'
import { ThemeProvider, useTheme } from './ThemeContext'
import { LS } from '@/constants'

afterEach(cleanup)
beforeEach(() => { localStorage.clear(); document.documentElement.className = '' })

const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>

describe('ThemeContext', () => {
  it('defaults to dark when no stored value', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem(LS.THEME)).toBe('dark')
  })

  it('reads a valid stored theme', () => {
    localStorage.setItem(LS.THEME, 'light')
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('light')
  })

  it('falls back to dark for an invalid stored value', () => {
    localStorage.setItem(LS.THEME, 'banana')
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('dark')
  })

  it('toggle flips dark<->light and updates dom + storage', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => result.current.toggle())
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem(LS.THEME)).toBe('light')
    act(() => result.current.toggle())
    expect(result.current.theme).toBe('dark')
  })

  it('setTheme sets an explicit value', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => result.current.setTheme('light'))
    expect(result.current.theme).toBe('light')
  })

  it('useTheme throws outside a provider', () => {
    expect(() => renderHook(() => useTheme())).toThrow(/within ThemeProvider/)
  })
})
