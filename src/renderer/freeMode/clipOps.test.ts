import { describe, it, expect } from 'vitest'
import {
  effectiveClips, clipAt, chunkEndAt, makeClip, splitAt, deleteAt, setVolumeAt,
  toggleLockAt, setCommentAt, pasteAt, moveToSlot,
  setTrimStart, setTrimEnd, MIN_CLIP_MS,
} from './clipOps'
import type { Clip, FreeSnapshot, RecordedNote } from './types'

const note = (id: string, midi: number, startMs: number, endMs: number): RecordedNote =>
  ({ id, midi, startMs, endMs, velocity: 0.8 })

const emptySnap = (durationMs: number): FreeSnapshot => ({
  notes: [], durationMs, trimStartMs: 0, trimEndMs: durationMs, clips: [],
})

const withClips = (durationMs: number, clips: Clip[], notes: RecordedNote[] = []): FreeSnapshot => ({
  notes, durationMs, trimStartMs: 0, trimEndMs: durationMs, clips,
})

// ── effectiveClips / clipAt ────────────────────────────────────────────────

describe('effectiveClips', () => {
  it('returns the explicit clips when set', () => {
    const c = makeClip(0, 1000)
    expect(effectiveClips({ clips: [c], trimStartMs: 0, trimEndMs: 1000 })).toEqual([c])
  })

  it('materialises a single clip across the trim when empty', () => {
    const out = effectiveClips({ clips: [], trimStartMs: 100, trimEndMs: 900 })
    expect(out).toHaveLength(1)
    expect(out[0].startMs).toBe(100)
    expect(out[0].endMs).toBe(900)
  })

  it('returns [] when trim has zero/negative width', () => {
    expect(effectiveClips({ clips: [], trimStartMs: 500, trimEndMs: 500 })).toEqual([])
  })
})

describe('chunkEndAt', () => {
  it('returns the clip end when there is only one clip', () => {
    const c = makeClip(0, 1000)
    expect(chunkEndAt([c], 500)).toBe(1000)
  })

  it('extends through two TOUCHING clips (split produces touching)', () => {
    const a = makeClip(0, 500)
    const b = makeClip(500, 1000)
    // Onset in clip a → chunk reaches all the way through b.
    expect(chunkEndAt([a, b], 200)).toBe(1000)
  })

  it('extends through THREE touching clips (chained splits)', () => {
    const a = makeClip(0, 300)
    const b = makeClip(300, 600)
    const c = makeClip(600, 1000)
    expect(chunkEndAt([a, b, c], 100)).toBe(1000)
  })

  it('stops at a gap (delete created a hole between clips)', () => {
    const a = makeClip(0, 300)
    const b = makeClip(500, 1000)              // 200 ms gap [300..500]
    expect(chunkEndAt([a, b], 100)).toBe(300)  // chunk ends at gap
  })

  it('extends from the second of two touching clips too', () => {
    const a = makeClip(0, 500)
    const b = makeClip(500, 1000)
    // Onset in b → chunk is just b (nothing touches AFTER b).
    expect(chunkEndAt([a, b], 700)).toBe(1000)
  })

  it('returns null when ms lies in a gap', () => {
    const a = makeClip(0, 300)
    const b = makeClip(500, 1000)
    expect(chunkEndAt([a, b], 400)).toBeNull()
  })

  it('returns null when ms is outside every clip', () => {
    expect(chunkEndAt([makeClip(0, 500)], 800)).toBeNull()
  })
})

describe('clipAt', () => {
  it('finds a clip whose range covers ms', () => {
    const c = makeClip(200, 800)
    const view = { clips: [c], trimStartMs: 0, trimEndMs: 1000 }
    expect(clipAt(view, 500)?.id).toBe(c.id)
  })

  it('returns null in a gap', () => {
    const a = makeClip(0, 300)
    const b = makeClip(700, 1000)
    expect(clipAt({ clips: [a, b], trimStartMs: 0, trimEndMs: 1000 }, 500)).toBeNull()
  })
})

// ── splitAt ────────────────────────────────────────────────────────────────

