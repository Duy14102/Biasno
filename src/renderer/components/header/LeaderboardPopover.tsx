import React, { useEffect, useMemo, useRef, useState } from 'react'
import ToggleSwitch from './ToggleSwitch'
import { DROPDOWN_CSS } from './modeGroups'
import { useLanguage } from '@/i18n'
import { getScores, type ScoreEntry } from '@/practice'
import type { PracticeMode } from '@/types'
import { formatShortDate, formatTimeSec } from '@/utils'

interface Props {
  songName:         string
  mode:             PracticeMode
  challengeEnabled: boolean
  onChallengeToggle: () => void
  scoreVersion?:    number
}

const POPOVER_STYLE = `
@keyframes lbpRow {
  0%   { opacity: 0; transform: translateX(-6px); }
  100% { opacity: 1; transform: translateX(0); }
}
.lbp-row { animation: lbpRow 220ms cubic-bezier(0.16, 1, 0.3, 1) both; }
`

export default function LeaderboardPopover({
  songName, mode, challengeEnabled, onChallengeToggle, scoreVersion,
}: Props): React.JSX.Element {
  const { t } = useLanguage()
  const [open, setOpen]     = useState(false)
  const [scores, setScores] = useState<ScoreEntry[]>([])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setScores(getScores(songName))
  }, [open, songName, scoreVersion])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const forMode = useMemo(
    () => scores.filter((s) => s.mode === mode).sort((a, b) =>
      b.score !== a.score ? b.score - a.score : b.accuracy - a.accuracy
    ),
    [scores, mode]
  )

  const best = forMode[0]

  return (
    <div ref={ref} className="relative">
      <style>{DROPDOWN_CSS}</style>
      <style>{POPOVER_STYLE}</style>

      <button
        onClick={() => setOpen((v) => !v)}
        title={t('leaderboardTitle')}
        className={[
          'flex items-center justify-center w-9 h-9 rounded-lg text-sm',
          'transition-[background-color,border-color,box-shadow,transform] duration-150',
          'hover:-translate-y-0.5 active:translate-y-0',
          open
            ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/40'
            : 'bg-slate-100 border border-slate-300 hover:bg-slate-200 hover:border-slate-400 hover:shadow-md hover:shadow-amber-500/10 text-slate-700 dark:bg-slate-700 dark:border-transparent dark:hover:bg-slate-600 dark:text-slate-300 dark:hover:text-white',
        ].join(' ')}
      >
        <span className="text-base leading-none" aria-hidden>🏆</span>
      </button>

      {open && (
        <div className="hdr-dd-enter absolute right-0 top-full mt-1.5 z-50 w-[360px] rounded-2xl bg-white/95 border-slate-200 dark:bg-slate-800/95 dark:border-slate-600/80 backdrop-blur-md border shadow-2xl shadow-black/20 dark:shadow-black/60 overflow-hidden origin-top-right">

          <div className="px-4 pt-3 pb-2 border-b border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t('leaderboardTitle')}
            </p>
            {best && (
              <span className="text-[10px] font-bold tabular-nums text-amber-600 dark:text-amber-300">
                ★ {Math.round(best.score)}
              </span>
            )}
          </div>

          <div className="hdr-dd-item px-4 py-2.5 flex items-center justify-between" style={{ animationDelay: '30ms' }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-amber-500 dark:text-amber-300 text-base leading-none" aria-hidden>🏆</span>
              <span className="text-slate-700 dark:text-slate-200 text-sm">{t('challengeMode')}</span>
            </div>
            <ToggleSwitch on={challengeEnabled} onClick={onChallengeToggle} />
          </div>

          <div className="mx-4 border-t border-slate-200 dark:border-slate-700/50" />

          {!challengeEnabled ? (
            <div className="px-4 py-5 text-center text-xs text-slate-500 dark:text-slate-400">
              {t('challengeOff')}
            </div>
          ) : forMode.length === 0 ? (
            <div className="px-4 py-5 text-center text-xs text-slate-500 dark:text-slate-400">
              <div className="text-2xl mb-1 opacity-50">🎼</div>
              {t('noScoresYet')}
            </div>
          ) : (
            <div className="max-h-[320px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="text-left  px-3 py-1.5 font-semibold">{t('rankColumn')}</th>
                    <th className="text-right px-3 py-1.5 font-semibold">{t('scoreColumn')}</th>
                    <th className="text-right px-3 py-1.5 font-semibold">{t('accuracyColumn')}</th>
                    <th className="text-right px-3 py-1.5 font-semibold">{t('comboColumn')}</th>
                    <th className="text-right px-3 py-1.5 font-semibold">{t('dateColumn')}</th>
                  </tr>
                </thead>
                <tbody>
                  {forMode.map((s, i) => {
                    const isTop = i === 0
                    return (
                      <tr
                        key={`${s.date}-${i}`}
                        className={[
                          'lbp-row border-t border-slate-100 dark:border-slate-800',
                          isTop ? 'bg-amber-50/60 dark:bg-amber-500/5' : '',
                        ].join(' ')}
                        style={{ animationDelay: `${Math.min(i, 8) * 24}ms` } as React.CSSProperties}
                      >
                        <td className="px-3 py-1.5 font-bold tabular-nums">
                          {isTop ? <span className="text-amber-500">🥇</span> : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                          {Math.round(s.score)}
                          {s.loopRegion && (
                            <span
                              title={`Loop ${formatTimeSec(s.loopRegion.startSec)} – ${formatTimeSec(s.loopRegion.endSec)}`}
                              className="ml-1 text-blue-500 dark:text-blue-300"
                              aria-hidden
                            >↻</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                          {Math.round(s.accuracy * 100)}%
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                          {s.maxCombo}
                        </td>
                        <td className="px-3 py-1.5 text-right text-slate-500 dark:text-slate-400">
                          {formatShortDate(s.date)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
