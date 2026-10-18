// src/components/birthdays/BirthdaysCard.tsx
// „Nächste Geburtstage“ (über das Menü): wer als Nächstes feiert, nach Monaten; ein Tipp springt zur Person.

import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Cake, CalendarPlus, Copy, X } from 'lucide-react'
import { daysText, upcomingBirthdays, type Birthday } from '@/family/birthdays'
import { describeKinship, kinshipLabel } from '@/family/kinship'
import { useFamily } from '@/components/app/FamilyProvider'
import { useView } from '@/components/app/ViewProvider'
import { useToast } from '@/components/app/Toast'
import { Portrait } from '@/components/ui/Portrait'

const WEEKDAY = new Intl.DateTimeFormat('de-DE', { weekday: 'short' })
const MONTH = new Intl.DateTimeFormat('de-DE', { month: 'long' })
const MONTH_YEAR = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' })

export function BirthdaysCard() {
  const { tree, index } = useFamily()
  const { meId, showLine, focusOn } = useView()
  const [subscribe, setSubscribe] = useState(false)

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
        <span className="-mr-1 flex items-center">
          <button
            type="button"
            onClick={() => setSubscribe((v) => !v)}
            aria-expanded={subscribe}
            aria-label="Im Kalender abonnieren"
            title="Im Kalender abonnieren"
            className={clsx(
              'grid h-9 w-9 place-items-center rounded-full hover:bg-paper-raised',
              subscribe ? 'bg-gilt-soft/70 text-gilt-deep' : 'text-ink-muted hover:text-ink',
            )}
          >
            <CalendarPlus className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => showLine(null)}
            aria-label="Schließen"
            className="grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-paper-raised hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </span>
      </header>
      {subscribe && <Subscribe />}

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

/** Abo-Link für Kalender-Apps: iPhone/Mac, Google oder zum Kopieren */
function Subscribe() {
  const { notify } = useToast()
  const [path, setPath] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetch('/api/kalender/link', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { path: string }) => setPath(d.path))
      .catch(() => setFailed(true))
  }, [])

  const renew = async () => {
    if (!window.confirm('Neuen Link erzeugen? Wer den alten abonniert hat, bekommt danach keine Geburtstage mehr.'))
      return
    const r = await fetch('/api/kalender/link', { method: 'POST' })
    if (!r.ok) return notify({ message: 'Der neue Link konnte nicht erzeugt werden.' })
    setPath(((await r.json()) as { path: string }).path)
    notify({ message: 'Neuer Link erzeugt. Der alte funktioniert nicht mehr.' })
  }

  if (failed) {
    return (
      <p className="mx-3 mb-2 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
        Der Kalender-Link konnte nicht geladen werden.
      </p>
    )
  }
  if (!path) return <p className="mx-4 mb-2 font-serif text-[15px] italic text-ink-muted">Link wird geholt …</p>

  const host = window.location.host
  const https = `https://${host}${path}`
  const webcal = `webcal://${host}${path}`
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`
  const linkButton =
    'inline-flex h-10 items-center justify-center gap-2 rounded-control border border-card-rule bg-card px-3 text-sm font-medium text-ink hover:border-gilt'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(https)
      notify({ message: 'Link kopiert.' })
    } catch {
      window.prompt('Link zum Kopieren:', https)
    }
  }

  return (
    <div className="mx-3 mb-2 shrink-0 rounded-control border border-gilt/50 bg-card/70 p-3">
      <p className="font-serif text-[15px] leading-snug text-ink">
        Alle Geburtstage in deinem Kalender, mit Erinnerung am Morgen. Neue Einträge kommen von selbst dazu.
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <a href={webcal} className={linkButton}>
          iPhone &amp; Mac
        </a>
        <a href={google} target="_blank" rel="noreferrer" className={linkButton}>
          Google Kalender
        </a>
      </div>
      <button type="button" onClick={copy} className={clsx(linkButton, 'mt-2 w-full')}>
        <Copy className="h-4 w-4" aria-hidden />
        Link kopieren (Outlook und andere)
      </button>
      <p className="mt-2 text-[13px] leading-snug text-ink-faint">
        Wer den Link hat, sieht Namen und Geburtstage.{' '}
        <button
          type="button"
          onClick={renew}
          className="underline decoration-gilt/60 underline-offset-2 hover:text-ink"
        >
          Neuen Link erzeugen
        </button>
      </p>
    </div>
  )
}
