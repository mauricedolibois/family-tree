// src/components/ui/Flourish.tsx
// Ornamental rule as in old books: two scrolls around a diamond. Marked as an
// ornament, so themes without ornaments hide it.

import clsx from 'clsx'

export function Flourish({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 240 16" className={clsx('ornament h-4 w-full text-accent', className)} style={style} aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
        <path d="M4 8 H92" opacity="0.55" />
        <path d="M148 8 H236" opacity="0.55" />
        <path d="M92 8 C100 8 102 2 108 4 C112 5.5 110 10 106 9" />
        <path d="M148 8 C140 8 138 14 132 12 C128 10.5 130 6 134 7" />
      </g>
      <path d="M120 2 L126 8 L120 14 L114 8 Z" fill="currentColor" />
      <circle cx="104" cy="8" r="1.2" fill="currentColor" />
      <circle cx="136" cy="8" r="1.2" fill="currentColor" />
    </svg>
  )
}
