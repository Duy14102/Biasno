import React, { useMemo } from 'react'
import { formatTimeMs } from '@/utils'

// Canva-style horizontal time ruler.  Major ticks carry a small text label
// (m:ss) plus a tall vertical mark; minor ticks (5 per major) are shorter
// unlabelled marks.  Step picks itself based on duration so labels never
// crowd each other on short takes and never sparse-out on long ones.
function pickStep(durMs: number): { major: number; minor: number } {
  const dur = durMs / 1000
  if (dur <  6)  return { major: 1000,  minor: 200  }
  if (dur < 30)  return { major: 5000,  minor: 1000 }
  if (dur < 120) return { major: 10000, minor: 2000 }
  if (dur < 600) return { major: 30000, minor: 5000 }
  return { major: 60000, minor: 10000 }
}

interface Props {
  range: number
}

export default function TimelineRuler({ range }: Props): React.JSX.Element {
  const { majors, minors } = useMemo(() => {
    const step = pickStep(range)
    const majors: number[] = []
    const minors: number[] = []
    for (let ms = 0; ms <= range; ms += step.minor) {
      if (Math.abs(ms % step.major) < 0.5) majors.push(ms)
      else minors.push(ms)
    }
    return { majors, minors }
  }, [range])

  const safeRange = Math.max(1, range)

  return (
    <div className="relative h-6 select-none">
      {minors.map((ms) => {
        const pct = (ms / safeRange) * 100
        return (
          <span
            key={`min-${ms}`}
            aria-hidden
            className="absolute bottom-0 w-px h-1.5 bg-slate-300 dark:bg-slate-700"
            style={{ left: `${pct}%` }}
          />
        )
      })}
      {majors.map((ms) => {
        const pct = (ms / safeRange) * 100
        const isLast = ms >= range - 1
        return (
          <div
            key={`maj-${ms}`}
            className="absolute bottom-0 flex items-end gap-1 whitespace-nowrap"
            style={{
              left: `${pct}%`,
              transform: isLast ? 'translateX(-100%)' : undefined,
            }}
          >
            <span className="w-px h-3 bg-slate-400 dark:bg-slate-500" />
            <span className="text-[10px] font-mono tabular-nums leading-none text-slate-500 dark:text-slate-400 mb-[-2px]">
              {formatTimeMs(ms)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
