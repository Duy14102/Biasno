// "My piano makes its own sound" — shared across every surface that turns
// physical-piano input into audio (Practice, Free Mode, Home preview).
//
// When the toggle is on AND a MIDI device is connected, the app stops
// re-synthesising notes that arrive FROM the device, so a piano with its own
// speakers (e.g. Yamaha P45, whose Local Control can't be disabled) isn't
// doubled.  Computer-keyboard / on-screen input is never suppressed by this —
// it has no other sound source.  The setting is persisted, so the choice is
// shared across pages and survives restarts.
import { useCallback, useState } from 'react'
import { useMidi } from '@/context'
import { LS } from '@/constants'

export function usePianoOwnSound(): {
  pianoOwnSound:       boolean
  togglePianoOwnSound: () => void
  suppressDeviceAudio: boolean
} {
  const { connectedId } = useMidi()
  const [pianoOwnSound, setPianoOwnSound] = useState(
    () => localStorage.getItem(LS.MIDI_OWN_SOUND) === 'true',
  )
  const togglePianoOwnSound = useCallback(() => {
    setPianoOwnSound((prev) => {
      const next = !prev
      localStorage.setItem(LS.MIDI_OWN_SOUND, String(next))
      return next
    })
  }, [])
  return {
    pianoOwnSound,
    togglePianoOwnSound,
    suppressDeviceAudio: pianoOwnSound && connectedId !== null,
  }
}