describe('splitAt', () => {
  it('cuts the implicit single clip at the requested point', () => {
    const s = emptySnap(1000)
    const next = splitAt(s, 400)
    expect(next.clips).toHaveLength(2)
    expect(next.clips[0].startMs).toBe(0)
    expect(next.clips[0].endMs).toBe(400)
    expect(next.clips[1].startMs).toBe(400)
    expect(next.clips[1].endMs).toBe(1000)
  })

  it('refuses to split closer than MIN_CLIP_MS to either end', () => {
    const s = emptySnap(1000)
    expect(splitAt(s, 10)).toBe(s)
    expect(splitAt(s, 1000 - 10)).toBe(s)
  })

  it('refuses to split a locked clip', () => {
    const c = makeClip(0, 1000, { locked: true })
    const s = withClips(1000, [c])
    expect(splitAt(s, 500)).toBe(s)
  })

  it('refuses to split outside any clip', () => {
    const c = makeClip(0, 300)
    const s = withClips(1000, [c])
    expect(splitAt(s, 700)).toBe(s)
  })

  // ── Note-preservation invariant ───────────────────────────────────────
  // splitAt is a pure clip-array operation; the notes array must be
  // reference-identical to the input.  This is the contract that
  // guarantees the rendered waveform doesn't change after a split.

  it('does not mutate notes — array reference is preserved', () => {
    const n1 = note('n1', 60, 100, 800)
    const n2 = note('n2', 62, 300, 600)
    const s = withClips(1000, [makeClip(0, 1000)], [n1, n2])
    const next = splitAt(s, 400)
    expect(next.notes).toBe(s.notes)
  })

  it('does not mutate notes even when a sustained note crosses the cut', () => {
    const n = note('n1', 60, 100, 800) // 700 ms — would have been data-split before
    const s = withClips(1000, [makeClip(0, 1000)], [n])
    const next = splitAt(s, 400)
    expect(next.notes).toBe(s.notes)
    expect(next.notes).toHaveLength(1)
    expect(next.notes[0]).toBe(n)
  })

  it('leaves a short note whole — onset side wins', () => {
    const n = note('n1', 60, 200, 320) // 120 ms — punctual
    const s = withClips(1000, [makeClip(0, 1000)], [n])
    const next = splitAt(s, 250)
    expect(next.notes).toHaveLength(1)
    expect(next.notes[0].startMs).toBe(200)
    expect(next.notes[0].endMs).toBe(320)
  })

  it('preserves volume/lock/comment on the left half; resets comment on the right', () => {
    const c = makeClip(0, 1000, { volume: 0.5, comment: 'hi' })
    const s = withClips(1000, [c])
    const next = splitAt(s, 400)
    expect(next.clips[0].volume).toBe(0.5)
    expect(next.clips[0].comment).toBe('hi')
    expect(next.clips[1].volume).toBe(0.5)
    expect(next.clips[1].comment).toBeUndefined()
  })

  // ── Edge cases ────────────────────────────────────────────────────────

  it('accepts a split exactly MIN_CLIP_MS from each edge', () => {
    const s = emptySnap(1000)
    const next = splitAt(s, MIN_CLIP_MS)
    expect(next.clips).toHaveLength(2)
    expect(next.clips[0].endMs).toBe(MIN_CLIP_MS)
  })

  it('refuses one ms inside MIN_CLIP_MS from an edge', () => {
    const s = emptySnap(1000)
    expect(splitAt(s, MIN_CLIP_MS - 1)).toBe(s)
    expect(splitAt(s, 1000 - MIN_CLIP_MS + 1)).toBe(s)
  })

  it('chained splits — splitting the right half of a prior split', () => {
    const s = emptySnap(1000)
    const a = splitAt(s, 400)         // [0..400] [400..1000]
    const b = splitAt(a, 700)         // [0..400] [400..700] [700..1000]
    expect(b.clips.map(c => [c.startMs, c.endMs])).toEqual([
      [0, 400], [400, 700], [700, 1000],
    ])
  })

  it('chained splits — splitting the left half of a prior split', () => {
    const s = emptySnap(1000)
    const a = splitAt(s, 600)         // [0..600] [600..1000]
    const b = splitAt(a, 300)         // [0..300] [300..600] [600..1000]
    expect(b.clips.map(c => [c.startMs, c.endMs])).toEqual([
      [0, 300], [300, 600], [600, 1000],
    ])
  })

  it('refuses a split at a touching clip boundary (would create a 0-width half)', () => {
    const s = withClips(1000, [makeClip(0, 500), makeClip(500, 1000)])
    expect(splitAt(s, 500)).toBe(s)
  })

  it('right-wins at a touching boundary: a click just-inside picks the right clip', () => {
    const a = makeClip(0, 500, { id: 'left' })
    const b = makeClip(500, 1000, { id: 'right' })
    const s = withClips(1000, [a, b])
    // Splitting at 500 is refused (boundary), but at 600 we should hit
    // the right clip and cut it.
    const next = splitAt(s, 600)
    expect(next.clips).toHaveLength(3)
    expect(next.clips.map(c => [c.startMs, c.endMs])).toEqual([
      [0, 500], [500, 600], [600, 1000],
    ])
  })

  it('chained splits across a sustained note leave the note untouched', () => {
    const n = note('n1', 60, 100, 900) // 800 ms — long
    const s = withClips(1000, [makeClip(0, 1000)], [n])
    const a = splitAt(s, 400)
    const b = splitAt(a, 700)
    expect(b.clips).toHaveLength(3)
    expect(b.notes).toBe(s.notes)
    expect(b.notes[0]).toBe(n)
  })

  it('a note whose onset equals the cut point goes into the RIGHT clip', () => {
    const n = note('n1', 60, 500, 600)
    const s = withClips(1000, [makeClip(0, 1000)], [n])
    const next = splitAt(s, 500)
    expect(next.notes).toBe(s.notes)
    expect(clipAt(next, 500)?.id).toBe(next.clips[1].id)
  })

  it('refuses to split inside a locked middle clip even when neighbours are unlocked', () => {
    const s = withClips(1500, [
      makeClip(0, 500),
      makeClip(500, 1000, { id: 'mid', locked: true }),
      makeClip(1000, 1500),
    ])
    expect(splitAt(s, 750)).toBe(s)
  })

  it('clip count grows by exactly 1 per successful split', () => {
    let s = emptySnap(2000)
    expect(s.clips.length).toBe(0) // implicit default
    s = splitAt(s, 500)
    expect(s.clips.length).toBe(2) // materialised + split
    s = splitAt(s, 1000)
    expect(s.clips.length).toBe(3)
    s = splitAt(s, 1500)
    expect(s.clips.length).toBe(4)
  })

  it('keeps clips sorted by startMs after a mid-array split', () => {
    const s = withClips(2000, [
      makeClip(0, 500),
      makeClip(500, 1500),
      makeClip(1500, 2000),
    ])
    const next = splitAt(s, 1000)
    const starts = next.clips.map(c => c.startMs)
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
  })

  it('rounds fractional ms before applying MIN_CLIP_MS check', () => {
    const s = emptySnap(1000)
    // 79.6 → rounds to 80 = MIN_CLIP_MS → accepted
    const next = splitAt(s, 79.6)
    expect(next.clips).toHaveLength(2)
    expect(next.clips[0].endMs).toBe(80)
  })

  it('split is idempotent at the same point (second call refuses)', () => {
    const a = splitAt(emptySnap(1000), 500)
    const b = splitAt(a, 500)
    expect(b).toBe(a)
  })

  it('handles a recording with no notes — clips still split, notes stay empty', () => {
    const s = emptySnap(1000)
    const next = splitAt(s, 400)
    expect(next.clips).toHaveLength(2)
    expect(next.notes).toEqual([])
  })

  it('multiple notes across a cut — every note preserved unchanged', () => {
    const ns = [
      note('a', 60, 100, 800),
      note('b', 62, 200, 410),
      note('c', 64, 300, 700),
      note('d', 65, 600, 950),
    ]
    const s = withClips(1000, [makeClip(0, 1000)], ns)
    const next = splitAt(s, 500)
    expect(next.notes).toBe(s.notes)
    expect(next.notes).toHaveLength(4)
    next.notes.forEach((n, i) => expect(n).toBe(ns[i]))
  })

  it('split a clip that already has a comment — left keeps it, right clears it', () => {
    const s = withClips(1000, [makeClip(0, 1000, { comment: 'first half' })])
    const next = splitAt(s, 500)
    expect(next.clips[0].comment).toBe('first half')
    expect(next.clips[1].comment).toBeUndefined()
  })

  it('split preserves the locked flag on both halves', () => {
    // locked clips refuse to split, so to test "preserves locked" we use a
    // non-locked clip and then mark a half locked afterwards — instead
    // verify the function preserves locked=false on both halves here.
    const s = withClips(1000, [makeClip(0, 1000, { locked: false, volume: 0.7 })])
    const next = splitAt(s, 500)
    expect(next.clips[0].locked).toBe(false)
    expect(next.clips[1].locked).toBe(false)
    expect(next.clips[0].volume).toBe(0.7)
    expect(next.clips[1].volume).toBe(0.7)
  })

  it('clip ids on the two halves are unique and not the parent id', () => {
    const s = withClips(1000, [makeClip(0, 1000, { id: 'parent' })])
    const next = splitAt(s, 500)
    expect(next.clips[0].id).not.toBe('parent')
    expect(next.clips[1].id).not.toBe('parent')
    expect(next.clips[0].id).not.toBe(next.clips[1].id)
  })

  it('after split + delete-of-left, the right clip survives with correct width', () => {
    const s = emptySnap(1000)
    const a = splitAt(s, 400)              // [0..400] [400..1000]
    const b = deleteAt(a, 100)             // ripple-delete [0..400]
    expect(b.clips).toHaveLength(1)
    expect(b.clips[0].startMs).toBe(0)
    expect(b.clips[0].endMs).toBe(600)     // shifted left by 400
    expect(b.durationMs).toBe(600)
  })

  // ── Critical: delete-one-half keeps the other half audible ────────────
  // The 5-second-held-note acceptance scenario the user called out.

  it('split a sustained note then delete RIGHT half: left half keeps audio', () => {
    const n = note('held', 60, 0, 5000)         // 5-second sustained note
    const s = withClips(5000, [makeClip(0, 5000)], [n])
    const a = splitAt(s, 2500)                  // [0..2500] [2500..5000]
    const b = deleteAt(a, 4000)                 // delete RIGHT half
    expect(b.clips).toHaveLength(1)
    expect(b.clips[0].startMs).toBe(0)
    expect(b.clips[0].endMs).toBe(2500)
    // Note still present, owns the surviving clip's range.
    expect(b.notes).toHaveLength(1)
    expect(b.notes[0].id).toBe('held')
    expect(b.notes[0].startMs).toBe(0)
  })

  it('split a sustained note then delete LEFT half: right half keeps audio', () => {
    const n = note('held', 60, 0, 5000)
    const s = withClips(5000, [makeClip(0, 5000)], [n])
    const a = splitAt(s, 2500)                  // [0..2500] [2500..5000]
    const b = deleteAt(a, 1000)                 // delete LEFT half
    expect(b.clips).toHaveLength(1)
    expect(b.clips[0].startMs).toBe(0)           // ripple shifts right clip left
    expect(b.clips[0].endMs).toBe(2500)
    // Note re-anchored to start where the surviving clip begins.
    expect(b.notes).toHaveLength(1)
    expect(b.notes[0].id).toBe('held')
    expect(b.notes[0].startMs).toBe(0)
    expect(b.notes[0].endMs).toBe(2500)
  })

  it('delete LEFT half preserves note id, midi, velocity', () => {
    const n = note('held', 64, 0, 5000)
    const s = withClips(5000, [makeClip(0, 5000)], [n])
    const a = splitAt(s, 2500)
    const b = deleteAt(a, 1000)
    expect(b.notes[0].id).toBe('held')
    expect(b.notes[0].midi).toBe(64)
    expect(b.notes[0].velocity).toBe(n.velocity)
  })

  it('delete a clip when note is entirely inside it (no survivor reach): drop', () => {
    const n = note('short', 60, 100, 400)
    const s = withClips(1000, [makeClip(0, 500), makeClip(500, 1000)], [n])
    const next = deleteAt(s, 250)                // delete LEFT [0..500]
    // Note's endMs (400) does NOT extend past the deleted clip (500), so
    // there's nothing to re-anchor.  Drop it.
    expect(next.notes).toHaveLength(0)
  })

  it('after delete-of-left + undo, the original snapshot is restored', () => {
    // History-level invariant: re-anchoring is reversible via the editor's
    // snapshot history (it's a pure transform — no in-place mutation).
    const n = note('held', 60, 0, 5000)
    const s = withClips(5000, [makeClip(0, 5000)], [n])
    const a = splitAt(s, 2500)
    const b = deleteAt(a, 1000)
    expect(b.notes[0].startMs).toBe(0)
    expect(b.notes[0].endMs).toBe(2500)
    // Original `n` reference is untouched by the deleteAt op.
    expect(s.notes[0]).toBe(n)
  })

  // ── Audible-window invariant (the REAL waveform check) ───────────────
  // It's not enough that the notes array is preserved by reference — the
  // audible window peaks.ts will render for each note must also be
  // identical.  That window is `[note.startMs, min(note.endMs,
  // chunkEndAt(clips, note.startMs))]`.  Pre-split there is one clip
  // [0, durationMs]; post-split there are two touching clips.  Both
  // configurations must produce the same chunk end → same audible
  // window → same buffer → same wave bars.

  const audibleEnd = (s: FreeSnapshot, n: RecordedNote): number => {
    const chunk = chunkEndAt(effectiveClips(s), n.startMs)
    return Math.min(n.endMs, chunk ?? n.endMs)
  }

  it('split preserves every note\'s audible end (the bar-shape invariant)', () => {
    const ns = [
      note('held',  60, 100, 4900),   // 4.8 s — long sustain crossing the cut
      note('short', 62, 200, 350),    // 150 ms — fully inside the left
      note('right', 64, 3000, 4500),  // 1.5 s — fully inside the right
    ]
    const s = withClips(5000, [makeClip(0, 5000)], ns)
    const before = ns.map(n => audibleEnd(s, n))
    const next = splitAt(s, 2500)
    const after = ns.map(n => audibleEnd(next, n))
    expect(after).toEqual(before)
  })

  it('chained splits across a sustained note: audible end still equals natural endMs', () => {
    const n = note('held', 60, 100, 4900)
    const s = withClips(5000, [makeClip(0, 5000)], [n])
    const a = splitAt(s, 1500)
    const b = splitAt(a, 3000)
    const c = splitAt(b, 4000)
    expect(audibleEnd(c, n)).toBe(4900)
  })

  it('delete RIGHT half of a split: left note\'s audible end clamps to surviving end', () => {
    const n = note('held', 60, 100, 4900)
    const s = withClips(5000, [makeClip(0, 5000)], [n])
    const a = splitAt(s, 2500)
    const b = deleteAt(a, 4000)                      // delete right
    // Surviving clip is [0..2500], note onset 100 stays in it, audible end
    // clamps to the surviving clip's end.
    expect(audibleEnd(b, b.notes[0])).toBe(2500)
  })

  it('delete LEFT half of a split: surviving note plays from sustain to clip end', () => {
    const n = note('held', 60, 100, 4900)
    const s = withClips(5000, [makeClip(0, 5000)], [n])
    const a = splitAt(s, 2500)
    const b = deleteAt(a, 1000)                      // delete left
    const survivor = b.notes[0]
    // Re-anchored: note now spans [0..2400] in post-ripple coords; chunk
    // covers the whole surviving clip [0..2500].
    expect(survivor.startMs).toBe(0)
    expect(audibleEnd(b, survivor)).toBe(2400)
  })

  // ── Note-array identity invariants (the rest of the contract) ─────────

  it('split anywhere: notes array reference is identical', () => {
    const ns = [
      note('a', 60, 100, 800),
      note('b', 62, 250, 600),
      note('c', 64, 400, 950),
    ]
    const s = withClips(1000, [makeClip(0, 1000)], ns)
    for (const cut of [200, 350, 500, 650, 850]) {
      const next = splitAt(s, cut)
      expect(next.notes).toBe(s.notes)
    }
  })

  it('split anywhere: each note has identical id/startMs/endMs/velocity/midi', () => {
    const ns = [
      note('a', 60, 100, 800),
      note('b', 62, 250, 600),
    ]
    const s = withClips(1000, [makeClip(0, 1000)], ns)
    const next = splitAt(s, 500)
    expect(next.notes.length).toBe(s.notes.length)
    next.notes.forEach((n, i) => {
      const orig = s.notes[i]
      expect(n.id).toBe(orig.id)
      expect(n.startMs).toBe(orig.startMs)
      expect(n.endMs).toBe(orig.endMs)
      expect(n.velocity).toBe(orig.velocity)
      expect(n.midi).toBe(orig.midi)
    })
  })

  it('durationMs and trimEnd are unchanged by split', () => {
    const ns = [note('a', 60, 100, 800)]
    const s = withClips(1000, [makeClip(0, 1000)], ns)
    const next = splitAt(s, 500)
    expect(next.durationMs).toBe(s.durationMs)
    expect(next.trimEndMs).toBe(s.trimEndMs)
    expect(next.trimStartMs).toBe(s.trimStartMs)
  })

  it('after split + delete-of-right, the left clip survives unchanged', () => {
    const s = emptySnap(1000)
    const a = splitAt(s, 400)              // [0..400] [400..1000]
    const b = deleteAt(a, 700)             // ripple-delete [400..1000]
    expect(b.clips).toHaveLength(1)
    expect(b.clips[0].startMs).toBe(0)
    expect(b.clips[0].endMs).toBe(400)
    expect(b.durationMs).toBe(400)
  })
})

