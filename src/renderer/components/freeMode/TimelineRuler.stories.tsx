import type { Meta, StoryObj } from '@storybook/react-vite'
import TimelineRuler from './TimelineRuler'

const meta = {
  title: 'FreeMode/TimelineRuler',
  component: TimelineRuler,
  args: { range: 30_000 },
  decorators: [(Story) => <div style={{ position: 'relative', width: 640 }}><Story /></div>],
} satisfies Meta<typeof TimelineRuler>

export default meta
type Story = StoryObj<typeof meta>

export const ThirtySeconds: Story = {}
export const TwoMinutes: Story = { args: { range: 120_000 } }
