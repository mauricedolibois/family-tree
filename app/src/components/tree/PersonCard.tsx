// src/components/tree/PersonCard.tsx
// One person in the tree: picture, given names, surname, country flag and life years.

import clsx from 'clsx'
import { memo } from 'react'
import type { Person } from '@/family/model'
import { isDeceased, lifeYears, splitName } from '@/family/format'
import type { CardBox } from '@/family/layout/types'
import { Portrait } from '@/components/ui/Portrait'
import { CountryFlag } from '@/components/ui/CountryFlag'
import { useI18n } from '@/i18n/I18nProvider'

export type CardState = 'normal' | 'selected' | 'line' | 'dimmed'

type Props = {
  person: Person
  box: CardBox
  state: CardState
  isMe: boolean
  onSelect: (id: string) => void
  /** Selected without the selected look (the scope preview marks selection itself) */
  pressed?: boolean
}

export const PersonCard = memo(function PersonCard({ person, box, state, isMe, onSelect, pressed }: Props) {
  const { given, surname } = splitName(person.name)
  const { t } = useI18n()
  const years = lifeYears(person)
  const past = isDeceased(person)
  const country = person.profile?.country?.trim()

  return (
    <button
      type="button"
      data-person={person.id}
      onClick={() => onSelect(person.id)}
      aria-pressed={pressed ?? state === 'selected'}
      aria-label={[person.name, years].filter(Boolean).join(', ')}
      className={clsx(
        'person-card absolute flex items-center gap-3 rounded-card border px-2.5 text-left',
        'transition-[opacity,box-shadow,border-color] duration-300 ease-settle',
        past ? 'bg-card-past' : 'bg-card',
        state === 'selected' && 'selected-glow z-10 border-accent [--plate-rule:rgb(var(--accent))]',
        state === 'line' && 'border-frame/80 shadow-card [--plate-rule:rgb(var(--accent)/0.55)]',
        state === 'normal' && 'border-card-rule shadow-card hover:border-line',
        state === 'dimmed' && 'border-card-rule opacity-[0.38] hover:opacity-80',
      )}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    >
      <Portrait person={person} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate font-text text-[16.5px] font-semibold text-ink">{given || surname}</span>
        {given && surname && (
          <span className="block truncate font-text text-[14px] tracking-[0.04em] text-ink-muted [font-variant-caps:all-small-caps]">
            {surname}
          </span>
        )}
        <span className="mt-px flex items-center gap-1.5 font-text text-[13.5px] text-ink-faint">
          {country && <CountryFlag country={country} />}
          {years && <span>{years}</span>}
          {isMe && (
            <span className="rounded-full bg-primary-tint px-1.5 text-[11px] font-medium text-on-tint">
              {t.person.youBadge}
            </span>
          )}
        </span>
      </span>
    </button>
  )
})
