// src/components/manage/ScopeEditor.tsx
// Which part of the tree a viewer or editor gets (family/scope.ts): the whole tree,
// or one or more blood lines (a person with ancestors, descendants and, if chosen,
// side lines), with a preview of who the member sees, edits and finds locked.

import { useMemo, useState } from 'react'
import { Flag, GitBranch, Plus, UserRound, X } from 'lucide-react'
import { lifeYears } from '@/family/format'
import { linePeople, MAX_LINES, withLine, type BloodLine, type TreeScope } from '@/family/scope'
import type { Tree } from '@/family/model'
import type { Role } from '@/lib/accounts'
import { useI18n } from '@/i18n/I18nProvider'
import { selectClass } from './parts'
import { RightsHelp, ScopeChanges, ScopePreview, type ScopeActions } from './ScopePreview'
import { InfoTip } from '@/components/ui/InfoTip'

/** Ancestors and descendants offered as fixed numbers; beyond that "all" */
const MAX_OFFERED = 8
/** Matches shown while searching a person */
const MATCHES = 8

/**
 * What a new part starts with: no line yet, or the whole blood line of this person
 * with their siblings (someone who married in adds their own brothers and
 * sisters); the rest hidden
 */
export const newScope = (person?: string): TreeScope => ({
  lines: person ? [{ person, up: null, down: null, side: 1 }] : [],
  stops: [],
  unlock: [],
  lock: [],
  hideRest: true,
})

/** Viewers see nothing but their part: a part with the rest visible would change nothing for them */
export const scopeForRole = (scope: TreeScope | null, role: Role): TreeScope | null =>
  role === 'moderator' ? null : scope && role === 'viewer' ? { ...scope, hideRest: true } : scope

/** A part is ready to send once it has a line */
export const scopeReady = (scope: TreeScope | null) => !scope || scope.lines.length > 0

