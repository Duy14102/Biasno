import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import { LanguageProvider } from '@/i18n'

// useMidi is the only context surface this component reads. Mock it so each
// test drives a specific device topology. Everything else in @/context is
// untouched by the picker.
const useMidi = vi.fn()
vi.mock('@/context', () => ({ useMidi: () => useMidi() }))
// The @/components/header barrel transitively imports `tone` (audio engine),
// which fails to resolve under jsdom. The picker only needs PianoIcon.
vi.mock('@/components/header', () => ({
  PianoIcon: (p: Record<string, unknown>) => React.createElement('svg', { 'data-icon': 'piano', ...p }),
}))

import MidiDevicePicker from './MidiDevicePicker'

type Dev = { id: string; name: string; online: boolean }

function midiState(over: Partial<ReturnType<typeof baseState>> = {}) {
  return { ...baseState(), ...over }
}
function baseState() {
  return {
    supported: true,
    devices: [] as Dev[],
    connectedId: null as string | null,
    connecting: null as string | null,
    connectError: null as { deviceId: string; message: string } | null,
    connect: vi.fn(),
    forgetDevice: vi.fn(),
  }
}

function renderPicker() {
  return render(
    <LanguageProvider>
      <MidiDevicePicker />
    </LanguageProvider>,
  )
}

beforeEach(() => { localStorage.setItem('biasno.lang', 'en') })
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

describe('MidiDevicePicker', () => {
  it('renders the unsupported panel when Web MIDI is unavailable', () => {
    useMidi.mockReturnValue(midiState({ supported: false }))
    const { getByText } = renderPicker()
    expect(getByText('MIDI unavailable')).toBeTruthy()
  })

  it('renders the empty panel when there are no devices', () => {
    useMidi.mockReturnValue(midiState({ devices: [] }))
    const { getByText } = renderPicker()
    expect(getByText('No piano connected')).toBeTruthy()
  })

  it('shows the active hero card and a click-to-connect hint with inactive rows', () => {
    const connect = vi.fn()
    useMidi.mockReturnValue(midiState({
      devices: [
        { id: 'a', name: 'Active Piano', online: true },
        { id: 'b', name: 'Other Piano', online: true },
      ],
      connectedId: 'a',
      connect,
    }))
    const { getByText, container } = renderPicker()
    expect(getByText('Active Piano')).toBeTruthy()
    expect(getByText('Connected — click to disconnect')).toBeTruthy()
    // Hint only shows because there is an active device + inactive rows.
    expect(getByText('Click to connect')).toBeTruthy()
    expect(getByText('Other Piano')).toBeTruthy()
    // Counter reads 1/<onlineCount=2>.
    expect(container.textContent).toContain('1/2')

    fireEvent.click(getByText('Active Piano'))
    expect(connect).toHaveBeenCalledWith('a')
  })

  it('lists inactive devices without a hint when nothing is connected (0/count)', () => {
    const connect = vi.fn()
    useMidi.mockReturnValue(midiState({
      devices: [{ id: 'b', name: 'Idle Piano', online: true }],
      connectedId: null,
      connect,
    }))
    const { getByText, queryByText, container } = renderPicker()
    expect(getByText('Idle Piano')).toBeTruthy()
    expect(queryByText('Click to connect')).toBeNull() // no active device
    expect(container.textContent).toContain('0/1')
    fireEvent.click(getByText('Idle Piano'))
    expect(connect).toHaveBeenCalledWith('b')
  })

  it('shows a connecting spinner and connecting hint for the row being connected', () => {
    useMidi.mockReturnValue(midiState({
      devices: [{ id: 'b', name: 'Pending Piano', online: true }],
      connecting: 'b',
    }))
    const { getByText, container } = renderPicker()
    expect(getByText('Connecting…')).toBeTruthy()
    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })

  it('offline remembered device shows offline badge + hint and a forget button that calls forgetDevice', () => {
    const forgetDevice = vi.fn()
    useMidi.mockReturnValue(midiState({
      devices: [{ id: 'b', name: 'Gone Piano', online: false }],
      forgetDevice,
    }))
    const { getByText, getByLabelText, container } = renderPicker()
    expect(getByText('Not plugged in')).toBeTruthy()
    expect(getByText('Remembered — plug it back in to connect')).toBeTruthy()
    // online=0 so counter is 0/0.
    expect(container.textContent).toContain('0/0')
    fireEvent.click(getByLabelText('Forget this piano'))
    expect(forgetDevice).toHaveBeenCalledWith('b')
  })

  it('renders the connect error message for the failing device', () => {
    useMidi.mockReturnValue(midiState({
      devices: [{ id: 'b', name: 'Err Piano', online: true }],
      connectError: { deviceId: 'b', message: 'boom' },
    }))
    const { getByText } = renderPicker()
    expect(getByText('boom')).toBeTruthy()
  })

  it('online inactive device exposes no forget button', () => {
    useMidi.mockReturnValue(midiState({
      devices: [{ id: 'b', name: 'Live Piano', online: true }],
    }))
    const { queryByLabelText } = renderPicker()
    expect(queryByLabelText('Forget this piano')).toBeNull()
  })
})
