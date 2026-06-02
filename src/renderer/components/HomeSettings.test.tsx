import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'

const toggle = vi.fn()
const setLang = vi.fn()
let theme: 'dark' | 'light' = 'light'
let lang: 'vi' | 'en' = 'en'

vi.mock('@/context', () => ({ useTheme: () => ({ theme, toggle }) }))
vi.mock('@/i18n', () => ({
  useLanguage: () => ({ lang, setLang, t: (k: string) => k }),
  LANGUAGES: [
    { code: 'vi', label: 'Tiếng Việt', flag: 'VN' },
    { code: 'en', label: 'English', flag: 'GB' },
  ],
}))

import HomeSettings from './HomeSettings'

beforeEach(() => { theme = 'light'; lang = 'en'; toggle.mockClear(); setLang.mockClear() })
afterEach(cleanup)

describe('HomeSettings', () => {
  it('is closed by default — no panel rendered', () => {
    const { queryByText } = render(<HomeSettings />)
    expect(queryByText('language')).toBeNull()
  })

  it('opens the panel on trigger click and sets aria-expanded', () => {
    const { getByLabelText, getByText } = render(<HomeSettings />)
    const trigger = getByLabelText('settings')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(getByText('language')).toBeTruthy()
  })

  it('closes again on a second trigger click', () => {
    const { getByLabelText, queryByText } = render(<HomeSettings />)
    const trigger = getByLabelText('settings')
    fireEvent.click(trigger)
    fireEvent.click(trigger)
    expect(queryByText('language')).toBeNull()
  })

  it('shows the light-theme label when theme is light', () => {
    theme = 'light'
    const { getByLabelText, getByText } = render(<HomeSettings />)
    fireEvent.click(getByLabelText('settings'))
    expect(getByText('themeLight')).toBeTruthy()
  })

  it('shows the dark-theme label when theme is dark', () => {
    theme = 'dark'
    const { getByLabelText, getByText } = render(<HomeSettings />)
    fireEvent.click(getByLabelText('settings'))
    expect(getByText('themeDark')).toBeTruthy()
  })

  it('calls toggle when the theme row is clicked', () => {
    const { getByLabelText, getByText } = render(<HomeSettings />)
    fireEvent.click(getByLabelText('settings'))
    fireEvent.click(getByText('themeLight'))
    expect(toggle).toHaveBeenCalledTimes(1)
  })

  it('switches language only when a different code is picked', () => {
    lang = 'en'
    const { getByLabelText, getByText } = render(<HomeSettings />)
    fireEvent.click(getByLabelText('settings'))
    fireEvent.click(getByText('Tiếng Việt')) // different → setLang
    expect(setLang).toHaveBeenCalledWith('vi')
  })

  it('does NOT call setLang when the already-active language is picked', () => {
    lang = 'en'
    const { getByLabelText, getByText } = render(<HomeSettings />)
    fireEvent.click(getByLabelText('settings'))
    fireEvent.click(getByText('English')) // same → no-op
    expect(setLang).not.toHaveBeenCalled()
  })

  it('closes on Escape key while open', () => {
    const { getByLabelText, queryByText } = render(<HomeSettings />)
    fireEvent.click(getByLabelText('settings'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(queryByText('language')).toBeNull()
  })

  it('closes on an outside mousedown', () => {
    const { getByLabelText, queryByText } = render(<HomeSettings />)
    fireEvent.click(getByLabelText('settings'))
    fireEvent.mouseDown(document.body)
    expect(queryByText('language')).toBeNull()
  })

  it('falls back to the first language when lang is unknown', () => {
    lang = 'zz' as unknown as 'en'
    const { getByLabelText } = render(<HomeSettings />)
    expect(() => fireEvent.click(getByLabelText('settings'))).not.toThrow()
  })
})
