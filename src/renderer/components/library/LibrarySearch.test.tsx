import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import LibrarySearch from './LibrarySearch'
import { LanguageProvider } from '@/i18n'

afterEach(cleanup)

function setup(value: string) {
  const onChange = vi.fn()
  const utils = render(
    <LanguageProvider>
      <LibrarySearch value={value} onChange={onChange} />
    </LanguageProvider>,
  )
  const input = utils.container.querySelector('input') as HTMLInputElement
  const clearBtn = utils.container.querySelector('button') as HTMLButtonElement
  return { onChange, input, clearBtn, ...utils }
}

describe('LibrarySearch', () => {
  it('forwards typed input to onChange', () => {
    const { onChange, input } = setup('')
    fireEvent.change(input, { target: { value: 'moon' } })
    expect(onChange).toHaveBeenCalledWith('moon')
  })

  it('clears via the clear button and refocuses the input', () => {
    const { onChange, input, clearBtn } = setup('song')
    fireEvent.click(clearBtn)
    expect(onChange).toHaveBeenCalledWith('')
    expect(document.activeElement).toBe(input)
  })

  it('Escape clears when there is a query', () => {
    const { onChange, input } = setup('abc')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('Escape is a no-op when the query is empty', () => {
    const { onChange, input } = setup('')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('non-Escape keydown does not clear', () => {
    const { onChange, input } = setup('abc')
    fireEvent.keyDown(input, { key: 'a' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clear button is interactive only when a query exists', () => {
    const { clearBtn } = setup('x')
    expect(clearBtn.className).toContain('pointer-events-auto')
    cleanup()
    const empty = setup('')
    expect(empty.clearBtn.className).toContain('pointer-events-none')
  })
})
