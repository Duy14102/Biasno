# 🎹 Biasno

An interactive piano learning app — falling notes, sheet music, real-time feedback, and a per-song leaderboard. Built with Electron + React.

Open any standard MIDI file, pick a hand and a skill (notes, rhythm, or both), and play along to a Synthesia-style falling-notes view, the original sheet, or both side-by-side. Tiếng Việt / English, dark / light.

---

## Highlights

- 🎼 **Three views** — falling notes, sheet music with live cursor, or both.
- 🖐 **Per-hand practice** — Watch & Listen demo, plus Melody / Rhythm / Melody + Rhythm for the right hand, left hand, or both. Switch modes mid-session.
- 🎹 **Real piano support** — auto-connects USB MIDI keyboards. Computer keyboard fallback covers C3 – A5 when no piano is plugged in.
- 🏆 **Challenge & leaderboard** — opt-in scoring with combos; per-(song, mode) ranking; loop iterations save too.
- 🎙 **Free Mode** — record what you play, trim with a SoundCloud-style waveform editor, export to MIDI / MusicXML / PDF. Every take auto-saves to a local library.
- 🌗 **Polished UI** — dark / light theme, animated mode-switch flash, mid-bar drag-to-set loop region, 3-2-1 countdown, BPM multiplier from 0.25× to 2.0×.
- 🌐 **Bilingual** — strings live in `i18n/locales/<code>.ts`; add a language by dropping in one file.

---

## Quick start

```bash
npm install

npm run dev         # hot-reload dev
npm run build       # bundle main + preload + renderer into ./out
npm run start       # run the built bundle without packaging
npm run lint        # ESLint over src/
npm run test        # Vitest (unit tests for utils + practice/mode)
npm run package     # Windows portable build into ./release/win-unpacked
```

The `package` step kills any running `Biasno.exe` / `app-builder.exe` first and retries on EBUSY — handles the "Access is denied" failure when a previous run left a file locked.

---

## How it plays

### Practice modes

| Mode | What it does |
|------|--------------|
| **Xem & Nghe** | Auto-playback. Watch the notes fall and the sheet cursor move, no input required. |
| **Melody** | Play the correct notes (single hand or both). |
| **Rhythm** | Play any note, but on the correct beat. |
| **Melody + Rhythm** | Both at once. |

Per-hand variants exist for every skill. Mode dropdown supports mid-session switching with an animated label flash. Sheet / falling-notes visibility is remembered per `(song, mode)` so toggling on one song doesn't bleed into another.

### Falling notes
- Hand-coloured note bars; hit-line glow on physical contact, separate confirmation glow on player input.
- Optional vertical lane lines + zoom (0.5×–2×).

### Sheet music
- OpenSheetMusicDisplay (OSMD 1.9.9) with cursor tracking.
- Auto-scroll lock (top-right) keeps the playhead row near the top, or lets you scroll freely.
- Dark mode toggle (sun/moon icon below the lock) — full invert + hue-rotate so notes flip from black to white while highlight colours stay consistent.
- Highlights match by `(time, staff)` rather than MIDI number so key changes don't break colouring.
- Pre-rendered off-screen the moment a file is picked, so opening the sheet inside practice is instant.

### Library
- Drag-drop one or many `.mid` / `.midi` files anywhere over the window — the drop zone lights up on the right panel as soon as the drag starts.
- Or pick a folder; every MIDI inside gets parsed and pre-rendered in the background. Multi-folder support; hover the row icon for the source path.
- Hover any row → trash button → confirm modal. Delete is memory-only; the file on disk stays put.

### Audio / input
- Web Audio engine with sample-based piano via `@tonejs/piano` and `soundfont-player`.
- Animated splash gates the app until the soundfont finishes loading — clicking a song before samples are ready is impossible.
- 300 ms scheduling look-ahead so timing survives normal JS jitter.
- MIDI keyboard input via Web MIDI API with auto-connect to remembered devices.
- Computer-keyboard fallback (Z + S/D row → C3 → E4, Q + 2/3 row → F4 → A5). Locked out automatically when a real piano is connected.

### Transport
- Play / pause / restart / rewind 5 s / fast-forward 5 s.
- BPM multiplier 0.25×–2.0× with live re-scheduling that avoids re-attacking sustained notes.
- Metronome, drag-to-define loop region with seamless wrap.
- Optional 3-2-1 countdown before playback starts.

