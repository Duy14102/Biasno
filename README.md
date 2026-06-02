# 🎹 Biasno

> An interactive piano-learning desktop app — Synthesia-style falling notes, live sheet music, real-time feedback, and a per-song leaderboard. Built with Electron + React.

Open any standard MIDI file, pick a hand and a skill, and play along to a falling-notes view, the original sheet, or both side-by-side. Plug in a real MIDI piano (sustain pedal included) or use your computer keyboard. Record your own playing in **Free Mode** and export it to MIDI / MusicXML / PDF. Bilingual (Tiếng Việt / English), dark / light.

---

## Contents

- [Features](#features)
- [Getting started](#getting-started) — **start here if you're a developer**
  - [Prerequisites](#prerequisites) · [Install & run](#install--run) · [Scripts](#scripts) · [Packaging](#packaging)
- [User guide](#user-guide)
  - [Practice modes](#practice-modes) · [Views](#views) · [Library](#library) · [Audio & input](#audio--input) · [Transport](#transport) · [Challenge & leaderboard](#challenge--leaderboard) · [Free Mode](#free-mode)
- [Developer guide](#developer-guide)
  - [Tech stack](#tech-stack) · [Project structure](#project-structure) · [Conventions](#conventions) · [Releases](#releases) · [Architecture notes](#architecture-notes)
- [Licence](#licence)

---

## Features

| | Feature | Summary |
|---|---|---|
| 🎼 | **Three views** | Falling notes, sheet music with a live cursor, or both at once. |
| 🖐 | **Per-hand practice** | Watch & Listen demo + Melody / Rhythm / Melody+Rhythm, for right / left / both hands. Switch mid-session. |
| 🎹 | **Real piano support** | Auto-connects USB MIDI keyboards, **honours the sustain pedal**, and falls back to the computer keyboard (C3–A5). |
| 🏆 | **Challenge & leaderboard** | Opt-in scoring with combos; per-`(song, mode)` ranking; loop iterations count too. |
| 🎙 | **Free Mode** | Record what you play, edit on a piano-roll timeline, export to MIDI / MusicXML / PDF. Auto-saves to a local library. |
| 🌗 | **Polished UI** | Dark / light theme, animated mode-switch flash, drag-to-set loop region, 3-2-1 countdown, 0.25×–2.0× BPM. |
| 🌐 | **Bilingual** | Strings live in `i18n/locales/<code>.ts` — add a language by dropping in one file. |

---

## Getting started

### Prerequisites

- **Node.js 18+** (CI builds on Node 22) and npm.
- **Windows** for packaging a distributable; dev/build run cross-platform.

### Install & run

```bash
npm install
npm run dev      # hot-reload dev build — this is where you start
```

That launches the Electron app with live reload. For day-to-day development you only need `npm run dev`; the other scripts cover building, checking, and packaging.

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Hot-reload dev build. |
| `npm run build` | Bundle main + preload + renderer into `./out`. |
| `npm run start` | Run the built bundle without packaging. |
| `npm run lint` | ESLint over `src/`. |
| `npm run typecheck` | `tsc --noEmit` for both the web and node configs. |
| `npm run test` | Vitest unit tests (utils, practice, free-mode, audio). |
| `npm run check` | typecheck + lint + test + build — fails fast on the first error. |
| `npm run package` | Windows portable build into `./release/win-unpacked`. |

> Run `npm run check` before pushing — it's the same gate CI uses.

### Packaging

<details>
<summary>Windows build details (EBUSY retry, winCodeSign, app icon)</summary>

- The `package` step kills any running `Biasno.exe` / `app-builder.exe` first and retries on `EBUSY` — handling the "Access is denied" failure when a previous run left a file locked.
- It pre-extracts electron-builder's `winCodeSign` cache via `scripts/prepare-wincodesign.cjs`, so the build succeeds on Windows **without admin / Developer Mode** (the bundled `app-builder.exe` would otherwise abort on the macOS `.dylib` symlinks inside the archive).
- The app icon lives at `resources/icon.ico` (Windows) and `resources/icon.png` (Linux + dev BrowserWindow). Regenerate both with `node scripts/generate-icon.cjs` — a small pure-Node PNG/ICO writer, no image dependencies.
- **Lean package.** `node_modules` is excluded from the build (`!**/node_modules/**`) — electron-vite already bundles every runtime lib into the renderer, and main/preload import nothing external — and `scripts/after-pack.cjs` prunes Chromium's locale `.pak` files down to `en-US`. Together that's ~145 MB off the unpacked app (the rest is the fixed Electron/Chromium runtime).

</details>

---

## User guide

### Practice modes

| Mode | What it does |
|------|--------------|
| **Xem & Nghe** (Watch & Listen) | Auto-playback. Watch the notes fall and the sheet cursor move — no input required. |
| **Melody** | Play the correct notes (single hand or both). |
| **Rhythm** | Play any note, but on the correct beat. |
| **Melody + Rhythm** | Both at once. |

Every skill has per-hand variants. The mode dropdown switches mid-session with an animated label flash, and sheet / falling-notes visibility is remembered per `(song, mode)` so toggling one song doesn't bleed into another.

### Views

**Falling notes**
- Hand-coloured note bars; a hit-line glow on physical contact and a separate confirmation glow on player input.
- Optional vertical lane lines, plus zoom from 0.5× to 2×.

**Sheet music**
- OpenSheetMusicDisplay (OSMD 1.9.9) with cursor tracking.
- Auto-scroll lock (top-right) keeps the playhead row near the top, or lets you scroll freely.
- Dark-mode toggle (sun/moon below the lock) — full invert + hue-rotate so notes flip black↔white while highlight colours stay consistent.
- Highlights match by `(time, staff)` rather than MIDI number, so key changes don't break colouring.
- Pre-rendered off-screen the moment a file is picked, so opening the sheet inside practice is instant.

### Library

- Drag-drop one or many `.mid` / `.midi` files anywhere over the window — the drop zone lights up on the right panel as soon as the drag starts.
- Or pick a folder; every MIDI inside is parsed and pre-rendered in the background. Multi-folder support; hover the row icon for the source path.
- Hover any row → trash button → confirm modal. Delete is memory-only; the file on disk stays put.

### Audio & input

- Web Audio engine with a sample-based piano via `@tonejs/piano` and `soundfont-player`. The MusyngKite acoustic-grand soundfont ships **bundled in the app**, so first launch doesn't wait on a CDN download (CDN MusyngKite → FluidR3 → a synth stay as fallbacks).
- The home page is interactive immediately while samples load in the background; only the playback pages (Practice / Free Mode) wait — behind a lightweight loading gate — so you still can't start a song before samples are ready.
- 300 ms scheduling look-ahead so timing survives normal JS jitter.
- MIDI keyboard input via the Web MIDI API, with auto-connect to remembered devices.
- **Sustain pedal (CC64)** — a real piano's damper pedal is honoured everywhere: held notes keep ringing while the pedal is down and damp on release, in Practice play-along and Free-Mode recording alike. MIDI files that carry pedal play back with their real sustain. (See the [architecture note](#architecture-notes) for the model.)
- **My piano makes its own sound** — a toggle in the Practice / Free-Mode settings (shown only while a MIDI device is connected). On a piano with its own speakers (e.g. Yamaha P45), turn it on so the app stops re-synthesising the keys you play and you don't hear a doubled note. It only mutes notes coming **from the device** — the on-screen keyboard and PC keyboard keep their app sound. Off by default (a controller with no speakers needs the app's sound); persisted across pages.
- Computer-keyboard input (`Z` + `S`/`D` row → C3–E4, `Q` + `2`/`3` row → F4–A5), the on-screen keyboard, and a connected MIDI piano all stay live at once — play any combination together.

### Transport

- Play / pause / restart / rewind 5 s / fast-forward 5 s.
- BPM multiplier 0.25×–2.0× with live re-scheduling that avoids re-attacking sustained notes.
- Metronome, drag-to-define loop region with seamless wrap, and an optional 3-2-1 countdown before playback.

### Challenge & leaderboard

A **per-song toggle**, defaulting off — each MIDI remembers its own state. Off is pure free-play; on tracks every playthrough and every loop iteration.

**Scoring**

| Action | Points |
|--------|--------|
| Correct note hit | +1 |
| 5 consecutive hits, then onward | +2 per hit (combo bonus) |
| Wrong key while a note is active | penalty scaled −1 (note onset) → 0 (note end); combo breaks; note flagged missed |

Score is clamped at 0. The missed counter is de-duped per note, so mashing several wrong keys on one note still counts as a single miss.

**Two surfaces**
- **Mode page → trophy** — a full modal with two filter rows: outer tabs (Total / Melody / Rhythm / M+R) and inner pills (All / Right / Left / Both). The Clear button is scope-aware — clearing under "Melody · Right" removes only those runs.
- **Practice header → trophy** — a compact popover with the challenge toggle on top and a scoreboard for the current `(song, mode)` below; scrollable for long histories.

Loop iterations show a `↻ 0:10–0:30` chip in the entry so loop-runs are recognisable.

### Free Mode

A freestyle recording surface — the same piano keyboard as practice, with no song loaded. Reach it from the gradient **"Open Free Mode"** button on the home page.

**Recording**
- **Record** captures every keypress (MIDI device, on-screen keyboard, or computer fallback) **plus sustain-pedal edges** from a real piano, so a pedalled take plays back and exports with its real sustain. A live red timer, `● REC` chip, and notes counter render while recording.
- **Continue** appends to the existing take — the next keypress lands right after the current `durationMs`, so long pieces don't need one uninterrupted run.
- **New** starts fresh, replacing the working draft; the previous take stays in the Library.
- Every Stop auto-creates a Library entry; later name / author / trim edits live-update it.

**Editing**
- **Trim range** is a piano-roll preview with Microsoft-Clipchamp-style window-closing handles. Each note is a rounded rectangle (X = time, Y = MIDI pitch auto-fit to the recording's range, width = duration, hue = velocity on a violet→fuchsia gradient); outside-trim regions dim under a translucent veil. It renders straight from the note array — no audio buffer, no peaks pipeline — so every clip op stays in sync with the data. Handle drag commits on mouse-up to keep the undo stack clean.
- **Playhead** — click the timeline to seek; grab the playhead (12 px hit zone) and drag to scrub. The knob scales up with a blue glow while held and stays visible past the trim window. Its resting point doubles as the trim-handle snap target (handles within 120 ms magnetise and flash amber) and the play-from anchor.
- **Right-click clip menu** — a video-editor-style menu. Every action is undo/redo tracked, persists with the library entry, and exports honour the splits, per-clip volume, and silent gaps:

  | Action | What it does |
  |---|---|
  | **Split** | Cuts the clip at the playhead. Halves touch in ms-space; the seam is a 1 px CSS inset, so boundary notes stay covered. |
  | **Copy / Paste** | Duplicate a clip elsewhere on the timeline. |
  | **Delete** | Removes a clip; the gap stays (neighbours don't shift). |
  | **Comment** | Emerald chat-bubble badge that expands on hover; long text scrolls in an infinite marquee. |
  | **Volume** | Per-clip gain slider; a badge shows when ≠ 100%. |
  | **Lock** | Marks a clip read-only (amber outline + LOCK badge); split / delete / volume / comment / paste-over all refuse. |

- **Speed control** beside Play — `0.5× / 0.75× / 1× / 1.25× / 1.5× / 2×` presets with `-` / `+` nudges; double-click the readout to reset to 1×.
- **Undo / Redo** track trim edits only. Returning to the recording's baseline trim wipes the history, so the buttons grey out instead of sitting at no-op states.
- **Clear** is gated behind a confirm modal and removes only the working draft — the Library entry is preserved.

**Library**
- A header button on the right opens a list of every saved take, each row showing name, author, duration, notes count, and last-edited timestamp.
- Click a row (or **Open**) to load it back into the editor; the trash icon prompts a confirm before deleting.

**Export**
- One dropdown offers **MIDI** (`.mid`, for DAWs), **MusicXML** (`.musicxml`, for notation editors), and **PDF** (the sheet, rendered via OSMD off-screen then converted by Electron's `webContents.printToPDF`).
- Captured **sustain pedal** is carried into all three: CC64 events in the MIDI, and `<pedal>` start/stop marks in the MusicXML / PDF sheet.
- The PDF title uses engraving-style typography — EB Garamond via Google Fonts with a Plantin → Garamond → Times fallback; the main process waits for `document.fonts.ready` before rasterising so the title is captured in the loaded font.
- The file-name and author inputs feed all three formats; the author renders as the composer line in the PDF.

---

## Developer guide

### Tech stack

- **Electron 32** (`contextIsolation: true`, `sandbox: false`) bundled with **electron-vite**.
- **React 18** + **TypeScript** + **TailwindCSS**, routed with **React Router** (home → mode → practice → free).
- **`@tonejs/midi`** (parsing), **`@tonejs/piano` + `tone`** (synthesis), **`opensheetmusicdisplay` 1.9.9** (sheet rendering).

### Project structure

```
src/
├── main/             Electron main — IPC for dialogs, folder scan, MIDI buffer reads.
├── preload/          contextBridge — window.electronAPI.
└── renderer/         React app.
    ├── audio/        AudioEngine — sample loading, scheduling, metronome,
    │                 live sustain-pedal; pedal (sustainedEnd timeline helper).
    ├── constants/    storageKeys — single source of truth for all biasno.* LS keys.
    ├── context/      AppContext (files, settings, prefs), MidiContext (Web MIDI),
    │                 ThemeContext (dark / light).
    ├── hooks/        Cross-feature hooks (useAudioEngine, useEscape).
    ├── i18n/         LanguageContext + per-language dictionaries in locales/.
    ├── types/        Shared types split per domain (midi, practice, visual, device).
    ├── utils/        midiUtils (parse), noteUtils (key geometry),
    │                 format (m:ss / dates), storage (loadJSON / saveJSON).
    ├── pages/        HomePage · ModePage · PracticePage · FreeModePage.
    ├── practice/     PracticePage's engine + scoring.
    │                 ├ Playback: usePlayhead, useTransport, useModeChange,
    │                 │           useAudioScheduler, usePracticeInput,
    │                 │           useFlashTimer, useViewSwap.
    │                 ├ Scoring:  useScoring, useChallengeEnabled, leaderboard.
    │                 └ Mode:     mode (parseMode, modeLabel, hand/skill helpers).
    ├── freeMode/     FreeModePage's hooks + helpers:
    │                 useRecorder (capture + trim undo/redo),
    │                 useFreePlayback (seek + speed + pedal-aware playback),
    │                 freeModeExport (MIDI / MusicXML / PDF builders),
    │                 library (localStorage CRUD), types.
    └── components/
        ├── common/   ConfirmModal scaffold + shared icons used across folders.
        ├── sheet/    SheetMusic + helpers (highlighting, refs, scroll, preload).
        ├── falling/  FallingNotes canvas.
        ├── keyboard/ PianoKeyboard.
        ├── header/   PracticeHeader split: ModeDropdown, SettingsPanel,
        │             KeyboardHelpPopover, LeaderboardPopover, IconBtn,
        │             ToggleSwitch + shared dropdown CSS.
        ├── library/  HomePage sub-components + useFileLibrary hook:
        │             FileRow, DevicePanel, MidiDevicePicker,
        │             DeleteConfirmModal, FolderConflictModal, LeaderboardModal.
        └── freeMode/ FreeModeHeader, RecorderPanel, TrimRange (piano-roll +
                      dual-thumb), ClipNotesPreview, ExportMenu, SpeedControl,
                      LibraryModal, ClearConfirmModal, icons.
```

### Conventions

**Placement**
- `hooks/` — only hooks used by 2+ unrelated callers.
- `practice/` — anything that exists because PracticePage exists.
- `components/<feature>/` — UI + the feature-specific hook, so the feature is self-contained and easy to grep.
- `types/` split per-domain; `index.ts` re-exports for convenience.

**Imports**
- Every folder has an `index.ts` barrel. Cross-folder imports go through the barrel — `import { formatTimeSec } from '@/utils'`, never `'../../utils/format'`.
- The `@/` alias resolves to `src/renderer/` and is configured in `tsconfig.web.json`, `electron.vite.config.ts`, and `vitest.config.ts`.
- Same-folder imports stay relative (`./xxx`) to avoid self-cycles through the barrel.
- Co-located test files (`*.test.ts`) also use `./xxx` for the unit under test.

### Releases

CI cuts a release automatically when a PR is merged into `main`, with a **label-driven** version bump:

| PR label | Bump | Example |
|---|---|---|
| `bug` | patch | `v0.1.0` → `v0.1.1` |
| `feature` / `enhancement` | minor | `v0.1.0` → `v0.2.0` |
| `release` | major | `v0.1.0` → `v1.0.0` |
| `beta` (+ a bump label) | adds a `-beta.N` pre-release | `v0.2.0-beta.1` |
| _(no bump label)_ | none — release skipped | — |

The workflow builds the Windows portable, zips it as `Biasno-<tag>.zip` (which extracts to a versioned `Biasno-<tag>/` folder), and generates grouped release notes from the merged PRs' titles + labels — falling back to the raw commit subjects so the body is never blank, whatever the merge method (squash / merge / rebase). The released version is also committed back to `package.json` on `main`, so the repo never drifts from the latest tag. A **`beta`** label produces a `-beta.N` **pre-release** (orange tag, auto-incrementing per base version); a plain `vX.Y.Z` is a normal release, so the newest one always carries GitHub's green **Latest** badge.

### Architecture notes

<details>
<summary><strong>Sheet preload</strong> — instant sheet open via off-screen render + LRU cache</summary>

Opening the sheet inside practice used to block the main thread for 1–2 s while OSMD rendered. The pre-loader (`utils/sheetPreload.ts`) renders into a detached `<div>` in `document.body` the moment a file is picked, and an LRU cache (max 10) keeps the rendered SVG so toggling the sheet, navigating back, or switching files is instant. `SheetMusic` mounts by appending the cached container into its wrapper and detaches by moving it back to body, so React doesn't tear it down on unmount. The render is scheduled **off** the import / drop / folder-scan path (during idle), so adding files never freezes the UI — a freshly added row is selectable immediately while its sheet warms up behind it.
</details>

<details>
<summary><strong>Cursor performance</strong> — ref-driven RAF instead of frame-rate re-renders</summary>

`currentTime` is passed to `SheetMusic` as a `MutableRefObject<number>`, not a plain number. The cursor sync runs in an internal RAF loop reading the ref, and the component is wrapped in `React.memo`. `SheetMusic` therefore re-renders only at note rate (~4–8 Hz, when `activeKeys` flips) instead of every frame.
</details>

<details>
<summary><strong>Highlight matching</strong> — match by (time, staff), not MIDI number</summary>

OSMD's `Pitch.halfTone` ignores key-signature accidentals, so MIDI-number matching breaks after a key change. Highlights match by `(time, staff)` within ±80 ms, which covers OSMD's quantisation error (~27 ms at 70 BPM) without bleeding into adjacent notes.
</details>

<details>
<summary><strong>MusicXML quantisation</strong> — snap-down to avoid drift</summary>

`midiToMusicXml` uses `snapDurDown` (largest valid duration ≤ available space) instead of nearest-snap, so a single overshot dotted note doesn't compound into drift that pushes the rest of the song off-grid.
</details>

<details>
<summary><strong>Scoring decoupling</strong> — engine raises callbacks, page wires scoring</summary>

`useScoring` only knows about hits / misses / wrong-presses. The playback engine raises callbacks (`onHit` / `onMissed` / `onSongEnd` / `onLoopWrap`) and `PracticePage` wires them to scoring. Turning challenge off simply stops passing those callbacks — no special-cased branches in the engine.
</details>

<details>
<summary><strong>Sustain pedal (CC64)</strong> — real damper model, no blanket tail</summary>

Sustain is modelled on the *real* damper pedal, not a blanket tail. Two paths share one pure helper (`audio/pedal.ts` → `sustainedEnd`):
1. **Offline** — MIDI files and Free-Mode playback/export precompute each note's audible end from a pedal timeline, so a note rings through any pedal-down span.
2. **Live** — `AudioEngine.setSustainPedal()` holds released keys while the pedal is down and damps them on release, driven by CC64 decoded in `MidiContext` (channel-masked, so any MIDI channel works) and forwarded by Practice + Free Mode.

`noteAtTime`'s tail is now just a 0.05 s anti-click release — there is no 1.5 s artificial sustain anywhere. Pedal uses the standard binary threshold (value ≥ 64 = down; no continuous half-pedal). Falling-note bars stay = key-press duration (Synthesia "key-press" style) — the pedal extends the audio, never the visual.
</details>

<details>
<summary><strong>Free Mode piano-roll preview</strong> — render the data, not a waveform</summary>

The clip editor used to render a synthesised waveform (OfflineAudioContext → peaks → bars), which forced an audio-buffer-shaped visual to stay coherent through purely data-shaped operations (split / delete / paste / ripple) — a whole class of bugs (envelope phase at the cut, peak normalisation across clip ids, async render races). The current `ClipNotesPreview` renders straight from `RecordedNote[]` to a Canvas2D piano roll (X = time, Y = MIDI pitch auto-fit, hue = velocity), so the visual *is* the data and clip operations are pure array transforms. Right-exclusive ownership at the cut (`n.startMs < c.startMs || n.startMs >= c.endMs` to skip) mirrors `clipAt` / `chunkEndAt`, so split-touching boundaries assign onsets to the RIGHT clip — the same convention everywhere.
</details>

<details>
<summary><strong>Cross-page volume contract</strong> — stopAll mutes, callers restoreVolume</summary>

`AudioEngine.stopAll()` silences the master gain to 0 by design — callers must `restoreVolume()` before the next play. Practice-page navigations leave the gain muted; Free Mode restores it both on mount and at the start of every play, so navigating Practice → Home → Free Mode → Play produces audio on the very first press without a pause/play wake-up.
</details>

<details>
<summary><strong>Free Mode MIDI → sheet pipeline</strong> — one notation engine, off-screen PDF</summary>

Recordings carry note onsets with millisecond accuracy (no quantisation). For MusicXML / PDF export, `freeModeExport` reuses `sheet/musicXmlBuilder.midiToMusicXml` — the same builder that powers the practice sheet view — so what you see in practice and what you get in the printed sheet share one notation engine. PDF rendering reuses the `sheetPreload` pattern: a hidden `<div>` is mounted at `-99999px`, OSMD renders, the resulting `<svg>` is wrapped in an HTML shell, and Electron's hidden `BrowserWindow` + `webContents.printToPDF` converts it without a print dialog.
</details>

---

## Licence

MIT
