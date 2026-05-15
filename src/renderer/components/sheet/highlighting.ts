// ─── Sheet note highlight colours ────────────────────────────────────────────
// 4-colour scheme mirrors FallingNotes + PianoKeyboard:
//   • Treble (right hand): blue shades
//   • Bass   (left  hand): orange shades
// Black-key notes use the darker variant of each pair for contrast against
// the natural ink colour of the printed note.

const HL_COLORS = {
  rightWhite: { fill: '#4A9EFF', stroke: '#1A6ECC' },
  rightBlack: { fill: '#1A6ECC', stroke: '#0D4A99' },
  leftWhite:  { fill: '#FF8833', stroke: '#CC4411' },
  leftBlack:  { fill: '#CC4411', stroke: '#992200' },
}

/** Apply the (right/left × white/black) colour to one SVG path element and
 *  remember it in `out` so the next clear can revert it. */
function applyColor(el: HTMLElement, isRight: boolean, isBlack: boolean, out: HTMLElement[]): void {
  const c = isRight
    ? (isBlack ? HL_COLORS.rightBlack : HL_COLORS.rightWhite)
    : (isBlack ? HL_COLORS.leftBlack  : HL_COLORS.leftWhite)
  el.style.fill   = c.fill
  el.style.stroke = c.stroke
  out.push(el)
}

/** Wipe inline fill / stroke from every element in `refs` and empty `refs`.
 *  Removing the inline styles lets the SVG's attribute colour show through. */
export function clearHighlights(refs: HTMLElement[]): void {
  for (const el of refs) {
    el.style.fill   = ''
    el.style.stroke = ''
  }
  refs.length = 0
}

/**
 * Colour every part of a printed note that belongs to a single VexFlow stave
 * note id: the head group (notehead + flag + accidental + non-beamed stem),
 * the separate stem element (present on beamed notes), and any ledger lines.
 */
export function colorFullNote(
  svgId: string,
  isRight: boolean,
  isBlack: boolean,
  out: HTMLElement[],
): void {
  const apply = (el: HTMLElement) => applyColor(el, isRight, isBlack, out)

  // Main stavenote group (note heads, flag, accidentals, non-beamed stems)
  const group = document.getElementById('vf-' + svgId)
  if (group) group.querySelectorAll<HTMLElement>('path').forEach(apply)

  // Separate stem element (beam class draws stems for beamed notes separately)
  const stem = document.getElementById('vf-' + svgId + '-stem')
  if (stem) stem.querySelectorAll<HTMLElement>('path').forEach(apply)

  // Ledger lines (above / below staff for extreme pitches)
  const ledger = document.getElementById('vf-' + svgId + 'ledgers')
  if (ledger) ledger.querySelectorAll<HTMLElement>('path').forEach(apply)
}