### Challenge & leaderboard

**Per-song toggle**, defaults off — each MIDI remembers its own state. Off is pure free-play; on tracks every playthrough and every loop iteration.

**Scoring**

| Action | Points |
|--------|--------|
| Correct note hit | +1 |
| 5 consecutive hits, then onward | +2 per hit (combo bonus) |
| Wrong key while a note is active | penalty linearly scaled from −1 (note onset) to 0 (note end). Combo breaks; note flagged missed. |

Score is clamped at 0. The missed counter is de-duped per note, so mashing several wrong keys on the same note still counts as one miss.

**Two surfaces**

- **Mode page → trophy** — full modal with two filter rows: outer tabs (Total / Melody / Rhythm / M+R) and inner pills (All / Right / Left / Both). Clear button is scope-aware — clearing under "Melody · Right" only removes those runs.
- **Practice header → trophy** — compact popover with the challenge toggle on top and a scoreboard for the current (song, mode) below. Scrollable for long histories.

Loop iterations show a `↻ 0:10–0:30` chip in the entry so loop-runs are recognisable.

---

## Free Mode

A freestyle recording surface — same piano keyboard as practice, no song loaded. Reach it from the gradient "Open Free Mode" button on the home page.

### Recording
- **Record** captures every keypress from the connected MIDI device, on-screen keyboard, or computer fallback keys. Live red timer + `● REC` chip + notes counter render while a take is in progress.
- **Continue** appends to the existing take — the next keypress lands right after the current `durationMs`, so longer pieces don't need a single uninterrupted run-through.
- **New** starts fresh, replacing the working draft with a new take. The previous take stays in the Library.
- Every Stop auto-creates a Library entry; subsequent name / author / trim edits live-update that entry.

### Editing
- **Trim range** is a SoundCloud-style waveform with Microsoft-Clipchamp-style window-closing handles. Per-note ADSR envelopes feed a 128-bin amplitude graph; bars inside the trim glow blue → violet → fuchsia, outside dim to grey under a translucent veil. Handle drag commits on mouse-up so the undo stack stays clean.
- **Click the waveform** to drop the white playhead at that position. The same point doubles as the snap target for the trim handles (handles within 120 ms magnetise to it and flash amber) AND the play-from anchor (next Play starts there).
- **Speed control** beside Play — `0.5× / 0.75× / 1× / 1.25× / 1.5× / 2×` presets with `-` / `+` nudges. Double-click the readout to reset to 1×.
- **Undo / Redo** track trim edits only. Returning to the recording's baseline trim wipes the history so the buttons grey out instead of staying lit at no-op states.
- **Clear** is gated behind a confirm modal. Clearing only removes the working draft — the Library entry is preserved.

### Library
- Header button on the right of Free Mode opens a list of every saved take. Each row shows name, author, duration, notes count, and last-edited timestamp.
- Click a row (or its **Open** button) to load it back into the editor; the trash icon prompts a confirm before deleting.

