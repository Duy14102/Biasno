import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { MidiProvider, useMidi } from './MidiContext'
import { LanguageProvider } from '@/i18n'
import { LS } from '@/constants'

// ─── Fake Web MIDI ──────────────────────────────────────────────────────────
interface FakeInput {
  id: string
  name: string | null
  open?: () => Promise<void>
  onmidimessage: ((e: { data: Uint8Array | null }) => void) | null
}

class FakeAccess {
  inputs = new Map<string, FakeInput>()
  onstatechange: (() => void) | null = null
  addInput(i: FakeInput) { this.inputs.set(i.id, i); this.onstatechange?.() }
  removeInput(id: string) { this.inputs.delete(id); this.onstatechange?.() }
}

let access: FakeAccess
let requestImpl: () => Promise<FakeAccess>

const mkInput = (id: string, name: string | null = id, open?: () => Promise<void>): FakeInput =>
  ({ id, name, open: open ?? (() => Promise.resolve()), onmidimessage: null })

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider><MidiProvider>{children}</MidiProvider></LanguageProvider>
)
const setup = () => renderHook(() => useMidi(), { wrapper })

afterEach(cleanup)
beforeEach(() => {
  localStorage.clear()
  access = new FakeAccess()
  requestImpl = () => Promise.resolve(access)
  vi.stubGlobal('navigator', {
    requestMIDIAccess: vi.fn(() => requestImpl()),
  })
})

describe('MidiContext support detection', () => {
  it('marks unsupported and sets a global error when Web MIDI is missing', async () => {
    vi.stubGlobal('navigator', {})
    const { result } = setup()
    await waitFor(() => expect(result.current.supported).toBe(false))
    expect(result.current.globalError).toBeTruthy()
  })

  it('surfaces a global error when requestMIDIAccess rejects', async () => {
    requestImpl = () => Promise.reject(new Error('denied'))
    const { result } = setup()
    await waitFor(() => expect(result.current.globalError).toBeTruthy())
    expect(result.current.supported).toBe(true)
    expect(result.current.globalError).toContain('denied')
  })
})

describe('MidiContext device list + auto-connect', () => {
  it('auto-connects when exactly one device is present', async () => {
    access.inputs.set('d1', mkInput('d1', 'Piano'))
    const { result } = setup()
    await waitFor(() => expect(result.current.connectedId).toBe('d1'))
    expect(result.current.devices).toHaveLength(1)
    expect(result.current.devices[0]).toMatchObject({ id: 'd1', online: true, remembered: true })
  })

  it('does NOT auto-connect when multiple unknown devices appear', async () => {
    access.inputs.set('d1', mkInput('d1'))
    access.inputs.set('d2', mkInput('d2'))
    const { result } = setup()
    await waitFor(() => expect(result.current.devices).toHaveLength(2))
    expect(result.current.connectedId).toBeNull()
  })

  it('prefers the most-recently-used remembered online device', async () => {
    localStorage.setItem(LS.MIDI_KNOWN, JSON.stringify([
      { id: 'd1', name: 'Old', lastConnectedAt: 1 },
      { id: 'd2', name: 'New', lastConnectedAt: 99 },
    ]))
    access.inputs.set('d1', mkInput('d1'))
    access.inputs.set('d2', mkInput('d2'))
    const { result } = setup()
    await waitFor(() => expect(result.current.connectedId).toBe('d2'))
  })

  it('appends remembered-but-offline devices to the view', async () => {
    localStorage.setItem(LS.MIDI_KNOWN, JSON.stringify([
      { id: 'gone', name: 'Ghost', lastConnectedAt: 5 },
    ]))
    const { result } = setup()
    await waitFor(() => expect(result.current.devices.some(d => d.id === 'gone')).toBe(true))
    const ghost = result.current.devices.find(d => d.id === 'gone')!
    expect(ghost).toMatchObject({ online: false, remembered: true, name: 'Ghost' })
  })
})

