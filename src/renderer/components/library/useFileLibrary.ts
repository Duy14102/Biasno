// ─── File library hook ──────────────────────────────────────────────────────
// All of HomePage's file-management state + handlers in one place:
//   • per-row loading set (each row can show its own spinner)
//   • busy flag for the Import / Choose-folder buttons
//   • error string
//   • pending-delete entry (drives the confirm modal)
//   • handlers: selectFile, importFile, chooseFolder, drop, drag overlay
//
// HomePage becomes a layout-only component that consumes this hook.

import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseMidiBuffer } from '../../utils/midiUtils'
import { preloadSheet, hasCachedSheetByName, evictSheetByName } from '../sheet/sheetPreload'
import { useAppContext, type FileEntry } from '../../context/AppContext'
import { useLanguage } from '../../i18n/LanguageContext'

export interface FolderConflict {
  folder:    string
  conflicts: Array<{ name: string; path: string }>
}

export interface UseFileLibrary {
  // Reactive state
  loadingFiles:          Set<string>
  error:                 string | null
  busyAction:            'import' | 'folder' | null
  isDragging:            boolean
  pendingDelete:         FileEntry | null
  pendingFolderConflict: FolderConflict | null

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

  // Folder-conflict plumbing
  cancelFolderAdd:  () => void
  confirmFolderAdd: () => void
}

