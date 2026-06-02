import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import LibrarySearch from './LibrarySearch'

const meta = {
  title: 'Library/LibrarySearch',
  component: LibrarySearch,
  args: { value: '', onChange: fn() },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
} satisfies Meta<typeof LibrarySearch>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {}
export const WithQuery: Story = { args: { value: 'nocturne' } }
