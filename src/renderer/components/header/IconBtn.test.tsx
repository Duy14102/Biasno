import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import IconBtn from './IconBtn'

afterEach(cleanup)

describe('IconBtn', () => {
  it('renders children + title and fires onClick', () => {
    const onClick = vi.fn()
    const { getByTitle } = render(
      <IconBtn onClick={onClick} title="Back"><span>X</span></IconBtn>,
    )
    const btn = getByTitle('Back')
    expect(btn.textContent).toContain('X')
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('default variant: not active, not danger', () => {
    const { getByTitle } = render(<IconBtn onClick={() => {}} title="t">i</IconBtn>)
    const cls = getByTitle('t').className
    expect(cls).toContain('bg-slate-100')
    expect(cls).not.toContain('bg-blue-500')
    expect(cls).not.toContain('is-danger')
  })

  it('active variant overrides danger styling', () => {
    const { getByTitle } = render(
      <IconBtn onClick={() => {}} title="t" active danger>i</IconBtn>,
    )
    const cls = getByTitle('t').className
    expect(cls).toContain('bg-blue-500')
    expect(cls).not.toContain('is-danger')
  })

  it('danger variant when not active', () => {
    const { getByTitle } = render(
      <IconBtn onClick={() => {}} title="t" danger>i</IconBtn>,
    )
    expect(getByTitle('t').className).toContain('is-danger')
  })

  it('does not pop the glyph on first mount even when active', () => {
    const { container } = render(
      <IconBtn onClick={() => {}} title="t" active>i</IconBtn>,
    )
    expect(container.querySelector('.iconbtn-pop')).toBeNull()
  })

  it('does not pop the glyph when active stays false', () => {
    const { rerender, container } = render(
      <IconBtn onClick={() => {}} title="t" active={false}>i</IconBtn>,
    )
    rerender(<IconBtn onClick={() => {}} title="t" active={false}>i</IconBtn>)
    expect(container.querySelector('.iconbtn-pop')).toBeNull()
  })

  it('pops the glyph when active flips false -> true after mount', () => {
    const { rerender, container } = render(
      <IconBtn onClick={() => {}} title="t" active={false}>i</IconBtn>,
    )
    rerender(<IconBtn onClick={() => {}} title="t" active>i</IconBtn>)
    expect(container.querySelector('.iconbtn-pop')).not.toBeNull()
  })

  it('does not re-pop when active flips true -> false', () => {
    const { rerender, container } = render(
      <IconBtn onClick={() => {}} title="t" active>i</IconBtn>,
    )
    rerender(<IconBtn onClick={() => {}} title="t" active={false}>i</IconBtn>)
    expect(container.querySelector('.iconbtn-pop')).toBeNull()
  })
})