export function useFileLibrary(): UseFileLibrary {
  const navigate = useNavigate()
  const {
    setMidiFile, updateFileList, setFolderPath, folderPath, fileList,
    hiddenPaths, addHiddenPath, removeHiddenPath,
  } = useAppContext()

  // Ref-mirrored fileList so async handlers (syncFolder) can read the latest
  // committed list without depending on closure capture, and without relying
  // on React invoking setState updaters synchronously — that "eager state
  // computation" is an optimization that only fires when the queue is empty,
  // so reading outer-scope writes from inside a setState callback is fragile.
  const fileListRef = useRef<FileEntry[]>(fileList)
  useEffect(() => { fileListRef.current = fileList }, [fileList])
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
  const [pendingFolderConflict, setPendingFolderConflict] =
    useState<FolderConflict | null>(null)

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

    // Explicit re-add — unhide so syncFolder won't skip this path again.
    removeHiddenPath(result.path)

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
  }, [updateFileList, addLoading, removeLoading, removeHiddenPath, t])

  // ─── Sync a folder's contents into fileList ────────────────────────────
  // Used by chooseFolder, the persisted-folder mount effect, and the live
  // fs.watch callback.  Diffs scan results against the current list so files
  // added on disk get parsed + preloaded, removed files disappear from the
  // list, and untouched files keep their cached duration / sheet preload.
  // When the folder is missing (scan returns null) the cached entries are
  // left in place so the library doesn't vanish if a drive is unplugged.
  const syncFolder = useCallback(async (folder: string) => {
    const refs0 = await window.electronAPI.scanMidiFolder(folder)
    if (refs0 === null) return  // folder gone — preserve persisted entries
    // Drop paths the user has explicitly hidden so they don't silently
    // reappear after restart or after fs.watch picks up the file again.
    const refs = refs0.filter((r) => !hiddenPaths.has(r.path))

    // Read the latest fileList via ref so the diff is computed against the
    // truly current state (not the closure-captured value when syncFolder was
    // memoised) and without relying on React running setState updaters
    // synchronously.
    const prev = fileListRef.current

    // Dedup by display name: when the new folder contains a file whose name
    // already exists in the list, the new folder wins — same single row,
    // updated to point at the new file.  Keeps the list stable (no duplicate
    // "123" rows when two folders both have 123.mid) while still letting the
    // user switch folders freely.
    const prevByName = new Map<string, FileEntry>()
    for (const f of prev) prevByName.set(f.name, f)
    const consumedNames = new Set<string>()
    const evictNames:   string[] = []

    const folderEntries: FileEntry[] = refs.map((r) => {
      const existing = prevByName.get(r.name)
      if (existing) {
        consumedNames.add(r.name)
        // Same file: exact path match OR same folder (a re-pick of the
        // current folder may yield a slightly different path string in edge
        // cases — don't wipe the cached duration).
        if (existing.path === r.path || existing.folderPath === folder) {
          return { ...existing, path: r.path, source: 'folder', folderPath: folder }
        }
        // Different folder, same name: it's a different file; cached
        // sheet/duration belong to the old file and must be discarded.
        evictNames.push(r.name)
      }
      return {
        name:       r.name,
        path:       r.path,
        duration:   undefined,
        source:     'folder',
        folderPath: folder,
      }
    })

    // Keep prev entries that weren't consumed by name, EXCEPT stale folder
    // entries belonging to THIS folder (file deleted from disk).  Entries
    // from other folders / imports are kept — list is additive across picks.
    const others = prev.filter((f) => {
      if (consumedNames.has(f.name))                            return false
      if (f.source === 'folder' && f.folderPath === folder)     return false
      return true
    })

    for (const f of prev) {
      if (f.source === 'folder' &&
          f.folderPath === folder &&
          !refs.some((r) => r.path === f.path)) {
        evictNames.push(f.name)
      }
    }

    // Re-parse:
    //  - current-folder entries when duration is missing (fresh / overridden)
    //    OR when the sheet isn't cached (app reopened — duration persists via
    //    localStorage but the OSMD cache does not).
    //  - other-folder / import entries when duration is missing.  Without
    //    this, an entry that lost its duration in a prior sync would stay
    //    blank forever.
    const currentFolderParsing = folderEntries
      .filter((e) => e.duration === undefined || !hasCachedSheetByName(e.name))
      .map((e) => ({ name: e.name, path: e.path }))
    const otherParsing = others
      .filter((f) => f.duration === undefined)
      .map((f) => ({ name: f.name, path: f.path }))
    const needsParsing = [...currentFolderParsing, ...otherParsing]

    const nextList = [...others, ...folderEntries]
    // Keep the ref in sync immediately so any concurrent syncFolder triggered
    // before the next render commit (rare, but possible via fs.watch) sees
    // the post-diff list rather than the pre-diff one.
    fileListRef.current = nextList
    updateFileList(() => nextList)

    for (const name of evictNames) evictSheetByName(name)

    if (needsParsing.length === 0) return

    for (const r of needsParsing) addLoading(r.path)
    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    for (const r of needsParsing) {
      try {
        const buf = await window.electronAPI.readMidiFile(r.path)
        if (!buf) continue
        const data = await parseMidiBuffer(buf, r.name)
        if (data.notes.length === 0) continue
        updateFileList((list) => list.map((f) =>
          f.path === r.path ? { ...f, duration: data.duration } : f
        ))
        await preloadSheet(data)
      } catch (err) {
        console.warn('[folder sync]', r.path, err)
      } finally {
        removeLoading(r.path)
      }
    }
  }, [updateFileList, addLoading, removeLoading, hiddenPaths])

  // Apply a folder selection: same-folder re-pick triggers a manual sync,
  // different folder lets the useEffect below scan + watch.
  const applyFolder = useCallback((folder: string) => {
    if (folder === folderPath) syncFolder(folder)
    else                       setFolderPath(folder)
  }, [folderPath, syncFolder, setFolderPath])

  // ─── Choose-folder button → set path → effect handles scan + watch ──────
  // Pre-scan the picked folder so we can warn before re-adding files the
  // user previously removed.  Without this check, every file in the folder
  // gets silently filtered by hiddenPaths and the list looks broken.
  const chooseFolder = useCallback(async () => {
    setError(null)
    setBusyAction('folder')
    let folder: string | null
    try { folder = await window.electronAPI.openFolder() }
    finally { setBusyAction(null) }
    if (!folder) return

    const refs = await window.electronAPI.scanMidiFolder(folder)
    if (refs) {
      const conflicts = refs
        .filter((r) => hiddenPaths.has(r.path))
        .map((r) => ({ name: r.name, path: r.path }))
      if (conflicts.length > 0) {
        setPendingFolderConflict({ folder, conflicts })
        return
      }
    }
    applyFolder(folder)
  }, [hiddenPaths, applyFolder])

  const cancelFolderAdd  = useCallback(() => setPendingFolderConflict(null), [])
  const confirmFolderAdd = useCallback(() => {
    if (!pendingFolderConflict) return
    const { folder, conflicts } = pendingFolderConflict
    for (const c of conflicts) removeHiddenPath(c.path)
    applyFolder(folder)
    setPendingFolderConflict(null)
  }, [pendingFolderConflict, removeHiddenPath, applyFolder])

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
      removeHiddenPath(absPath)
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
  }, [updateFileList, addLoading, removeLoading, removeHiddenPath, t])

  // ─── Delete plumbing ────────────────────────────────────────────────────
  const requestDelete = useCallback((entry: FileEntry) => setPendingDelete(entry), [])
  const cancelDelete  = useCallback(() => setPendingDelete(null), [])
  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return
    const { path, name } = pendingDelete
    updateFileList((prev) => prev.filter((f) => f.path !== path))
    // Drop the preloaded SVG so it doesn't leak in memory after the row goes.
    evictSheetByName(name)
    // Remember the removal so syncFolder doesn't re-add it after restart
    // or the next fs.watch ping.
    addHiddenPath(path)
    setPendingDelete(null)
  }, [pendingDelete, updateFileList, addHiddenPath])

  return {
    loadingFiles, error, busyAction, isDragging, pendingDelete, pendingFolderConflict,
    selectFile, importFile, chooseFolder, dropFiles, dragOverAside,
    requestDelete, cancelDelete, confirmDelete,
    cancelFolderAdd, confirmFolderAdd,
  }
}
