// src/components/tree/PersonCard.tsx
// Eine Person im Baum: Bild, Vornamen, Nachname, Herkunftsflagge und Lebensjahre.

import clsx from 'clsx'
import { memo } from 'react'
import type { Person } from '@/family/model'
import { isDeceased, lifeYears, splitName } from '@/family/format'
import { useLang } from '@/i18n/lang'
import type { CardBox } from '@/family/layout/types'
import { Portrait } from '@/components/ui/Portrait'
import { CountryFlag } from '@/components/ui/CountryFlag'

export type CardState = 'normal' | 'selected' | 'line' | 'dimmed'

type Props = {
  person: Person
  box: CardBox
  state: CardState
  isMe: boolean
  onSelect: (id: string) => void
}

export const PersonCard = memo(function PersonCard({ person, box, state, isMe, onSelect }: Props) {
  const { t, lang } = useLang()
  const { given, surname } = splitName(person.name)
  const years = lifeYears(person, lang)
  const past = isDeceased(person)
  const country = person.profile?.country?.trim()

  return (
    <button
      type="button"
      data-person={person.id}
      onClick={() => onSelect(person.id)}
      aria-pressed={state === 'selected'}
      aria-label={[person.name, years].filter(Boolean).join(', ')}
      className={clsx(
        'bookplate absolute flex items-center gap-3 rounded-card border px-2.5 text-left',
        'transition-[opacity,box-shadow,border-color] duration-300 ease-settle',
        past ? 'bg-card-past' : 'bg-card',
        state === 'selected' && 'candle-glow z-10 border-gilt [--plate-rule:rgb(var(--gilt))]',
        state === 'line' && 'border-gilt/80 shadow-card [--plate-rule:rgb(var(--gilt)/0.55)]',
        state === 'normal' && 'border-card-rule shadow-card hover:border-line',
        state === 'dimmed' && 'border-card-rule opacity-[0.38] hover:opacity-80',
      )}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    >
      <Portrait person={person} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate font-serif text-[16.5px] font-semibold text-ink">{given || surname}</span>
        {given && surname && (
          <span className="block truncate font-serif text-[14px] tracking-[0.04em] text-ink-muted [font-variant-caps:all-small-caps]">
            {surname}
          </span>
        )}
        <span className="mt-px flex items-center gap-1.5 font-serif text-[13.5px] text-ink-faint">
          {country && <CountryFlag country={country} />}
          {years && <span>{years}</span>}
          {isMe && (
            <span className="rounded-full bg-linen-tint px-1.5 text-[11px] font-medium text-linen">
              {t('Du', 'You')}
            </span>
          )}
        </span>
      </span>
    </button>
  )
})