describe('MidiContext connect / disconnect', () => {
  it('manual connect remembers the device and toggling it off disconnects', async () => {
    access.inputs.set('a', mkInput('a', 'A'))
    access.inputs.set('b', mkInput('b', 'B'))
    const { result } = setup()
    await waitFor(() => expect(result.current.devices).toHaveLength(2))

    act(() => result.current.connect('a'))
    await waitFor(() => expect(result.current.connectedId).toBe('a'))
    expect(JSON.parse(localStorage.getItem(LS.MIDI_KNOWN)!)).toHaveLength(1)

    act(() => result.current.connect('a')) // toggle off
    expect(result.current.connectedId).toBeNull()
  })

  it('reports offline error when the device is not in the access list', async () => {
    access.inputs.set('a', mkInput('a'))
    access.inputs.set('b', mkInput('b'))
    const { result } = setup()
    await waitFor(() => expect(result.current.devices).toHaveLength(2))
    act(() => result.current.connect('ghost'))
    await waitFor(() => expect(result.current.connectError?.deviceId).toBe('ghost'))
    expect(result.current.connectError?.message).toBeTruthy()
  })

  it('reports a connect failure when input.open() throws', async () => {
    access.inputs.set('a', mkInput('a'))
    access.inputs.set('b', mkInput('b', 'B', () => Promise.reject(new Error('busy'))))
    const { result } = setup()
    await waitFor(() => expect(result.current.devices).toHaveLength(2))
    act(() => result.current.connect('b'))
    await waitFor(() => expect(result.current.connectError?.deviceId).toBe('b'))
    expect(result.current.connectError?.message).toContain('busy')
  })

  it('disconnect clears the active connection', async () => {
    access.inputs.set('a', mkInput('a', 'A'))
    const { result } = setup()
    await waitFor(() => expect(result.current.connectedId).toBe('a'))
    act(() => result.current.disconnect())
    expect(result.current.connectedId).toBeNull()
  })

  it('dismissConnectError clears the error', async () => {
    access.inputs.set('a', mkInput('a'))
    access.inputs.set('b', mkInput('b'))
    const { result } = setup()
    await waitFor(() => expect(result.current.devices).toHaveLength(2))
    act(() => result.current.connect('ghost'))
    await waitFor(() => expect(result.current.connectError).not.toBeNull())
    act(() => result.current.dismissConnectError())
    expect(result.current.connectError).toBeNull()
  })
})

describe('MidiContext forgetDevice + disconnect notice', () => {
  it('forgetDevice removes a remembered device and disconnects if active', async () => {
    access.inputs.set('a', mkInput('a', 'A'))
    const { result } = setup()
    await waitFor(() => expect(result.current.connectedId).toBe('a'))
    act(() => result.current.forgetDevice('a'))
    expect(result.current.connectedId).toBeNull()
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(LS.MIDI_KNOWN)!).some((k: { id: string }) => k.id === 'a')).toBe(false))
  })

  it('raises a disconnect notice when the active device disappears', async () => {
    access.inputs.set('a', mkInput('a', 'A'))
    const { result } = setup()
    await waitFor(() => expect(result.current.connectedId).toBe('a'))
    act(() => access.removeInput('a'))
    await waitFor(() => expect(result.current.disconnectNotice?.name).toBe('A'))
    expect(result.current.connectedId).toBeNull()
    act(() => result.current.dismissDisconnectNotice())
    expect(result.current.disconnectNotice).toBeNull()
  })
})

describe('MidiContext message dispatch', () => {
  it('fans out note-on, note-off and pedal events; unsubscribe stops delivery', async () => {
    const input = mkInput('a', 'A')
    access.inputs.set('a', input)
    const { result } = setup()
    await waitFor(() => expect(result.current.connectedId).toBe('a'))

    const notes: Array<[number, number, boolean]> = []
    const pedals: boolean[] = []
    let unNote = () => {}
    act(() => {
      unNote = result.current.subscribe((m, v, on) => notes.push([m, v, on]))
      result.current.subscribePedal(d => pedals.push(d))
    })

    const send = (bytes: number[]) => act(() => input.onmidimessage?.({ data: new Uint8Array(bytes) }))
    send([0x90, 60, 127])   // note on
    send([0x80, 60, 0])     // note off (explicit)
    send([0x90, 62, 0])     // note off (note-on, vel 0)
    send([0xb0, 64, 100])   // pedal down
    send([0xb0, 64, 10])    // pedal up
    send([0xb0, 7, 100])    // non-pedal CC -> ignored
    send([0x90])            // too short -> ignored
    act(() => input.onmidimessage?.({ data: null })) // null data -> ignored

    expect(notes).toEqual([[60, 1, true], [60, 0, false], [62, 0, false]])
    expect(pedals).toEqual([true, false])

    notes.length = 0
    act(() => unNote())
    send([0x90, 60, 127])
    expect(notes).toEqual([])
  })

  it('useMidi throws outside a provider', () => {
    expect(() => renderHook(() => useMidi(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <LanguageProvider>{children}</LanguageProvider>,
    })).toThrow(/within MidiProvider/)
  })
})
