import { useAudioEngine } from '@/hooks'
import { useLanguage } from '@/i18n'

// Gate for the audio-needing routes (Practice / Free Mode).  The app shell
// (home / mode) renders without waiting on the soundfont, so the window is
// interactive immediately; only starting a song waits here while the samples
// finish loading.  Falls through on 'error' too — initialize() always settles
// on a playable source (synth fallback), so we never trap the user.
export function RequireAudio({ children }: { children: React.ReactNode }) {
  const { loadState } = useAudioEngine()
  const { t } = useLanguage()

  if (loadState === 'ready' || loadState === 'error') return <>{children}</>

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-slate-200 dark:bg-slate-950 text-slate-900 dark:text-white">
      <div className="w-12 h-12 rounded-full border-4 border-slate-400/40 border-t-blue-500 animate-spin" />
      <div className="flex flex-col items-center gap-1">
        <div className="text-base font-semibold tracking-wide">{t('splashLoading')}</div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('splashHint')}</p>
      </div>
    </div>
  )
}
