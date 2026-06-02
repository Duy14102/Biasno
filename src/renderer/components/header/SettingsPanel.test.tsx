import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
vi.mock('@/i18n', () => ({ useLanguage: () => ({ t: (k: string) => k }) }))
import SettingsPanel from './SettingsPanel'

type Handlers = {
  onVolumeChange: ReturnType<typeof vi.fn<(v: number) => void>>
  onVolumeMute: ReturnType<typeof vi.fn<() => void>>
  onZoomChange: ReturnType<typeof vi.fn<(v: number) => void>>
  onMeasureLinesToggle: ReturnType<typeof vi.fn<() => void>>
  onCountdownToggle: ReturnType<typeof vi.fn<() => void>>
  onPianoOwnSoundToggle: ReturnType<typeof vi.fn<() => void>>
}

const wrap = (over: Partial<{
  volume: number; zoom: number; measureLines: boolean; countdownEnabled: boolean
  midiConnected: boolean; pianoOwnSound: boolean
}> = {}) => {
  const h: Handlers = {
    onVolumeChange: vi.fn<(v: number) => void>(), onVolumeMute: vi.fn<() => void>(),
    onZoomChange: vi.fn<(v: number) => void>(),
    onMeasureLinesToggle: vi.fn<() => void>(), onCountdownToggle: vi.fn<() => void>(),
    onPianoOwnSoundToggle: vi.fn<() => void>(),
  }
  const r = render(
    <SettingsPanel
      volume={over.volume ?? 0.5}
      zoom={over.zoom ?? 1}
      measureLines={over.measureLines ?? false}
      countdownEnabled={over.countdownEnabled ?? false}
      midiConnected={over.midiConnected ?? false}
      pianoOwnSound={over.pianoOwnSound ?? false}
      {...h}
    />,
  )
  return { ...r, h }
}

const trigger = (c: HTMLElement) => c.querySelector('button') as HTMLButtonElement
const open = (c: HTMLElement) => fireEvent.click(trigger(c))
const paths = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('path')).map(p => p.getAttribute('d') ?? '')

afterEach(cleanup)

describe('SettingsPanel', () => {
  it('starts closed', () => {
    const { queryByText } = wrap()
    expect(queryByText('audio')).toBeNull()
  })

  it('opens on trigger and adds the spin class', () => {
    const { container, getByText } = wrap()
    open(container)
    expect(getByText('audio')).toBeTruthy()
    expect(getByText('display')).toBeTruthy()
    expect(container.querySelector('.settings-gear-spin')).not.toBeNull()
  })

  it('toggles closed on a second trigger click', () => {
    const { container, queryByText } = wrap()
    open(container)
    expect(queryByText('audio')).toBeTruthy()
    open(container)
    expect(queryByText('audio')).toBeNull()
  })

  it('volume slider change converts pct -> 0..1', () => {
    const { container, h } = wrap({ volume: 0.5 })
    open(container)
    const range = container.querySelector('input[type="range"]') as HTMLInputElement
    fireEvent.change(range, { target: { value: '80' } })
    expect(h.onVolumeChange).toHaveBeenCalledWith(0.8)
  })

  it('zoom slider change converts pct -> ratio', () => {
    const { container, h } = wrap({ zoom: 1 })
    open(container)
    const ranges = container.querySelectorAll('input[type="range"]')
    fireEvent.change(ranges[1], { target: { value: '150' } })
    expect(h.onZoomChange).toHaveBeenCalledWith(1.5)
  })

  it('mute button fires onVolumeMute', () => {
    const { container, getByTitle, h } = wrap({ volume: 0.5 })
    open(container)
    fireEvent.click(getByTitle('mute'))
    expect(h.onVolumeMute).toHaveBeenCalledTimes(1)
  })

  it('VolumeGlyph: muted (v === 0) shows mute icon + "unmute" title', () => {
    const { container, getByTitle } = wrap({ volume: 0 })
    open(container)
    expect(getByTitle('unmute')).toBeTruthy()
    expect(paths(container).some(d => d.startsWith('M16.5 12c0-1.77'))).toBe(true)
  })

  it('VolumeGlyph: low (0 < v < 0.35) + "mute" title', () => {
    const { container, getByTitle } = wrap({ volume: 0.2 })
    open(container)
    expect(getByTitle('mute')).toBeTruthy()
    expect(paths(container)).toContain('M7 9v6h4l5 5V4l-5 5H7z')
  })

  it('VolumeGlyph: medium (0.35 <= v < 0.70) shows med icon', () => {
    const { container } = wrap({ volume: 0.5 })
    open(container)
    expect(paths(container).some(d => d.includes('11.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05'))).toBe(true)
  })

  it('VolumeGlyph: high (v >= 0.70) shows high icon', () => {
    const { container } = wrap({ volume: 0.9 })
    open(container)
    expect(paths(container).some(d => d.startsWith('M3 9v6h4l5 5V4'))).toBe(true)
  })

  it('measure-lines toggle reflects state and fires callback', () => {
    const { container, h } = wrap({ measureLines: true })
    open(container)
    const switches = container.querySelectorAll('[role="switch"]')
    // First switch is measureLines, second is countdown.
    expect(switches[0].getAttribute('aria-checked')).toBe('true')
    fireEvent.click(switches[0])
    expect(h.onMeasureLinesToggle).toHaveBeenCalledTimes(1)
  })

  it('countdown toggle reflects state and fires callback', () => {
    const { container, h } = wrap({ countdownEnabled: true })
    open(container)
    const switches = container.querySelectorAll('[role="switch"]')
    expect(switches[1].getAttribute('aria-checked')).toBe('true')
    fireEvent.click(switches[1])
    expect(h.onCountdownToggle).toHaveBeenCalledTimes(1)
  })

  it('piano-own-sound toggle is hidden when no MIDI device is connected', () => {
    const { container, queryByText } = wrap({ midiConnected: false })
    open(container)
    expect(queryByText('pianoOwnSound')).toBeNull()
  })

  it('piano-own-sound toggle shows when connected, reflects state, fires callback', () => {
    const { container, getByText, h } = wrap({ midiConnected: true, pianoOwnSound: true })
    open(container)
    expect(getByText('pianoOwnSound')).toBeTruthy()
    const switches = container.querySelectorAll('[role="switch"]')
    // Order: pianoOwnSound (audio section), measureLines, countdown (display).
    expect(switches[0].getAttribute('aria-checked')).toBe('true')
    fireEvent.click(switches[0])
    expect(h.onPianoOwnSoundToggle).toHaveBeenCalledTimes(1)
  })

  it('closes on outside mousedown', () => {
    const { container, queryByText } = wrap()
    open(container)
    expect(queryByText('audio')).toBeTruthy()
    fireEvent.mouseDown(document.body)
    expect(queryByText('audio')).toBeNull()
  })

  it('stays open on inside mousedown', () => {
    const { container, queryByText } = wrap()
    open(container)
    fireEvent.mouseDown(trigger(container))
    expect(queryByText('audio')).toBeTruthy()
  })
})