### Export
- A single dropdown button offers **MIDI** (`.mid` for DAWs), **MusicXML** (`.musicxml` for notation editors), and **PDF** (the sheet itself, rendered via OSMD off-screen then converted by Electron's `webContents.printToPDF` in the main process).
- PDF title uses engraving-style typography — EB Garamond via Google Fonts, with a Plantin → Garamond → Times fallback chain. Main process waits for `document.fonts.ready` before rasterising so the title is captured in the loaded font, not the fallback.
- The file-name and author inputs feed all three formats; the author renders as the composer line in the PDF.

---

## Tech stack

- **Electron 32** (`contextIsolation: true`, `sandbox: false`)
- **electron-vite** for dev + production bundling
- **React 18** + **TypeScript** + **TailwindCSS**
- **React Router** for the 4-page flow (home → mode → practice → free)
- **`@tonejs/midi`** for MIDI parsing
- **`@tonejs/piano` + `tone`** for synthesis
- **`opensheetmusicdisplay`** 1.9.9 for sheet rendering

---

## Project structure

```
src/
├── main/             Electron main — IPC for dialogs, folder scan, MIDI buffer reads.
├── preload/          contextBridge — window.electronAPI.
└── renderer/         React app.
    ├── audio/        AudioEngine — sample loading, scheduling, metronome.
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
    │                 useFreePlayback (seek + speed + tail-cut playback),
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
        └── freeMode/ FreeModeHeader, RecorderPanel, TrimRange (waveform +
                      dual-thumb), ExportMenu, SpeedControl, LibraryModal,
                      ClearConfirmModal, icons.
```

**Placement rules of thumb**

- `hooks/` — only hooks used by 2+ unrelated callers.
- `practice/` — anything that exists because PracticePage exists.
- `components/<feature>/` — UI + the feature-specific hook, so the feature is self-contained and easy to grep.
- `types/` split per-domain; `index.ts` re-exports for convenience.

**Import convention**

- Every folder has an `index.ts` barrel. Cross-folder imports go through the barrel, e.g. `import { formatTimeSec } from '@/utils'` — never `'../../utils/format'`.
- The `@/` alias resolves to `src/renderer/` and is configured in `tsconfig.web.json`, `electron.vite.config.ts`, and `vitest.config.ts`.
- Same-folder imports stay relative (`./xxx`) — avoids self-cycles through the barrel.
- Test files (`*.test.ts`) co-located with sources also use `./xxx` for the unit under test.

---

## Architecture notes

**Sheet preload.** Opening the sheet inside the practice page used to block the main thread for 1–2 s while OSMD rendered. The pre-loader (`utils/sheetPreload.ts`) renders into a detached `<div>` in `document.body` the moment a file is picked, and an LRU cache (max 10) keeps the rendered SVG around so toggling the sheet, navigating back, or switching files is instant. `SheetMusic` mounts by appending the cached container into its wrapper and detaches by moving it back to body so React doesn't tear it down on unmount.

**Cursor performance.** `currentTime` is passed to `SheetMusic` as a `MutableRefObject<number>`, not a plain number. The cursor sync runs in an internal RAF loop reading the ref, and the component is wrapped in `React.memo`. `SheetMusic` therefore re-renders only at note rate (~4–8 Hz, when `activeKeys` flips) instead of frame rate.

**Highlight matching.** OSMD's `Pitch.halfTone` ignores key-signature accidentals, so MIDI-number matching breaks after a key change. Highlights match by `(time, staff)` within ±80 ms, which covers OSMD's quantisation error (~27 ms at 70 BPM) without bleeding into adjacent notes.

**MusicXML quantisation.** `midiToMusicXml` uses `snapDurDown` (largest valid duration ≤ available space) instead of nearest-snap so a single overshot dotted note doesn't compound into a drift that pushes the rest of the song off-grid.

**Scoring decoupling.** `useScoring` only knows about hits / misses / wrong-presses. The playback engine raises callbacks (`onHit` / `onMissed` / `onSongEnd` / `onLoopWrap`) and `PracticePage` wires them to scoring. Turning challenge off simply stops passing those callbacks — no special-cased branches in the engine.

**Free Mode note tail.** `AudioEngine.noteAtTime` accepts an optional `tailSec` (default 1.5 s) that lets a piano sample's natural release ring past each note's logical end — practice playback wants this so notes don't snap off. Free Mode passes `tailSec = 0.05` so a sustained note from before a click-to-seek point doesn't bleed into a "silent" gap created by Continue. Playback hard-cuts at the same boundary the waveform draws and the export files spell out.

**Cross-page volume contract.** `AudioEngine.stopAll()` silences the master gain to 0 by design — callers must `restoreVolume()` before the next play. Practice page navigations leave the gain muted; Free Mode restores it both on mount AND at the start of every play, so navigating Practice → Home → Free Mode → Play produces audio on the very first press without needing a pause/play wake-up.

**Free Mode MIDI → sheet pipeline.** Recordings carry note onsets with millisecond accuracy (no quantisation). For MusicXML / PDF export, `freeModeExport` re-uses `sheet/musicXmlBuilder.midiToMusicXml` — the same builder that powers the practice sheet view — so what the user sees on the practice page and what they get in their printed sheet share a single notation engine. PDF rendering reuses the same off-screen OSMD pattern as `sheetPreload`: a hidden `<div>` is mounted at `-99999px`, OSMD renders, the resulting `<svg>` is wrapped in an HTML shell, and Electron's hidden `BrowserWindow` + `webContents.printToPDF` converts it without a print dialog.

---

## Licence

MIT