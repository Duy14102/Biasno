import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import FreeModeSettings from './FreeModeSettings'

const meta = {
  title: 'FreeMode/FreeModeSettings',
  component: FreeModeSettings,
  args: {
    keyCount: 88,
    keyCountLocked: false,
    onKeyCountChange: fn(),
    countdownEnabled: true,
    onCountdownToggle: fn(),
    metronomeEnabled: false,
    onMetronomeToggle: fn(),
    measureLinesEnabled: true,
    onMeasureLinesToggle: fn(),
    midiConnected: false,
    pianoOwnSound: false,
    onPianoOwnSoundToggle: fn(),
  },
} satisfies Meta<typeof FreeModeSettings>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const MidiConnected: Story = { args: { midiConnected: true, pianoOwnSound: true } }
export const KeyCountLocked: Story = { args: { keyCountLocked: true, keyCount: 61 } }
