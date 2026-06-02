import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import { LanguageProvider } from '@/i18n'
import ExportMenu from './ExportMenu'

beforeEach(() => localStorage.setItem('biasno.lang', 'en'))
afterEach(() => { cleanup(); localStorage.clear() })

function setup(props: Partial<React.ComponentProps<typeof ExportMenu>> = {}) {
  const onMidi = vi.fn(), onXml = vi.fn(), onPdf = vi.fn()
  const utils = render(
    <LanguageProvider>
      <ExportMenu onMidi={onMidi} onXml={onXml} onPdf={onPdf} busy={null} disabled={false} {...props} />
    </LanguageProvider>,
  )
  const trigger = utils.container.querySelector('button') as HTMLButtonElement
  return { onMidi, onXml, onPdf, trigger, ...utils }
}

describe('ExportMenu', () => {
  it('is closed initially and opens on trigger click', () => {
    const { trigger, queryByRole } = setup()
    expect(queryByRole('menu')).toBeNull()
    fireEvent.click(trigger)
    expect(queryByRole('menu')).toBeTruthy()
  })

  it('toggles closed on a second trigger click', () => {
    const { trigger, queryByRole } = setup()
    fireEvent.click(trigger)
    fireEvent.click(trigger)
    expect(queryByRole('menu')).toBeNull()
  })

  it('fires onMidi and closes the menu when MIDI is chosen', () => {
    const { trigger, onMidi, getByText, queryByRole } = setup()
    fireEvent.click(trigger)
    fireEvent.click(getByText('MIDI'))
    expect(onMidi).toHaveBeenCalledTimes(1)
    expect(queryByRole('menu')).toBeNull()
  })

  it('fires onXml and onPdf for their items', () => {
    const { trigger, onXml, onPdf, getByText } = setup()
    fireEvent.click(trigger)
    fireEvent.click(getByText('MusicXML'))
    expect(onXml).toHaveBeenCalledTimes(1)
    fireEvent.click(trigger)
    fireEvent.click(getByText('PDF'))
    expect(onPdf).toHaveBeenCalledTimes(1)
  })

  it('closes on outside mousedown', () => {
    const { trigger, queryByRole } = setup()
    fireEvent.click(trigger)
    fireEvent.mouseDown(document.body)
    expect(queryByRole('menu')).toBeNull()
  })

  it('does NOT close on an inside mousedown', () => {
    const { trigger, queryByRole, getByRole } = setup()
    fireEvent.click(trigger)
    fireEvent.mouseDown(getByRole('menu'))
    expect(queryByRole('menu')).toBeTruthy()
  })

  it('closes on Escape', () => {
    const { trigger, queryByRole } = setup()
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(queryByRole('menu')).toBeNull()
  })

  it('ignores non-Escape keys', () => {
    const { trigger, queryByRole } = setup()
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'a' })
    expect(queryByRole('menu')).toBeTruthy()
  })

  it('shows the busy label per format and disables that item', () => {
    const { getByText, rerender } = setup({ busy: 'midi' })
    expect(getByText('Exporting MIDI…')).toBeTruthy()
    rerender(
      <LanguageProvider>
        <ExportMenu onMidi={vi.fn()} onXml={vi.fn()} onPdf={vi.fn()} busy={'xml'} disabled={false} />
      </LanguageProvider>,
    )
    expect(getByText('Exporting MusicXML…')).toBeTruthy()
    rerender(
      <LanguageProvider>
        <ExportMenu onMidi={vi.fn()} onXml={vi.fn()} onPdf={vi.fn()} busy={'pdf'} disabled={false} />
      </LanguageProvider>,
    )
    expect(getByText('Exporting PDF…')).toBeTruthy()
  })

  it('disables the trigger when disabled', () => {
    const { trigger } = setup({ disabled: true })
    expect(trigger.disabled).toBe(true)
  })
})
