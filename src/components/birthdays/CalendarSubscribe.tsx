// src/components/birthdays/CalendarSubscribe.tsx
//
// Geburtstage als Kalender-Abo: für iPhone/Mac, Google oder zum Kopieren.
// Wahlweise die ganze Familie oder nur die eigene Linie – Person und Umfang
// stehen als Parameter im Link (siehe src/family/calendarLink.ts).
// Steht unter „Nächste Geburtstage“ und am Ende der Einführung.

import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Copy } from 'lucide-react'
import { upcomingBirthdays } from '@/family/birthdays'
import { calendarQuery, calendarSubset, type CalendarSelection } from '@/family/calendarLink'
import { describeLineScope } from '@/family/format'
import { lineDepth, type LineScope } from '@/family/model'
import { useFamily } from '@/components/app/FamilyProvider'
import { useView } from '@/components/app/ViewProvider'
import { useToast } from '@/components/app/Toast'
import { Segmented } from '@/components/ui/Choice'
import { SIDE_OPTIONS } from '@/components/tree/LineScopeCard'

type Whom = 'line' | 'all'

export function CalendarSubscribe({
  personId,
  intro = true,
  allowRenew = false,
}: {
  /** Wessen Linie zur Wahl steht; ohne Person nur die ganze Familie */
  personId: string | null
  /** Einleitender Satz (in der Einführung steht er schon in der Erklärung) */
  intro?: boolean
  /** „Neuen Link erzeugen“ anbieten */
  allowRenew?: boolean
}) {
  const { tree, index } = useFamily()
  const { lineScope } = useView()
  const { notify } = useToast()
  const person = personId ? index.byId.get(personId) : undefined

  const [whom, setWhom] = useState<Whom>(person ? 'line' : 'all')
  const [side, setSide] = useState<LineScope['side']>(lineScope.side)
  const [path, setPath] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetch('/api/kalender/link', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { path: string }) => setPath(d.path))
      .catch(() => setFailed(true))
  }, [])

  // Vorfahren und Nachkommen wie unter „Meine Linie“ eingestellt, Seitenlinien hier wählbar
  const selection = useMemo<CalendarSelection | null>(
    () => (person && whom === 'line' ? { personId: person.id, scope: { ...lineScope, side } } : null),
    [person, whom, lineScope, side],
  )
  const count = useMemo(() => upcomingBirthdays(calendarSubset(tree, selection).tree).length, [tree, selection])
  const scopeText = useMemo(
    () => (selection ? describeLineScope(selection.scope, lineDepth(index, selection.personId)) : null),
    [selection, index],
  )

  const renew = async () => {
    if (!window.confirm('Neuen Link erzeugen? Wer den alten abonniert hat, bekommt danach keine Geburtstage mehr.'))
      return
    const r = await fetch('/api/kalender/link', { method: 'POST' })
    if (!r.ok) return notify({ message: 'Der neue Link konnte nicht erzeugt werden.' })
    setPath(((await r.json()) as { path: string }).path)
    notify({ message: 'Neuer Link erzeugt. Der alte funktioniert nicht mehr.' })
  }

  const href = path ? `${path}${calendarQuery(selection)}` : null
  const host = typeof window !== 'undefined' ? window.location.host : ''
  const https = `https://${host}${href ?? ''}`
  const webcal = `webcal://${host}${href ?? ''}`
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(https)
      notify({ message: 'Link kopiert.' })
    } catch {
      window.prompt('Link zum Kopieren:', https)
    }
  }

  const linkButton =
    'inline-flex h-10 items-center justify-center gap-2 rounded-control border border-card-rule bg-card px-3 text-sm font-medium text-ink hover:border-gilt'
  const disabled = !href && 'pointer-events-none opacity-50'

  return (
    <div className="flex flex-col gap-2.5 text-left">
      {intro && (
        <p className="font-serif text-[15px] leading-snug text-ink">
          Die Geburtstage in deinem Kalender, mit Erinnerung am Morgen. Neue Einträge kommen von selbst dazu.
        </p>
      )}

      {person && (
        <Segmented<Whom>
          dense
          label="Welche Geburtstage?"
          value={whom}
          onChange={setWhom}
          options={[
            { value: 'line', label: 'Meine Linie' },
            { value: 'all', label: 'Ganze Familie' },
          ]}
        />
      )}
      {selection && (
        <Segmented
          dense
          label="Seitenlinien"
          value={`${side}`}
          options={SIDE_OPTIONS}
          onChange={(v) => setSide(Number(v) as LineScope['side'])}
        />
      )}
      <p className="text-[13px] leading-snug text-ink-muted">
        {scopeText ? `${scopeText} – ` : 'Aus der ganzen Familie: '}
        <span className="tabular-nums">{count === 1 ? '1 Geburtstag' : `${count} Geburtstage`}</span>.
      </p>

      {failed ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
          Der Kalender-Link konnte nicht geladen werden.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <a href={webcal} className={clsx(linkButton, disabled)}>
              iPhone &amp; Mac
            </a>
            <a href={google} target="_blank" rel="noreferrer" className={clsx(linkButton, disabled)}>
              Google Kalender
            </a>
          </div>
          <button type="button" onClick={copy} disabled={!href} className={clsx(linkButton, 'w-full', disabled)}>
            <Copy className="h-4 w-4" aria-hidden />
            Link kopieren (Outlook und andere)
          </button>
        </div>
      )}

      <p className="text-[13px] leading-snug text-ink-faint">
        Wer den Link hat, sieht Namen und Geburtstage.
        {allowRenew && path && (
          <>
            {' '}
            <button
              type="button"
              onClick={renew}
              className="underline decoration-gilt/60 underline-offset-2 hover:text-ink"
            >
              Neuen Link erzeugen
            </button>
          </>
        )}
      </p>
    </div>
  )
}
