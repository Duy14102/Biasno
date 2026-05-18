// ─── File library hook ──────────────────────────────────────────────────────
// All of HomePage's file-management state + handlers in one place:
//   • per-row loading set (each row can show its own spinner)
//   • busy flag for the Import / Choose-folder buttons
//   • error string
//   • pending-delete entry (drives the confirm modal)
//   • handlers: selectFile, importFile, chooseFolder, drop, drag overlay
//
// HomePage becomes a layout-only component that consumes this hook.

import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseMidiBuffer } from '../../utils/midiUtils'
import { preloadSheet } from '../sheet/sheetPreload'
import { useAppContext, type FileEntry } from '../../context/AppContext'
import { useLanguage } from '../../i18n/LanguageContext'

export interface UseFileLibrary {
  // Reactive state
  loadingFiles:   Set<string>
  error:          string | null
  busyAction:     'import' | 'folder' | null
  isDragging:     boolean
  pendingDelete:  FileEntry | null

  // Handlers
  selectFile:     (entry: FileEntry) => Promise<void>
  importFile:     () => Promise<void>
  chooseFolder:   () => Promise<void>
  dropFiles:      (e: React.DragEvent) => Promise<void>
  dragOverAside:  (e: React.DragEvent) => void

  // Pending-delete plumbing
  requestDelete:  (entry: FileEntry) => void
  cancelDelete:   () => void
  confirmDelete:  () => void
}

