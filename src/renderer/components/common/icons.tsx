import React from 'react'

type IconProps = { className?: string }

export function Svg({ className = 'w-4 h-4', children }: IconProps & { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      {children}
    </svg>
  )
}

export const TrashIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></Svg>
)

export const CloseIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></Svg>
)

export const FolderIcon = ({ className = 'w-4 h-4' }: IconProps): React.JSX.Element => (
  <Svg className={className}>
    <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
  </Svg>
)

export const WarningIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></Svg>
)

export const ImportIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></Svg>
)
