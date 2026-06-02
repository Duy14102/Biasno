import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'

const midi = { connectedId: null as string | null }
vi.mock('@/context', () => ({ useMidi: () => midi }))
vi.mock('@/i18n', () => ({ useLanguage: () => ({ t: (k: string) => k }) }))

import KeyboardHelpPopover from './KeyboardHelpPopover'

const wrap = () => render(<KeyboardHelpPopover />)

afterEach(() => { cleanup(); midi.connectedId = null })

describe('KeyboardHelpPopover', () => {
  it('trigger is enabled and popover closed by default', () => {
    const { container, queryByText } = wrap()
    const btn = container.querySelector('button') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    expect(queryByText('keyboardHelpTitle')).toBeNull()
  })

  it('opens the popover on click, rendering both octave diagrams', () => {
    const { container, getByText } = wrap()
    fireEvent.click(container.querySelector('button') as HTMLButtonElement)
    // Header title text appears once the panel is open.
    expect(getByText('keyboardHelpTitle')).toBeTruthy()
    expect(getByText('upperOctaveLabel')).toBeTruthy()
    expect(getByText('lowerOctaveLabel')).toBeTruthy()
    // White keys for both octaves are rendered.
    expect(getByText('Q')).toBeTruthy()
    expect(getByText('Z')).toBeTruthy()
    // A black key letter is rendered.
    expect(getByText('S')).toBeTruthy()
  })

  it('toggles closed on a second click', () => {
    const { container, queryByText } = wrap()
    const btn = container.querySelector('button') as HTMLButtonElement
    fireEvent.click(btn)
    expect(queryByText('upperOctaveLabel')).toBeTruthy()
    fireEvent.click(btn)
    expect(queryByText('upperOctaveLabel')).toBeNull()
  })

  it('closes when clicking outside while open', () => {
    const { container, queryByText } = wrap()
    fireEvent.click(container.querySelector('button') as HTMLButtonElement)
    expect(queryByText('upperOctaveLabel')).toBeTruthy()
    fireEvent.mouseDown(document.body)
    expect(queryByText('upperOctaveLabel')).toBeNull()
  })

  it('stays open when mousedown is inside the popover', () => {
    const { container, queryByText } = wrap()
    fireEvent.click(container.querySelector('button') as HTMLButtonElement)
    fireEvent.mouseDown(container.querySelector('button') as HTMLButtonElement)
    expect(queryByText('upperOctaveLabel')).toBeTruthy()
  })

  it('locked: trigger disabled, shows lock title, click does not open', () => {
    midi.connectedId = 'dev-1'
    const { container, queryByText } = wrap()
    const btn = container.querySelector('button') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn.title).toBe('keyboardHelpLocked')
    fireEvent.click(btn)
    expect(queryByText('upperOctaveLabel')).toBeNull()
  })

  it('connecting a device while open force-closes the popover', () => {
    const { container, queryByText, rerender } = wrap()
    fireEvent.click(container.querySelector('button') as HTMLButtonElement)
    expect(queryByText('upperOctaveLabel')).toBeTruthy()
    midi.connectedId = 'dev-2'
    rerender(<KeyboardHelpPopover />)
    expect(queryByText('upperOctaveLabel')).toBeNull()
  })
})
