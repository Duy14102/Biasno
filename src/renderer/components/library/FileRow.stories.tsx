import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import FileRow from './FileRow'

const meta = {
  title: 'Library/FileRow',
  component: FileRow,
  args: {
    entry: { name: 'Nocturne Op.9 No.2.mid', path: 'C:/midi/nocturne.mid', duration: 268, source: 'import' },
    isLoading: false,
    isHovered: false,
    onHoverChange: fn(),
    onClick: fn(),
    onDelete: fn(),
  },
  decorators: [(Story) => <div style={{ width: 360 }}><Story /></div>],
} satisfies Meta<typeof FileRow>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Hovered: Story = { args: { isHovered: true } }
export const Loading: Story = { args: { isLoading: true } }
export const FromFolder: Story = {
  args: { entry: { name: 'Prelude.mid', path: 'C:/midi/prelude.mid', duration: 92, source: 'folder', folderPath: 'C:/midi' } },
}
