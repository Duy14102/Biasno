import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import ExportMenu from './ExportMenu'

const meta = {
  title: 'FreeMode/ExportMenu',
  component: ExportMenu,
  args: { onMidi: fn(), onXml: fn(), onPdf: fn(), busy: null, disabled: false },
} satisfies Meta<typeof ExportMenu>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Disabled: Story = { args: { disabled: true } }
export const ExportingPdf: Story = { args: { busy: 'pdf' } }
