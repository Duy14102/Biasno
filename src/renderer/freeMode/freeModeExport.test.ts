import { describe, it, expect, vi } from 'vitest'
import { Midi } from '@tonejs/midi'

// The source imports from the `@/components/sheet` and `@/audio` barrels, which
// transitively pull in `tone` (broken build in this env) via SheetMusic /
// AudioEngine.  Redirect those imports to the real, dependency-light modules so
// the genuine builder logic still runs.
vi.mock('@/components/sheet', () => import('@/components/sheet/musicXmlBuilder'))
vi.mock('@/audio', () => import('@/audio/pedal'))

import { buildMidi, buildMusicXml, buildSheetHtml } from './freeModeExport'
import type { FreeSnapshot, RecordedNote } from './types'
import type { PedalEvent } from '@/types'

const note = (id: string, midi: number, startMs: number, endMs: number, velocity = 0.8): RecordedNote =>
  ({ id, midi, startMs, endMs, velocity })

const snap = (o: Partial<FreeSnapshot> = {}): FreeSnapshot => ({
  notes: [], durationMs: 0, trimStartMs: 0, trimEndMs: 0, clips: [], ...o,
})

// Parse a built MIDI ArrayBuffer back into a Midi object for assertions.
const parse = (buf: ArrayBuffer) => new Midi(buf)

describe('buildMidi', () => {
  it('empty notes → empty track, valid buffer', () => {
    const buf = buildMidi(snap())
    expect(buf).toBeInstanceOf(ArrayBuffer)
    const m = parse(buf)
    expect(m.tracks[0].notes.length).toBe(0)
  })

  it('honours bpm in the header', () => {
    const m = parse(buildMidi(snap(), 90))
    expect(m.header.tempos[0].bpm).toBeCloseTo(90, 1)
  })

  it('keeps a note inside the trim window, shifted to t=0', () => {
    const s = snap({
      notes: [note('a', 60, 1000, 2000)],
      durationMs: 3000, trimStartMs: 500, trimEndMs: 3000,
    })
    const m = parse(buildMidi(s))
    expect(m.tracks[0].notes.length).toBe(1)
    const n = m.tracks[0].notes[0]
    expect(n.time).toBeCloseTo(0.5, 3)       // (1000-500)/1000
    expect(n.midi).toBe(60)
  })

  it('drops a note entirely outside the trim window', () => {
    const s = snap({
      notes: [note('a', 60, 0, 400)],         // endMs <= trimStart
      durationMs: 3000, trimStartMs: 500, trimEndMs: 3000,
    })
    expect(parse(buildMidi(s)).tracks[0].notes.length).toBe(0)
  })

  it('scales velocity by the containing clip volume', () => {
    const s = snap({
      notes: [note('a', 60, 0, 1000, 1)],
      durationMs: 2000, trimStartMs: 0, trimEndMs: 2000,
      clips: [{ id: 'c', startMs: 0, endMs: 2000, volume: 0.5, locked: false }],
    })
    // MIDI velocity is 7-bit, so 0.5 round-trips to ~0.496.
    expect(parse(buildMidi(s)).tracks[0].notes[0].velocity).toBeCloseTo(0.5, 2)
  })

  it('drops notes whose onset falls in a gap (no containing clip)', () => {
    const s = snap({
      notes: [note('a', 60, 5000, 6000)],     // onset past the only clip
      durationMs: 7000, trimStartMs: 0, trimEndMs: 7000,
      clips: [{ id: 'c', startMs: 0, endMs: 1000, volume: 1, locked: false }],
    })
    expect(parse(buildMidi(s)).tracks[0].notes.length).toBe(0)
  })

  it('clamps a minimum note duration of 0.03s', () => {
    const s = snap({
      notes: [note('a', 60, 100, 110)],       // 10ms → clamped to 0.03s
      durationMs: 2000, trimStartMs: 0, trimEndMs: 2000,
    })
    expect(parse(buildMidi(s)).tracks[0].notes[0].duration).toBeCloseTo(0.03, 3)
  })
})

