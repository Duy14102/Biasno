import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import ConfirmModal from './ConfirmModal'
import { TrashIcon, WarningIcon } from './icons'

const meta = {
  title: 'Common/ConfirmModal',
  component: ConfirmModal,
  args: { onCancel: fn(), onConfirm: fn() },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ConfirmModal>

export default meta
type Story = StoryObj<typeof meta>

export const Delete: Story = {
  args: {
    icon: <TrashIcon className="w-5 h-5" />,
    iconAccent: 'red',
    title: 'Delete this recording?',
    subtitle: 'My first take.mid',
    cancelLabel: 'Cancel',
    confirmLabel: 'Delete',
    children: 'This removes the take from your library. It cannot be undone.',
  },
}

export const Warning: Story = {
  args: {
    icon: <WarningIcon className="w-5 h-5" />,
    iconAccent: 'amber',
    confirmAccent: 'amber',
    title: 'Discard unsaved changes?',
    cancelLabel: 'Keep editing',
    confirmLabel: 'Discard',
    children: 'Your current edits to the clip will be lost.',
  },
}
