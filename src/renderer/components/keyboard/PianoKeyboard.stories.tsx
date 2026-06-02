import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import PianoKeyboard from './PianoKeyboard'

// A C-major triad in the right hand plus one wrong-key flash.
const activeKeys = new Map<number, { hand: 'left' | 'right' | 'unknown'; hitState?: 'correct' | 'wrong' }>([
  [60, { hand: 'right', hitState: 'correct' }],
  [64, { hand: 'right', hitState: 'correct' }],
  [67, { hand: 'right', hitState: 'correct' }],
  [48, { hand: 'left' }],
  [70, { hand: 'right', hitState: 'wrong' }],
])

const meta = {
  title: 'Keyboard/PianoKeyboard',
  component: PianoKeyboard,
  args: { activeKeys, onKeyDown: fn(), onKeyUp: fn() },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PianoKeyboard>

export default meta
type Story = StoryObj<typeof meta>

export const FullEightyEight: Story = {}
export const SixtyOneKeys: Story = { args: { keyCount: 61 } }
export const WithHints: Story = { args: { activeKeys: new Map(), hintKeys: new Set([62, 65, 69]) } }
