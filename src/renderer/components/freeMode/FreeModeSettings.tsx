import React, { useEffect, useRef, useState } from 'react'
import { useLanguage } from '@/i18n'
import { KEY_COUNTS, type KeyCount } from '@/utils'
import {
  GearIcon, KeyboardIcon, MetronomeIcon, MeasureIcon, CountdownIcon, LockIcon,
  ToggleSwitch,
} from '@/components/header'

const SETTINGS_STYLE = `
@keyframes freeSettingsDdEnter {
  0%   { opacity: 0; transform: translateY(-8px) scale(0.96); }
  100% { opacity: 1; transform: translateY(0)    scale(1);    }
}
@keyframes freeGearSpin {
  0%   { transform: rotate(0); }
  100% { transform: rotate(120deg); }
}
.free-settings-dd-enter { animation: freeSettingsDdEnter 200ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.free-gear-spin         { animation: freeGearSpin 480ms cubic-bezier(0.34, 1.56, 0.64, 1); }
`

interface Props {
  keyCount:           KeyCount
  keyCountLocked:     boolean
  onKeyCountChange:   (n: KeyCount) => void
  countdownEnabled:   boolean
  onCountdownToggle:  () => void
  metronomeEnabled:   boolean
  onMetronomeToggle:  () => void
  measureLinesEnabled: boolean
  onMeasureLinesToggle: () => void
}

export default function FreeModeSettings({
  keyCount, keyCountLocked, onKeyCountChange,
  countdownEnabled, onCountdownToggle,
  metronomeEnabled, onMetronomeToggle,
  measureLinesEnabled, onMeasureLinesToggle,
}: Props): React.JSX.Element {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [spinKey, setSpinKey] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const onTrigger = () => { setOpen(v => !v); setSpinKey(k => k + 1) }

  return (
    <div ref={ref} className="relative">
      <style>{SETTINGS_STYLE}</style>

      <button
        type="button"
        onClick={onTrigger}
        title={t('settings')}
        aria-label={t('settings')}
        aria-expanded={open}
        className={[
          'flex items-center justify-center w-9 h-9 rounded-xl',
          'transition-[background-color,box-shadow,transform] duration-150',
          'active:scale-[0.96]',
          open
            ? 'bg-slate-200 text-slate-900 shadow-md dark:bg-slate-700 dark:text-white'
            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200',
        ].join(' ')}
      >
        <span key={spinKey} className={spinKey > 0 ? 'free-gear-spin inline-flex' : 'inline-flex'}>
          <GearIcon className="w-4 h-4" />
        </span>
      </button>

      {open && (
        <div className="free-settings-dd-enter absolute right-0 top-full mt-2 z-50 w-[18rem] rounded-xl bg-white/95 border-slate-200 dark:bg-slate-800/95 dark:border-slate-600/80 backdrop-blur-md border shadow-2xl shadow-black/20 dark:shadow-black/60 overflow-hidden origin-top-right">

          {/* Header */}
          <div className="px-3.5 pt-3 pb-2 border-b border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t('settings')}
            </p>
            <GearIcon className="w-3 h-3 text-slate-500" />
          </div>

          {/* Keyboard size */}
          <div className="px-3.5 pt-3 pb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <KeyboardIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                {t('freeSettingsKeyboardSize')}
              </span>
              {keyCountLocked && (
                <LockIcon className="w-3.5 h-3.5 text-amber-500" />
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {KEY_COUNTS.map((n) => {
                const active = n === keyCount
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => !keyCountLocked && onKeyCountChange(n)}
                    disabled={keyCountLocked}
                    className={[
                      'h-9 rounded-lg text-xs font-mono font-semibold tabular-nums transition-colors',
                      'disabled:cursor-not-allowed disabled:opacity-60',
                      active
                        ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-900/60 dark:hover:bg-slate-700 dark:text-slate-200',
                    ].join(' ')}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
            {keyCountLocked && (
              <p className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-400/90 leading-tight">
                {t('keyCountLocked', { n: keyCount })}
              </p>
            )}
          </div>

          <div className="mx-3.5 border-t border-slate-200 dark:border-slate-700/50" />

          {/* Countdown */}
          <SettingRow
            icon={<CountdownIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
            label={t('countdown321')}
            hint={t('freeSettingsCountdownHint')}
            on={countdownEnabled}
            onToggle={onCountdownToggle}
          />

          {/* Metronome */}
          <SettingRow
            icon={<MetronomeIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
            label={t('metronome')}
            hint={t('freeSettingsMetronomeHint')}
            on={metronomeEnabled}
            onToggle={onMetronomeToggle}
          />

          {/* Measure / note lines */}
          <SettingRow
            icon={<MeasureIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
            label={t('freeSettingsMeasureLines')}
            hint={t('freeSettingsMeasureHint')}
            on={measureLinesEnabled}
            onToggle={onMeasureLinesToggle}
          />
        </div>
      )}
    </div>
  )
}

function SettingRow({
  icon, label, hint, on, onToggle,
}: {
  icon: React.ReactNode; label: string; hint: string; on: boolean; onToggle: () => void
}): React.JSX.Element {
  return (
    <div className="px-3.5 py-2.5 flex items-start justify-between gap-3">
      <div className="flex items-start gap-2 min-w-0">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="flex flex-col min-w-0">
          <span className="text-sm text-slate-700 dark:text-slate-200">{label}</span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{hint}</span>
        </div>
      </div>
      <ToggleSwitch on={on} onClick={onToggle} />
    </div>
  )
}
