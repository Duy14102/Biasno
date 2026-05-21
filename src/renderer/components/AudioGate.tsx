import { useEffect, useState } from 'react'
import { audioEngine } from '../audio/AudioEngine'
import { useLanguage } from '../i18n/LanguageContext'
import { parseMidiBuffer } from '../utils/midiUtils'
import { preloadSheet, hasCachedSheetByName } from './sheet/sheetPreload'
import { LS } from '../constants/storageKeys'
import { loadJSON } from '../utils/storage'
import type { FileEntry } from '../context/AppContext'

async function preloadPersistedSheets(): Promise<void> {
  const list = loadJSON<FileEntry[]>(LS.FILE_LIST, [], (v): v is FileEntry[] => Array.isArray(v))
  for (const entry of list) {
    if (hasCachedSheetByName(entry.name)) continue
    try {
      const buf = await window.electronAPI.readMidiFile(entry.path)
      if (!buf) continue
      const data = await parseMidiBuffer(buf, entry.name)
      if (data.notes.length === 0) continue
      await preloadSheet(data)
    } catch (err) {
      console.warn('[splash preload]', entry.path, err)
    }
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
  }
}

// Gate the entire app behind audio sample loading + sheet preloading so the
// home page is fully ready (no per-row loading bars) the moment the splash
// unmounts.  Both run in parallel; the splash waits on the slower of the two.
export function AudioGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(audioEngine.ready)
  const { t } = useLanguage()

  useEffect(() => {
    const audio  = audioEngine.ready ? Promise.resolve() : audioEngine.initialize()
    const sheets = preloadPersistedSheets()
    Promise.allSettled([audio, sheets]).finally(() => setReady(true))
  }, [])

  if (ready) return <>{children}</>

  return (
    <div className="relative flex flex-col items-center justify-center h-screen bg-slate-200 dark:bg-slate-950 text-slate-900 dark:text-white overflow-hidden">
      <style>{SPLASH_CSS}</style>

      {/* Drifting gradient orbs — same palette as HomePage for visual continuity. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-40 w-[40rem] h-[40rem] rounded-full opacity-40 blur-3xl splash-orb-a"
        style={{ background: 'radial-gradient(circle at center, rgba(59,130,246,0.35), transparent 60%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-20 w-[34rem] h-[34rem] rounded-full opacity-30 blur-3xl splash-orb-b"
        style={{ background: 'radial-gradient(circle at center, rgba(139,92,246,0.30), transparent 60%)' }}
      />

      <div className="relative flex flex-col items-center gap-6">
        {/* Logo — pulsing halo + gentle float. */}
        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500 via-violet-500 to-fuchsia-500 blur-2xl splash-halo"
          />
          <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 via-violet-500 to-fuchsia-500 flex items-center justify-center text-4xl shadow-2xl shadow-blue-500/40 ring-1 ring-white/10 splash-float">
            🎹
          </div>
        </div>

        {/* Animated music bars. */}
        <div className="flex items-end gap-1.5 h-8" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="block w-1.5 rounded-full bg-gradient-to-t from-blue-500 via-violet-500 to-fuchsia-500"
              style={{
                height: '100%',
                transformOrigin: 'bottom',
                animation: `splash-bar 1s ease-in-out ${i * 0.12}s infinite`,
              }}
            />
          ))}
        </div>

        {/* Title with shimmer + animated dots. */}
        <div className="flex flex-col items-center gap-1">
          <div className="text-base font-semibold tracking-wide splash-shimmer">
            {t('splashLoading')}
            <span className="splash-dots" />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('splashHint')}</p>
        </div>
      </div>
    </div>
  )
}

const SPLASH_CSS = `
@keyframes splash-bar {
  0%, 100% { transform: scaleY(0.25); }
  50%      { transform: scaleY(1); }
}
@keyframes splash-float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-6px); }
}
@keyframes splash-halo {
  0%, 100% { opacity: 0.55; transform: scale(0.95); }
  50%      { opacity: 0.9;  transform: scale(1.1);  }
}
@keyframes splash-shimmer {
  0%   { background-position: -200% center; }
  100% { background-position:  200% center; }
}
@keyframes splash-dots {
  0%   { content: ''; }
  25%  { content: '.'; }
  50%  { content: '..'; }
  75%, 100% { content: '...'; }
}
@keyframes splash-orb-a {
  0%, 100% { transform: translate(0, 0); }
  50%      { transform: translate(30px, 20px); }
}
@keyframes splash-orb-b {
  0%, 100% { transform: translate(0, 0); }
  50%      { transform: translate(-25px, -15px); }
}
.splash-float   { animation: splash-float 2.4s ease-in-out infinite; }
.splash-halo    { animation: splash-halo  2.4s ease-in-out infinite; }
.splash-orb-a   { animation: splash-orb-a 8s  ease-in-out infinite; }
.splash-orb-b   { animation: splash-orb-b 10s ease-in-out infinite; }
.splash-shimmer {
  background: linear-gradient(90deg, currentColor 0%, currentColor 40%, rgba(255,255,255,0.85) 50%, currentColor 60%, currentColor 100%);
  background-size: 200% auto;
  -webkit-background-clip: text;
          background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: splash-shimmer 2.4s linear infinite;
}
.splash-dots::after { content: ''; animation: splash-dots 1.2s steps(1, end) infinite; }
`
