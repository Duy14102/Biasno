import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import { LanguageProvider } from '@/i18n'
import { KEY_COUNTS } from '@/utils'

// The header barrel transitively imports `tone` (audio engine) which fails to
// resolve under jsdom; stub the icons + ToggleSwitch the component pulls from it.
vi.mock('@/components/header', () => {
  const Icon = (p: { className?: string }) => <span className={p.className} />
  return {
    GearIcon: Icon, KeyboardIcon: Icon, MetronomeIcon: Icon,
    MeasureIcon: Icon, CountdownIcon: Icon, LockIcon: Icon,
    ToggleSwitch: ({ on, onClick }: { on: boolean; onClick: () => void }) => (
      <button data-toggle data-on={on} onClick={onClick} />
    ),
  }
})

import FreeModeSettings from './FreeModeSettings'

beforeEach(() => localStorage.setItem('biasno.lang', 'en'))
afterEach(() => { cleanup(); localStorage.clear() })

type P = React.ComponentProps<typeof FreeModeSettings>
function setup(props: Partial<P> = {}) {
  const onKeyCountChange = vi.fn(), onCountdownToggle = vi.fn()
  const onMetronomeToggle = vi.fn(), onMeasureLinesToggle = vi.fn()
  const full: P = {
    keyCount: 88, keyCountLocked: false, onKeyCountChange,
    countdownEnabled: false, onCountdownToggle,
    metronomeEnabled: false, onMetronomeToggle,
    measureLinesEnabled: false, onMeasureLinesToggle,
    ...props,
  }
  const utils = render(<LanguageProvider><FreeModeSettings {...full} /></LanguageProvider>)
  const trigger = utils.container.querySelector('button') as HTMLButtonElement
  return { onKeyCountChange, onCountdownToggle, onMetronomeToggle, onMeasureLinesToggle, trigger, ...utils }
}

describe('FreeModeSettings', () => {
  it('opens the dropdown on trigger click and closes on second click', () => {
    const { trigger, queryByText } = setup()
    expect(queryByText('Keyboard size')).toBeNull()
    fireEvent.click(trigger)
    expect(queryByText('Keyboard size')).toBeTruthy()
    fireEvent.click(trigger)
    expect(queryByText('Keyboard size')).toBeNull()
  })

  it('reflects open state on aria-expanded', () => {
    const { trigger } = setup()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('closes on outside mousedown but not on inside mousedown', () => {
    const { trigger, queryByText, getByText } = setup()
    fireEvent.click(trigger)
    fireEvent.mouseDown(getByText('Keyboard size'))
    expect(queryByText('Keyboard size')).toBeTruthy()
    fireEvent.mouseDown(document.body)
    expect(queryByText('Keyboard size')).toBeNull()
  })

  it('closes on Escape, ignores other keys', () => {
    const { trigger, queryByText } = setup()
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'x' })
    expect(queryByText('Keyboard size')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(queryByText('Keyboard size')).toBeNull()
  })

  it('calls onKeyCountChange with the chosen count when unlocked', () => {
    const { trigger, getByText, onKeyCountChange } = setup({ keyCount: 88 })
    fireEvent.click(trigger)
    fireEvent.click(getByText(String(KEY_COUNTS[1])))
    expect(onKeyCountChange).toHaveBeenCalledWith(KEY_COUNTS[1])
  })

  it('disables key buttons and shows the lock note when locked', () => {
    const { trigger, getByText, onKeyCountChange } = setup({ keyCountLocked: true, keyCount: 61 })
    fireEvent.click(trigger)
    const btn = getByText('61') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(onKeyCountChange).not.toHaveBeenCalled()
    expect(getByText('Following connected piano (61 keys) — locked')).toBeTruthy()
  })

  it('marks the active key count with the blue style', () => {
    const { trigger, getByText } = setup({ keyCount: 76 })
    fireEvent.click(trigger)
    expect((getByText('76') as HTMLElement).className).toContain('bg-blue-500')
    expect((getByText('88') as HTMLElement).className).not.toContain('bg-blue-500')
  })

  it('wires each setting-row toggle to its handler', () => {
    const { trigger, container, onCountdownToggle, onMetronomeToggle, onMeasureLinesToggle } = setup()
    fireEvent.click(trigger)
    const toggles = container.querySelectorAll('[data-toggle]')
    expect(toggles.length).toBe(3) // countdown, metronome, measure-lines
    fireEvent.click(toggles[0]); fireEvent.click(toggles[1]); fireEvent.click(toggles[2])
    expect(onCountdownToggle).toHaveBeenCalledTimes(1)
    expect(onMetronomeToggle).toHaveBeenCalledTimes(1)
    expect(onMeasureLinesToggle).toHaveBeenCalledTimes(1)
  })

  it('adds the gear-spin class only after the first trigger', () => {
    const { trigger, container } = setup()
    expect(container.querySelector('.free-gear-spin')).toBeNull()
    fireEvent.click(trigger)
    expect(container.querySelector('.free-gear-spin')).toBeTruthy()
  })
})
