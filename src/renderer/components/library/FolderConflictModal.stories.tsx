import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import FolderConflictModal from './FolderConflictModal'

const meta = {
  title: 'Library/FolderConflictModal',
  component: FolderConflictModal,
  args: {
    folder: 'C:/Users/me/Music/MIDI',
    conflicts: [
      { name: 'Canon in D.mid', path: 'C:/midi/canon.mid' },
      { name: 'Gymnopédie No.1.mid', path: 'C:/midi/gymnopedie.mid' },
    ],
    onCancel: fn(),
    onConfirm: fn(),
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof FolderConflictModal>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
