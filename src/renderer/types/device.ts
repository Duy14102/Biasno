// ─── MIDI device types ──────────────────────────────────────────────────────
// What the Web MIDI hook (`useMIDIDevice`) returns about connected hardware.

export interface MidiDevice {
  id:   string
  name: string
  type: 'input' | 'output'
}
