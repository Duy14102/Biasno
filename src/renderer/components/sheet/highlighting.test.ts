import { describe, it, expect, afterEach } from 'vitest'
import { colorFullNote, clearHighlights } from './highlighting'

afterEach(() => { document.body.innerHTML = '' })

describe('colorFullNote', () => {
  it('colors paths in the main note group', () => {
    document.body.innerHTML = `<g id="vf-n1"><path/><path/></g>`
    const out: HTMLElement[] = []
    colorFullNote('n1', true, false, out)
    expect(out.length).toBe(2)
    expect(out[0].style.fill).not.toBe('')
    expect(out[0].style.stroke).not.toBe('')
  })

  it('also colors the separate stem and ledger groups', () => {
    document.body.innerHTML = `
      <g id="vf-n2"><path/></g>
      <g id="vf-n2-stem"><path/></g>
      <g id="vf-n2ledgers"><path/><path/></g>`
    const out: HTMLElement[] = []
    colorFullNote('n2', false, false, out)
    expect(out.length).toBe(4) // 1 head + 1 stem + 2 ledger
  })

  it('is a no-op when no matching elements exist', () => {
    const out: HTMLElement[] = []
    colorFullNote('missing', true, true, out)
    expect(out.length).toBe(0)
  })

  it('applies distinct right-black vs left-white colours', () => {
    document.body.innerHTML = `<g id="vf-a"><path/></g><g id="vf-b"><path/></g>`
    const a: HTMLElement[] = []
    const b: HTMLElement[] = []
    colorFullNote('a', true, true, a)   // right + black
    colorFullNote('b', false, false, b) // left + white
    expect(a[0].style.fill).not.toBe(b[0].style.fill)
  })
})

describe('clearHighlights', () => {
  it('wipes inline fill/stroke and empties the refs array', () => {
    document.body.innerHTML = `<g id="vf-n1"><path/></g>`
    const out: HTMLElement[] = []
    colorFullNote('n1', true, false, out)
    const el = out[0]
    expect(el.style.fill).not.toBe('')
    clearHighlights(out)
    expect(el.style.fill).toBe('')
    expect(el.style.stroke).toBe('')
    expect(out.length).toBe(0)
  })

  it('handles an empty refs array', () => {
    const out: HTMLElement[] = []
    expect(() => clearHighlights(out)).not.toThrow()
    expect(out.length).toBe(0)
  })
})
