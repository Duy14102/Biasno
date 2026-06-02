import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import SpeedControl, { SPEED_PRESETS } from './SpeedControl'

const meta = {
  title: 'FreeMode/SpeedControl',
  component: SpeedControl,
  args: { speed: 1, onChange: fn() },
  argTypes: { speed: { control: 'select', options: SPEED_PRESETS } },
} satisfies Meta<typeof SpeedControl>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Slowest: Story = { args: { speed: 0.5 } }
export const Fastest: Story = { args: { speed: 2 } }
export const Disabled: Story = { args: { disabled: true } }
