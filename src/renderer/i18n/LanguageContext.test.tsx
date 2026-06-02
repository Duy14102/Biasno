import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import React from 'react'
import { LanguageProvider, useLanguage } from './LanguageContext'
import type { TranslationKey } from './translations'
import { LS } from '@/constants'

afterEach(cleanup)
beforeEach(() => localStorage.clear())

const wrapper = ({ children }: { children: React.ReactNode }) => <LanguageProvider>{children}</LanguageProvider>

describe('LanguageContext', () => {
  it('defaults to vi with no stored value', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper })
    expect(result.current.lang).toBe('vi')
    expect(localStorage.getItem(LS.LANG)).toBe('vi')
  })

  it('reads a valid stored language', () => {
    localStorage.setItem(LS.LANG, 'en')
    const { result } = renderHook(() => useLanguage(), { wrapper })
    expect(result.current.lang).toBe('en')
  })

  it('falls back to vi for an invalid stored value', () => {
    localStorage.setItem(LS.LANG, 'fr')
    const { result } = renderHook(() => useLanguage(), { wrapper })
    expect(result.current.lang).toBe('vi')
  })

  it('setLang switches language and persists it', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper })
    act(() => result.current.setLang('en'))
    expect(result.current.lang).toBe('en')
    expect(localStorage.getItem(LS.LANG)).toBe('en')
  })

  it('t resolves a key for the active language and changes with it', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper })
    const viStr = result.current.t('audioLoading')
    expect(typeof viStr).toBe('string')
    expect(viStr.length).toBeGreaterThan(0)
    act(() => result.current.setLang('en'))
    expect(result.current.t('audioLoading')).toBe('⏳ Loading audio...')
  })

  it('t interpolates params (replacing all occurrences)', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper })
    act(() => result.current.setLang('en'))
    expect(result.current.t('errConnectFailed', { msg: 'boom' })).toContain('boom')
  })

  it('t returns the key string when no translation exists', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper })
    expect(result.current.t('__nope__' as TranslationKey)).toBe('__nope__')
  })

  it('useLanguage throws outside a provider', () => {
    expect(() => renderHook(() => useLanguage())).toThrow(/within LanguageProvider/)
  })
})
