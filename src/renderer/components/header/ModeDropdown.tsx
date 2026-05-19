import React, { useState, useRef, useEffect } from 'react'
import type { PracticeMode } from '../../types'
import {
  MODE_GROUPS, GROUP_COLORS, modeGroup, modeFullLabel, DROPDOWN_CSS,
} from './modeGroups'
import { useLanguage } from '../../i18n/LanguageContext'

interface Props {
  mode:         PracticeMode
  onModeChange: (m: PracticeMode) => void
}

/** Practice-mode picker.  Trigger is a coloured pill in the header that
 *  shows the current mode's full label; the dropdown panel lists every mode
 *  grouped by hand (view / right / left / both), each group sub-titled and
 *  themed with its hand colour. */
const ModeDropdown = React.memo(function ModeDropdown({ mode, onModeChange }: Props) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const grp = modeGroup(mode)
  const col = GROUP_COLORS[grp]

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <style>{DROPDOWN_CSS}</style>

      <button
        onClick={() => setOpen(v => !v)}
        className={[
          'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-semibold border',
          'transition-[background-color,border-color,box-shadow,transform] duration-150',
          'hover:-translate-y-0.5 hover:shadow-md active:translate-y-0',
          col.badge,
        ].join(' ')}
      >
        {modeFullLabel(mode, t)}
        <span className={`text-[10px] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="hdr-dd-enter absolute left-0 top-full mt-1.5 z-50 min-w-[260px] rounded-2xl bg-white/95 border-slate-200 dark:bg-slate-800/95 dark:border-slate-600/80 backdrop-blur-md border shadow-2xl shadow-black/20 dark:shadow-black/60 overflow-hidden origin-top-left">
          <div className="px-4 pt-3 pb-2 border-b border-slate-200 dark:border-slate-700/60">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t('practiceModeHeading')}
            </p>
          </div>

          <div className="py-1.5">
            {MODE_GROUPS.map((g, gi) => {
              const gc = GROUP_COLORS[g.key]
              // Flat per-item index for the stagger.  Restart at gi so each
              // group's items follow its header by a consistent gap.
              let localIdx = 0
              return (
                <div key={g.key}>
                  {gi > 0 && <div className="mx-3 my-1 border-t border-slate-200 dark:border-slate-700/50" />}

                  {g.labelKey && (
                    <div
                      className="hdr-dd-item flex items-center gap-2 px-3 pt-1.5 pb-0.5"
                      style={{ animationDelay: `${40 + gi * 80}ms` }}
                    >
                      <span className={`text-[10px] font-bold uppercase tracking-[0.15em] ${gc.header}`}>
                        {t(g.labelKey)}
                      </span>
                      <div className={`flex-1 h-px ${gc.header} opacity-20`} style={{ background: 'currentColor' }} />
                    </div>
                  )}

                  {g.items.map((item) => {
                    const active = item.id === mode
                    const delay  = 60 + gi * 80 + localIdx++ * 35
                    return (
                      <button
                        key={item.id}
                        onClick={() => { onModeChange(item.id); setOpen(false) }}
                        style={{ animationDelay: `${delay}ms` }}
                        className={[
                          'hdr-dd-item w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left',
                          'transition-[background-color,color,padding-left] duration-150',
                          active
                            ? `${gc.item} font-semibold`
                            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 hover:pl-4 dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-white',
                        ].join(' ')}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 transition-transform duration-150 ${active ? `${gc.dot} scale-125` : 'bg-slate-300 dark:bg-slate-600'}`} />
                        <span className="flex-1">{t(item.subKey)}</span>
                        {active && (
                          <svg viewBox="0 0 24 24" fill="currentColor" className={`w-3.5 h-3.5 ${gc.header}`}>
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                          </svg>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
})

export default ModeDropdown
