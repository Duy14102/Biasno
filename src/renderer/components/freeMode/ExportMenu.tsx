import React, { useEffect, useRef, useState } from 'react'
import { useLanguage } from '@/i18n'
import { DownloadIcon, ChevronDownIcon, NoteIcon, StaffIcon, PdfIcon } from './icons'

interface Props {
  onMidi:  () => void
  onXml:   () => void
  onPdf:   () => void
  busy:    null | 'midi' | 'xml' | 'pdf'
  disabled: boolean
}

const STYLES = `
@keyframes em-menu-in {
  from { opacity: 0; transform: translateY(-4px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0)    scale(1);    }
}
.em-menu { animation: em-menu-in 140ms ease-out both; transform-origin: top right; }
`

export default function ExportMenu({ onMidi, onXml, onPdf, busy, disabled }: Props): React.JSX.Element {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close on outside click and on Escape — standard popover hygiene so the
  // menu doesn't trap the user.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown',   onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown',   onKey)
    }
  }, [open])

  // While an export is in flight, the trigger label tells the user which
  // format is being written.
  const triggerLabel =
    busy === 'midi' ? t('freeExportingMidi')
    : busy === 'xml'  ? t('freeExportingXml')
    : busy === 'pdf'  ? t('freeExportingPdf')
    : t('freeExport')

  const fire = (fn: () => void) => () => { setOpen(false); fn() }

  return (
    <div ref={wrapRef} className="relative">
      <style>{STYLES}</style>

      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className={[
          'flex items-center gap-2 px-4 h-11 rounded-xl',
          'text-white text-sm font-semibold transition-all',
          'bg-gradient-to-br from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500',
          'shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-violet-500/30',
          'active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
        ].join(' ')}
      >
        <DownloadIcon className="w-4 h-4" />
        <span>{triggerLabel}</span>
        <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="em-menu absolute right-0 top-full mt-2 w-52 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl shadow-black/20 overflow-hidden z-40"
        >
          <MenuItem icon={<NoteIcon  className="w-4 h-4" />} label="MIDI"     hint={t('freeExportMidiHint')} onClick={fire(onMidi)} busy={busy === 'midi'} />
          <MenuItem icon={<StaffIcon className="w-4 h-4" />} label="MusicXML" hint={t('freeExportXmlHint')}  onClick={fire(onXml)}  busy={busy === 'xml'}  />
          <MenuItem icon={<PdfIcon   className="w-4 h-4" />} label="PDF"      hint={t('freeExportPdfHint')}  onClick={fire(onPdf)}  busy={busy === 'pdf'}  />
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon, label, hint, onClick, busy,
}: {
  icon: React.ReactNode; label: string; hint: string; onClick: () => void; busy: boolean
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={busy}
      className="w-full px-3.5 py-2.5 flex items-center gap-3 text-left hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors disabled:opacity-60 disabled:cursor-wait"
    >
      <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/15 to-violet-500/15 text-blue-600 dark:text-blue-300 flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</span>
        <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">{hint}</span>
      </span>
    </button>
  )
}
