import React, { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseMidiBuffer } from '../utils/midiUtils'
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
      navigate('/mode')
    } catch (e) {
      setError(`Lỗi: ${e instanceof Error ? e.message : 'Unknown'}`)
    } finally {
      setLoadingFile(null)
    }
  }, [setMidiFile, navigate])

  // ─── Import single file via dialog ────────────────────────────────────────
  const handleImport = useCallback(async () => {
    setError(null)
    const result = await window.electronAPI.openMidiFile()
    if (!result) return
    try {
      const data = await parseMidiBuffer(result.buffer, result.name)
      if (data.notes.length === 0) { setError('File không chứa note nào'); return }
      const entry: FileEntry = { name: result.name, path: result.path, duration: data.duration }
      updateFileList((prev) =>
        prev.some((f) => f.path === result.path) ? prev : [entry, ...prev]
      )
    } catch (e) {
      setError(`Không đọc được file: ${e instanceof Error ? e.message : ''}`)
    }
  }, [updateFileList])

  // ─── Choose folder ────────────────────────────────────────────────────────
  const handleChooseFolder = useCallback(async () => {
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
  }, [updateFileList, setFolderPath])

  // ─── Drag-drop ────────────────────────────────────────────────────────────
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(mid|midi)$/i.test(f.name)
    )
    for (const file of files) {
      try {
        const buf  = await file.arrayBuffer()
        const name = file.name.replace(/\.(mid|midi)$/i, '')
        const data = await parseMidiBuffer(buf, name)
        const entry: FileEntry = { name, path: file.name, duration: data.duration }
        updateFileList((prev) =>
          prev.some((f) => f.path === file.name) ? prev : [entry, ...prev]
        )
      } catch { /* skip bad file */ }
    }
  }, [updateFileList])

  return (
    <div
      className="flex flex-col h-screen bg-slate-950 text-white"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
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

          {isDragging && (
            <div className="mt-8 px-8 py-6 border-2 border-dashed border-blue-400 rounded-2xl text-blue-300 text-center">
              <p className="text-3xl mb-2">🎵</p>
              <p>Thả file MIDI vào đây</p>
            </div>
          )}

          {error && (
            <div className="mt-6 max-w-sm w-full px-4 py-3 bg-red-900/20 border border-red-700/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
        </main>

        {/* ── RIGHT: MIDI file list ────────────────────────────────────────── */}
        <aside className="w-80 flex flex-col bg-slate-900 overflow-hidden">
          {/* Panel header */}
          <div className="px-4 pt-4 pb-3 border-b border-slate-700/60">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
              File MIDI
            </h2>
            <div className="flex gap-2">
              <button
                onClick={handleImport}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white text-xs font-semibold transition-colors"
              >
                📂 Import file
              </button>
              <button
                onClick={handleChooseFolder}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200 text-xs font-semibold transition-colors"
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
                <p className="text-xs">Hỗ trợ kéo thả vào cửa sổ</p>
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
                          'px-4 py-2.5 cursor-pointer transition-all duration-100 border-l-2',
                          isHovered
                            ? 'bg-slate-800 border-blue-500'
                            : 'border-transparent hover:bg-slate-800/50 hover:border-slate-600'
                        ].join(' ')}
                        onMouseEnter={() => setHoveredPath(entry.path)}
                        onMouseLeave={() => setHoveredPath(null)}
                        onClick={() => !isLoading && handleSelectFile(entry)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {/* Icon or music bars */}
                          <div className="flex-shrink-0 w-5 flex items-center justify-center">
                            {isHovered ? <MusicBars /> : <span className="text-sm">🎵</span>}
                          </div>

                          {/* Name */}
                          <span className="flex-1 text-sm text-slate-200 truncate font-medium min-w-0">
                            {entry.name}
                          </span>

                          {/* Duration / loading indicator */}
                          <span className="text-xs text-slate-500 font-mono flex-shrink-0 ml-1">
                            {isLoading
                              ? <span className="animate-spin inline-block">⟳</span>
                              : formatDur(entry.duration)}
                          </span>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
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
