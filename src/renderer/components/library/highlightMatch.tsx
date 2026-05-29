import React from 'react'

// Inline yellow tint for matched substrings — readable in both themes,
// inherits row text color so highlight + truncate still play nice.
const MARK_CLASS = 'bg-yellow-200/70 dark:bg-yellow-400/30 text-inherit rounded-[2px]'

/** Render `text` with case-insensitive occurrences of `query` wrapped in a
 *  styled <mark>.  Returns the original string unchanged when query is empty
 *  so non-search renders stay zero-cost. */
export function highlightMatch(text: string, query: string): React.ReactNode {
  const q = query.trim()
  if (!q) return text
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const parts: React.ReactNode[] = []
  let i = 0
  let hit = lower.indexOf(needle, i)
  let k = 0
  while (hit !== -1) {
    if (hit > i) parts.push(text.slice(i, hit))
    parts.push(<mark key={k++} className={MARK_CLASS}>{text.slice(hit, hit + needle.length)}</mark>)
    i = hit + needle.length
    hit = lower.indexOf(needle, i)
  }
  if (i < text.length) parts.push(text.slice(i))
  return parts
}
