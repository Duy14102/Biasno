import React from 'react'
import { MinusIcon, PlusIcon } from '@/components/header'

// Six fixed presets — same range as PracticeHeader's BPM multiplier, so the
// vocabulary feels consistent across the app.  Anything outside this set
// snaps to 1x on next change.
export const SPEED_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

interface Props {
  speed:    number
  onChange: (next: number) => void
  disabled?: boolean
}

export default function SpeedControl({ speed, onChange, disabled }: Props): React.JSX.Element {
  const i = Math.max(0, SPEED_PRESETS.indexOf(speed as typeof SPEED_PRESETS[number]))
  const canDown = i > 0
  const canUp   = i < SPEED_PRESETS.length - 1

  const step = (dir: -1 | 1) => () => {
    const next = SPEED_PRESETS[Math.max(0, Math.min(SPEED_PRESETS.length - 1, i + dir))]
    onChange(next)
  }

  return (
    <div
      className={[
        'flex items-center h-11 rounded-xl bg-slate-100 dark:bg-slate-800',
        'border border-slate-200 dark:border-slate-700 px-1',
        disabled ? 'opacity-50' : '',
      ].join(' ')}
      title="Playback speed"
    >
      <button
        type="button"
        onClick={step(-1)}
        disabled={disabled || !canDown}
        className="w-7 h-9 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Slower"
      >
        <MinusIcon className="w-3.5 h-3.5" />
      </button>
      <div
        // Double-click resets to 1× — matches the BPM control's reset gesture.
        onDoubleClick={() => onChange(1)}
        className="px-2 min-w-[3rem] text-center text-sm font-mono font-semibold text-slate-700 dark:text-slate-200 tabular-nums select-none cursor-pointer"
        title="Double-click to reset to 1×"
      >
        {speed}×
      </div>
      <button
        type="button"
        onClick={step(1)}
        disabled={disabled || !canUp}
        className="w-7 h-9 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Faster"
      >
        <PlusIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
