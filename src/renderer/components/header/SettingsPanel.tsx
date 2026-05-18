import React, { useState, useRef, useEffect } from 'react'
import ToggleSwitch from './ToggleSwitch'
import { DROPDOWN_CSS } from './modeGroups'
import { useLanguage } from '../../i18n/LanguageContext'

function volumeIcon(v: number): string {
  if (v === 0)   return '🔇'
  if (v < 0.35)  return '🔈'
  if (v < 0.70)  return '🔉'
  return '🔊'
}

// ─── Building blocks ──────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-500 mb-2">
      {children}
    </p>
  )
}

function SliderRow({
  icon, label, value, min, max, step, onChange, suffix,
}: {
  icon:    React.ReactNode
  label?:  string
  value:   number
  min:     number
  max:     number
  step:    number
  onChange: (v: number) => void
  suffix?: string
}): React.JSX.Element {
  return (
    <div className="mb-1.5">
      {label && <p className="text-xs text-slate-600 dark:text-slate-400 mb-1.5">{label}</p>}
      <div className="flex items-center gap-2.5">
        <div className="w-5 flex items-center justify-center shrink-0">{icon}</div>
        <input
          type="range" min={min} max={max} step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="flex-1 h-1.5 accent-blue-500 cursor-pointer"
        />
        <span className="text-slate-700 dark:text-slate-200 text-xs font-mono tabular-nums w-9 text-right shrink-0">
          {value}{suffix ?? ''}
        </span>
      </div>
    </div>
  )
}

function SettingRow({
  icon, label, children,
}: {
  icon:     React.ReactNode
  label:    string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2.5">
        <div className="w-5 flex items-center justify-center shrink-0">{icon}</div>
        <span className="text-slate-700 dark:text-slate-200 text-sm">{label}</span>
      </div>
      {children}
    </div>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────
interface Props {
  volume:               number
  zoom:                 number
  measureLines:         boolean
  countdownEnabled:     boolean
  onVolumeChange:       (v: number) => void
  onVolumeMute:         () => void
  onZoomChange:         (v: number) => void
  onMeasureLinesToggle: () => void
  onCountdownToggle:    () => void
}

const SettingsPanel = React.memo(function SettingsPanel({
  volume, zoom, measureLines, countdownEnabled,
  onVolumeChange, onVolumeMute, onZoomChange, onMeasureLinesToggle, onCountdownToggle,
}: Props) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <style>{DROPDOWN_CSS}</style>

      <button
        onClick={() => setOpen(v => !v)}
        title={t('settings')}
        className={[
          'flex items-center justify-center w-9 h-9 rounded-lg text-sm transition-colors',
          open
            ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
            : 'bg-slate-100 border border-slate-300 hover:bg-slate-200 hover:border-slate-400 text-slate-700 dark:bg-slate-700 dark:border-transparent dark:hover:bg-slate-600 dark:text-slate-300 dark:hover:text-white',
        ].join(' ')}
      >
        ⚙
      </button>

      {open && (
        <div className="hdr-dd-enter absolute right-0 top-full mt-1.5 z-50 w-72 rounded-2xl bg-white/95 border-slate-200 dark:bg-slate-800/95 dark:border-slate-600/80 backdrop-blur-md border shadow-2xl shadow-black/20 dark:shadow-black/60 overflow-hidden">

          <div className="px-4 pt-3 pb-2 border-b border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t('settings')}
            </p>
            <span className="text-[10px] text-slate-500 font-mono">⚙</span>
          </div>

          {/* Âm thanh */}
          <div className="px-4 pt-3 pb-2">
            <SectionLabel>{t('audio')}</SectionLabel>
            <SliderRow
              icon={(
                <button
                  onClick={onVolumeMute}
                  title={volume === 0 ? t('unmute') : t('mute')}
                  className="text-base leading-none opacity-90 hover:opacity-100 transition-opacity"
                >
                  {volumeIcon(volume)}
                </button>
              )}
              value={Math.round(volume * 100)}
              min={0} max={100} step={1}
              onChange={v => onVolumeChange(v / 100)}
              suffix="%"
            />
          </div>

          <div className="mx-4 border-t border-slate-200 dark:border-slate-700/50" />

          {/* Hiển thị */}
          <div className="px-4 pt-3 pb-3">
            <SectionLabel>{t('display')}</SectionLabel>

            <SliderRow
              icon={<span className="text-sm leading-none">🔍</span>}
              label={t('noteSize')}
              value={Math.round(zoom * 100)}
              min={50} max={200} step={5}
              onChange={v => onZoomChange(v / 100)}
              suffix="%"
            />

            <SettingRow icon={<span className="text-sm">📐</span>} label={t('measureLines')}>
              <ToggleSwitch on={measureLines} onClick={onMeasureLinesToggle} />
            </SettingRow>

            <SettingRow icon={<span className="text-sm">⏱</span>} label={t('countdown321')}>
              <ToggleSwitch on={countdownEnabled} onClick={onCountdownToggle} />
            </SettingRow>
          </div>
        </div>
      )}
    </div>
  )
})

export default SettingsPanel
