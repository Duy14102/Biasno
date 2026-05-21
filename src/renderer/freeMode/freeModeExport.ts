// Export helpers for Free Mode.
//
// All three formats (MIDI, MusicXML, PDF) consume the SAME slice of the
// recording — notes inside [trimStartMs, trimEndMs], shifted to start at
// t=0.  This keeps the three exported files mutually consistent: what you
// hear in MIDI is what's drawn on the sheet PDF.

import { Midi } from '@tonejs/midi'
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import type { FreeSnapshot, RecordedNote } from './types'
import { midiToMusicXml } from '@/components/sheet'
import type { MidiNote, Hand } from '@/types'

const DEFAULT_BPM = 120

function trimmedNotes(s: FreeSnapshot): { rel: RecordedNote[]; durMs: number } {
  const filtered = s.notes
    .filter(n => n.endMs > s.trimStartMs && n.startMs < s.trimEndMs)
    .map<RecordedNote>(n => ({
      ...n,
      startMs: Math.max(0, n.startMs - s.trimStartMs),
      endMs:   Math.min(s.trimEndMs - s.trimStartMs, n.endMs - s.trimStartMs),
    }))
  const durMs = Math.max(0, s.trimEndMs - s.trimStartMs)
  return { rel: filtered, durMs }
}

// ─── MIDI ──────────────────────────────────────────────────────────────────
export function buildMidi(s: FreeSnapshot, bpm = DEFAULT_BPM): ArrayBuffer {
  const { rel } = trimmedNotes(s)
  const midi = new Midi()
  midi.header.setTempo(bpm)
  const track = midi.addTrack()
  track.name = 'Free Mode'
  rel.forEach((n) => {
    track.addNote({
      midi:     n.midi,
      time:     n.startMs / 1000,
      duration: Math.max(0.03, (n.endMs - n.startMs) / 1000),
      velocity: n.velocity,
    })
  })
  // Midi.toArray() returns a Uint8Array — copy into a clean ArrayBuffer so
  // it survives the IPC structured clone without TypedArray view weirdness.
  const arr = midi.toArray()
  const out = new ArrayBuffer(arr.byteLength)
  new Uint8Array(out).set(arr)
  return out
}

// ─── MusicXML ──────────────────────────────────────────────────────────────
// Free recording has no hand assignment — split at middle C (60), same
// convention parseMidiBuffer uses for single-track input.
function toMidiNotes(s: FreeSnapshot): MidiNote[] {
  const { rel } = trimmedNotes(s)
  return rel.map((n, i) => ({
    id:        `f${i}`,
    midi:      n.midi,
    time:      n.startMs / 1000,
    duration:  Math.max(0.05, (n.endMs - n.startMs) / 1000),
    velocity:  n.velocity,
    name:      '',
    track:     0,
    hand:      (n.midi < 60 ? 'left' : 'right') as Hand,
    channel:   0,
  }))
}

export function buildMusicXml(s: FreeSnapshot, bpm = DEFAULT_BPM): string {
  const notes = toMidiNotes(s)
  if (notes.length === 0) return ''
  return midiToMusicXml(notes, bpm, { numerator: 4, denominator: 4 }, ['left', 'right'])
}

// ─── PDF (via OSMD render → printToPDF in main) ────────────────────────────
// Off-screen render mirrors components/sheet/sheetPreload.ts.  We grab the
// produced <svg>'s outerHTML, wrap it in a print-friendly HTML shell, and
// hand it to the main process to convert via webContents.printToPDF.

// Engraving-style typography: EB Garamond is the closest free webfont to the
// Plantin/Edwin lineage used by MuseScore and classical engraving houses.
// Loaded via Google Fonts; the print step waits for document.fonts.ready
// before rasterising so the title isn't captured in the fallback font.
//
// Body falls back through Plantin / Garamond / Times so users who somehow
// can't reach Google Fonts (offline runs, blocked DNS) still get a clean
// serif title instead of a sans-serif.
const PDF_HTML_SHELL = (svgMarkup: string, title: string, author: string) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
<style>
  @page { margin: 16mm; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; }
  body {
    font-family: "EB Garamond", "Plantin", "Garamond", "Times New Roman", "Liberation Serif", Georgia, serif;
    font-feature-settings: "kern" 1, "liga" 1, "onum" 1;
    -webkit-font-smoothing: antialiased;
  }
  .title-block { text-align: center; margin: 4mm 0 6mm 0; }
  .title {
    font-size: 32pt;
    font-weight: 600;
    letter-spacing: 0.3px;
    line-height: 1.1;
    margin: 0;
  }
  .composer {
    font-size: 13pt;
    font-style: italic;
    margin: 2mm 0 0 0;
    color: #222;
    letter-spacing: 0.3px;
  }
  .credit {
    text-align: right;
    font-size: 9pt;
    font-style: italic;
    color: #555;
    margin: 0 0 4mm 0;
  }
  svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }
</style></head>
<body>
  <div class="title-block">
    <h1 class="title">${escapeHtml(title)}</h1>
    ${author ? `<div class="composer">${escapeHtml(author)}</div>` : ''}
  </div>
  <div class="credit">Recorded with Biasno</div>
  ${svgMarkup}
</body></html>`

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ))
}

export async function buildSheetHtml(
  s: FreeSnapshot, title: string, author: string, bpm = DEFAULT_BPM,
): Promise<string | null> {
  const xml = buildMusicXml(s, bpm)
  if (!xml) return null

  const container = document.createElement('div')
  container.style.position  = 'fixed'
  container.style.left      = '-99999px'
  container.style.top       = '0'
  container.style.width     = '900px'
  document.body.appendChild(container)
  try {
    const osmd = new OpenSheetMusicDisplay(container, {
      autoResize: false,
      drawingParameters: 'compact',
      drawTitle: false, drawSubtitle: false, drawComposer: false, drawLyricist: false,
    })
    await osmd.load(xml)
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    osmd.render()
    const svg = container.querySelector('svg')
    if (!svg) return null
    // Ensure namespace is present on the outer element so the standalone
    // HTML renders correctly in the hidden BrowserWindow that prints it.
    if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    return PDF_HTML_SHELL(svg.outerHTML, title, author)
  } catch (e) {
    console.error('[freeMode] buildSheetHtml', e)
    return null
  } finally {
    container.remove()
  }
}
