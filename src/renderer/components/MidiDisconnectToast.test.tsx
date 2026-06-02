import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'

const dismiss = vi.fn()
let notice: { name: string } | null = null
vi.mock('@/context', () => ({ useMidi: () => ({ disconnectNotice: notice, dismissDisconnectNotice: dismiss }) }))
vi.mock('@/i18n', () => ({
  useLanguage: () => ({
    t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k),
  }),
}))

import MidiDisconnectToast from './MidiDisconnectToast'

beforeEach(() => { notice = null; dismiss.mockClear(); vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('MidiDisconnectToast', () => {
  it('renders nothing when there is no notice', () => {
    const { container } = render(<MidiDisconnectToast />)
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('renders the toast with the device name when a notice is present', () => {
    notice = { name: 'My Piano' }
    const { getByText, getByRole } = render(<MidiDisconnectToast />)
    expect(getByRole('alert')).toBeTruthy()
    expect(getByText(/My Piano/)).toBeTruthy()
  })

  it('auto-dismisses after the timeout', () => {
    notice = { name: 'X' }
    render(<MidiDisconnectToast />)
    expect(dismiss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(7000)
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('dismisses on the close button click', () => {
    notice = { name: 'X' }
    const { getByLabelText } = render(<MidiDisconnectToast />)
    fireEvent.click(getByLabelText('dismiss'))
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('does not arm a timer when there is no notice (effect early return)', () => {
    notice = null
    render(<MidiDisconnectToast />)
    vi.advanceTimersByTime(7000)
    expect(dismiss).not.toHaveBeenCalled()
  })
})
