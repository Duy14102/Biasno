import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import IconBtn from './IconBtn'
import { PlayIcon, GearIcon, BackIcon } from './icons'

const meta = {
  title: 'Header/IconBtn',
  component: IconBtn,
  args: { onClick: fn(), title: 'Play' },
} satisfies Meta<typeof IconBtn>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { children: <PlayIcon /> },
}

export const Active: Story = {
  args: { title: 'Settings', active: true, children: <GearIcon /> },
}

export const Danger: Story = {
  args: { title: 'Back', danger: true, children: <BackIcon /> },
}