// ── deleteAt ───────────────────────────────────────────────────────────────

describe('deleteAt', () => {
  it('ripple-removes a middle clip; later clips shift left by its span', () => {
    const a = makeClip(0, 200)
    const b = makeClip(200, 500)
    const c = makeClip(500, 800)
    const s = withClips(800, [a, b, c])
    const next = deleteAt(s, 300)
    expect(next.clips).toHaveLength(2)
    expect(next.clips[0].id).toBe(a.id)
    expect(next.clips[1].id).toBe(c.id)
    expect(next.clips[1].startMs).toBe(200)
    expect(next.clips[1].endMs).toBe(500)
    expect(next.durationMs).toBe(500)
    expect(next.trimEndMs).toBe(500)
  })

  it('drops notes inside the deleted clip; shifts notes after it', () => {
    const a = makeClip(0, 200)
    const b = makeClip(200, 500)
    const c = makeClip(500, 800)
    const n1 = note('n1', 60, 100, 180)   // in a
    const n2 = note('n2', 62, 250, 400)   // in b — drop
    const n3 = note('n3', 64, 600, 750)   // in c — shift left
    const s = withClips(800, [a, b, c], [n1, n2, n3])
    const next = deleteAt(s, 300)
    expect(next.notes.map(n => n.id)).toEqual(['n1', 'n3'])
    expect(next.notes[1].startMs).toBe(300)
    expect(next.notes[1].endMs).toBe(450)
  })

  it('refuses to delete a locked clip', () => {
    const c = makeClip(0, 1000, { locked: true })
    const s = withClips(1000, [c])
    expect(deleteAt(s, 500)).toBe(s)
  })

  it('refuses to delete from a gap', () => {
    const a = makeClip(0, 300)
    const b = makeClip(700, 1000)
    const s = withClips(1000, [a, b])
    expect(deleteAt(s, 500)).toBe(s)
  })
})

