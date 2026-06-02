import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import type { RecordedNote, Clip } from '@/freeMode'
import ClipNotesPreview from './ClipNotesPreview'

// A short C-major run, ascending then a held chord.
const notes: RecordedNote[] = [60, 62, 64, 65, 67, 69, 71, 72].map((midi, i) => ({
  id: `n${i}`,
  midi,
  startMs: i * 320,
  endMs: i * 320 + 280,
  velocity: 0.7,
}))

const clips: Clip[] = [
  { id: 'c1', startMs: 0, endMs: 1280, volume: 1, locked: false },
  { id: 'c2', startMs: 1280, endMs: 2560, volume: 1, locked: false, comment: 'second phrase' },
]

const meta = {
  title: 'FreeMode/ClipNotesPreview',
  component: ClipNotesPreview,
  args: { notes, clips, durationMs: 2560, selectedClipId: 'c1', onSeek: fn(), showMeasureLines: false },
  decorators: [(Story) => <div style={{ width: 640, height: 160 }}><Story /></div>],
} satisfies Meta<typeof ClipNotesPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const SecondClipSelected: Story = { args: { selectedClipId: 'c2' } }
export const WithMeasureLines: Story = { args: { showMeasureLines: true } }
