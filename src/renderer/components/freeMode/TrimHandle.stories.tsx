import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import TrimHandle from './TrimHandle'

const meta = {
  title: 'FreeMode/TrimHandle',
  component: TrimHandle,
  args: { side: 'left', pct: 50, onMouseDown: fn(), dragging: false, snapping: false },
  decorators: [(Story) => (
    <div style={{ position: 'relative', width: 480, height: 64, background: '#1e293b', borderRadius: 8 }}>
      <Story />
    </div>
  )],
} satisfies Meta<typeof TrimHandle>

export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = {}
export const Dragging: Story = { args: { dragging: true } }
export const Snapping: Story = { args: { snapping: true } }
