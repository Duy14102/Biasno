import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
vi.mock('@/i18n', () => ({ useLanguage: () => ({ t: (k: string) => k }) }))
import type { PracticeMode } from '@/types'
import ModeDropdown from './ModeDropdown'

const wrap = (mode: PracticeMode = 'right-melody') => {
  const onModeChange = vi.fn()
  const r = render(<ModeDropdown mode={mode} onModeChange={onModeChange} />)
  return { ...r, onModeChange }
}

const trigger = (c: HTMLElement) => c.querySelector('button') as HTMLButtonElement

afterEach(cleanup)

describe('ModeDropdown', () => {
  it('trigger shows the current mode full label, panel closed', () => {
    const { getByText, queryByText } = wrap('right-melody')
    expect(getByText('rightHand · melody')).toBeTruthy()
    expect(queryByText('practiceModeHeading')).toBeNull()
  })

  it('view-listen mode shows sub-label only (no parent join)', () => {
    const { getByText } = wrap('view-listen')
    expect(getByText('viewListenShort')).toBeTruthy()
  })

  it('opens panel listing group headers and items', () => {
    const { container, getByText, getAllByText } = wrap()
    fireEvent.click(trigger(container))
    expect(getByText('practiceModeHeading')).toBeTruthy()
    // Group headers (view group has no labelKey, so none for it).
    expect(getByText('rightHand')).toBeTruthy()
    expect(getByText('leftHand')).toBeTruthy()
    expect(getByText('twoHands')).toBeTruthy()
    // 'melody' sub-label appears in each of right/left/both groups.
    expect(getAllByText('melody').length).toBe(3)
  })

  it('selecting an item fires onModeChange and closes', () => {
    const { container, getAllByText, onModeChange, queryByText } = wrap('right-melody')
    fireEvent.click(trigger(container))
    // Pick 'rhythm' from the left group (the second occurrence ordering is
    // right, left, both); just click the first 'rhythm'.
    fireEvent.click(getAllByText('rhythm')[0])
    expect(onModeChange).toHaveBeenCalledWith('right-rhythm')
    expect(queryByText('practiceModeHeading')).toBeNull()
  })

  it('marks the active item (checkmark svg present in panel)', () => {
    const { container } = wrap('left-melody-rhythm')
    fireEvent.click(trigger(container))
    // The active item renders an inline svg checkmark.
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('caret rotates when open', () => {
    const { container } = wrap()
    const caret = trigger(container).querySelector('span') as HTMLElement
    expect(caret.className).not.toContain('rotate-180')
    fireEvent.click(trigger(container))
    expect(caret.className).toContain('rotate-180')
  })

  it('closes on outside mousedown', () => {
    const { container, queryByText } = wrap()
    fireEvent.click(trigger(container))
    expect(queryByText('practiceModeHeading')).toBeTruthy()
    fireEvent.mouseDown(document.body)
    expect(queryByText('practiceModeHeading')).toBeNull()
  })

  it('stays open on inside mousedown', () => {
    const { container, queryByText } = wrap()
    fireEvent.click(trigger(container))
    fireEvent.mouseDown(trigger(container))
    expect(queryByText('practiceModeHeading')).toBeTruthy()
  })
})
