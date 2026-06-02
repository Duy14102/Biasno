import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import { LanguageProvider } from '@/i18n'
import type { Clip } from '@/freeMode'
import ClipContextMenu, { type ClipMenuActions } from './ClipContextMenu'

beforeEach(() => localStorage.setItem('biasno.lang', 'en'))
afterEach(() => { cleanup(); localStorage.clear() })

const clip = (over: Partial<Clip> = {}): Clip =>
  ({ id: 'c1', startMs: 0, endMs: 1000, volume: 1, locked: false, ...over })

function makeActions(): ClipMenuActions {
  return {
    onSplit: vi.fn(), onCopy: vi.fn(), onPaste: vi.fn(), onDelete: vi.fn(),
    onSetComment: vi.fn(), onSetVolume: vi.fn(), onToggleLock: vi.fn(),
  }
}

type P = React.ComponentProps<typeof ClipContextMenu>
function setup(props: Partial<P> = {}) {
  const actions = props.actions ?? makeActions()
  const onClose = props.onClose ?? vi.fn()
  render(
    <LanguageProvider>
      <ClipContextMenu
        x={10} y={10} atMs={500} splitAtMs={500}
        clipHere={clip()} hasClipboard={false}
        onClose={onClose} actions={actions} {...props}
      />
    </LanguageProvider>,
  )
  const item = (label: string) =>
    Array.from(document.body.querySelectorAll('button'))
      .find(b => b.textContent?.includes(label)) as HTMLButtonElement
  return { actions, onClose, item }
}

describe('ClipContextMenu', () => {
  it('Split fires onSplit with splitAtMs and closes (editable clip)', () => {
    const { actions, onClose, item } = setup({ splitAtMs: 700 })
    fireEvent.click(item('Split'))
    expect(actions.onSplit).toHaveBeenCalledWith(700)
    expect(onClose).toHaveBeenCalled()
  })

  it('disables Split / Delete on a locked clip, Copy stays enabled', () => {
    const { item } = setup({ clipHere: clip({ locked: true }) })
    expect(item('Split').disabled).toBe(true)
    expect(item('Delete').disabled).toBe(true)
    expect(item('Copy').disabled).toBe(false)
  })

  it('disables Copy and Lock when in a gap (clipHere null)', () => {
    const { item } = setup({ clipHere: null })
    expect(item('Copy').disabled).toBe(true)
    expect(item('Lock').disabled).toBe(true)
    expect(item('Split').disabled).toBe(true)
  })

  it('Paste enabled only with clipboard contents', () => {
    expect(setup({ hasClipboard: false }).item('Paste').disabled).toBe(true)
    cleanup()
    expect(setup({ hasClipboard: true }).item('Paste').disabled).toBe(false)
  })

  it('Copy / Delete / Paste call their action with atMs', () => {
    const { actions, item } = setup({ atMs: 333, hasClipboard: true })
    fireEvent.click(item('Copy'));   expect(actions.onCopy).toHaveBeenCalledWith(333)
    cleanup()
    const b = setup({ atMs: 333, hasClipboard: true })
    fireEvent.click(b.item('Paste')); expect(b.actions.onPaste).toHaveBeenCalledWith(333)
    cleanup()
    const c = setup({ atMs: 333 })
    fireEvent.click(c.item('Delete')); expect(c.actions.onDelete).toHaveBeenCalledWith(333)
  })

  it('shows Unlock label on a locked clip, Lock otherwise', () => {
    expect(setup({ clipHere: clip({ locked: true }) }).item('Unlock')).toBeTruthy()
    cleanup()
    expect(setup({ clipHere: clip() }).item('Lock')).toBeTruthy()
  })

  it('toggles the comment sub-editor and saves via the Save button', () => {
    const { actions, onClose, item } = setup({ atMs: 200, clipHere: clip({ comment: 'old' }) })
    fireEvent.click(item('Comment'))
    const input = document.body.querySelector('input[type="text"], input:not([type])') as HTMLInputElement
    expect(input.value).toBe('old')
    fireEvent.change(input, { target: { value: 'new note' } })
    fireEvent.click(item('Save'))
    expect(actions.onSetComment).toHaveBeenCalledWith(200, 'new note')
    expect(onClose).toHaveBeenCalled()
  })

  it('Clear submits an empty comment', () => {
    const { actions, item } = setup({ atMs: 200, clipHere: clip({ comment: 'x' }) })
    fireEvent.click(item('Comment'))
    fireEvent.click(item('Clear'))
    expect(actions.onSetComment).toHaveBeenCalledWith(200, '')
  })

  it('Enter inside the comment input commits', () => {
    const { actions, item } = setup({ atMs: 1 })
    fireEvent.click(item('Comment'))
    const input = document.body.querySelector('input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'hey' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(actions.onSetComment).toHaveBeenCalledWith(1, 'hey')
  })

  it('closing the comment editor by re-clicking hides the input', () => {
    const { item } = setup()
    fireEvent.click(item('Comment'))
    expect(document.body.querySelector('input')).toBeTruthy()
    fireEvent.click(item('Comment'))
    expect(document.body.querySelector('input')).toBeNull()
  })

  it('volume slider onChange fires onSetVolume live', () => {
    const { actions, item } = setup({ atMs: 9 })
    fireEvent.click(item('Volume'))
    const slider = document.body.querySelector('input[type="range"]') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '1.5' } })
    expect(actions.onSetVolume).toHaveBeenCalledWith(9, 1.5)
  })

  it('does not render the comment editor for a locked (non-editable) clip', () => {
    const { item } = setup({ clipHere: clip({ locked: true }) })
    // Comment item is disabled; clicking does nothing
    fireEvent.click(item('Comment'))
    expect(document.body.querySelector('input')).toBeNull()
  })

  it('closes on Escape', () => {
    const { onClose } = setup()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on an outside mousedown but not an inside one', () => {
    const { onClose } = setup()
    const menu = document.body.querySelector('.fixed') as HTMLElement
    fireEvent.mouseDown(menu)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalled()
  })

  it('clamps the panel position within the viewport (PAD floor)', () => {
    setup({ x: -500, y: -500 })
    const menu = document.body.querySelector('.fixed') as HTMLElement
    expect(menu.style.left).toBe('8px')
    expect(menu.style.top).toBe('8px')
  })
})
