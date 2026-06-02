import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import ProgressBar from './ProgressBar'

const meta = {
  title: 'Transport/ProgressBar',
  component: ProgressBar,
  args: { duration: 180, currentTime: 72, loopRegion: null, onSeek: fn(), onLoopChange: fn() },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ProgressBar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const NearEnd: Story = { args: { currentTime: 175 } }
export const WithLoopRegion: Story = { args: { loopRegion: { start: 0.25, end: 0.6 } } }
