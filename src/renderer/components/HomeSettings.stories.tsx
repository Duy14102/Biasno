import type { Meta, StoryObj } from '@storybook/react-vite'
import HomeSettings from './HomeSettings'

const meta = {
  title: 'Home/HomeSettings',
  component: HomeSettings,
} satisfies Meta<typeof HomeSettings>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
