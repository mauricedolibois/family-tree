// src/components/relation/RelationCard.tsx
// Beziehungsansicht: zwei Personen wählen, Bezeichnung lesen, darunter zeigt der Baum nur den Weg.

import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { ArrowLeftRight } from 'lucide-react'
import type { Person, TreeIndex } from '@/family/model'
import { splitName } from '@/family/format'
import { kinshipSentence, kinshipTitle, type Connection, type Party } from '@/family/kinship'
import { useFamily } from '@/components/app/FamilyProvider'
import { useView, type RelationPick } from '@/components/app/ViewProvider'
import { PersonChip, PersonSearchField } from './PersonPicker'

type Slot = keyof RelationPick

const SLOT_LABEL: Record<Slot, string> = { from: 'Erste Person', to: 'Zweite Person' }

export function RelationCard({ connection, compact }: { connection: Connection | null; compact: boolean }) {
  const { index } = useFamily()
  const { relation, showRelation, meId } = useView()
  const [editing, setEditing] = useState<Slot | null>(null)
  const pick = relation ?? { from: null, to: null }
  const from = pick.from ? index.byId.get(pick.from) ?? null : null
  const to = pick.to ? index.byId.get(pick.to) ?? null : null
  const exclude = useMemo(
    () => [editing === 'from' ? pick.to : pick.from].filter((x): x is string => !!x),
    [editing, pick.from, pick.to],
  )

  const choose = (slot: Slot, id: string) => {
    showRelation({ ...pick, [slot]: id })
    setEditing(null)
  }

  const text = from && to && connection ? describe(index, connection, from, to, meId) : null

  return (
    <section
      aria-label="Beziehung zwischen zwei Personen"
      className="parchment pointer-events-auto relative w-full rounded-card border border-gilt/60 p-3 shadow-card md:w-[380px]"
    >
      {/* Am Handy mit offenem Infoblatt nur eine Zeile, damit der Baum sichtbar bleibt */}
      {compact && from && to && (
        <p className="truncate font-serif text-[15px] text-ink md:hidden">
          <span className="text-ink-muted">
            {shortName(from, to)} und {shortName(to, from)}:
          </span>{' '}
          <span className="font-semibold">{text?.title ?? 'keine Verbindung'}</span>
        </p>
      )}

      <div className={clsx(compact && from && to && 'hidden md:block')}>
        {editing ? (
          <PersonSearchField
            key={editing}
            label={SLOT_LABEL[editing]}
            exclude={exclude}
            onPick={(id) => choose(editing, id)}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <div className="flex items-center gap-1.5">
            <PersonChip person={from} label={SLOT_LABEL.from} onClick={() => setEditing('from')} />
            <button
              type="button"
              onClick={() => showRelation({ from: pick.to, to: pick.from })}
              disabled={!from && !to}
              aria-label="Personen tauschen"
              title="Personen tauschen"
              className="grid h-10 w-9 shrink-0 place-items-center rounded-full text-gilt-deep hover:bg-gilt-soft/50 disabled:opacity-40"
            >
              <ArrowLeftRight className="h-[18px] w-[18px]" />
            </button>
            <PersonChip person={to} label={SLOT_LABEL.to} onClick={() => setEditing('to')} />
          </div>
        )}

        <div aria-live="polite" className="mt-3 border-t border-card-rule pt-2.5">
          {text ? (
            <>
              <p className="font-display text-[1.45rem] leading-[1.15] text-ink">{text.title}</p>
              {text.note && <p className="font-serif text-[16px] italic leading-snug text-ink-muted">{text.note}</p>}
              <p className="mt-1.5 font-serif text-[16px] leading-snug text-ink">{text.forward}</p>
              {text.backward && <p className="font-serif text-[16px] leading-snug text-ink-muted">{text.backward}</p>}
              {text.common && <p className="mt-1.5 text-sm leading-snug text-ink-muted">{text.common}</p>}
            </>
          ) : from && to ? (
            <p className="font-serif text-[16px] leading-snug text-ink-muted">
              Im Stammbaum gibt es keine Verbindung zwischen {from.name} und {to.name}.
            </p>
          ) : (
            <p className="font-serif text-[16px] leading-snug text-ink-muted">
              Tippe zwei Personen im Baum an oder suche sie oben.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

/** Vorname reicht – außer beide heißen gleich */
function shortName(p: Person, other: Person): string {
  const a = splitName(p.name).given || p.name
  const b = splitName(other.name).given || other.name
  return a === b ? p.name : a
}

function describe(ix: TreeIndex, c: Connection, from: Person, to: Person, meId: string | null) {
  const party = (p: Person, other: Person): Party => (p.id === meId ? 'you' : { name: shortName(p, other) })
  const { title, note } = c.detour !== null ? { title: detourTitle(c.detour), note: '' } : kinshipTitle(c.kinship)
  const forward = kinshipSentence(c.kinship, party(to, from), party(from, to))
  const backward = kinshipSentence(c.reverse, party(from, to), party(to, from))
  // Gleiche Bezeichnung in beide Richtungen (z. B. zwei Cousins): ein Satz genügt
  const same = c.reverse.term === c.kinship.term && kinshipTitle(c.reverse).title === kinshipTitle(c.kinship).title
  // Wie in der Ahnentafel: Mann zuerst
  const common = c.common
    .map((id) => ix.byId.get(id))
    .filter((p): p is Person => !!p)
    .sort((a, b) => (a.gender === b.gender ? 0 : a.gender === 'MALE' ? -1 : 1))
  return {
    title,
    note,
    forward: same ? `${forward.slice(0, -1)} – und umgekehrt.` : forward,
    backward: same ? null : backward,
    common: common.length ? `${commonLabel(common)}: ${common.map((p) => p.name).join(' und ')}` : null,
  }
}

function commonLabel(common: Person[]) {
  if (common.length > 1) return 'Gemeinsame Vorfahren'
  return common[0].gender === 'FEMALE' ? 'Gemeinsame Vorfahrin' : 'Gemeinsamer Vorfahr'
}

function detourTitle(n: number) {
  return n <= 1 ? 'Über eine Ecke verbunden' : `Über ${n} Ecken verbunden`
}
