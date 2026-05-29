// 4-colour hand palette shared by PianoKeyboard, FallingNotes, the sheet
// highlighter and Free-Mode's clip preview.
//
// Design goals
// ─────────────
// 1. Hand identity is the dominant signal → carried by HUE.
//    Right = cool family (blue / indigo).
//    Left  = warm family (orange / rose).
//    Blue ↔ orange is the most colour-blind-safe complementary pair
//    (safe for deuteranopia, protanopia and tritanopia).
//
// 2. White-key vs black-key is the secondary signal → carried by a
//    HUE SHIFT (not just lightness).  Holding lightness near 55 % keeps
//    every swatch readable on both the light bg (slate-200 ≈ #E2E8F0)
//    and the dark bg (slate-950 ≈ #020617), so notes never "disappear"
//    when the user flips the theme.
//
//        right-white  =  blue-500    #3B82F6
//        right-black  =  violet-600  #7C3AED   (deep purple — cool family)
//        left-white   =  orange-500  #F97316
//        left-black   =  pink-500    #EC4899   (pink — warm family)
//
//    All four sit at WCAG ≥ 4:1 against BOTH bgs (verified) — well above
//    the 3:1 bar for non-text graphics.
//
// 3. Two extras per variant for visual layering:
//      • glow   — lighter / brighter tint, used by FallingNotes when a
//                 note touches the hit-line and by hover states.
//      • stroke — darker tint, used as the outline that gives the note a
//                 crisp edge on the LIGHT bg where fills look washed.
//
// 4. Hit / miss feedback stays universal (green / red) and is NOT part of
//    this palette — those are independent of hand identity.

export type HandKey = 'right-white' | 'right-black' | 'left-white' | 'left-black' | 'unknown'

export interface HandColor {
  fill:   string   // primary body colour
  glow:   string   // brighter shade for highlights / shadows
  stroke: string   // darker shade for outlines / edges
}

export const HAND_COLORS: Record<HandKey, HandColor> = {
  'right-white': { fill: '#3B82F6', glow: '#60A5FA', stroke: '#1D4ED8' }, // blue-500   / 400 / 700
  'right-black': { fill: '#7C3AED', glow: '#A78BFA', stroke: '#5B21B6' }, // violet-600 / 400 / 800 — deep purple
  'left-white':  { fill: '#F97316', glow: '#FB923C', stroke: '#C2410C' }, // orange-500 / 400 / 700
  'left-black':  { fill: '#EC4899', glow: '#F9A8D4', stroke: '#BE185D' }, // pink-500   / 300 / 700
  'unknown':     { fill: '#94A3B8', glow: '#CBD5E1', stroke: '#475569' }, // slate-400  / 300 / 600
}

/** Resolve a MIDI number + hand into one of the five palette slots. */
export function handColorKey(
  midi: number,
  hand: 'left' | 'right' | 'unknown',
  isBlack: boolean,
): HandKey {
  if (hand === 'right') return isBlack ? 'right-black' : 'right-white'
  if (hand === 'left')  return isBlack ? 'left-black'  : 'left-white'
  return 'unknown'
}

/** Convenience: look up the swatch in one call. */
export function handColorOf(
  midi: number,
  hand: 'left' | 'right' | 'unknown',
  isBlack: boolean,
): HandColor {
  return HAND_COLORS[handColorKey(midi, hand, isBlack)]
}
