import React from 'react'
import { useEscape } from '@/hooks'

type Accent = 'red' | 'amber' | 'blue'

interface Props {
  icon:          React.ReactNode
  iconAccent:    Accent
  title:         string
  subtitle?:     string
  cancelLabel:   string
  confirmLabel:  string
  confirmAccent?: Accent
  width?:        number
  onCancel:      () => void
  onConfirm:     () => void
  children:      React.ReactNode
}

const ACCENT_BG: Record<Accent, string> = {
  red:   'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  blue:  'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
}

const ACCENT_BTN: Record<Accent, string> = {
  red:   'bg-red-600 hover:bg-red-500',
  amber: 'bg-amber-600 hover:bg-amber-500',
  blue:  'bg-blue-600 hover:bg-blue-500',
}

export default function ConfirmModal({
  icon, iconAccent, title, subtitle, cancelLabel, confirmLabel, confirmAccent = 'red',
  width = 420, onCancel, onConfirm, children,
}: Props): React.JSX.Element {
  useEscape(onCancel)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-[92vw] rounded-2xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-700 shadow-2xl overflow-hidden"
        style={{ width, animation: 'fadeInUp 180ms cubic-bezier(0.16, 1, 0.3, 1) both' }}
      >
        <style>{`@keyframes fadeInUp {
          0% { opacity: 0; transform: translateY(12px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }`}</style>

        <div className="flex items-start gap-3 px-5 pt-5">
          <div className={[
            'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
            ACCENT_BG[iconAccent],
          ].join(' ')}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-900 dark:text-white font-semibold text-base leading-snug">
              {title}
            </p>
            {subtitle && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate" title={subtitle}>
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="px-5 py-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {children}
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 text-sm font-medium transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className={[
              'px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors',
              ACCENT_BTN[confirmAccent],
            ].join(' ')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
