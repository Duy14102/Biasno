import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import ModeDropdown from './ModeDropdown'

// Explicit annotation (not `satisfies`) so the emitted type names the imported
// component rather than its memo-internal `Props` — required under composite tsconfig.
const meta: Meta<typeof ModeDropdown> = {
  title: 'Header/ModeDropdown',
  component: ModeDropdown,
  args: { mode: 'right-melody', onModeChange: fn() },
}

export default meta
type Story = StoryObj<typeof ModeDropdown>

export const RightMelody: Story = {}
export const WatchAndListen: Story = { args: { mode: 'view-listen' } }
export const BothMelodyRhythm: Story = { args: { mode: 'both-melody-rhythm' } }
