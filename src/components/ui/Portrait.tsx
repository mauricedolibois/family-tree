// src/components/ui/Portrait.tsx
// Foto oder Initialen. Wie in klassischen Ahnentafeln: Männer eckig, Frauen rund.

import clsx from 'clsx'
import { useState } from 'react'
import type { Person } from '@/family/model'
import { initials, isDeceased } from '@/family/format'

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-20 w-20 text-xl',
} as const

export function Portrait({
  person,
  size = 'md',
  className,
}: {
  person: Person
  size?: keyof typeof SIZES
  className?: string
}) {
  const url = person.profile?.titleImageUrl
  // Fehlt die Datei, lieber die Initialen zeigen als ein kaputtes Bild
  const [broken, setBroken] = useState<string | null>(null)
  const shape = person.gender === 'FEMALE' ? 'rounded-full' : size === 'lg' ? 'rounded-[14px]' : 'rounded-[7px]'
  return (
    <span
      className={clsx(
        'cameo relative inline-grid shrink-0 place-items-center overflow-hidden bg-portrait font-display text-linen',
        SIZES[size],
        shape,
        className,
      )}
      aria-hidden
    >
      {url && broken !== url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          loading="lazy"
          onError={() => setBroken(url)}
          className={clsx('h-full w-full object-cover', isDeceased(person) && 'grayscale-[35%]')}
        />
      ) : (
        initials(person.name)
      )}
    </span>
  )
}
