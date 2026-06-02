import type { Meta, StoryObj } from '@storybook/react-vite'
import VirtualFileList, { FILE_ROW_HEIGHT } from './VirtualFileList'

// Generic component — type the meta loosely and drive everything from `render`
// so the generic parameter doesn't need to be threaded through CSF args.
const meta: Meta = {
  title: 'Library/VirtualFileList',
}

export default meta
type Story = StoryObj

const items = Array.from({ length: 500 }, (_, i) => `Song ${i + 1}`)

export const FiveHundredRows: Story = {
  render: () => (
    <div style={{ height: 320, width: 320 }} className="rounded-lg border border-slate-300 dark:border-slate-700">
      <VirtualFileList
        items={items}
        rowKey={(item) => item}
        renderRow={(item) => (
          <div
            style={{ height: FILE_ROW_HEIGHT }}
            className="flex items-center px-4 text-sm text-slate-700 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800"
          >
            {item}
          </div>
        )}
      />
    </div>
  ),
}
