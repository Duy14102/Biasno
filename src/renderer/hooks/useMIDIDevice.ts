import { useEffect, useRef, useState, useCallback } from 'react'
import type { MidiDevice } from '../types'

export type MidiNoteCallback = (midi: number, velocity: number, on: boolean) => void

export function useMIDIDevice(onNote: MidiNoteCallback) {
  const [supported, setSupported] = useState(false)
  const [devices, setDevices] = useState<MidiDevice[]>([])
  const [connectedId, setConnectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const accessRef = useRef<MIDIAccess | null>(null)
  const onNoteRef = useRef(onNote)
  onNoteRef.current = onNote

  const handleMidiMessage = useCallback((e: MIDIMessageEvent) => {
    if (!e.data || e.data.length < 2) return
    const [status, note, velocity] = Array.from(e.data)
    const cmd = status & 0xf0

    if (cmd === 0x90 && velocity > 0) {
      onNoteRef.current(note, velocity / 127, true)
    } else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) {
      onNoteRef.current(note, 0, false)
    }
  }, [])

  useEffect(() => {
    if (!navigator.requestMIDIAccess) {
      setSupported(false)
      setError('Web MIDI API không được hỗ trợ')
      return
    }

    setSupported(true)

    navigator.requestMIDIAccess({ sysex: false }).then((access) => {
      accessRef.current = access

      const refreshDevices = () => {
        const inputs: MidiDevice[] = []
        access.inputs.forEach((input) => {
          inputs.push({ id: input.id, name: input.name || `MIDI Input ${input.id}`, type: 'input' })
        })
        setDevices(inputs)
      }

      refreshDevices()
      access.onstatechange = () => refreshDevices()
    }).catch((err) => {
      setError(`Không thể truy cập MIDI: ${err.message}`)
    })
  }, [])

  const connect = useCallback((deviceId: string) => {
    const access = accessRef.current
    if (!access) return

    // Disconnect previous
    access.inputs.forEach((input) => {
      input.onmidimessage = null
    })

    if (deviceId === '__none__') {
      setConnectedId(null)
      return
    }

    const input = access.inputs.get(deviceId)
    if (!input) return

    input.onmidimessage = handleMidiMessage
    setConnectedId(deviceId)
  }, [handleMidiMessage])

  const disconnect = useCallback(() => {
    const access = accessRef.current
    if (!access) return
    access.inputs.forEach((input) => { input.onmidimessage = null })
    setConnectedId(null)
  }, [])

  return { supported, devices, connectedId, error, connect, disconnect }
}
