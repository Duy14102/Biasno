import React, { useRef } from 'react'
import { SearchIcon, CloseIcon } from './icons'
import { useLanguage } from '@/i18n'

interface Props {
  value:    string
  onChange: (next: string) => void
}

/** Search input for the library panel.  Icon on the left, fade-in clear
 *  button on the right, soft focus ring.  Escape clears + blurs. */
export default function LibrarySearch({ value, onChange }: Props): React.JSX.Element {
  const { t } = useLanguage()
  const inputRef = useRef<HTMLInputElement>(null)
  const hasQuery = value.length > 0

  const clear = (): void => {
    onChange('')
    inputRef.current?.focus()
  }

  return (
    <div
      className={[
        'group relative flex items-center gap-2 px-3 h-9 rounded-lg',
        'bg-slate-100 dark:bg-slate-800/70',
        'border border-transparent',
        'focus-within:border-blue-500 focus-within:bg-white dark:focus-within:bg-slate-800',
        'focus-within:ring-2 focus-within:ring-blue-500/25',
        'transition-[background-color,border-color,box-shadow] duration-150 ease-out',
      ].join(' ')}
    >
      <SearchIcon
        className={[
          'w-4 h-4 flex-shrink-0 transition-colors duration-150',
          hasQuery
            ? 'text-blue-500 dark:text-blue-400'
            : 'text-slate-400 dark:text-slate-500 group-focus-within:text-blue-500 dark:group-focus-within:text-blue-400',
        ].join(' ')}
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && hasQuery) {
            e.preventDefault()
            onChange('')
          }
        }}
        placeholder={t('searchPlaceholder')}
        spellCheck={false}
        autoComplete="off"
        className="flex-1 min-w-0 bg-transparent outline-none text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
      />
      <button
        type="button"
        onClick={clear}
        title={t('searchClear')}
        aria-label={t('searchClear')}
        className={[
          'flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-md',
          'text-slate-500 hover:text-slate-800 hover:bg-slate-200',
          'dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700',
          'transition-all duration-150 ease-out',
          hasQuery
            ? 'opacity-100 scale-100 pointer-events-auto'
            : 'opacity-0 scale-75 pointer-events-none',
        ].join(' ')}
      >
        <CloseIcon />
      </button>
    </div>
  )
}
