import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import React from 'react'

const engine = vi.hoisted(() => ({ ready: true, initialize: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/audio', () => ({ audioEngine: engine }))
vi.mock('@/i18n', () => ({ useLanguage: () => ({ t: (k: string) => k }) }))
vi.mock('@/utils', () => ({ parseMidiBuffer: vi.fn(), loadJSON: vi.fn(() => []) }))
vi.mock('./sheet/sheetPreload', () => ({ preloadSheet: vi.fn(), hasCachedSheetByName: vi.fn(() => true) }))

import { AudioGate } from './AudioGate'

beforeEach(() => {
  engine.ready = true
  engine.initialize.mockClear().mockResolvedValue(undefined)
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { cb(); return 1 })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('AudioGate', () => {
  it('renders children immediately and shows no splash when the engine is already ready', () => {
    const { getByText, queryByText } = render(<AudioGate><div>APP</div></AudioGate>)
    expect(getByText('APP')).toBeTruthy()
    expect(queryByText('splashLoading')).toBeNull()
    expect(engine.initialize).not.toHaveBeenCalled()
  })

  it('shows the splash while loading, then reveals children once init resolves', async () => {
    engine.ready = false
    const { getByText } = render(<AudioGate><div>APP</div></AudioGate>)
    expect(getByText('splashLoading')).toBeTruthy() // splash up front
    await waitFor(() => expect(getByText('APP')).toBeTruthy()) // children after ready
    expect(engine.initialize).toHaveBeenCalled()
  })
})
