import React, { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseMidiBuffer } from '../utils/midiUtils'
import { preloadSheet } from '../utils/sheetPreload'
import { useAppContext, type FileEntry } from '../context/AppContext'
import { useMIDIDevice } from '../hooks/useMIDIDevice'
import { useAudioEngine } from '../hooks/useAudioEngine'
import { audioEngine } from '../audio/AudioEngine'

// ─── Keyframe style injected once ────────────────────────────────────────────
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

// ─── Music bars animation component ──────────────────────────────────────────
function MusicBars(): React.JSX.Element {
  const delays = [0, 0.18, 0.08, 0.28, 0.14]
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 14, flexShrink: 0 }}>
      {delays.map((d, i) => (
        <div
          key={i}
          style={{
            width: 2,
            height: 14,
            background: '#4488ff',
            borderRadius: 1,
            transformOrigin: 'bottom',
            animation: `mbar ${0.55 + i * 0.07}s ease-in-out ${d}s infinite`
          }}
        />
      ))}
    </div>
  )
}

function formatDur(s?: number): string {
  if (!s) return ''
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function HomePage(): React.JSX.Element {
  const navigate = useNavigate()
  const {
    setMidiFile,
    fileList, updateFileList,
    folderPath, setFolderPath
  } = useAppContext()

  const { loadState } = useAudioEngine()

  const [loadingFile, setLoadingFile] = useState<string | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const [hoveredPath, setHoveredPath] = useState<string | null>(null)
  const [isDragging, setIsDragging]   = useState(false)
  // Spinner on the import / folder buttons while their dialogs + I/O run.
  const [busyAction, setBusyAction]   = useState<'import' | 'folder' | null>(null)

  // ─── MIDI device ──────────────────────────────────────────────────────────
  const { supported: midiSupported, devices, connectedId, connect, error: midiError } =
    useMIDIDevice((midi, vel, on) => {
      if (on) audioEngine.noteOn(midi, vel)
      else    audioEngine.noteOff(midi)
    })

  // ─── Select file → navigate ───────────────────────────────────────────────
  const handleSelectFile = useCallback(async (entry: FileEntry) => {
    setLoadingFile(entry.path)
    setError(null)
    try {
      const buffer = await window.electronAPI.readMidiFile(entry.path)
      if (!buffer) { setError('Không đọc được file MIDI'); return }
      const data = await parseMidiBuffer(buffer, entry.name)
      if (data.notes.length === 0) { setError('File không chứa note nào'); return }
      setMidiFile(data)
      // Pre-render the sheet music while the user is already waiting for
      // navigation.  This shifts the 1–2 s OSMD render off the practice page,
      // so opening the sheet there is instant.
      await preloadSheet(data)
      navigate('/mode')
    } catch (e) {
      setError(`Lỗi: ${e instanceof Error ? e.message : 'Unknown'}`)
    } finally {
      setLoadingFile(null)
    }
  }, [setMidiFile, navigate])

  // ─── Import single file via dialog ────────────────────────────────────────
  // Adds the row to the list IMMEDIATELY with a loading indicator so the user
  // has visible feedback, then parses + warms the sheet preload cache in the
  // background.  User stays on the home page.
  const handleImport = useCallback(async () => {
    setError(null)
    setBusyAction('import')
    let result: Awaited<ReturnType<typeof window.electronAPI.openMidiFile>>
    try { result = await window.electronAPI.openMidiFile() }
    finally { setBusyAction(null) }
    if (!result) return

    // 1) Show the row right away so the user sees something happen.
    const placeholder: FileEntry = { name: result.name, path: result.path, duration: undefined }
    updateFileList((prev) =>
      prev.some((f) => f.path === result.path) ? prev : [placeholder, ...prev]
    )
    setLoadingFile(result.path)

    // 2) Yield one frame so the placeholder row + spinner actually paints
    //    before we block the main thread parsing the MIDI buffer.  Without
    //    this yield, parseMidiBuffer (synchronous body inside an async wrapper)
    //    runs before React commits the state update → the loading state is
    //    invisible until preload finishes (which can be instant for cached files).
    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    try {
      const data = await parseMidiBuffer(result.buffer, result.name)
      if (data.notes.length === 0) {
        setError('File không chứa note nào')
        updateFileList((prev) => prev.filter((f) => f.path !== result.path))
        return
      }
      updateFileList((prev) => prev.map((f) =>
        f.path === result.path ? { ...f, duration: data.duration } : f
      ))
      await preloadSheet(data)
    } catch (e) {
      setError(`Không đọc được file: ${e instanceof Error ? e.message : ''}`)
      updateFileList((prev) => prev.filter((f) => f.path !== result.path))
    } finally {
      setLoadingFile(null)
    }
  }, [updateFileList])

  // ─── Choose folder ────────────────────────────────────────────────────────
  // Spinner on the button covers both the native folder-pick dialog and the
  // subsequent fs scan — the user gets continuous feedback from click to
  // entries appearing.
  const handleChooseFolder = useCallback(async () => {
    setError(null)
    setBusyAction('folder')
    try {
      const folder = await window.electronAPI.openFolder()
      if (!folder) return
      setFolderPath(folder)
      const refs = await window.electronAPI.scanMidiFolder(folder)
      updateFileList((prev) => {
        // Keep manually imported files not in this folder; merge folder files
        const folderEntries: FileEntry[] = refs.map((r) => {
          const existing = prev.find((f) => f.path === r.path)
          return { name: r.name, path: r.path, duration: existing?.duration }
        })
        const manual = prev.filter((f) => !refs.some((r) => r.path === f.path))
        return [...manual, ...folderEntries]
      })
    } finally {
      setBusyAction(null)
    }
  }, [updateFileList, setFolderPath])

  // ─── Drag-drop ────────────────────────────────────────────────────────────
  // Window-level listeners detect ANY file being dragged over the app — that
  // way the drop zone on the aside lights up immediately when the user starts
  // dragging, not only when the cursor happens to cross the aside.  The
  // counter pattern dampens the dragenter/dragleave noise that fires for every
  // child element the cursor crosses.
  useEffect(() => {
    let counter = 0
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types?.includes('Files')

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      counter++
      if (counter === 1) setIsDragging(true)
    }
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      counter = Math.max(0, counter - 1)
      if (counter === 0) setIsDragging(false)
    }
    // preventDefault on dragover is required everywhere or the browser will
    // refuse the drop (and would open the file as a navigation).
    const onOver = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault() }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()      // prevent browser from opening files dropped outside the aside
      counter = 0
      setIsDragging(false)
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover',  onOver)
    window.addEventListener('drop',      onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover',  onOver)
      window.removeEventListener('drop',      onDrop)
    }
  }, [])

  // Aside-specific drag handlers — only here does the drop actually consume
  // files.  preventDefault on dragover signals "this is a valid drop target".
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    // Window-level listener also resets isDragging; no local counter to clear.
    setIsDragging(false)
    setError(null)

    const all     = Array.from(e.dataTransfer.files)
    const midis   = all.filter((f) => /\.(mid|midi)$/i.test(f.name))

    if (midis.length === 0) {
      setError(all.length === 0
        ? 'Không có file nào được kéo vào'
        : 'File kéo vào không phải MIDI (.mid / .midi)')
      return
    }

    // Add ALL dropped files as placeholders FIRST so the user immediately
    // sees them in the list (with a loading indicator).  Then parse each;
    // on success → fill in duration, on failure → remove the placeholder.
    // The first newly-added file gets its sheet pre-rendered.
    const queued: Array<{ file: File; path: string; name: string }> = []
    for (const file of midis) {
      let absPath = file.name
      try { absPath = window.electronAPI.getPathForFile(file) || file.name } catch { /* fall back */ }
      const name = file.name.replace(/\.(mid|midi)$/i, '')
      const placeholder: FileEntry = { name, path: absPath, duration: undefined }
      updateFileList((prev) =>
        prev.some((f) => f.path === absPath) ? prev : [placeholder, ...prev]
      )
      queued.push({ file, path: absPath, name })
    }

    // Yield so the placeholders paint before we begin the parse loop.
    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    let firstNew: { entry: FileEntry; data: Awaited<ReturnType<typeof parseMidiBuffer>> } | null = null
    const failed: string[] = []

    for (const item of queued) {
      setLoadingFile(item.path)
      try {
        const buf  = await item.file.arrayBuffer()
        const data = await parseMidiBuffer(buf, item.name)
        if (data.notes.length === 0) {
          failed.push(item.file.name)
          updateFileList((prev) => prev.filter((f) => f.path !== item.path))
          continue
        }
        // Fill in the duration once parsed.
        updateFileList((prev) => prev.map((f) =>
          f.path === item.path ? { ...f, duration: data.duration } : f
        ))
        if (!firstNew) firstNew = { entry: { name: item.name, path: item.path, duration: data.duration }, data }
      } catch (err) {
        failed.push(item.file.name)
        updateFileList((prev) => prev.filter((f) => f.path !== item.path))
        console.error('[drop parse]', err)
      }
    }

    if (firstNew) {
      // Keep the loading indicator on the first file while preloading.
      setLoadingFile(firstNew.entry.path)
      try { await preloadSheet(firstNew.data) }
      finally { setLoadingFile(null) }
    } else {
      setLoadingFile(null)
    }

    if (failed.length) {
      setError(`Không đọc được: ${failed.join(', ')}`)
    }
  }, [updateFileList])

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white">
      {/* Inject keyframes once */}
      <style>{BAR_STYLE}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-5 py-3 bg-slate-900 border-b border-slate-700/60">
        <span className="text-2xl">🎹</span>
        <h1 className="text-xl font-bold tracking-wide text-white">Biasno</h1>
        <div className="flex-1" />
        {loadState !== 'ready' && (
          <span className={[
            'text-xs px-2 py-1 rounded-md',
            loadState === 'loading'
              ? 'bg-yellow-900/40 text-yellow-300 border border-yellow-700/50'
              : 'bg-red-900/40 text-red-300 border border-red-700/50'
          ].join(' ')}>
            {loadState === 'loading' ? '⏳ Đang tải âm thanh...' : '⚠ Lỗi âm thanh'}
          </span>
        )}
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── CENTER: MIDI device ──────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col items-center justify-center p-8 border-r border-slate-800">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6">
            Đàn điện / MIDI
          </h2>

          {!midiSupported ? (
            <DevicePanel state="unsupported" />
          ) : devices.length === 0 ? (
            <DevicePanel state="none" />
          ) : (
            <div className="w-full max-w-sm flex flex-col gap-3">
              {devices.map((dev) => {
                const isConn = connectedId === dev.id
                return (
                  <button
                    key={dev.id}
                    onClick={() => connect(isConn ? '__none__' : dev.id)}
                    className={[
                      'w-full flex items-center gap-4 p-4 rounded-xl border transition-all duration-150',
                      isConn
                        ? 'bg-blue-600/20 border-blue-500/50 text-white'
                        : 'bg-slate-800/60 border-slate-700/50 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                    ].join(' ')}
                  >
                    <div className={[
                      'w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0',
                      isConn ? 'bg-blue-600' : 'bg-slate-700'
                    ].join(' ')}>
                      🎹
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <p className="font-semibold truncate">{dev.name}</p>
                      <p className={['text-xs mt-0.5', isConn ? 'text-blue-300' : 'text-slate-500'].join(' ')}>
                        {isConn ? '🔗 Đã kết nối — nhấn để ngắt' : 'MIDI Input — nhấn để kết nối'}
                      </p>
                    </div>
                    <div className={[
                      'w-2.5 h-2.5 rounded-full flex-shrink-0',
                      isConn ? 'bg-green-400 shadow-lg shadow-green-500/50' : 'bg-slate-600'
                    ].join(' ')} />
                  </button>
                )
              })}
            </div>
          )}

          {midiError && <p className="mt-4 text-xs text-red-400">{midiError}</p>}

          {error && (
            <div className="mt-6 max-w-sm w-full px-4 py-3 bg-red-900/20 border border-red-700/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
        </main>

        {/* ── RIGHT: MIDI file list ──────────────────────────────────────────
            File drops are accepted only on this aside.  The overlay is driven
            by `isDragging` which a window-level listener flips on as soon as
            ANY file enters the app — so the drop zone is visible the moment
            the drag starts, not only once the cursor crosses the aside. */}
        <aside
          className="w-80 flex flex-col bg-slate-900 overflow-hidden relative"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Panel header */}
          <div className="px-4 pt-4 pb-3 border-b border-slate-700/60">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
              File MIDI
            </h2>
            <div className="flex gap-2">
              <button
                onClick={handleImport}
                disabled={busyAction !== null}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/60 disabled:cursor-wait rounded-lg text-white text-xs font-semibold transition-colors"
              >
                📂 Import file
              </button>
              <button
                onClick={handleChooseFolder}
                disabled={busyAction !== null}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700/60 disabled:cursor-wait rounded-lg text-slate-200 text-xs font-semibold transition-colors"
              >
                🗂 Chọn thư mục
              </button>
            </div>
            {folderPath && (
              <p className="mt-2 text-xs text-slate-500 truncate" title={folderPath}>
                📁 {folderPath}
              </p>
            )}
          </div>

          {/* File list */}
          <div className="flex-1 overflow-y-auto">
            {fileList.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2 px-6 text-center">
                <span className="text-4xl">🎵</span>
                <p className="text-sm">Import file MIDI hoặc chọn thư mục để bắt đầu</p>
                <p className="text-xs">Hoặc kéo thả file .mid / .midi vào đây</p>
              </div>
            ) : (
              <ul className="py-1">
                {fileList.map((entry) => {
                  const isLoading = loadingFile === entry.path
                  const isHovered = hoveredPath === entry.path

                  return (
                    <li key={entry.path}>
                      <div
                        className={[
                          'px-4 py-2.5 cursor-pointer transition-colors duration-100 border-l-2 relative overflow-hidden',
                          isLoading
                            ? 'bg-blue-900/25 border-blue-500'
                            : isHovered
                              ? 'bg-slate-800 border-blue-500'
                              : 'border-transparent hover:bg-slate-800/50 hover:border-slate-600'
                        ].join(' ')}
                        onMouseEnter={() => setHoveredPath(entry.path)}
                        onMouseLeave={() => setHoveredPath(null)}
                        onClick={() => !isLoading && handleSelectFile(entry)}
                      >
                        {/* Row content — fixed-height single line so the list
                            never reflows when an entry switches into loading. */}
                        <div className="flex items-center gap-2 min-w-0">
                          {/* Icon: spinner when loading, music bars on hover, note otherwise */}
                          <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                            {isLoading
                              ? <span className="inline-block w-3.5 h-3.5 border-2 border-blue-300/40 border-t-blue-400 rounded-full animate-spin" />
                              : isHovered
                                ? <MusicBars />
                                : <span className="text-sm">🎵</span>}
                          </div>

                          {/* Name */}
                          <span className="flex-1 text-sm text-slate-200 truncate font-medium min-w-0">
                            {entry.name}
                          </span>

                          {/* Right-side meta: duration normally, "Đang tải" while loading.
                              Both occupy the same slot so the row's width stays stable. */}
                          <span className={[
                            'text-xs font-mono flex-shrink-0 ml-1 tabular-nums',
                            isLoading ? 'text-blue-300' : 'text-slate-500',
                          ].join(' ')}>
                            {isLoading ? 'Đang tải' : formatDur(entry.duration)}
                          </span>
                        </div>

                        {/* Indeterminate progress bar pinned to the row's bottom edge.
                            Absolute → does not contribute to row height. */}
                        {isLoading && (
                          <div className="absolute left-0 right-0 bottom-0 h-[2px] overflow-hidden bg-blue-900/30">
                            <div className="h-full w-1/3 bg-blue-400/90 rounded-full animate-[loadingbar_1.2s_ease-in-out_infinite]" />
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Drag-drop overlay ─────────────────────────────────────────────
              Pointer-events:none so it doesn't intercept the drop event
              itself (the aside handles the drop).  Just visual feedback. */}
          <div
            className={[
              'absolute inset-2 rounded-xl border-2 border-dashed pointer-events-none',
              'flex flex-col items-center justify-center gap-2',
              'bg-blue-900/30 backdrop-blur-sm border-blue-400/80',
              'transition-opacity duration-150',
              isDragging ? 'opacity-100' : 'opacity-0',
            ].join(' ')}
          >
            <span className="text-4xl">🎵</span>
            <p className="text-blue-200 text-sm font-medium">Thả file MIDI vào đây</p>
            <p className="text-blue-300/70 text-xs">.mid hoặc .midi</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function DevicePanel({ state }: { state: 'none' | 'unsupported' }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-4 text-center max-w-xs">
      <div className="w-24 h-24 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-5xl">
        🎹
      </div>
      <div>
        <p className="font-semibold text-slate-300 mb-1">
          {state === 'unsupported' ? 'MIDI không khả dụng' : 'Chưa kết nối đàn'}
        </p>
        <p className="text-sm text-slate-500">
          {state === 'unsupported'
            ? 'Trình duyệt không hỗ trợ Web MIDI API'
            : 'Cắm đàn qua cổng USB và thử lại. Phím máy tính cũng dùng được (A–J = C4–C5).'}
        </p>
      </div>
    </div>
  )
}
