import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import React from 'react'
import { AppProvider, useAppContext, modePrefsKey } from './AppContext'
import { LS } from '@/constants'

afterEach(cleanup)
beforeEach(() => localStorage.clear())

const wrapper = ({ children }: { children: React.ReactNode }) => <AppProvider>{children}</AppProvider>
const setup = () => renderHook(() => useAppContext(), { wrapper })

describe('modePrefsKey', () => {
  it('joins name and mode', () => {
    expect(modePrefsKey('song.mid', 'view-listen')).toBe('song.mid|view-listen')
  })
})

describe('AppContext init from localStorage', () => {
  it('loads valid persisted state', () => {
    localStorage.setItem(LS.FILE_LIST, JSON.stringify([{ name: 'a', path: 'a.mid' }]))
    localStorage.setItem(LS.FOLDER_PATH, '/music')
    localStorage.setItem(LS.HIDDEN_PATHS, JSON.stringify(['x.mid']))
    localStorage.setItem(LS.RESUME_POINTS, JSON.stringify({ 'a.mid': { time: 3, mode: 'listen' } }))
    const { result } = setup()
    expect(result.current.fileList).toEqual([{ name: 'a', path: 'a.mid' }])
    expect(result.current.folderPath).toBe('/music')
    expect(result.current.hiddenPaths.has('x.mid')).toBe(true)
    expect(result.current.resumePoints['a.mid']).toEqual({ time: 3, mode: 'listen' })
  })

  it('uses fallbacks for missing/invalid persisted state', () => {
    localStorage.setItem(LS.FILE_LIST, JSON.stringify({ not: 'array' }))
    localStorage.setItem(LS.HIDDEN_PATHS, JSON.stringify('nope'))
    const { result } = setup()
    expect(result.current.fileList).toEqual([])
    expect(result.current.folderPath).toBeNull()
    expect(result.current.hiddenPaths.size).toBe(0)
    expect(result.current.resumePoints).toEqual({})
  })
})

describe('AppContext mutations', () => {
  it('setFileList persists and updateFileList applies a function', () => {
    const { result } = setup()
    act(() => result.current.setFileList([{ name: 'a', path: 'a.mid' }]))
    expect(JSON.parse(localStorage.getItem(LS.FILE_LIST)!)).toHaveLength(1)
    act(() => result.current.updateFileList(prev => [...prev, { name: 'b', path: 'b.mid' }]))
    expect(result.current.fileList).toHaveLength(2)
  })

  it('setFolderPath writes the key, then null removes it', () => {
    const { result } = setup()
    act(() => result.current.setFolderPath('/m'))
    expect(localStorage.getItem(LS.FOLDER_PATH)).toBe('/m')
    act(() => result.current.setFolderPath(null))
    expect(localStorage.getItem(LS.FOLDER_PATH)).toBeNull()
  })

  it('addHiddenPath ignores duplicates (same set reference)', () => {
    const { result } = setup()
    act(() => result.current.addHiddenPath('p'))
    const first = result.current.hiddenPaths
    act(() => result.current.addHiddenPath('p'))
    expect(result.current.hiddenPaths).toBe(first)
    expect(result.current.hiddenPaths.has('p')).toBe(true)
  })

  it('removeHiddenPath is a no-op when absent, removes when present', () => {
    const { result } = setup()
    act(() => result.current.addHiddenPath('p'))
    const before = result.current.hiddenPaths
    act(() => result.current.removeHiddenPath('absent'))
    expect(result.current.hiddenPaths).toBe(before)
    act(() => result.current.removeHiddenPath('p'))
    expect(result.current.hiddenPaths.has('p')).toBe(false)
  })

  it('setResumePoint sets a value then deletes on null', () => {
    const { result } = setup()
    act(() => result.current.setResumePoint('a.mid', { time: 5, mode: 'right-melody' }))
    expect(result.current.resumePoints['a.mid']).toEqual({ time: 5, mode: 'right-melody' })
    act(() => result.current.setResumePoint('a.mid', null))
    expect(result.current.resumePoints['a.mid']).toBeUndefined()
  })

  it('setModePrefs applies defaults then merges partial overrides', () => {
    const { result } = setup()
    act(() => result.current.setModePrefs('k', { showSheetMusic: true }))
    expect(result.current.modePrefs['k']).toEqual({ showSheetMusic: true, showFallingNotes: true })
    act(() => result.current.setModePrefs('k', { showFallingNotes: false }))
    expect(result.current.modePrefs['k']).toEqual({ showSheetMusic: true, showFallingNotes: false })
  })

  it('clearAll resets midiFile and practiceSettings', () => {
    const { result } = setup()
    act(() => {
      result.current.setMidiFile({} as never)
      result.current.setPracticeSettings({} as never)
    })
    expect(result.current.midiFile).not.toBeNull()
    act(() => result.current.clearAll())
    expect(result.current.midiFile).toBeNull()
    expect(result.current.practiceSettings).toBeNull()
  })

  it('useAppContext throws outside a provider', () => {
    expect(() => renderHook(() => useAppContext())).toThrow(/within AppProvider/)
  })
})
