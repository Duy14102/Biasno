# 🎹 Biasno

An interactive piano learning app — falling notes, sheet music, MIDI keyboard support, and real-time feedback. Built with Electron + React.

UI is in Vietnamese; the app itself plays any standard MIDI file.

---

## Features

### Practice modes
- **Xem & Nghe** — auto-playback with falling notes / sheet sync, no input required.
- **Melody** — play the correct notes (single hand or both).
- **Rhythm** — play any note, but on the correct beat.
- **Melody + Rhythm** — both at once.
- Per-hand variants (left / right / both) for every mode above.
- Mid-session mode switching with an animated label flash.
- Per-(song, mode) UI prefs — toggling the sheet for song A doesn't bleed into song B.

### Sheet music
- OpenSheetMusicDisplay (OSMD) renderer with live cursor tracking.
- Auto-scroll lock (top-right) keeps the playhead row near the top of the viewport, or lets you scroll freely.
- Dark mode toggle (sun/moon icon below the lock) — full invert + hue-rotate so notes flip from black to white while highlight colours stay consistent.
- Per-note highlighting synced with the active key state. Treble = blue shades, bass = orange.
- Pre-rendered off-screen on the home page so opening the sheet inside practice is instant.

### Falling notes
- Synthesia-style canvas view with hand-coloured note bars.
- Hit-line glow on physical contact, separate confirmation glow on player input.
- Optional vertical lane lines + zoom (0.5×–2×).

### Library
- Import a single file via dialog.
- Drag-drop one or many `.mid` / `.midi` files anywhere over the window — the drop zone lights up on the right panel as soon as the drag starts.
- Pick a folder; every MIDI inside it gets parsed and pre-rendered in the background.
- Multi-folder support — entries from different folders coexist; hover the leading icon for the source path.
- Hover any row → trash button → confirm modal (different copy depending on whether the file is import- or folder-sourced; in both cases delete is memory-only, the file on disk stays put).

### Audio / input
- Web Audio engine with sample-based piano via `@tonejs/piano` and `soundfont-player`.
- 300 ms scheduling look-ahead so timing survives normal JS jitter.
- MIDI keyboard input via Web MIDI API.
- Computer keyboard fallback: `a w s e d f t g y h u j k o l p ;` → C4 → E5.

### Transport / tools
- Play / pause / restart / rewind 5 s / fast-forward 5 s.
- BPM multiplier (0.25×–2.0×), with live re-scheduling that avoids re-attacking sustained notes.
- Metronome, loop region (drag the bar to set a region, then loop it).
- Optional 3-2-1 countdown before playback starts.
- Visual separator at the keyboard's top edge (a thin gradient seam) so the falling-notes hit line and the keys line up cleanly.

---

## Tech stack

- **Electron 32** (`contextIsolation: true`, `sandbox: false`)
- **electron-vite** for dev + production bundling
- **React 18** + **TypeScript** + **TailwindCSS**
- **React Router** for the 3-page flow (home → mode → practice)
- **`@tonejs/midi`** for MIDI parsing
- **`@tonejs/piano` + `tone`** for synthesis
- **`opensheetmusicdisplay`** for sheet rendering (OSMD 1.9.9)

---

## Quick start

```bash
# Install dependencies
npm install

# Run in dev mode (hot reload)
npm run dev

# Production build (renderer + main + preload bundles into ./out)
npm run build

# Run the production bundle without packaging
npm run start

# Package a Windows portable build into ./release/win-unpacked
npm run package
```

The `clean` step inside `package` kills any running `Biasno.exe` / `app-builder.exe` and removes `dist/`, `out/`, `release/` with EBUSY retries — handles the common "Access is denied" failure when a previous run left a file locked.

---

## Project structure

```
src/
├── main/            Electron main process — IPC handlers for file dialogs,
│                    folder scan, MIDI buffer reads.
├── preload/         contextBridge bridge — exposes window.electronAPI
│                    (openMidiFile, openFolder, scanMidiFolder, readMidiFile,
│                    getPathForFile, getDataPath).
└── renderer/        React app.
    ├── audio/        AudioEngine (sample loading, scheduler, metronome).
    ├── components/   SheetMusic, FallingNotes, PianoKeyboard,
    │                 PracticeHeader, ProgressBar, …
    ├── context/      AppContext (file list, midiFile, practiceSettings,
    │                 resumePoint, per-(song, mode) prefs).
    ├── hooks/        useAudioEngine, useMIDIDevice.
    ├── pages/        HomePage, ModePage, PracticePage.
    └── utils/        midiUtils, musicXmlBuilder (MIDI → MusicXML, with
                      snapDurDown to keep cumulative timing aligned with the
                      MIDI grid), sheetPreload (multi-slot LRU cache of
                      pre-rendered OSMD instances), noteUtils.
```

---

## Architecture notes

- **Sheet preload** — opening the sheet inside the practice page used to block the main thread 1–2 s while OSMD rendered. The pre-loader (`utils/sheetPreload.ts`) renders into a detached `<div>` in `document.body` the moment a file is picked, and an LRU cache (max 10) keeps the rendered SVG around so toggling the sheet, navigating back, or switching files is instant. SheetMusic mounts by appending the cached container into its wrapper and detaches by moving it back to body so React doesn't tear it down on unmount.

- **Cursor performance** — `currentTime` is passed to SheetMusic as a `MutableRefObject<number>`, not a plain number. The cursor-sync runs in an internal RAF loop reading the ref, and the component itself is wrapped in `React.memo`. SheetMusic therefore re-renders only at note rate (~4–8 Hz, when `activeKeys` flips) instead of frame rate, removing the perceived lag when the sheet is open during playback.

- **Highlight matching** — note highlights match by `(time, staff)` rather than MIDI number. OSMD's `Pitch.halfTone` ignores key-signature accidentals so MIDI-number matching breaks after a key change; matching by `currentTimeRef.current` within ±80 ms covers OSMD's quantisation error (~27 ms at 70 BPM) without bleeding into adjacent notes.

- **MusicXML quantisation** — `midiToMusicXml` uses `snapDurDown` (largest valid duration ≤ available space) instead of nearest-snap so a single overshot dotted note doesn't compound into a drift that pushes the rest of the song off-grid.

---

## Licence

For personal / educational use.
