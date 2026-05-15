// ─── Auto-scroll helper for OSMD cursor ──────────────────────────────────────
// Design goals:
//   1. SMOOTH — a single custom rAF animation (ease-out, 550 ms) per row jump
//      instead of browser-native scrollTo({ behavior: 'smooth' }) which is
//      shorter (~300 ms) and gets cancelled/restarted on every cursor step,
//      producing jitter.
//   2. NO CASCADE — `_lastTargetTop` guards against starting a fresh animation
//      while we're already heading to the same row.  Only a row-sized
//      displacement (> ROW_THRESHOLD px) opens a new animation.
//   3. LOOK-AHEAD — we place the cursor row at 25 % from the top of the
//      viewport so the bottom 75 % shows the current row + the next row,
//      giving the player a clear runway of upcoming notes.

const ROW_THRESHOLD = 50          // px — smaller than any rendered row height

let lastTargetTop = -9999         // sentinel so the first call always animates
let rafId: number | null = null

export function resetScrollState(): void {
  lastTargetTop = -9999
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

export function scrollToCursor(scrollEl: HTMLDivElement | null, force = false): void {
  if (!scrollEl) return
  const cursorEl = document.getElementById('cursorImg-0')
  if (!cursorEl) return

  const cursorRect = cursorEl.getBoundingClientRect()
  const scrollRect = scrollEl.getBoundingClientRect()

  // Cursor's Y position in content (scrollTop-relative) coordinates.  This is
  // stable against the current scrollTop and any in-flight animation: if
  // scrollTop changes by Δ, cursorRect.top changes by -Δ, sum stays constant.
  const contentY = (cursorRect.top - scrollRect.top) + scrollEl.scrollTop

  // Place the cursor row's top at 25 % from the viewport top.
  const targetTop = Math.max(0, contentY - scrollEl.clientHeight * 0.25)

  if (!force && Math.abs(targetTop - lastTargetTop) < ROW_THRESHOLD) return
  lastTargetTop = targetTop

  if (rafId !== null) cancelAnimationFrame(rafId)

  const startTop = scrollEl.scrollTop
  const dist     = targetTop - startTop
  if (Math.abs(dist) < 1) return

  const DURATION = 550
  const t0       = performance.now()

  function animate(now: number): void {
    const progress = Math.min((now - t0) / DURATION, 1)
    const eased    = 1 - Math.pow(1 - progress, 3)   // ease-out cubic
    scrollEl!.scrollTop = startTop + dist * eased
    if (progress < 1) {
      rafId = requestAnimationFrame(animate)
    } else {
      rafId = null
    }
  }

  rafId = requestAnimationFrame(animate)
}
