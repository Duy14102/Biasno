import { describe, it, expect } from 'vitest'
import { midiToMusicXml } from './musicXmlBuilder'
import type { MidiNote, Hand } from '../../types'

const note = (
  id: string, midi: number, time: number, duration: number, hand: Hand = 'right',
): MidiNote => ({
  id, midi, time, duration, velocity: 0.8, name: '?',
  track: hand === 'left' ? 1 : 0, hand, channel: 0,
})

const TS = { numerator: 4, denominator: 4 }

describe('midiToMusicXml', () => {
  it('returns empty string when no notes match the active hands', () => {
    const notes = [note('a', 60, 0, 1, 'right')]
    expect(midiToMusicXml(notes, 120, TS, ['left'])).toBe('')
  })

  it('returns valid XML preamble and a part block', () => {
    const xml = midiToMusicXml([note('a', 60, 0, 1)], 120, TS, ['right'])
    expect(xml).toContain('<?xml version="1.0"')
    expect(xml).toContain('<score-partwise')
    expect(xml).toContain('</score-partwise>')
    expect(xml).toContain('<part id="P1">')
  })

  it('includes time + key + tempo attributes in measure 1 only', () => {
    const notes = [note('a', 60, 0, 1), note('b', 60, 5, 1)]
    const xml = midiToMusicXml(notes, 120, TS, ['right'])
    expect(xml.match(/<attributes>/g)?.length).toBe(1)
    expect(xml).toContain('<beats>4</beats>')
    expect(xml).toContain('<beat-type>4</beat-type>')
    expect(xml).toContain('<per-minute>120</per-minute>')
  })

  it('splits notes across treble (G) and bass (F) clefs', () => {
    const notes = [
      note('hi', 72, 0, 1, 'right'),
      note('lo', 48, 0, 1, 'left'),
    ]
    const xml = midiToMusicXml(notes, 120, TS, ['left', 'right'])
    expect(xml).toContain('<sign>G</sign>')
    expect(xml).toContain('<sign>F</sign>')
    expect(xml).toContain('<staff>1</staff>')
    expect(xml).toContain('<staff>2</staff>')
  })

  it('encodes accidental notes with <alter>', () => {
    const xml = midiToMusicXml([note('a', 61, 0, 1)], 120, TS, ['right'])
    expect(xml).toContain('<step>C</step>')
    expect(xml).toContain('<alter>1</alter>')
  })

  it('marks subsequent notes at the same onset as <chord/>', () => {
    const notes = [
      note('a', 60, 0, 1, 'right'),
      note('b', 64, 0, 1, 'right'),
      note('c', 67, 0, 1, 'right'),
    ]
    const xml = midiToMusicXml(notes, 120, TS, ['right'])
    expect(xml.match(/<chord\/>/g)?.length).toBe(2)
  })

  it('generates one measure per beat-time and writes them in order', () => {
    const notes = [note('a', 60, 0, 1), note('b', 60, 5, 1)]
    const xml = midiToMusicXml(notes, 120, TS, ['right'])
    expect(xml).toContain('<measure number="1">')
    expect(xml).toContain('<measure number="2">')
    expect(xml).toContain('<measure number="3">')
  })
})
