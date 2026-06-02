import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import PianoKeyboard from './PianoKeyboard'
import { PIANO_RANGES, isBlackKey } from '@/utils'

afterEach(cleanup)

type HL = { hand: 'left' | 'right'; hitState?: 'correct' | 'wrong'; time?: number }

function setup(props: Partial<React.ComponentProps<typeof PianoKeyboard>> = {}) {
  const onKeyDown = vi.fn()
  const onKeyUp = vi.fn()
  const utils = render(
    <PianoKeyboard activeKeys={new Map()} onKeyDown={onKeyDown} onKeyUp={onKeyUp} {...props} />,
  )
  return { onKeyDown, onKeyUp, ...utils }
}

describe('PianoKeyboard geometry', () => {
  it('renders the correct white + black key counts for an 88-key range', () => {
    const { container } = setup()
    const range = PIANO_RANGES[88]
    let whites = 0, blacks = 0
    for (let m = range.min; m <= range.max; m++) { if (isBlackKey(m)) blacks++; else whites++ }
    // White keys carry an onMouseDown handler; count direct key divs by zIndex.
    const keys = container.querySelectorAll('div[style*="position: absolute"]')
    // sanity: there are at least whites+blacks interactive keys
    expect(keys.length).toBeGreaterThanOrEqual(whites + blacks)
  })

  it('renders fewer keys for a 61-key range than 88', () => {
    const { container: c88 } = render(<PianoKeyboard activeKeys={new Map()} keyCount={88} />)
    const n88 = c88.querySelectorAll('div[style*="position: absolute"]').length
    cleanup()
    const { container: c61 } = render(<PianoKeyboard activeKeys={new Map()} keyCount={61} />)
    const n61 = c61.querySelectorAll('div[style*="position: absolute"]').length
    expect(n61).toBeLessThan(n88)
  })

  it('applies the height prop to the root container', () => {
    const { container } = setup({ height: 321 })
    const root = container.firstChild as HTMLElement
    expect(root.style.height).toBe('321px')
  })
})

describe('PianoKeyboard callbacks', () => {
  it('fires onKeyDown / onKeyUp with the midi number', () => {
    const { container, onKeyDown, onKeyUp } = setup()
    const firstWhite = container.querySelector('div[style*="cursor: pointer"]') as HTMLElement
    fireEvent.mouseDown(firstWhite)
    fireEvent.mouseUp(firstWhite)
    expect(onKeyDown).toHaveBeenCalledTimes(1)
    expect(onKeyUp).toHaveBeenCalledTimes(1)
    expect(typeof onKeyDown.mock.calls[0][0]).toBe('number')
  })

  it('mouseLeave with the primary button held releases the key (buttons===1)', () => {
    const { container, onKeyUp } = setup()
    const key = container.querySelector('div[style*="cursor: pointer"]') as HTMLElement
    fireEvent.mouseLeave(key, { buttons: 1 })
    expect(onKeyUp).toHaveBeenCalledTimes(1)
  })

  it('mouseLeave without a held button does NOT release', () => {
    const { container, onKeyUp } = setup()
    const key = container.querySelector('div[style*="cursor: pointer"]') as HTMLElement
    fireEvent.mouseLeave(key, { buttons: 0 })
    expect(onKeyUp).not.toHaveBeenCalled()
  })

  it('does not throw when callbacks are omitted (optional-chaining branch)', () => {
    const { container } = render(<PianoKeyboard activeKeys={new Map()} />)
    const key = container.querySelector('div[style*="cursor: pointer"]') as HTMLElement
    expect(() => { fireEvent.mouseDown(key); fireEvent.mouseUp(key) }).not.toThrow()
  })
})

describe('PianoKeyboard highlight states', () => {
  it('renders a flash overlay for an active key', () => {
    const active = new Map<number, HL>([[60, { hand: 'right', time: 1.5 }]])
    const { container } = setup({ activeKeys: active })
    expect(container.querySelector('.kb-flash-white')).toBeTruthy()
  })

  it('renders a black-key flash overlay for an active black key', () => {
    const active = new Map<number, HL>([[61, { hand: 'left', time: 0.2 }]]) // C#4 is black
    const { container } = setup({ activeKeys: active })
    expect(container.querySelector('.kb-flash-black')).toBeTruthy()
  })

  it('renders a hint pulse only when the key is not also active', () => {
    const { container } = setup({ hintKeys: new Set([60]) })
    expect(container.querySelector('.kb-hint-white')).toBeTruthy()
  })

  it('suppresses the hint when the same key is active', () => {
    const active = new Map<number, HL>([[60, { hand: 'right' }]])
    const { container } = setup({ activeKeys: active, hintKeys: new Set([60]) })
    expect(container.querySelector('.kb-hint-white')).toBeNull()
    expect(container.querySelector('.kb-flash-white')).toBeTruthy()
  })

  it('uses the green hit colour for a correct hit', () => {
    const active = new Map<number, HL>([[60, { hand: 'right', hitState: 'correct' }]])
    const { container } = setup({ activeKeys: active })
    // The white key background gradient embeds the active colour (#22c55e).
    expect(container.innerHTML).toContain('#22c55e')
  })

  it('uses the red hit colour for a wrong hit', () => {
    const active = new Map<number, HL>([[60, { hand: 'right', hitState: 'wrong' }]])
    const { container } = setup({ activeKeys: active })
    expect(container.innerHTML).toContain('#ef4444')
  })
})
