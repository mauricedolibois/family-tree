// src/components/birthdays/BirthdaysCard.tsx
// "Upcoming birthdays" (from the menu): who celebrates next, grouped by month; a tap jumps to the person.
// The calendar button flips to a separate subscription page, regardless of the scroll position.

import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { ArrowLeft, Cake, CalendarPlus, X } from 'lucide-react'
import { daysText, upcomingBirthdays, type Birthday } from '@/family/birthdays'
import { describeKinship, kinshipLabel } from '@/family/kinship'
import { useFamily } from '@/components/app/FamilyProvider'
import { useView } from '@/components/app/ViewProvider'
import { Portrait } from '@/components/ui/Portrait'
import { CalendarSubscribe } from './CalendarSubscribe'
import { INTL_TAG } from '@/i18n/locales'
import { useI18n } from '@/i18n/I18nProvider'

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function BirthdaysCard() {
  const { tree, index } = useFamily()
  const { meId, showLine, focusOn } = useView()
  const [subscribe, setSubscribe] = useState(false)
  const { t, locale } = useI18n()

  // Groups by month, in order of the next birthdays
  const groups = useMemo(() => {
    const month = new Intl.DateTimeFormat(INTL_TAG[locale], { month: 'long' })
    const monthYear = new Intl.DateTimeFormat(INTL_TAG[locale], { month: 'long', year: 'numeric' })
    const thisYear = new Date().getFullYear()
    const out: Array<{ label: string; items: Birthday[] }> = []
    for (const b of upcomingBirthdays(tree)) {
      const label = capitalize((b.date.getFullYear() === thisYear ? month : monthYear).format(b.date))
      const last = out[out.length - 1]
      if (last?.label === label) last.items.push(b)
      else out.push({ label, items: [b] })
    }
    return out
  }, [tree, locale])

  /** With "that's me" set: who the person is to you */
  const relationTo = (id: string) => {
    if (!meId) return null
    if (id === meId) return t.birthdays.you
    const k = describeKinship(index, meId, id)
    return k ? kinshipLabel(k, locale) : null
  }

  const open = (id: string) => {
    showLine(null)
    focusOn(id)
  }

  return (
    <section
      aria-label={t.birthdays.title}
      className="surface pointer-events-auto flex max-h-[calc(100dvh-150px)] w-full flex-col rounded-card border border-frame/60 shadow-card md:w-[380px]"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 px-4 pb-1 pt-3">
        {subscribe ? (
          <span className="-ml-2 flex min-w-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setSubscribe(false)}
              aria-label={t.birthdays.backToList}
              title={t.birthdays.backToList}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-canvas-raised hover:text-ink"
            >
              <ArrowLeft className="h-[18px] w-[18px]" />
            </button>
            <h2 className="truncate font-display text-[1.35rem] leading-tight text-ink">{t.birthdays.subscribe}</h2>
          </span>
        ) : (
          <h2 className="font-display text-[1.35rem] leading-tight text-ink">{t.birthdays.title}</h2>
        )}
        <span className="-mr-1 flex shrink-0 items-center">
          {!subscribe && (
            <button
              type="button"
              onClick={() => setSubscribe(true)}
              aria-label={t.birthdays.subscribe}
              title={t.birthdays.subscribe}
              className="grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-canvas-raised hover:text-ink"
            >
              <CalendarPlus className="h-[18px] w-[18px]" />
            </button>
          )}
          <button
            type="button"
            onClick={() => showLine(null)}
            aria-label={t.birthdays.close}
            className="grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-canvas-raised hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </span>
      </header>
      {subscribe && (
        <div className="panel-enter min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-1">
          <CalendarSubscribe personId={meId} allowRenew />
        </div>
      )}

      {/* The list stays mounted (hidden) so going back returns to the same spot */}
      <div className={clsx('min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2', subscribe && 'hidden')}>
        {groups.length === 0 && (
          <p className="px-2 py-4 font-text text-[16px] leading-snug text-ink-muted">{t.birthdays.none}</p>
        )}
        {groups.map((g) => (
          <section key={g.label}>
            <h3 className="surface sticky top-0 z-10 px-2 pb-1 pt-2 font-text text-[15px] italic text-accent-deep">
              {g.label}
            </h3>
            <ul className="flex flex-col gap-0.5">
              {g.items.map((b) => (
                <BirthdayRow
                  key={b.person.id}
                  b={b}
                  relation={relationTo(b.person.id)}
                  onOpen={() => open(b.person.id)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {!subscribe && (
        <p className="shrink-0 border-t border-card-rule px-4 py-2 text-[13px] text-ink-faint">{t.birthdays.footer}</p>
      )}
    </section>
  )
}

function BirthdayRow({ b, relation, onOpen }: { b: Birthday; relation: string | null; onOpen: () => void }) {
  const { t, locale } = useI18n()
  const soon = b.days <= 7
  const weekday = new Intl.DateTimeFormat(INTL_TAG[locale], { weekday: 'short' }).format(b.date)
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={clsx(
          'flex w-full items-center gap-3 rounded-control px-2 py-1.5 text-left hover:bg-canvas-raised',
          b.days === 0 && 'bg-accent-soft/60',
        )}
      >
        {/* Calendar leaf */}
        <span className="flex w-11 shrink-0 flex-col items-center rounded-control border border-card-rule bg-card py-1 leading-none">
          <span className="font-text text-[12px] text-ink-muted">{weekday}</span>
          <span className="mt-0.5 font-display text-[1.3rem] text-ink">{b.date.getDate()}</span>
        </span>
        <Portrait person={b.person} size="sm" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate font-text text-[16px] font-semibold text-ink">{b.person.name}</span>
          <span className="block truncate font-text text-[14px] text-ink-muted">
            {[t.birthdays.turns(b.age), relation].filter(Boolean).join(', ')}
          </span>
        </span>
        <span
          className={clsx(
            'flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[13px]',
            b.days === 0 ? 'bg-accent font-medium text-on-accent' : soon ? 'text-accent-deep' : 'text-ink-faint',
          )}
        >
          {b.days === 0 && <Cake className="h-3.5 w-3.5" aria-hidden />}
          {daysText(b.days, locale)}
        </span>
      </button>
    </li>
  )
}