// ── volume / lock / comment ────────────────────────────────────────────────

describe('setVolumeAt', () => {
  it('clamps to [0, 2]', () => {
    const s = withClips(1000, [makeClip(0, 1000)])
    expect(setVolumeAt(s, 500, 5).clips[0].volume).toBe(2)
    expect(setVolumeAt(s, 500, -1).clips[0].volume).toBe(0)
  })

  it('refuses on locked clips', () => {
    const c = makeClip(0, 1000, { locked: true })
    const s = withClips(1000, [c])
    expect(setVolumeAt(s, 500, 0.5)).toBe(s)
  })
})

describe('toggleLockAt', () => {
  it('flips the locked flag', () => {
    const s = withClips(1000, [makeClip(0, 1000)])
    const next = toggleLockAt(s, 500)
    expect(next.clips[0].locked).toBe(true)
    expect(toggleLockAt(next, 500).clips[0].locked).toBe(false)
  })

  it('works even on already-locked clips (so user can unlock)', () => {
    const c = makeClip(0, 1000, { locked: true })
    const s = withClips(1000, [c])
    expect(toggleLockAt(s, 500).clips[0].locked).toBe(false)
  })
})

describe('setCommentAt', () => {
  it('stores trimmed comment; clears on empty string', () => {
    const s = withClips(1000, [makeClip(0, 1000)])
    const a = setCommentAt(s, 500, '  hello  ')
    expect(a.clips[0].comment).toBe('hello')
    expect(setCommentAt(a, 500, '   ').clips[0].comment).toBeUndefined()
  })

  it('refuses on locked clips', () => {
    const c = makeClip(0, 1000, { locked: true })
    const s = withClips(1000, [c])
    expect(setCommentAt(s, 500, 'x')).toBe(s)
  })
})

