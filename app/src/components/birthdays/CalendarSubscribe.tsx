// src/components/birthdays/CalendarSubscribe.tsx
//
// Birthdays as a calendar subscription: for iPhone/Mac, Google, or as a link to copy.
// Either the whole family or just one's own line; person and scope are link
// parameters (see src/family/calendarLink.ts).
// Shown under "Upcoming birthdays" and at the end of the guided tour.

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
import { useI18n } from '@/i18n/I18nProvider'

type Whom = 'line' | 'all'

export function CalendarSubscribe({
  personId,
  intro = true,
  allowRenew = false,
}: {
  /** Whose line can be chosen; without a person only the whole family */
  personId: string | null
  /** Intro sentence (the tour already explains it) */
  intro?: boolean
  /** Offer "create new link" */
  allowRenew?: boolean
}) {
  const { tree, index, treeId, canEdit } = useFamily()
  const { lineScope } = useView()
  const { notify } = useToast()
  const { t, locale } = useI18n()
  const person = personId ? index.byId.get(personId) : undefined

  const [whom, setWhom] = useState<Whom>(person ? 'line' : 'all')
  const [side, setSide] = useState<LineScope['side']>(lineScope.side)
  const [path, setPath] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetch(`/api/trees/${treeId}/calendar`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { path: string }) => setPath(d.path))
      .catch(() => setFailed(true))
  }, [treeId])

  // Ancestors and descendants as set under "Meine Linie"; collateral lines chosen here
  const selection = useMemo<CalendarSelection | null>(
    () => (person && whom === 'line' ? { personId: person.id, scope: { ...lineScope, side } } : null),
    [person, whom, lineScope, side],
  )
  const count = useMemo(() => upcomingBirthdays(calendarSubset(tree, selection).tree).length, [tree, selection])
  const scopeText = useMemo(
    () => (selection ? describeLineScope(selection.scope, lineDepth(index, selection.personId), locale) : null),
    [selection, index, locale],
  )

  const renew = async () => {
    if (!window.confirm(t.subscribe.confirmRenew)) return
    const r = await fetch(`/api/trees/${treeId}/calendar`, { method: 'POST' })
    if (!r.ok) return notify({ message: t.subscribe.renewFailed })
    setPath(((await r.json()) as { path: string }).path)
    notify({ message: t.subscribe.renewed })
  }

  const href = path ? `${path}${calendarQuery(selection, locale)}` : null
  const host = typeof window !== 'undefined' ? window.location.host : ''
  const https = `https://${host}${href ?? ''}`
  const webcal = `webcal://${host}${href ?? ''}`
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(https)
      notify({ message: t.subscribe.copied })
    } catch {
      window.prompt(t.subscribe.copyPrompt, https)
    }
  }

  const linkButton =
    'inline-flex h-10 items-center justify-center gap-2 rounded-control border border-card-rule bg-card px-3 text-sm font-medium text-ink hover:border-gilt'
  const disabled = !href && 'pointer-events-none opacity-50'

  return (
    <div className="flex flex-col gap-2.5 text-left">
      {intro && <p className="font-serif text-[15px] leading-snug text-ink">{t.subscribe.intro}</p>}

      {person && (
        <Segmented<Whom>
          dense
          label={t.subscribe.which}
          value={whom}
          onChange={setWhom}
          options={[
            { value: 'line', label: t.subscribe.myLine },
            { value: 'all', label: t.subscribe.wholeFamily },
          ]}
        />
      )}
      {selection && (
        <Segmented
          dense
          label={t.subscribe.sideLines}
          value={`${side}`}
          options={sideOptions(t)}
          onChange={(v) => setSide(Number(v) as LineScope['side'])}
        />
      )}
      <p className="text-[13px] leading-snug text-ink-muted">
        {scopeText ? `${scopeText} – ` : t.subscribe.fromWholeFamily}
        <span className="tabular-nums">{t.subscribe.count(count)}</span>.
      </p>

      {failed ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{t.subscribe.loadFailed}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <a href={webcal} className={clsx(linkButton, disabled)}>
              {t.subscribe.apple}
            </a>
            <a href={google} target="_blank" rel="noreferrer" className={clsx(linkButton, disabled)}>
              {t.subscribe.google}
            </a>
          </div>
          <button type="button" onClick={copy} disabled={!href} className={clsx(linkButton, 'w-full', disabled)}>
            <Copy className="h-4 w-4" aria-hidden />
            {t.subscribe.copy}
          </button>
        </div>
      )}

      <p className="text-[13px] leading-snug text-ink-faint">
        {t.subscribe.privacy}
        {allowRenew && canEdit && path && (
          <>
            {' '}
            <button
              type="button"
              onClick={renew}
              className="underline decoration-gilt/60 underline-offset-2 hover:text-ink"
            >
              {t.subscribe.renew}
            </button>
          </>
        )}
      </p>
    </div>
  )
}
