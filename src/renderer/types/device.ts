// ─── MIDI device types ──────────────────────────────────────────────────────
// What MidiContext exposes about connected hardware.

export interface MidiDevice {
  id:   string
  name: string
  type: 'input' | 'output'
}
