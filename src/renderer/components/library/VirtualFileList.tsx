import React, { useLayoutEffect, useRef, useState } from 'react'

// Fixed-height windowed list. Renders only the rows currently in (or near)
// the viewport, so a library with thousands of songs scrolls at 60fps with
// O(viewport) DOM nodes instead of O(items).
export const FILE_ROW_HEIGHT = 56
const OVERSCAN = 6

interface Props<T> {
  items:     T[]
  rowKey:    (item: T, index: number) => string
  renderRow: (item: T, index: number) => React.ReactNode
  className?: string
}

export default function VirtualFileList<T>({
  items, rowKey, renderRow, className,
}: Props<T>): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setViewportH(el.clientHeight)
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // rAF-throttle scroll updates — one render per frame at most.
  const handleScroll = (e: React.UIEvent<HTMLDivElement>): void => {
    const top = e.currentTarget.scrollTop
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      setScrollTop(top)
    })
  }

  const start = Math.max(0, Math.floor(scrollTop / FILE_ROW_HEIGHT) - OVERSCAN)
  const end   = Math.min(items.length, Math.ceil((scrollTop + viewportH) / FILE_ROW_HEIGHT) + OVERSCAN)
  const slice = items.slice(start, end)

  return (
    <div ref={ref} onScroll={handleScroll} className={className}>
      <div style={{ height: items.length * FILE_ROW_HEIGHT, position: 'relative' }} role="list">
        <div
          style={{
            position:  'absolute',
            top:       0,
            left:      0,
            right:     0,
            transform: `translateY(${start * FILE_ROW_HEIGHT}px)`,
          }}
        >
          {slice.map((item, i) => (
            <div key={rowKey(item, start + i)} style={{ height: FILE_ROW_HEIGHT }} role="listitem">
              {renderRow(item, start + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
