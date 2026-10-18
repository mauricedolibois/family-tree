// src/components/birthdays/BirthdaysCard.tsx
// „Nächste Geburtstage“ (über das Menü): wer als Nächstes feiert, nach Monaten; ein Tipp springt zur Person.

import { useMemo } from 'react'
import clsx from 'clsx'
import { Cake, X } from 'lucide-react'
import { daysText, upcomingBirthdays, type Birthday } from '@/family/birthdays'
import { describeKinship, kinshipLabel } from '@/family/kinship'
import { useFamily } from '@/components/app/FamilyProvider'
import { useView } from '@/components/app/ViewProvider'
import { Portrait } from '@/components/ui/Portrait'

const WEEKDAY = new Intl.DateTimeFormat('de-DE', { weekday: 'short' })
const MONTH = new Intl.DateTimeFormat('de-DE', { month: 'long' })
const MONTH_YEAR = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' })

export function BirthdaysCard() {
  const { tree, index } = useFamily()
  const { meId, showLine, focusOn } = useView()

  // Gruppen nach Monat, in Reihenfolge der nächsten Geburtstage
  const groups = useMemo(() => {
    const thisYear = new Date().getFullYear()
    const out: Array<{ label: string; items: Birthday[] }> = []
    for (const b of upcomingBirthdays(tree)) {
      const label = (b.date.getFullYear() === thisYear ? MONTH : MONTH_YEAR).format(b.date)
      const last = out[out.length - 1]
      if (last?.label === label) last.items.push(b)
      else out.push({ label, items: [b] })
    }
    return out
  }, [tree])

  /** Mit „Das bin ich“: wer die Person für dich ist */
  const relationTo = (id: string) => {
    if (!meId) return null
    if (id === meId) return 'Du'
    const k = describeKinship(index, meId, id)
    return k ? kinshipLabel(k) : null
  }

  const open = (id: string) => {
    showLine(null)
    focusOn(id)
  }

  return (
    <section
      aria-label="Nächste Geburtstage"
      className="parchment pointer-events-auto flex max-h-[calc(100dvh-150px)] w-full flex-col rounded-card border border-gilt/60 shadow-card md:w-[380px]"
    >
      <header className="flex shrink-0 items-center justify-between px-4 pb-1 pt-3">
        <h2 className="font-display text-[1.35rem] leading-tight text-ink">Nächste Geburtstage</h2>
        <button
          type="button"
          onClick={() => showLine(null)}
          aria-label="Schließen"
          className="-mr-1 grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-paper-raised hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
        {groups.length === 0 && (
          <p className="px-2 py-4 font-serif text-[16px] leading-snug text-ink-muted">
            Noch keine Geburtstage eingetragen. Im Infoblatt unter „Bearbeiten“ lässt sich das Geburtsdatum ergänzen.
          </p>
        )}
        {groups.map((g) => (
          <section key={g.label}>
            <h3 className="parchment sticky top-0 z-10 px-2 pb-1 pt-2 font-serif text-[15px] italic text-gilt-deep">
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

      <p className="shrink-0 border-t border-card-rule px-4 py-2 text-[13px] text-ink-faint">
        Alle Lebenden mit vollständigem Geburtsdatum.
      </p>
    </section>
  )
}

function BirthdayRow({ b, relation, onOpen }: { b: Birthday; relation: string | null; onOpen: () => void }) {
  const soon = b.days <= 7
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={clsx(
          'flex w-full items-center gap-3 rounded-control px-2 py-1.5 text-left hover:bg-paper-raised',
          b.days === 0 && 'bg-gilt-soft/60',
        )}
      >
        {/* Kalenderblatt */}
        <span className="flex w-11 shrink-0 flex-col items-center rounded-control border border-card-rule bg-card py-1 leading-none">
          <span className="font-serif text-[12px] text-ink-muted">{WEEKDAY.format(b.date)}</span>
          <span className="mt-0.5 font-display text-[1.3rem] text-ink">{b.date.getDate()}</span>
        </span>
        <Portrait person={b.person} size="sm" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate font-serif text-[16px] font-semibold text-ink">{b.person.name}</span>
          <span className="block truncate font-serif text-[14px] text-ink-muted">
            {[`wird ${b.age}`, relation].filter(Boolean).join(', ')}
          </span>
        </span>
        <span
          className={clsx(
            'flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[13px]',
            b.days === 0 ? 'bg-gilt font-medium text-linen-deep' : soon ? 'text-gilt-deep' : 'text-ink-faint',
          )}
        >
          {b.days === 0 && <Cake className="h-3.5 w-3.5" aria-hidden />}
          {daysText(b.days)}
        </span>
      </button>
    </li>
  )
}
