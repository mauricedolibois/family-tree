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
import { sideOptions } from '@/components/tree/LineScopeCard'
import { useLang } from '@/i18n/lang'

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
  const { t, lang } = useLang()
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
    () => (selection ? describeLineScope(selection.scope, lineDepth(index, selection.personId), lang) : null),
    [selection, index, lang],
  )

  const renew = async () => {
    const ok = window.confirm(
      t(
        'Neuen Link erzeugen? Wer den alten abonniert hat, bekommt danach keine Geburtstage mehr.',
        'Create a new link? Anyone subscribed to the old one will stop getting birthdays.',
      ),
    )
    if (!ok) return
    const r = await fetch('/api/kalender/link', { method: 'POST' })
    if (!r.ok)
      return notify({ message: t('Der neue Link konnte nicht erzeugt werden.', 'The new link could not be created.') })
    setPath(((await r.json()) as { path: string }).path)
    notify({
      message: t(
        'Neuer Link erzeugt. Der alte funktioniert nicht mehr.',
        'New link created. The old one no longer works.',
      ),
    })
  }

  const href = path ? `${path}${calendarQuery(selection, lang)}` : null
  const host = typeof window !== 'undefined' ? window.location.host : ''
  const https = `https://${host}${href ?? ''}`
  const webcal = `webcal://${host}${href ?? ''}`
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(https)
      notify({ message: t('Link kopiert.', 'Link copied.') })
    } catch {
      window.prompt(t('Link zum Kopieren:', 'Link to copy:'), https)
    }
  }

  const linkButton =
    'inline-flex h-10 items-center justify-center gap-2 rounded-control border border-card-rule bg-card px-3 text-sm font-medium text-ink hover:border-gilt'
  const disabled = !href && 'pointer-events-none opacity-50'

  return (
    <div className="flex flex-col gap-2.5 text-left">
      {intro && (
        <p className="font-serif text-[15px] leading-snug text-ink">
          {t(
            'Die Geburtstage in deinem Kalender, mit Erinnerung am Morgen. Neue Einträge kommen von selbst dazu.',
            'Birthdays in your calendar, with a reminder in the morning. New entries appear automatically.',
          )}
        </p>
      )}

      {person && (
        <Segmented<Whom>
          dense
          label={t('Welche Geburtstage?', 'Which birthdays?')}
          value={whom}
          onChange={setWhom}
          options={[
            { value: 'line', label: t('Meine Linie', 'My line') },
            { value: 'all', label: t('Ganze Familie', 'Whole family') },
          ]}
        />
      )}
      {selection && (
        <Segmented
          dense
          label={t('Seitenlinien', 'Side branches')}
          value={`${side}`}
          options={sideOptions(t)}
          onChange={(v) => setSide(Number(v) as LineScope['side'])}
        />
      )}
      <p className="text-[13px] leading-snug text-ink-muted">
        {scopeText ? `${scopeText} – ` : t('Aus der ganzen Familie: ', 'From the whole family: ')}
        <span className="tabular-nums">
          {count === 1 ? t('1 Geburtstag', '1 birthday') : t(`${count} Geburtstage`, `${count} birthdays`)}
        </span>
        .
      </p>

      {failed ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
          {t('Der Kalender-Link konnte nicht geladen werden.', 'The calendar link could not be loaded.')}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <a href={webcal} className={clsx(linkButton, disabled)}>
              iPhone &amp; Mac
            </a>
            <a href={google} target="_blank" rel="noreferrer" className={clsx(linkButton, disabled)}>
              {t('Google Kalender', 'Google Calendar')}
            </a>
          </div>
          <button type="button" onClick={copy} disabled={!href} className={clsx(linkButton, 'w-full', disabled)}>
            <Copy className="h-4 w-4" aria-hidden />
            {t('Link kopieren (Outlook und andere)', 'Copy link (Outlook and others)')}
          </button>
        </div>
      )}

      <p className="text-[13px] leading-snug text-ink-faint">
        {t('Wer den Link hat, sieht Namen und Geburtstage.', 'Anyone with the link can see names and birthdays.')}
        {allowRenew && path && (
          <>
            {' '}
            <button
              type="button"
              onClick={renew}
              className="underline decoration-gilt/60 underline-offset-2 hover:text-ink"
            >
              {t('Neuen Link erzeugen', 'Create a new link')}
            </button>
          </>
        )}
      </p>
    </div>
  )
}