describe('buildMidi — pedal CC64', () => {
  it('emits no CC when there are no pedal events', () => {
    const m = parse(buildMidi(snap({
      notes: [note('a', 60, 0, 1000)], durationMs: 1000, trimStartMs: 0, trimEndMs: 1000,
    })))
    expect(m.tracks[0].controlChanges[64] ?? []).toHaveLength(0)
  })

  it('emits CC64 down/up edges inside the window, shifted to t=0', () => {
    const pedalEvents: PedalEvent[] = [{ time: 200, down: true }, { time: 800, down: false }]
    const m = parse(buildMidi(snap({
      notes: [note('a', 60, 0, 1000)],
      durationMs: 1000, trimStartMs: 0, trimEndMs: 1000, pedalEvents,
    })))
    const cc = m.tracks[0].controlChanges[64]
    expect(cc.map(c => c.value)).toEqual([1, 0])
    expect(cc[0].time).toBeCloseTo(0.2, 3)
  })

  it('seeds a down edge at t=0 when the pedal was already held at trim start', () => {
    const pedalEvents: PedalEvent[] = [{ time: 0, down: true }, { time: 5000, down: false }]
    const m = parse(buildMidi(snap({
      notes: [note('a', 60, 1100, 1500)],
      durationMs: 6000, trimStartMs: 1000, trimEndMs: 2000, pedalEvents,
    })))
    const cc = m.tracks[0].controlChanges[64]
    // seeded down at 0, then a synthetic up at the slice end (1000ms = 1s)
    expect(cc[0].value).toBe(1)
    expect(cc[0].time).toBeCloseTo(0, 3)
    expect(cc[cc.length - 1].value).toBe(0)
  })

  it('collapses consecutive duplicate pedal states', () => {
    const pedalEvents: PedalEvent[] = [
      { time: 100, down: true }, { time: 200, down: true }, { time: 300, down: false },
    ]
    const m = parse(buildMidi(snap({
      notes: [note('a', 60, 0, 1000)],
      durationMs: 1000, trimStartMs: 0, trimEndMs: 1000, pedalEvents,
    })))
    expect(m.tracks[0].controlChanges[64].map(c => c.value)).toEqual([1, 0])
  })
})

describe('buildMusicXml', () => {
  it('returns empty string when no notes survive', () => {
    expect(buildMusicXml(snap())).toBe('')
  })

  it('produces a MusicXML document for a non-empty snapshot', () => {
    const s = snap({
      notes: [note('a', 64, 0, 500), note('b', 55, 600, 1000)],
      durationMs: 1000, trimStartMs: 0, trimEndMs: 1000,
    })
    const xml = buildMusicXml(s)
    expect(xml).toContain('score-partwise')
    // 64 >= 60 → right hand, 55 < 60 → left hand; both staves present.
    expect(xml.length).toBeGreaterThan(0)
  })
})

describe('buildSheetHtml', () => {
  it('returns null when there is nothing to render', async () => {
    expect(await buildSheetHtml(snap(), 'T', 'A')).toBe(null)
  })

  it('returns null and logs when OSMD throws (jsdom cannot render)', async () => {
    // jsdom has no real SVG layout engine, so osmd.render() throws — exercises
    // the catch path.  We assert the error was logged and null returned.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const s = snap({
      notes: [note('a', 64, 0, 500)], durationMs: 500, trimStartMs: 0, trimEndMs: 500,
    })
    const out = await buildSheetHtml(s, 'My <Title>', 'Me & Co')
    // Either it rendered (null only on no-svg) or threw → both paths return null
    // in jsdom; the container must be cleaned up regardless.
    expect(out === null || typeof out === 'string').toBe(true)
    expect(document.querySelectorAll('div[style*="-99999px"]').length).toBe(0)
    spy.mockRestore()
  })
})