export function ScopeEditor({
  tree,
  role,
  value,
  onChange,
  before,
}: {
  tree: Tree | null
  role: Role
  value: TreeScope | null
  onChange: (scope: TreeScope | null) => void
  /** The part saved so far, to show what changes; left out for a new invitation */
  before?: TreeScope | null
}) {
  const { t } = useI18n()
  const a = t.members.access
  if (role === 'moderator') return null

  const set = (patch: Partial<TreeScope>) => value && onChange({ ...value, ...patch })
  const setLine = (i: number, patch: Partial<BloodLine>) =>
    value && set({ lines: value.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  const put = (list: string[], id: string, on: boolean) => [...list.filter((x) => x !== id), ...(on ? [id] : [])]
  const actions: ScopeActions = {
    addLine: (person) => value && onChange(withLine(value, person)),
    removeLine: (person) => value && set({ lines: value.lines.filter((l) => l.person !== person) }),
    toggleStop: (person) => value && set({ stops: toggle(value.stops, person) }),
    setExceptions: (person, { lock, unlock }) =>
      value && set({ lock: put(value.lock, person, lock), unlock: put(value.unlock, person, unlock) }),
  }
  const name = (id: string) => tree?.members[id]?.name ?? '?'
  const shown = scopeForRole(value, role)

  const generations = (current: number | null, label: string, apply: (v: number | null) => void) => (
    <label className="flex flex-col gap-1">
      <span className="field-label">{label}</span>
      <select
        className={selectClass}
        value={current === null ? 'all' : String(current)}
        onChange={(e) => apply(e.target.value === 'all' ? null : Number(e.target.value))}
      >
        <option value="all">{a.all}</option>
        {Array.from({ length: MAX_OFFERED + 1 }, (_, n) => (
          <option key={n} value={n}>
            {t.format.generations(n)}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="field-label flex items-center gap-1">
          {a.label}
          <InfoTip label={a.modesTitle} wide>
            <span className="block font-semibold">{a.modesTitle}</span>
            {a.modes.map((m) => (
              <span key={m.title} className="mt-2 block">
                <span className="block font-semibold">{m.title}</span>
                <span className="block">{m.text}</span>
                <span className="block italic text-ink-muted">{m.example}</span>
              </span>
            ))}
          </InfoTip>
        </span>
        <select
          aria-label={a.label}
          className={selectClass}
          value={value ? 'part' : 'whole'}
          onChange={(e) => onChange(e.target.value === 'part' ? before ?? newScope() : null)}
        >
          <option value="whole">{a.whole}</option>
          <option value="part">{a.part}</option>
        </select>
      </div>
      {value && (
        <>
          <p className="text-sm text-ink-muted">{a.linesHint}</p>
          {value.lines.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="field-label flex items-center gap-1">
                {a.lines}
                <RightsHelp />
              </span>
              {value.lines.map((l, i) => (
                <div key={l.person} className="flex flex-col gap-2 rounded-control border border-accent/60 bg-card p-3">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 shrink-0 text-accent-deep" />
                    <span className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
                      {a.lineOf(name(l.person))}
                    </span>
                    {value.lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => actions.removeLine(l.person)}
                        aria-label={a.removeLine(name(l.person))}
                        title={a.removeLine(name(l.person))}
                        className="grid h-8 w-8 place-items-center rounded-full text-ink-muted hover:bg-canvas-raised hover:text-danger"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {generations(l.up, t.scope.ancestors, (up) => setLine(i, { up }))}
                    {generations(l.down, t.scope.descendants, (down) => setLine(i, { down }))}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="field-label flex items-center gap-1">
                      {t.scope.sideLines}
                      <InfoTip label={a.sideTitle} wide>
                        <span className="block font-semibold">{a.sideTitle}</span>
                        {([0, 1, 2, 3] as const).map((side) => (
                          <span key={side} className="mt-2 block">
                            <span className="block font-semibold">{t.scope.side[side]}</span>
                            <span className="block">{t.scope.sideHint[side]}</span>
                            <span className="block italic text-ink-muted">{a.sideExample[side]}</span>
                          </span>
                        ))}
                      </InfoTip>
                    </span>
                    <select
                      aria-label={t.scope.sideLines}
                      className={selectClass}
                      value={l.side ?? 0}
                      onChange={(e) => {
                        const side = Number(e.target.value)
                        setLine(i, { side: side ? (side as 1 | 2 | 3) : undefined })
                      }}
                    >
                      {([0, 1, 2, 3] as const).map((side) => (
                        <option key={side} value={side}>
                          {t.scope.side[side]}
                        </option>
                      ))}
                    </select>
                    <span className="text-sm text-ink-muted">{t.scope.sideHint[l.side ?? 0]}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {value.lines.length < MAX_LINES && (
            <PersonSearch
              tree={tree}
              label={value.lines.length ? a.addLine : a.firstLine}
              exclude={linePeople(value)}
              onPick={actions.addLine}
            />
          )}
          {value.stops.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="field-label">{a.stops}</span>
              {value.stops.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => actions.toggleStop(s)}
                  title={a.unstop(name(s))}
                  className="inline-flex items-center gap-1.5 rounded-full border border-card-rule bg-card px-2.5 py-1 text-sm text-ink hover:border-danger"
                >
                  <Flag className="h-3.5 w-3.5" />
                  {name(s)}
                  <X className="h-3.5 w-3.5 text-ink-muted" />
                </button>
              ))}
            </div>
          )}
          {role === 'editor' ? (
            <label className="flex items-start gap-2 text-[15px] text-ink">
              <input
                type="checkbox"
                className="mt-1"
                checked={value.hideRest}
                onChange={(e) => set({ hideRest: e.target.checked })}
              />
              <span>
                {a.hideRest}
                <span className="block text-sm text-ink-muted">{a.hideRestHint}</span>
              </span>
            </label>
          ) : (
            <p className="text-sm text-ink-muted">{a.viewerHint}</p>
          )}
          <p className="text-sm text-ink-muted">{a.spouseHint}</p>
          {tree && shown && shown.lines.length > 0 && <ScopePreview tree={tree} scope={shown} actions={actions} />}
        </>
      )}
      {tree && before !== undefined && scopeReady(value) && <ScopeChanges tree={tree} before={before} after={shown} />}
    </fieldset>
  )
}

/** Finding a person by name: for a new line, or who someone is in the tree */
export function PersonSearch({
  tree,
  label,
  exclude,
  onPick,
  kind = 'line',
}: {
  tree: Tree | null
  label: string
  exclude: Set<string>
  onPick: (id: string) => void
  kind?: 'line' | 'person'
}) {
  const Icon = kind === 'line' ? GitBranch : UserRound
  const { t } = useI18n()
  const a = t.members.access
  const [query, setQuery] = useState('')
  const people = useMemo(
    () =>
      Object.values(tree?.members ?? {})
        .map((p) => ({ id: p.id, name: p.name, years: lifeYears(p) }))
        .sort((x, y) => x.name.localeCompare(y.name)),
    [tree],
  )
  const q = query.trim().toLowerCase()
  const matches = q
    ? people.filter((p) => !exclude.has(p.id) && p.name.toLowerCase().includes(q)).slice(0, MATCHES)
    : []
  const pick = (id: string) => {
    onPick(id)
    setQuery('')
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className="field-label">{label}</span>
        <span className="relative">
          <Plus className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            className="field h-9 w-full pl-8 text-sm"
            placeholder={a.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches[0]) {
                e.preventDefault()
                pick(matches[0].id)
              }
            }}
          />
        </span>
      </label>
      {q && (
        <ul className="flex flex-col rounded-control border border-card-rule bg-card py-1">
          {matches.length === 0 ? (
            <li className="px-3 py-1.5 text-sm text-ink-muted">{a.noMatch}</li>
          ) : (
            matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => pick(p.id)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[15px] text-ink hover:bg-accent-soft/50"
                >
                  <Icon className="h-4 w-4 text-accent-deep" />
                  {p.name}
                  {p.years && <span className="text-sm text-ink-muted">({p.years})</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