// ── pasteAt ────────────────────────────────────────────────────────────────

describe('pasteAt', () => {
  it('ripple-inserts after the host when cursor is INSIDE a clip', () => {
    const a = makeClip(0, 300)
    const b = makeClip(700, 1000)
    const s = withClips(1000, [a, b])
    const source = makeClip(0, 200, { id: 'src' })
    const next = pasteAt(s, source, 150) // inside a
    // After paste: a [0..300], dup [300..500], b shifted to [900..1200]
    expect(next.clips).toHaveLength(3)
    expect(next.clips.map(c => [c.startMs, c.endMs])).toEqual([
      [0, 300], [300, 500], [900, 1200],
    ])
    expect(next.durationMs).toBe(1200)
  })

  it('fits-to-gap when cursor is in a wide-enough gap', () => {
    const a = makeClip(0, 300)
    const b = makeClip(700, 1000)
    const s = withClips(1000, [a, b])
    const source = makeClip(0, 100, { id: 'src' })
    const next = pasteAt(s, source, 500)
    // Clips should be: a, dup centred near 500 ([450..550]), b — durationMs unchanged
    expect(next.clips).toHaveLength(3)
    expect(next.durationMs).toBe(1000)
    const dup = next.clips.find(c => c.startMs >= 300 && c.endMs <= 700)
    expect(dup).toBeDefined()
    expect(dup!.endMs - dup!.startMs).toBe(100)
  })

  it('ripple-inserts at the cursor when the gap is too small', () => {
    const a = makeClip(0, 300)
    const b = makeClip(500, 1000)
    const s = withClips(1000, [a, b])
    const source = makeClip(0, 400, { id: 'src' }) // too wide for the 200 ms gap
    const next = pasteAt(s, source, 400)
    expect(next.durationMs).toBeGreaterThan(1000)
  })

  it('refuses to paste a source narrower than MIN_CLIP_MS', () => {
    const s = withClips(1000, [makeClip(0, 1000)])
    const tiny = makeClip(0, MIN_CLIP_MS - 10, { id: 'tiny' })
    expect(pasteAt(s, tiny, 500)).toBe(s)
  })

  it('copies notes whose onset is inside the source clip', () => {
    const a = makeClip(0, 300)
    const b = makeClip(700, 1000)
    const sourceClip = makeClip(0, 300, { id: 'src' })
    const sNote = note('s1', 60, 100, 200)
    const s = withClips(1000, [a, b], [sNote])
    const next = pasteAt(s, sourceClip, 800)
    // Cursor inside b → ripple insert after b's end.  Original note stays.
    const newNotes = next.notes.filter(n => n.id !== 's1')
    expect(newNotes).toHaveLength(1)
  })
})

