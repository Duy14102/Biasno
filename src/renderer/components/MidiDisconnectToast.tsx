// Floating toast rendered at App level (outside Routes) so a mid-session
// unplug shows up regardless of which page the user is on — including in the
// middle of a practice run. Auto-dismisses after a few seconds; user can
// dismiss earlier via the close button.

import React, { useEffect } from 'react'
import { useMidi } from '@/context'
import { useLanguage } from '@/i18n'

const AUTO_DISMISS_MS = 7000

const SLIDE_IN_STYLE = `
@keyframes biasno-toast-in {
  0%   { opacity: 0; transform: translate(-50%, -1rem); }
  100% { opacity: 1; transform: translate(-50%, 0); }
}
`

export default function MidiDisconnectToast(): React.JSX.Element | null {
  const { disconnectNotice, dismissDisconnectNotice } = useMidi()
  const { t } = useLanguage()

  useEffect(() => {
    if (!disconnectNotice) return
    const id = window.setTimeout(dismissDisconnectNotice, AUTO_DISMISS_MS)
    return () => window.clearTimeout(id)
  }, [disconnectNotice, dismissDisconnectNotice])

  if (!disconnectNotice) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-4 left-1/2 z-[60] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2"
      style={{ animation: 'biasno-toast-in 220ms ease-out both' }}
    >
      <style>{SLIDE_IN_STYLE}</style>
      <div className="flex items-start gap-3 p-3.5 rounded-xl shadow-2xl border bg-white border-red-300 dark:bg-slate-900 dark:border-red-500/40 ring-1 ring-red-500/10">
        <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center text-xl bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300">
          🎹
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {t('disconnectToastTitle')}
          </p>
          <p className="text-xs mt-0.5 text-slate-600 dark:text-slate-300 leading-relaxed">
            {t('disconnectToastBody', { name: disconnectNotice.name })}
          </p>
        </div>
        <button
          onClick={dismissDisconnectNotice}
          className="text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 transition-colors p-1 -m-1 text-sm flex-shrink-0"
          aria-label={t('dismiss')}
          title={t('dismiss')}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
