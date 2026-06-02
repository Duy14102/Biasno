import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'
import { highlightMatch } from './highlightMatch'

afterEach(cleanup)

describe('highlightMatch', () => {
  it('returns the original string unchanged when query is empty', () => {
    expect(highlightMatch('Hello', '')).toBe('Hello')
  })

  it('returns the original string when query is whitespace only', () => {
    expect(highlightMatch('Hello', '   ')).toBe('Hello')
  })

  it('returns a single <mark> at the start with no leading text segment', () => {
    const out = highlightMatch('Hello world', 'hello') as React.ReactNode[]
    expect(Array.isArray(out)).toBe(true)
    // leading text skipped (hit === i === 0), then mark, then trailing text
    expect(out.length).toBe(2)
    const { container } = render(<>{out}</>)
    const marks = container.querySelectorAll('mark')
    expect(marks.length).toBe(1)
    expect(marks[0].textContent).toBe('Hello') // preserves original casing
    expect(container.textContent).toBe('Hello world')
  })

  it('emits leading text before a mid-string match', () => {
    const out = highlightMatch('abXYab', 'XY') as React.ReactNode[]
    // ['ab', <mark>XY</mark>, 'ab']
    expect(out.length).toBe(3)
    expect(out[0]).toBe('ab')
    const { container } = render(<>{out}</>)
    expect(container.querySelectorAll('mark').length).toBe(1)
    expect(container.querySelector('mark')?.textContent).toBe('XY')
  })

  it('wraps multiple case-insensitive occurrences', () => {
    const out = highlightMatch('a A a', 'a') as React.ReactNode[]
    const { container } = render(<>{out}</>)
    const marks = container.querySelectorAll('mark')
    expect(marks.length).toBe(3)
    expect([...marks].map((m) => m.textContent)).toEqual(['a', 'A', 'a'])
    expect(container.textContent).toBe('a A a')
  })

  it('returns no trailing segment when the match ends the string', () => {
    const out = highlightMatch('foobar', 'bar') as React.ReactNode[]
    // ['foo', <mark>bar</mark>] — i === text.length, no trailing push
    expect(out.length).toBe(2)
    expect(out[0]).toBe('foo')
  })

  it('returns a single text node when query has no match', () => {
    const out = highlightMatch('abc', 'zzz') as React.ReactNode[]
    expect(out).toEqual(['abc'])
  })
})