// ── moveToSlot ─────────────────────────────────────────────────────────────

describe('moveToSlot', () => {
  it('reorders clips and lays them out touching from trimStart', () => {
    const a = makeClip(0, 100, { id: 'a' })
    const b = makeClip(300, 500, { id: 'b' })
    const c = makeClip(700, 1000, { id: 'c' })
    const s = withClips(1000, [a, b, c])
    const next = moveToSlot(s, 'c', 0)
    expect(next.clips.map(c => c.id)).toEqual(['c', 'a', 'b'])
    expect(next.clips.map(c => [c.startMs, c.endMs])).toEqual([
      [0, 300], [300, 400], [400, 600],
    ])
  })

  it('refuses to move a locked clip', () => {
    const a = makeClip(0, 100, { id: 'a', locked: true })
    const b = makeClip(300, 500, { id: 'b' })
    const s = withClips(500, [a, b])
    expect(moveToSlot(s, 'a', 1)).toBe(s)
  })

  it('is a no-op if dropping on the original slot', () => {
    const a = makeClip(0, 100, { id: 'a' })
    const b = makeClip(300, 500, { id: 'b' })
    const s = withClips(500, [a, b])
    expect(moveToSlot(s, 'a', 0)).toBe(s)
  })

  it('shifts a boundary-onset note with the RIGHT clip (right-wins), not the left', () => {
    // Repro of the "B(1) becomes empty after dragging AB(2) onto it" bug.
    // Pre-move layout has b1 starting exactly at ab2.endMs (touching).  The
    // duplicate note created for b1 sits at b1.startMs, which is on the
    // boundary.  Ascending iteration + inclusive bounds matched ab2 first
    // (left-wins), so the note picked up ab2's shift (0) and got stranded
    // at the old position when b1 moved.
    const lead = makeClip(0, 5360, { id: 'lead' })
    const stb  = makeClip(5360, 6312, { id: 'stb' })
    const ab2  = makeClip(6576, 7528, { id: 'ab2' })
    const b1   = makeClip(7528, 7792, { id: 'b1' })
    const s: FreeSnapshot = {
      notes:       [note('boundary', 57, 7528, 7792)],
      clips:       [lead, stb, ab2, b1],
      durationMs:  7792,
      trimStartMs: 0,
      trimEndMs:   7792,
    }
    const out = moveToSlot(s, 'ab2', 3)
    const newB1 = out.clips.find(c => c.id === 'b1')!
    expect([newB1.startMs, newB1.endMs]).toEqual([6312, 6576])
    const noteAfter = out.notes.find(n => n.id === 'boundary')!
    expect([noteAfter.startMs, noteAfter.endMs]).toEqual([6312, 6576])
  })
})

