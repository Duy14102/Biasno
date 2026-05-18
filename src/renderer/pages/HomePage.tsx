import React, { useState } from 'react'
import { useAppContext } from '../context/AppContext'
import { useMIDIDevice }  from '../hooks/useMIDIDevice'
import { useFileLibrary } from '../components/library/useFileLibrary'
import { audioEngine }    from '../audio/AudioEngine'
import FileRow            from '../components/library/FileRow'
import DevicePanel        from '../components/library/DevicePanel'
import KeyboardHint       from '../components/library/KeyboardHint'
import DeleteConfirmModal from '../components/library/DeleteConfirmModal'
import LanguageToggle     from '../components/LanguageToggle'
import ThemeToggle        from '../components/ThemeToggle'
import { useLanguage }    from '../i18n/LanguageContext'

// ─── Page-scoped keyframes ───────────────────────────────────────────────────
// Injected once at the top of the document.  `mbar` drives the hover music
// bars on each row; `loadingbar` is the indeterminate progress sliver pinned
// to the bottom of a row while it's parsing / preloading.
const BAR_STYLE = `
@keyframes mbar {
  0%, 100% { transform: scaleY(0.15); }
  50%       { transform: scaleY(1); }
}
@keyframes loadingbar {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}
`

export default function HomePage(): React.JSX.Element {
  const { fileList, folderPath } = useAppContext()
  const { t }                    = useLanguage()

  // MIDI input device — clicking a key on a connected keyboard plays the
  // corresponding piano sample through the shared audio engine.
  const { supported: midiSupported, devices, connectedId, connect, error: midiError } =
    useMIDIDevice((midi, vel, on) => {
      if (on) audioEngine.noteOn(midi, vel)
      else    audioEngine.noteOff(midi)
    })

  // Hover state — picked up by FileRow to show the delete affordance and
  // swap the leading icon to music bars on the active row.
  const [hoveredPath, setHoveredPath] = useState<string | null>(null)

  const lib = useFileLibrary()

  return (
    <div className="flex flex-col h-screen bg-slate-200 text-slate-900 dark:bg-slate-950 dark:text-white relative overflow-hidden">
      <style>{BAR_STYLE}</style>

      {/* Decorative background orbs — soft radial gradients far in the
          corners so the page doesn't feel flat / empty without files.  Set
          pointer-events: none so they don't intercept drag-drop or clicks. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-40 w-[40rem] h-[40rem] rounded-full opacity-30 dark:opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle at center, rgba(59,130,246,0.25), transparent 60%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-20 w-[34rem] h-[34rem] rounded-full opacity-20 dark:opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle at center, rgba(139,92,246,0.22), transparent 60%)' }}
      />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      {/* z-20 (higher than the body's z-10) so the language dropdown can
          extend below the header without the body intercepting clicks. */}
      <header className="relative flex items-center gap-3 px-5 py-3 bg-white dark:bg-slate-900 dark:bg-gradient-to-b dark:from-slate-800/95 dark:to-slate-900/95 backdrop-blur-sm border-b border-slate-300 dark:border-slate-700/70 shadow-sm z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 via-violet-500 to-fuchsia-500 flex items-center justify-center text-base shadow-lg shadow-blue-500/30 ring-1 ring-white/10">
            🎹
          </div>
          <div className="flex flex-col leading-tight">
            <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">Biasno</h1>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-medium">
              {t('appSubtitle')}
            </p>
          </div>
        </div>

        <div className="flex-1" />

        {/* Theme toggle — left of the language toggle. */}
        <ThemeToggle />

        {/* Language toggle — pinned to the far right of the header. */}
        <LanguageToggle />
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="relative flex flex-1 overflow-hidden z-10">

        {/* CENTER: device picker + keyboard cheat-sheet */}
        <main className="flex-1 flex flex-col items-center justify-center px-8 py-6 overflow-y-auto">
          <div className="w-full max-w-md flex flex-col gap-5">

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {t('midiDevicesHeading')}
              </span>
              <div className="flex-1 h-px bg-slate-300/70 dark:bg-slate-700/50" />
            </div>

            {!midiSupported ? (
              <DevicePanel state="unsupported" />
            ) : devices.length === 0 ? (
              <DevicePanel state="none" />
            ) : (
              <div className="w-full flex flex-col gap-2.5">
                {devices.map((dev) => {
                  const isConn = connectedId === dev.id
                  return (
                    <button
                      key={dev.id}
                      onClick={() => connect(isConn ? '__none__' : dev.id)}
                      className={[
                        'w-full flex items-center gap-3 p-3.5 rounded-xl border',
                        'transition-[background-color,border-color,box-shadow] duration-150',
                        isConn
                          ? 'bg-blue-50 border-blue-400 shadow-lg shadow-blue-500/15 dark:bg-blue-600/15 dark:border-blue-500/50'
                          : 'bg-white border-slate-300 hover:bg-slate-50 hover:border-slate-400 dark:bg-slate-800/60 dark:border-slate-700/50 dark:hover:bg-slate-800 dark:hover:border-slate-600',
                      ].join(' ')}
                    >
                      <div className={[
                        'w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0',
                        isConn ? 'bg-blue-600 shadow-md shadow-blue-500/30' : 'bg-slate-200 dark:bg-slate-700/80',
                      ].join(' ')}>
                        🎹
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <p className={['font-semibold truncate text-sm', isConn ? 'text-blue-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'].join(' ')}>
                          {dev.name}
                        </p>
                        <p className={['text-xs mt-0.5', isConn ? 'text-blue-600 dark:text-blue-300' : 'text-slate-500'].join(' ')}>
                          {isConn ? t('deviceConnected') : t('deviceClickToConnect')}
                        </p>
                      </div>
                      <div className={[
                        'w-2.5 h-2.5 rounded-full flex-shrink-0',
                        isConn ? 'bg-green-500 shadow-lg shadow-green-500/50' : 'bg-slate-300 dark:bg-slate-600',
                      ].join(' ')} />
                    </button>
                  )
                })}
              </div>
            )}

            {midiError && <p className="text-xs text-red-600 dark:text-red-400 text-center">{midiError}</p>}

            <KeyboardHint />

            {lib.error && (
              <div className="px-4 py-3 bg-red-100 border border-red-300 text-red-700 dark:bg-red-900/25 dark:border-red-700/50 dark:text-red-300 rounded-lg text-sm">
                {lib.error}
              </div>
            )}
          </div>
        </main>

        {/* RIGHT: library file list — accepts drops; drop overlay shows the
            moment any file enters the app (handled by useFileLibrary). */}
        <aside
          className="w-[22rem] flex flex-col bg-white dark:bg-slate-900/80 backdrop-blur-sm border-l border-slate-300 dark:border-slate-800 overflow-hidden relative"
          onDragOver={lib.dragOverAside}
          onDrop={lib.dropFiles}
        >
          {/* Panel header */}
          <div className="px-4 pt-4 pb-3 border-b border-slate-300 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-900 dark:bg-gradient-to-b dark:from-slate-900 dark:to-slate-900/0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">{t('songList')}</h2>
              {fileList.length > 0 && (
                <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                  {t('songsCount', { n: fileList.length })}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={lib.importFile}
                disabled={lib.busyAction !== null}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/60 disabled:cursor-wait rounded-lg text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-colors"
              >
                {t('importFile')}
              </button>
              <button
                onClick={lib.chooseFolder}
                disabled={lib.busyAction !== null}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 disabled:opacity-60 disabled:cursor-wait rounded-lg text-xs font-semibold transition-colors"
              >
                {t('chooseFolder')}
              </button>
            </div>
            {folderPath && (
              <div className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-500" title={folderPath}>
                <span className="text-amber-500 dark:text-amber-400/80 shrink-0">📁</span>
                <span className="truncate">{folderPath}</span>
              </div>
            )}
          </div>

          {/* File list */}
          <div className="flex-1 overflow-y-auto">
            {fileList.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 dark:bg-slate-800/60 dark:border-slate-700/60 flex items-center justify-center text-3xl mb-1">
                  🎵
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">{t('noSongsYet')}</p>
                <p className="text-xs text-slate-500 leading-relaxed max-w-[18rem]">
                  {t('noSongsHintBefore')}<span className="text-blue-600 dark:text-blue-300 font-medium">{t('noSongsHintImport')}</span>{t('noSongsHintMiddle')}<span className="text-slate-700 dark:text-slate-300 font-medium">{t('noSongsHintFolder')}</span>{t('noSongsHintAfter')}<span className="font-mono text-slate-500 dark:text-slate-400">.mid / .midi</span>{t('noSongsHintTail')}
                </p>
              </div>
            ) : (
              <ul className="py-1">
                {fileList.map((entry) => (
                  <li key={entry.path}>
                    <FileRow
                      entry={entry}
                      isLoading={lib.loadingFiles.has(entry.path)}
                      isHovered={hoveredPath === entry.path}
                      onHoverChange={(h) => setHoveredPath(h ? entry.path : null)}
                      onClick={() => lib.selectFile(entry)}
                      onDelete={() => lib.requestDelete(entry)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Drag-drop overlay — pointer-events: none so it doesn't intercept
              the drop event itself; the aside owns the drop handler. */}
          <div
            className={[
              'absolute inset-2 rounded-xl border-2 border-dashed pointer-events-none',
              'flex flex-col items-center justify-center gap-2',
              'bg-blue-100/80 border-blue-400/80 dark:bg-blue-900/30 dark:border-blue-400/80 backdrop-blur-sm',
              'transition-opacity duration-150',
              lib.isDragging ? 'opacity-100' : 'opacity-0',
            ].join(' ')}
          >
            <span className="text-4xl">🎵</span>
            <p className="text-blue-700 dark:text-blue-200 text-sm font-medium">{t('dropMidiHere')}</p>
            <p className="text-blue-600/80 dark:text-blue-300/70 text-xs">{t('midOrMidi')}</p>
          </div>
        </aside>
      </div>

      {/* Delete-confirm modal */}
      {lib.pendingDelete && (
        <DeleteConfirmModal
          entry={lib.pendingDelete}
          onCancel={lib.cancelDelete}
          onConfirm={lib.confirmDelete}
        />
      )}
    </div>
  )
}
