import { useEffect, useState } from 'react'
import { audioEngine } from '@/audio'
import { useLanguage } from '@/i18n'
import { parseMidiBuffer } from '@/utils'
import { preloadSheet, hasCachedSheetByName } from './sheet/sheetPreload'
import { LS } from '@/constants'
import { loadJSON } from '@/utils'
import type { FileEntry } from '@/context'

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

// Gate the app shell behind sheet preloading so the home page is fully ready
// (no per-row loading bars) the moment the splash unmounts.  Audio samples
// warm in the background and are gated separately at the playback routes.
//
// Cross-fade strategy: once preload finishes, children mount IMMEDIATELY but
// the splash stays painted on top for one frame to let HomePage do its first
// render + paint underneath.  The splash then fades to opacity 0 over ~400ms
// and unmounts.  The user never sees the per-frame stutter of the initial
// HomePage mount because it happens behind the fully-opaque splash.
const SPLASH_FADE_MS = 420
export function AudioGate({ children }: { children: React.ReactNode }) {
  const [ready,         setReady]         = useState(audioEngine.ready)
  const [splashMounted, setSplashMounted] = useState(!audioEngine.ready)
  const [splashOpaque,  setSplashOpaque]  = useState(!audioEngine.ready)
  const { t } = useLanguage()

  useEffect(() => {
    // Warm the piano samples in the background — the app shell no longer waits
    // on the (first-run, cold-network) soundfont load.  The playback routes
    // gate themselves via <RequireAudio>, so only starting a song waits on it.
    if (!audioEngine.ready) void audioEngine.initialize()
    preloadPersistedSheets().finally(() => setReady(true))
  }, [])

  // Drive the cross-fade once preload is done.  Two rAFs: the first lets
  // React commit the children render and the browser paint it underneath;
  // the second flips opacity so the transition fires from 1 → 0.  Flipping
  // opacity also adds the `splash-frozen` class, which kills every infinite
  // CSS animation inside the splash — no compositor work during the fade.
  // The final unmount is deferred to `requestIdleCallback` so the DOM-removal
  // recalc happens during a quiet frame, never on the last fade frame.
  useEffect(() => {
    if (!ready || !splashMounted) return
    let raf2 = 0
    let idleId = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setSplashOpaque(false))
    })
    const tm = window.setTimeout(() => {
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback
      if (ric) idleId = ric(() => setSplashMounted(false), { timeout: 200 })
      else setSplashMounted(false)
    }, SPLASH_FADE_MS + 60)
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
      window.clearTimeout(tm)
      const cic = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback
      if (idleId && cic) cic(idleId)
    }
  }, [ready, splashMounted])

  return (
    <>
      {ready && children}
      {splashMounted && (
        <div
          aria-hidden={!splashOpaque}
          className={[
            'fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-200 dark:bg-slate-950 text-slate-900 dark:text-white overflow-hidden',
            splashOpaque ? '' : 'splash-frozen',
          ].join(' ')}
          style={{
            opacity:       splashOpaque ? 1 : 0,
            pointerEvents: splashOpaque ? 'auto' : 'none',
            transition:    `opacity ${SPLASH_FADE_MS}ms ease-out`,
            willChange:    'opacity',
          }}
        >
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
      )}
    </>
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
/* While fading out, freeze every inner animation so the compositor isn't
   doing per-frame work on an invisible element.  Halves stutter on slower
   machines and removes the "last-frame hiccup" that lands when the splash
   unmounts. */
.splash-frozen, .splash-frozen *, .splash-frozen *::after { animation: none !important; }
`
