// src/components/relation/RelationCard.tsx
// Relation view: pick two people, read how they are related; the tree below shows only the path.

import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { ArrowLeftRight } from 'lucide-react'
import type { Person, TreeIndex } from '@/family/model'
import { splitName } from '@/family/format'
import { kinshipSentence, kinshipTitle, sameKinship, type Connection, type Party } from '@/family/kinship'
import { useFamily } from '@/components/app/FamilyProvider'
import { useView, type RelationPick } from '@/components/app/ViewProvider'
import { PersonChip, PersonSearchField } from './PersonPicker'
import { DEFAULT_LOCALE, type Locale } from '@/i18n/locales'
import { MESSAGES } from '@/i18n/messages'
import { useI18n } from '@/i18n/I18nProvider'

type Slot = keyof RelationPick

export function RelationCard({ connection, compact }: { connection: Connection | null; compact: boolean }) {
  const { index } = useFamily()
  const { relation, showRelation, meId } = useView()
  const [editing, setEditing] = useState<Slot | null>(null)
  const { t, locale } = useI18n()
  const pick = relation ?? { from: null, to: null }
  const from = pick.from ? (index.byId.get(pick.from) ?? null) : null
  const to = pick.to ? (index.byId.get(pick.to) ?? null) : null
  const exclude = useMemo(
    () => [editing === 'from' ? pick.to : pick.from].filter((x): x is string => !!x),
    [editing, pick.from, pick.to],
  )

  const choose = (slot: Slot, id: string) => {
    showRelation({ ...pick, [slot]: id })
    setEditing(null)
  }

  const slotLabel = { from: t.relation.first, to: t.relation.second }
  const text = from && to && connection ? describeRelation(index, connection, from, to, meId, locale) : null

  return (
    <section
      aria-label={t.relation.cardLabel}
      className="surface pointer-events-auto relative w-full rounded-card border border-frame/60 p-3 shadow-card md:w-[380px]"
    >
      {/* On phones with the info sheet open, a single row keeps the tree visible */}
      {compact && from && to && (
        <p className="truncate font-text text-[15px] text-ink md:hidden">
          <span className="text-ink-muted">{t.relation.pair(shortName(from, to), shortName(to, from))}:</span>{' '}
          <span className="font-semibold">{text?.title ?? t.relation.noConnectionShort}</span>
        </p>
      )}

      <div className={clsx(compact && from && to && 'hidden md:block')}>
        {editing ? (
          <PersonSearchField
            key={editing}
            label={slotLabel[editing]}
            exclude={exclude}
            onPick={(id) => choose(editing, id)}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <div className="flex items-center gap-1.5">
            <PersonChip person={from} label={slotLabel.from} onClick={() => setEditing('from')} />
            <button
              type="button"
              onClick={() => showRelation({ from: pick.to, to: pick.from })}
              disabled={!from && !to}
              aria-label={t.relation.swap}
              title={t.relation.swap}
              className="grid h-10 w-9 shrink-0 place-items-center rounded-full text-accent-deep hover:bg-accent-soft/50 disabled:opacity-40"
            >
              <ArrowLeftRight className="h-[18px] w-[18px]" />
            </button>
            <PersonChip person={to} label={slotLabel.to} onClick={() => setEditing('to')} tour="relation-to" />
          </div>
        )}

        <div aria-live="polite" className="mt-3 border-t border-card-rule pt-2.5">
          {text ? (
            <div data-tour="relation-result">
              <p className="font-display text-[1.45rem] leading-[1.15] text-ink">{text.title}</p>
              {text.note && <p className="font-text text-[16px] italic leading-snug text-ink-muted">{text.note}</p>}
              <p className="mt-1.5 font-text text-[16px] leading-snug text-ink">{text.forward}</p>
              {text.backward && <p className="font-text text-[16px] leading-snug text-ink-muted">{text.backward}</p>}
              {text.common && <p className="mt-1.5 text-sm leading-snug text-ink-muted">{text.common}</p>}
            </div>
          ) : from && to ? (
            <p className="font-text text-[16px] leading-snug text-ink-muted" data-tour="relation-result">
              {t.relation.noConnection(from.name, to.name)}
            </p>
          ) : (
            <p className="font-text text-[16px] leading-snug text-ink-muted">{t.relation.hint}</p>
          )}
        </div>
      </div>
    </section>
  )
}

/** First name is enough unless both share it */
function shortName(p: Person, other: Person): string {
  const a = splitName(p.name).given || p.name
  const b = splitName(other.name).given || other.name
  return a === b ? p.name : a
}

/** Heading, sentences in both directions and common ancestors; with `meId` from your point of view ("dein Cousin") */
export function describeRelation(
  ix: TreeIndex,
  c: Connection,
  from: Person,
  to: Person,
  meId: string | null,
  locale: Locale = DEFAULT_LOCALE,
) {
  const t = MESSAGES[locale].relation
  const party = (p: Person, other: Person): Party => (p.id === meId ? 'you' : { name: shortName(p, other) })
  const { title, note } = c.detour !== null ? { title: t.detour(c.detour), note: '' } : kinshipTitle(c.kinship, locale)
  const forward = kinshipSentence(c.kinship, party(to, from), party(from, to), locale)
  const backward = kinshipSentence(c.reverse, party(from, to), party(to, from), locale)
  // Same term both ways (e.g. two cousins): one sentence is enough
  const same = sameKinship(c.reverse, c.kinship)
  // As in a pedigree chart: husband first
  const common = c.common
    .map((id) => ix.byId.get(id))
    .filter((p): p is Person => !!p)
    .sort((a, b) => (a.gender === b.gender ? 0 : a.gender === 'MALE' ? -1 : 1))
  return {
    title,
    note,
    forward: same ? t.viceVersa(forward.slice(0, -1)) : forward,
    backward: same ? null : backward,
    common: common.length
      ? `${common.length > 1 ? t.commonAncestors : t.commonAncestor(common[0].gender === 'FEMALE')}: ${t.names(
          common.map((p) => p.name),
        )}`
      : null,
  }
}
