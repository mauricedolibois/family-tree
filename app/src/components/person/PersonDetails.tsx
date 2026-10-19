// src/components/person/PersonDetails.tsx
// Everything about a person at a glance, and the starting point to browse the family.

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
import { MediaImage } from '@/components/ui/MediaImage'
import { errorText } from '@/i18n/errors'
import { useI18n } from '@/i18n/I18nProvider'

type Props = { person: Person; onEdit: () => void; onAdd: (r: Relation) => void }

export function PersonDetails({ person, onEdit, onAdd }: Props) {
  const { tree, index, commit } = useFamily()
  const { meId, setMe, focusOn, showLine, lineId, select, showRelation, relation } = useView()
  const { notify } = useToast()
  const [deleting, setDeleting] = useState(false)
  const { t, locale } = useI18n()

  const kin = meId ? describeKinship(index, meId, person.id) : null
  const parents = parentsOf(index, person.id)
  const spouse = spouseOf(index, person.id)
  const siblings = useMemo(() => sortByBirth(siblingsOf(index, person.id), index.byId), [index, person.id])
  const kids = useMemo(() => sortByBirth(childrenOf(index, person.id), index.byId), [index, person.id])
  const isAdopted = (childId: string) => [person.id, spouse].some((p) => p && index.adopted.get(p)?.has(childId))

  const p = person.profile ?? {}
  const age = ageOf(person)
  const ageText = age ? t.person.ageYears(age.years, age.approx) : null
  const media = p.media ?? []

  /** Relation view: from you to this person, otherwise starting with them */
  const showRelationTo = () => {
    showRelation(meId && meId !== person.id ? { from: meId, to: person.id } : { from: person.id, to: null })
    select(null)
  }

  const remove = async () => {
    if (!window.confirm(t.person.confirmRemove(person.name))) return
    setDeleting(true)
    try {
      await commit(deletePerson(tree, person.id))
      select(null)
      notify({ message: t.person.removed(person.name) })
    } catch (e) {
      if (!(e instanceof TreeConflictError)) notify({ message: errorText(e, t, locale, t.errors.deleteFailed) })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
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
              {kinshipLabel(kin, locale)}
            </p>
          )}
          {meId === person.id && (
            <p className="mt-1 font-serif text-[17px] italic text-gilt-deep">{t.person.thatsYou}</p>
          )}
        </div>
      </div>

      <Flourish className="-my-2" />

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={onEdit} data-tour="edit">
          {t.person.edit}
        </Button>
        {lineId !== person.id && (
          <Button size="sm" icon={<GitBranch className="h-4 w-4" />} onClick={() => showLine(person.id)}>
            {t.person.onlyThisLine}
          </Button>
        )}
        {(!relation || (relation.from !== person.id && relation.to !== person.id)) && (
          <Button size="sm" icon={<Route className="h-4 w-4" />} onClick={showRelationTo}>
            {t.person.showRelation}
          </Button>
        )}
        {meId !== person.id && (
          <Button size="sm" icon={<UserRound className="h-4 w-4" />} onClick={() => setMe(person.id)}>
            {t.person.thatsMe}
          </Button>
        )}
      </div>

      {/* Life dates */}
      <dl className="grid grid-cols-[auto,1fr] gap-x-5 gap-y-2 text-[15px]">
        <Fact
          label={t.person.born}
          value={[formatDate(p.birthDate, locale), p.birthPlace && t.person.bornIn(p.birthPlace)]
            .filter(Boolean)
            .join(' ')}
        />
        <Fact label={t.person.maidenName} value={p.maidenName ?? ''} />
        <Fact
          label={t.person.died}
          value={
            !isDeceased(person)
              ? ''
              : p.deathDate
              ? [formatDate(p.deathDate, locale), age && t.person.diedAtAge(age.years, age.approx)]
                  .filter(Boolean)
                  .join(', ')
              : t.person.diedDateUnknown
          }
        />
        {!isDeceased(person) && ageText && <Fact label={t.person.age} value={ageText} />}
        <Fact label={t.person.city} value={p.city ?? ''} />
        <Fact
          label={t.person.country}
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
        <Fact label={t.person.job} value={p.job ?? ''} />
      </dl>

      {p.comments && (
        <section>
          <h3 className="ornament-heading mb-3">{t.person.notes}</h3>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{p.comments}</p>
        </section>
      )}

      {media.length > 0 && (
        <section>
          <h3 className="ornament-heading mb-3">{t.person.media}</h3>
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
                    <MediaImage src={m.url} alt={m.title ?? ''} />
                  ) : (
                    <span className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-ink-muted">
                      <FileText className="h-6 w-6" />
                      <span className="line-clamp-2 break-all">{m.title ?? t.person.file}</span>
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Family */}
      <section className="flex flex-col gap-4">
        <h3 className="ornament-heading">{t.person.family}</h3>
        <Relatives
          title={t.person.parents}
          ids={parents}
          onOpen={focusOn}
          add={parents.length < 2 ? { label: t.person.addParent, run: () => onAdd('PARENT') } : undefined}
        />
        <Relatives
          title={t.person.spouse}
          ids={spouse ? [spouse] : []}
          onOpen={focusOn}
          add={!spouse ? { label: t.person.addSpouse, run: () => onAdd('SPOUSE') } : undefined}
        />
        <Relatives
          title={t.person.children}
          ids={kids}
          onOpen={focusOn}
          tag={(id) => (isAdopted(id) ? t.person.adopted(index.byId.get(id)?.gender === 'FEMALE') : null)}
          add={{ label: t.person.addChild, run: () => onAdd('CHILD'), tour: 'add-child' }}
        />
        {siblings.length > 0 && <Relatives title={t.person.siblings} ids={siblings} onOpen={focusOn} />}
      </section>

      {canDelete(tree, person.id) && (
        <div className="border-t border-card-rule pt-4">
          <Button variant="danger" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={remove} disabled={deleting}>
            {t.person.remove}
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
