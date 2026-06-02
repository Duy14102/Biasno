import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import ToggleSwitch from './ToggleSwitch'

const meta = {
  title: 'Header/ToggleSwitch',
  component: ToggleSwitch,
  args: { onClick: fn() },
  argTypes: { on: { control: 'boolean' } },
} satisfies Meta<typeof ToggleSwitch>

export default meta
type Story = StoryObj<typeof meta>

export const Off: Story = { args: { on: false } }
export const On: Story = { args: { on: true } }
