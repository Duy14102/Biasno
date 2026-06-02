import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import LeaderboardPopover from './LeaderboardPopover'

const meta = {
  title: 'Header/LeaderboardPopover',
  component: LeaderboardPopover,
  args: {
    songName: 'Für Elise',
    mode: 'right-melody',
    challengeEnabled: true,
    onChallengeToggle: fn(),
  },
} satisfies Meta<typeof LeaderboardPopover>

export default meta
type Story = StoryObj<typeof meta>

export const ChallengeOn: Story = {}
export const ChallengeOff: Story = { args: { challengeEnabled: false } }
