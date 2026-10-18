// src/components/person/PersonDetails.tsx
// Alles über eine Person auf einen Blick – und von hier aus durch die Familie.

import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { ChevronRight, FileText, GitBranch, Pencil, Plus, Route, Trash2, UserRound } from 'lucide-react'
import { childrenOf, parentsOf, siblingsOf, spouseOf, type Person } from '@/family/model'
import { ageOf, formatDate, isDeceased, lifeYears } from '@/family/format'
import { describeKinship, kinshipLabel } from '@/family/kinship'
import { canDelete, deletePerson, type Relation } from '@/family/edit'
import { TreeConflictError, useFamily } from '@/components/app/FamilyProvider'
import { useView } from '@/components/app/ViewProvider'
import { useToast } from '@/components/app/Toast'
import { Portrait } from '@/components/ui/Portrait'
import { CountryFlag } from '@/components/ui/CountryFlag'
import { Button } from '@/components/ui/Button'
import { Flourish } from '@/components/ui/Flourish'

type Props = { person: Person; onEdit: () => void; onAdd: (r: Relation) => void }

export function PersonDetails({ person, onEdit, onAdd }: Props) {
  const { tree, index, commit } = useFamily()
  const { meId, setMe, focusOn, showLine, lineId, select, showRelation, relation } = useView()
  const { notify } = useToast()
  const [deleting, setDeleting] = useState(false)

  const kin = meId ? describeKinship(index, meId, person.id) : null
  const parents = parentsOf(index, person.id)
  const spouse = spouseOf(index, person.id)
  const siblings = useMemo(() => sortByBirth(siblingsOf(index, person.id), index.byId), [index, person.id])
  const kids = useMemo(() => sortByBirth(childrenOf(index, person.id), index.byId), [index, person.id])
  const isAdopted = (childId: string) => [person.id, spouse].some((p) => p && index.adopted.get(p)?.has(childId))

  const p = person.profile ?? {}
  const age = ageOf(person)
  const ageText = age ? `${age.approx ? 'etwa ' : ''}${age.years} Jahre` : null
  const media = p.media ?? []

  /** Beziehungsansicht: von dir zu dieser Person, sonst mit ihr beginnen */
  const showRelationTo = () => {
    showRelation(meId && meId !== person.id ? { from: meId, to: person.id } : { from: person.id, to: null })
    select(null)
  }

  const remove = async () => {
    if (!window.confirm(`${person.name} aus dem Stammbaum entfernen? Der Stand davor wird automatisch gesichert.`))
      return
    setDeleting(true)
    try {
      await commit(deletePerson(tree, person.id))
      select(null)
      notify({ message: `${person.name} wurde entfernt.` })
    } catch (e) {
      if (!(e instanceof TreeConflictError))
        notify({ message: e instanceof Error ? e.message : 'Löschen fehlgeschlagen.' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Kopf */}
      <div className="flex items-center gap-4">
        <span data-tour="portrait">
          <Portrait person={person} size="lg" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[1.75rem] leading-[1.1] text-ink">{person.name}</h2>
          {lifeYears(person) && <p className="mt-0.5 font-serif text-[18px] text-ink-muted">{lifeYears(person)}</p>}
          {kin && (
            <p
              className={clsx(
                'mt-1 font-serif text-[17px] italic',
                kin.byMarriage ? 'text-ink-muted' : 'text-gilt-deep',
              )}
            >
              {kinshipLabel(kin)}
            </p>
          )}
          {meId === person.id && <p className="mt-1 font-serif text-[17px] italic text-gilt-deep">Das bist du</p>}
        </div>
      </div>

      <Flourish className="-my-2" />

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={onEdit} data-tour="edit">
          Bearbeiten
        </Button>
        {lineId !== person.id && (
          <Button size="sm" icon={<GitBranch className="h-4 w-4" />} onClick={() => showLine(person.id)}>
            Nur diese Linie
          </Button>
        )}
        {(!relation || (relation.from !== person.id && relation.to !== person.id)) && (
          <Button size="sm" icon={<Route className="h-4 w-4" />} onClick={showRelationTo}>
            Beziehung zeigen
          </Button>
        )}
        {meId !== person.id && (
          <Button size="sm" icon={<UserRound className="h-4 w-4" />} onClick={() => setMe(person.id)}>
            Das bin ich
          </Button>
        )}
      </div>

      {/* Lebensdaten */}
      <dl className="grid grid-cols-[auto,1fr] gap-x-5 gap-y-2 text-[15px]">
        <Fact label="Geboren" value={formatDate(p.birthDate)} />
        <Fact
          label="Gestorben"
          value={
            isDeceased(person)
              ? [formatDate(p.deathDate), age && `mit ${age.approx ? 'etwa ' : ''}${age.years} Jahren`]
                  .filter(Boolean)
                  .join(', ')
              : ''
          }
        />
        {!isDeceased(person) && ageText && <Fact label="Alter" value={ageText} />}
        <Fact label="Wohnort" value={p.city ?? ''} />
        <Fact
          label="Land"
          value={
            p.country ? (
              <span className="inline-flex items-center gap-2">
                <CountryFlag country={p.country} />
                {p.country}
              </span>
            ) : (
              ''
            )
          }
        />
        <Fact label="Beruf" value={p.job ?? ''} />
      </dl>

      {p.comments && (
        <section>
          <h3 className="ornament-heading mb-3">Notizen</h3>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{p.comments}</p>
        </section>
      )}

      {media.length > 0 && (
        <section>
          <h3 className="ornament-heading mb-3">Fotos und Dokumente</h3>
          <ul className="grid grid-cols-3 gap-2">
            {media.map((m) => (
              <li key={m.id}>
                <a
                  href={m.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block aspect-square overflow-hidden rounded-control border border-card-rule bg-paper-raised"
                  title={m.title ?? undefined}
                >
                  {m.kind === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt={m.title ?? ''} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-ink-muted">
                      <FileText className="h-6 w-6" />
                      <span className="line-clamp-2 break-all">{m.title ?? 'Datei'}</span>
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Familie */}
      <section className="flex flex-col gap-4">
        <h3 className="ornament-heading">Familie</h3>
        <Relatives
          title="Eltern"
          ids={parents}
          onOpen={focusOn}
          add={parents.length < 2 ? { label: 'Elternteil hinzufügen', run: () => onAdd('PARENT') } : undefined}
        />
        <Relatives
          title="Ehepartner"
          ids={spouse ? [spouse] : []}
          onOpen={focusOn}
          add={!spouse ? { label: 'Ehepartner hinzufügen', run: () => onAdd('SPOUSE') } : undefined}
        />
        <Relatives
          title="Kinder"
          ids={kids}
          onOpen={focusOn}
          tag={(id) => (isAdopted(id) ? 'adoptiert' : null)}
          add={{ label: 'Kind hinzufügen', run: () => onAdd('CHILD'), tour: 'add-child' }}
        />
        {siblings.length > 0 && <Relatives title="Geschwister" ids={siblings} onOpen={focusOn} />}
      </section>

      {canDelete(tree, person.id) && (
        <div className="border-t border-card-rule pt-4">
          <Button variant="danger" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={remove} disabled={deleting}>
            Aus dem Stammbaum entfernen
          </Button>
        </div>
      )}
    </div>
  )
}

function sortByBirth(ids: string[], byId: Map<string, Person>) {
  return [...ids].sort((a, b) =>
    (byId.get(a)?.profile?.birthDate ?? '9999').localeCompare(byId.get(b)?.profile?.birthDate ?? '9999'),
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-serif text-[17px] leading-6 text-ink">{value}</dd>
    </>
  )
}

function Relatives({
  title,
  ids,
  onOpen,
  add,
  tag,
}: {
  title: string
  ids: string[]
  onOpen: (id: string) => void
  add?: { label: string; run: () => void; tour?: string }
  tag?: (id: string) => string | null
}) {
  const { index } = useFamily()
  return (
    <div>
      <p className="mb-1.5 text-sm text-ink-muted">{title}</p>
      <ul className="flex flex-col gap-1.5">
        {ids.map((id) => {
          const p = index.byId.get(id)
          if (!p) return null
          const t = tag?.(id)
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onOpen(id)}
                className="flex w-full items-center gap-3 rounded-control border border-card-rule bg-card/70 px-2.5 py-2 text-left transition-colors hover:border-gilt hover:bg-card"
              >
                <Portrait person={p} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-serif text-base font-semibold text-ink">{p.name}</span>
                  <span className="block font-serif text-[14px] text-ink-muted">
                    {[lifeYears(p), t].filter(Boolean).join(', ')}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-ink-faint" />
              </button>
            </li>
          )
        })}
        {add && (
          <li>
            <button
              type="button"
              onClick={add.run}
              data-tour={add.tour}
              className="flex w-full items-center gap-3 rounded-control border border-dashed border-gilt/60 px-2.5 py-2 text-left text-[15px] text-ink-muted transition-colors hover:border-gilt hover:bg-gilt-soft/40 hover:text-ink"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full border border-gilt/50 text-gilt-deep">
                <Plus className="h-4 w-4" />
              </span>
              {add.label}
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}
