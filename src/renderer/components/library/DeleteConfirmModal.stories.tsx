import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import DeleteConfirmModal from './DeleteConfirmModal'

const meta = {
  title: 'Library/DeleteConfirmModal',
  component: DeleteConfirmModal,
  args: {
    entry: { name: 'Clair de Lune.mid', path: 'C:/midi/clair-de-lune.mid', source: 'import' },
    onCancel: fn(),
    onConfirm: fn(),
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DeleteConfirmModal>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
