import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import ClearConfirmModal from './ClearConfirmModal'

const meta = {
  title: 'FreeMode/ClearConfirmModal',
  component: ClearConfirmModal,
  args: { name: 'Untitled take', onCancel: fn(), onConfirm: fn() },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ClearConfirmModal>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