export function useFileLibrary(): UseFileLibrary {
  const navigate = useNavigate()
  const { setMidiFile, updateFileList, setFolderPath, folderPath } = useAppContext()
  const { t } = useLanguage()

  // Loading set rather than a single path — folder picks parse multiple files
  // in sequence and EVERY row should show its own spinner until ready.
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(() => new Set())
  const addLoading = useCallback((path: string) => {
    setLoadingFiles((prev) => { const next = new Set(prev); next.add(path); return next })
  }, [])
  const removeLoading = useCallback((path: string) => {
    setLoadingFiles((prev) => { const next = new Set(prev); next.delete(path); return next })
  }, [])

  const [error, setError]                 = useState<string | null>(null)
  const [busyAction, setBusyAction]       = useState<'import' | 'folder' | null>(null)
  const [isDragging, setIsDragging]       = useState(false)
  const [pendingDelete, setPendingDelete] = useState<FileEntry | null>(null)

  // ─── Click a list row → navigate to mode page ───────────────────────────
  const selectFile = useCallback(async (entry: FileEntry) => {
    addLoading(entry.path)
    setError(null)
    try {
      const buffer = await window.electronAPI.readMidiFile(entry.path)
      if (!buffer) { setError(t('errCantReadMidiFile')); return }
      const data = await parseMidiBuffer(buffer, entry.name)
      if (data.notes.length === 0) { setError(t('errEmptyMidi')); return }
      setMidiFile(data)
      // Warm the sheet cache while the user is already waiting — opening the
      // sheet on the practice page is then instant.
      await preloadSheet(data)
      navigate('/mode')
    } catch (e) {
      setError(t('errGeneric', { msg: e instanceof Error ? e.message : 'Unknown' }))
    } finally {
      removeLoading(entry.path)
    }
  }, [setMidiFile, navigate, addLoading, removeLoading, t])

  // ─── Import-file button → native dialog → list row (no auto-navigate) ───
  const importFile = useCallback(async () => {
    setError(null)
    setBusyAction('import')
    let result: Awaited<ReturnType<typeof window.electronAPI.openMidiFile>>
    try { result = await window.electronAPI.openMidiFile() }
    finally { setBusyAction(null) }
    if (!result) return

    // 1) Show the row right away so the user sees feedback.
    const placeholder: FileEntry = {
      name: result.name, path: result.path, duration: undefined, source: 'import',
    }
    updateFileList((prev) =>
      prev.some((f) => f.path === result.path) ? prev : [placeholder, ...prev]
    )
    addLoading(result.path)

    // 2) Yield one frame so the placeholder + spinner actually paint before
    //    we block the main thread on parseMidiBuffer.
    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    try {
      const data = await parseMidiBuffer(result.buffer, result.name)
      if (data.notes.length === 0) {
        setError(t('errEmptyMidi'))
        updateFileList((prev) => prev.filter((f) => f.path !== result.path))
        return
      }
      updateFileList((prev) => prev.map((f) =>
        f.path === result.path ? { ...f, duration: data.duration } : f
      ))
      await preloadSheet(data)
    } catch (e) {
      setError(t('errCantReadFile', { msg: e instanceof Error ? e.message : '' }))
      updateFileList((prev) => prev.filter((f) => f.path !== result.path))
    } finally {
      removeLoading(result.path)
    }
  }, [updateFileList, addLoading, removeLoading, t])

  // ─── Sync a folder's contents into fileList ────────────────────────────
  // Used by chooseFolder, the persisted-folder mount effect, and the live
  // fs.watch callback.  Diffs scan results against the current list so files
  // added on disk get parsed + preloaded, removed files disappear from the
  // list, and untouched files keep their cached duration / sheet preload.
  // When the folder is missing (scan returns null) the cached entries are
  // left in place so the library doesn't vanish if a drive is unplugged.
  const syncFolder = useCallback(async (folder: string) => {
    const refs = await window.electronAPI.scanMidiFolder(folder)
    if (refs === null) return  // folder gone — preserve persisted entries

    // Compute the "needs parsing" set inside the state updater so we always
    // see the latest fileList; the array is captured into the outer scope
    // for the parse loop that runs after.
    let needsParsing: Array<{ name: string; path: string }> = []

    updateFileList((prev) => {
      const folderEntries: FileEntry[] = refs.map((r) => {
        const existing = prev.find((f) => f.path === r.path)
        return {
          name:       r.name,
          path:       r.path,
          duration:   existing?.duration,
          source:     'folder',
          folderPath: folder,
        }
      })
      // Keep entries NOT in the scan, EXCEPT folder-sourced entries that
      // belonged to this folder — those are stale (file was deleted) and
      // must be dropped.  Entries from other folders / imports are kept.
      const others = prev.filter((f) => {
        if (refs.some((r) => r.path === f.path))                          return false
        if (f.source === 'folder' && f.folderPath === folder)             return false
        return true
      })
      needsParsing = folderEntries
        .filter((e) => e.duration === undefined)
        .map((e) => ({ name: e.name, path: e.path }))
      return [...others, ...folderEntries]
    })

    if (needsParsing.length === 0) return

    for (const r of needsParsing) addLoading(r.path)
    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    for (const r of needsParsing) {
      try {
        const buf = await window.electronAPI.readMidiFile(r.path)
        if (!buf) continue
        const data = await parseMidiBuffer(buf, r.name)
        if (data.notes.length === 0) continue
        updateFileList((prev) => prev.map((f) =>
          f.path === r.path ? { ...f, duration: data.duration } : f
        ))
        await preloadSheet(data)
      } catch (err) {
        console.warn('[folder sync]', r.path, err)
      } finally {
        removeLoading(r.path)
      }
    }
  }, [updateFileList, addLoading, removeLoading])

  // ─── Choose-folder button → set path → effect handles scan + watch ──────
  const chooseFolder = useCallback(async () => {
    setError(null)
    setBusyAction('folder')
    let folder: string | null
    try { folder = await window.electronAPI.openFolder() }
    finally { setBusyAction(null) }
    if (!folder) return

    // If user re-picks the SAME folder, the effect below won't re-fire
    // (folderPath unchanged) — force a manual sync so they still get a
    // refresh.  Otherwise the effect handles the first scan.
    if (folder === folderPath) syncFolder(folder)
    else                       setFolderPath(folder)
  }, [setFolderPath, folderPath, syncFolder])

  // ─── Auto-sync + watch whenever folderPath is set ──────────────────────
  // Fires on mount (covers the persisted-folder rehydration case) and on
  // every folderPath change.  The watcher in main debounces and fires an
  // IPC event back; we just re-sync.
  useEffect(() => {
    if (!folderPath) return
    let cancelled = false

    const doSync = async () => {
      if (cancelled) return
      try { await syncFolder(folderPath) } catch (e) { console.warn('[syncFolder]', e) }
    }

    doSync()
    window.electronAPI.watchFolder(folderPath)
    const unsubscribe = window.electronAPI.onFolderChanged((changed) => {
      if (changed === folderPath) doSync()
    })

    return () => {
      cancelled = true
      unsubscribe()
      window.electronAPI.unwatchFolder()
    }
  }, [folderPath, syncFolder])

  // ─── Drag-drop ──────────────────────────────────────────────────────────
  // Window-level listeners flip `isDragging` the instant any file enters the
  // app — so the drop overlay on the right panel lights up immediately, not
  // only when the cursor happens to cross the aside.  The counter pattern
  // dampens the dragenter/leave noise from every child element transition.
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
      e.preventDefault()  // prevent browser opening files dropped outside the aside
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

  // Aside-specific dragover — preventDefault signals "valid drop target".
  const dragOverAside = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const dropFiles = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    // Window-level listener also resets isDragging; no local counter to clear.
    setIsDragging(false)
    setError(null)

    const all   = Array.from(e.dataTransfer.files)
    const midis = all.filter((f) => /\.(mid|midi)$/i.test(f.name))

    if (midis.length === 0) {
      setError(all.length === 0
        ? t('errNoFilesDragged')
        : t('errNotMidiDragged'))
      return
    }

    // Add ALL dropped files as placeholders first so the user immediately
    // sees them in the list with their spinners.
    const queued: Array<{ file: File; path: string; name: string }> = []
    for (const file of midis) {
      let absPath = file.name
      try { absPath = window.electronAPI.getPathForFile(file) || file.name } catch { /* fallback */ }
      const name = file.name.replace(/\.(mid|midi)$/i, '')
      const placeholder: FileEntry = { name, path: absPath, duration: undefined, source: 'import' }
      updateFileList((prev) =>
        prev.some((f) => f.path === absPath) ? prev : [placeholder, ...prev]
      )
      addLoading(absPath)
      queued.push({ file, path: absPath, name })
    }

    // Yield so the placeholders paint before the parse loop blocks.
    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    const failed: string[] = []

    // Parse → fill duration → preload sheet → clear spinner.  ALL files get
    // pre-rendered so clicking any of them later navigates instantly.
    for (const item of queued) {
      try {
        const buf  = await item.file.arrayBuffer()
        const data = await parseMidiBuffer(buf, item.name)
        if (data.notes.length === 0) {
          failed.push(item.file.name)
          updateFileList((prev) => prev.filter((f) => f.path !== item.path))
          continue
        }
        updateFileList((prev) => prev.map((f) =>
          f.path === item.path ? { ...f, duration: data.duration } : f
        ))
        await preloadSheet(data)
      } catch (err) {
        failed.push(item.file.name)
        updateFileList((prev) => prev.filter((f) => f.path !== item.path))
        console.error('[drop parse]', err)
      } finally {
        removeLoading(item.path)
      }
    }

    if (failed.length) {
      setError(t('errFailedToRead', { names: failed.join(', ') }))
    }
  }, [updateFileList, addLoading, removeLoading, t])

  // ─── Delete plumbing ────────────────────────────────────────────────────
  const requestDelete = useCallback((entry: FileEntry) => setPendingDelete(entry), [])
  const cancelDelete  = useCallback(() => setPendingDelete(null), [])
  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return
    const path = pendingDelete.path
    updateFileList((prev) => prev.filter((f) => f.path !== path))
    setPendingDelete(null)
  }, [pendingDelete, updateFileList])

  return {
    loadingFiles, error, busyAction, isDragging, pendingDelete,
    selectFile, importFile, chooseFolder, dropFiles, dragOverAside,
    requestDelete, cancelDelete, confirmDelete,
  }
}
