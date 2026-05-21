import React, { useEffect, useMemo, useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext'
import type { TranslationKey } from '../../i18n/translations'
import { getScores, clearScores, addScore, type ScoreEntry } from '../../practice/leaderboard'
import type { PracticeMode } from '../../types'
import {
  parseMode, handLabelKey, skillLabelKey, modeLabel,
  type Skill, type HandFilter,
} from '../../practice/mode'
import { formatShortDate, formatTimeSec } from '../../utils/format'

interface Props {
  songName: string
  onClose:  () => void
}

const MODAL_STYLE = `
@keyframes lbBackdropIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes lbCardIn {
  0%   { opacity: 0; transform: translateY(20px) scale(0.96); }
  100% { opacity: 1; transform: translateY(0)    scale(1);    }
}
@keyframes lbRowIn {
  0%   { opacity: 0; transform: translateX(-12px); }
  100% { opacity: 1; transform: translateX(0); }
}
.lbBackdrop { animation: lbBackdropIn 180ms ease-out both; }
.lbCard     { animation: lbCardIn 260ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.lbRow      { animation: lbRowIn 280ms cubic-bezier(0.16, 1, 0.3, 1) both; }
`

type SkillTab = 'total' | Skill
const SKILL_TABS: { id: SkillTab; key: TranslationKey }[] = [
  { id: 'total',         key: 'lbTabTotal'  },
  { id: 'melody',        key: 'melody'      },
  { id: 'rhythm',        key: 'rhythm'      },
  { id: 'melody-rhythm', key: 'melodyRhythm' },
]

type HandTab = 'all' | HandFilter
const HAND_TABS: { id: HandTab; key: TranslationKey }[] = [
  { id: 'all',   key: 'lbHandAll' },
  { id: 'right', key: 'rightHand' },
  { id: 'left',  key: 'leftHand'  },
  { id: 'both',  key: 'bothHands' },
]

function filterScores(all: ScoreEntry[], skill: SkillTab, hand: HandTab): ScoreEntry[] {
  return all.filter((s) => {
    const p = parseMode(s.mode)
    if (skill !== 'total' && p.skill !== skill) return false
    if (skill !== 'total' && hand !== 'all' && p.hand !== hand) return false
    return true
  })
}

function rowModeLabel(mode: PracticeMode, t: (k: TranslationKey) => string): string {
  if (mode === 'view-listen') return t('viewListenShort')
  return modeLabel(mode, t)
}

export default function LeaderboardModal({ songName, onClose }: Props): React.JSX.Element {
  const { t } = useLanguage()
  const [allScores, setAllScores] = useState<ScoreEntry[]>(() => getScores(songName))
  const [skillTab,  setSkillTab]  = useState<SkillTab>('total')
  const [handTab,   setHandTab]   = useState<HandTab>('all')
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => { setHandTab('all') }, [skillTab])

  const visible = useMemo(
    () => filterScores(allScores, skillTab, handTab).sort((a, b) =>
      b.score !== a.score ? b.score - a.score : b.accuracy - a.accuracy
    ),
    [allScores, skillTab, handTab]
  )

  const best = visible[0] ?? null
  const rows = useMemo(() => visible.slice(0, 20), [visible])

  const handleClear = (): void => {
    if (skillTab === 'total' && handTab === 'all') {
      clearScores(songName)
      setAllScores([])
    } else {
      const keep = allScores.filter((s) => {
        const p = parseMode(s.mode)
        if (skillTab !== 'total' && p.skill !== skillTab) return true
        if (skillTab !== 'total' && handTab !== 'all' && p.hand !== handTab) return true
        return false
      })
      clearScores(songName)
      keep.forEach((s) => addScore(songName, s))
      setAllScores(keep)
    }
    setConfirming(false)
  }

  return (
    <div
      className="lbBackdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <style>{MODAL_STYLE}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        className="lbCard w-full max-w-2xl rounded-3xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 flex items-center justify-center shrink-0 text-xl">
            🏆
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-slate-900 dark:text-white font-bold text-lg leading-snug">
              {t('leaderboardTitle')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate" title={songName}>
              {songName}
            </p>
          </div>
          {best && (
            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
                {t('bestScore')}
              </div>
              <div className="text-xl font-extrabold tabular-nums text-amber-600 dark:text-amber-300">
                {Math.round(best.score)}
              </div>
            </div>
          )}
        </div>

        <div className="px-3 pt-2 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-1">
          {SKILL_TABS.map((tab) => {
            const on = tab.id === skillTab
            return (
              <button
                key={tab.id}
                onClick={() => setSkillTab(tab.id)}
                className={[
                  'relative px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors',
                  on
                    ? 'text-blue-600 dark:text-blue-300'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                ].join(' ')}
              >
                {t(tab.key)}
                {on && (
                  <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-blue-500 dark:bg-blue-400" />
                )}
              </button>
            )
          })}
        </div>

        {skillTab !== 'total' && (
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-1.5">
            {HAND_TABS.map((tab) => {
              const on = tab.id === handTab
              return (
                <button
                  key={tab.id}
                  onClick={() => setHandTab(tab.id)}
                  className={[
                    'px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors',
                    on
                      ? 'bg-blue-500 text-white shadow shadow-blue-500/30'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300',
                  ].join(' ')}
                >
                  {t(tab.key)}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <div className="p-10 text-center text-slate-500 dark:text-slate-400 text-sm">
              <div className="text-4xl mb-2 opacity-50">🎼</div>
              {t('noScoresYet')}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/80 backdrop-blur text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="text-left  px-4 py-2 font-semibold">{t('rankColumn')}</th>
                  <th className="text-right px-4 py-2 font-semibold">{t('scoreColumn')}</th>
                  <th className="text-right px-4 py-2 font-semibold">{t('accuracyColumn')}</th>
                  <th className="text-right px-4 py-2 font-semibold">{t('comboColumn')}</th>
                  <th className="text-left  px-4 py-2 font-semibold hidden sm:table-cell">{t('modeColumn')}</th>
                  <th className="text-right px-4 py-2 font-semibold hidden sm:table-cell">{t('dateColumn')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => {
                  const isTop = i === 0
                  return (
                    <tr
                      key={`${s.date}-${i}`}
                      className={[
                        'lbRow border-t border-slate-100 dark:border-slate-800',
                        isTop ? 'bg-amber-50/60 dark:bg-amber-500/5' : '',
                      ].join(' ')}
                      style={{ animationDelay: `${Math.min(i, 10) * 28}ms` } as React.CSSProperties}
                    >
                      <td className="px-4 py-2 font-bold tabular-nums">
                        {isTop ? <span className="text-amber-500">🥇</span> : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                        {Math.round(s.score)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {Math.round(s.accuracy * 100)}%
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {s.maxCombo}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                        <div className="flex items-center gap-1.5">
                          <span>{rowModeLabel(s.mode, t)}</span>
                          {s.loopRegion && (
                            <span
                              title={`Loop ${formatTimeSec(s.loopRegion.startSec)} – ${formatTimeSec(s.loopRegion.endSec)}`}
                              className="px-1.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 text-[10px] font-mono font-semibold whitespace-nowrap"
                            >
                              ↻ {formatTimeSec(s.loopRegion.startSec)}–{formatTimeSec(s.loopRegion.endSec)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                        {formatShortDate(s.date)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2">
          {visible.length > 0 && (
            confirming ? (
              <>
                <span className="text-xs text-slate-500 dark:text-slate-400 mr-auto">
                  {(() => {
                    if (skillTab === 'total' && handTab === 'all') {
                      return t('clearLeaderboardConfirm')
                    }
                    const parts: string[] = []
                    if (skillTab !== 'total') parts.push(t(skillLabelKey(skillTab)))
                    if (handTab  !== 'all')   parts.push(t(handLabelKey(handTab)))
                    return t('clearLeaderboardScope', { scope: parts.join(' · ') })
                  })()}
                </span>
                <button
                  onClick={() => setConfirming(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleClear}
                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
                >
                  {t('deleteAction')}
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="mr-auto px-3 py-1.5 rounded-lg text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-xs font-medium transition-colors"
              >
                🗑  {t('clearLeaderboard')}
              </button>
            )
          )}
          <button
            onClick={onClose}
            className="ml-auto px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium transition-colors"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