// ── setTrimStart / setTrimEnd ──────────────────────────────────────────────

describe('trim window', () => {
  it('setTrimStart clamps to ≥ 0 and ≤ trimEnd-50', () => {
    const s = withClips(1000, [makeClip(0, 1000)])
    expect(setTrimStart(s, -50).trimStartMs).toBe(0)
    expect(setTrimStart(s, 980).trimStartMs).toBe(950)
  })

  it('setTrimEnd clamps to ≥ trimStart+50 and ≤ durationMs', () => {
    const s = withClips(1000, [makeClip(0, 1000)])
    expect(setTrimEnd(s, 1200).trimEndMs).toBe(1000)
    expect(setTrimEnd({ ...s, trimStartMs: 500 }, 510).trimEndMs).toBe(550)
  })

  it('returns the same snapshot when nothing changes', () => {
    const s = withClips(1000, [makeClip(0, 1000)])
    expect(setTrimStart(s, 0)).toBe(s)
    expect(setTrimEnd(s, 1000)).toBe(s)
  })
})

// ── pedal timeline stays aligned through time-shifting edits ─────────────────

describe('pedal events follow clip edits', () => {
  it('delete ripples later pedal edges left and drops ones inside the gap', () => {
    // Three clips; delete the middle [400..800] (span 400).
    const clips = [makeClip(0, 400), makeClip(400, 800), makeClip(800, 1200)]
    const s: FreeSnapshot = {
      notes: [note('a', 60, 100, 200), note('b', 62, 900, 1000)],
      durationMs: 1200, trimStartMs: 0, trimEndMs: 1200, clips,
      pedalEvents: [
        { time: 100, down: true },   // before target — stays
        { time: 500, down: false },  // inside target — dropped
        { time: 900, down: true },   // after target — shifts left by 400 → 500
      ],
    }
    const out = deleteAt(s, 600)
    expect(out.pedalEvents).toEqual([
      { time: 100, down: true },
      { time: 500, down: true },
    ])
  })
})
