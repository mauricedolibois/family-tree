// src/components/manage/ScopeEditor.tsx
// Which part of the tree a viewer or editor gets (family/scope.ts): the whole tree,
// or one person with ancestors, descendants and side lines, as in "only this line".

import { useMemo } from 'react'
import { lifeYears } from '@/family/format'
import { scopeSets, type TreeScope } from '@/family/scope'
import type { Tree } from '@/family/model'
import type { Role } from '@/lib/accounts'
import { useI18n } from '@/i18n/I18nProvider'
import { selectClass } from './parts'

/** Ancestors and descendants offered as fixed numbers; beyond that "all" */
const MAX_OFFERED = 8

/** What a new part starts with: the whole family of the chosen person, their own side lines */
export const newScope = (): TreeScope => ({ person: '', up: null, down: null, side: 1, hideRest: true })

/** Viewers see nothing but their part: a part with the rest visible would change nothing for them */
export const scopeForRole = (scope: TreeScope | null, role: Role): TreeScope | null =>
  role === 'moderator' ? null : scope && role === 'viewer' ? { ...scope, hideRest: true } : scope

/** A part is ready to send once its start person is chosen */
export const scopeReady = (scope: TreeScope | null) => !scope || !!scope.person

export function ScopeEditor({
  tree,
  role,
  value,
  onChange,
}: {
  tree: Tree | null
  role: Role
  value: TreeScope | null
  onChange: (scope: TreeScope | null) => void
}) {
  const { t } = useI18n()
  const a = t.members.access
  const people = useMemo(
    () =>
      Object.values(tree?.members ?? {})
        .map((p) => ({ id: p.id, label: lifeYears(p) ? `${p.name} (${lifeYears(p)})` : p.name }))
        .sort((x, y) => x.label.localeCompare(y.label)),
    [tree],
  )
  const count = useMemo(() => (tree && value?.person ? scopeSets(tree, value).visible.size : null), [tree, value])
  if (role === 'moderator') return null

  const set = (patch: Partial<TreeScope>) => value && onChange({ ...value, ...patch })
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
    <fieldset className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="field-label">{a.label}</span>
        <select
          className={selectClass}
          value={value ? 'part' : 'whole'}
          onChange={(e) => onChange(e.target.value === 'part' ? newScope() : null)}
        >
          <option value="whole">{a.whole}</option>
          <option value="part">{a.part}</option>
        </select>
      </label>
      {value && (
        <>
          <p className="text-sm text-ink-muted">{a.help}</p>
          <label className="flex flex-col gap-1">
            <span className="field-label">{a.from}</span>
            <select className={selectClass} value={value.person} onChange={(e) => set({ person: e.target.value })}>
              <option value="" disabled>
                {a.choose}
              </option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            {generations(value.up, t.scope.ancestors, (up) => set({ up }))}
            {generations(value.down, t.scope.descendants, (down) => set({ down }))}
            <label className="flex flex-col gap-1">
              <span className="field-label">{t.scope.sideLines}</span>
              <select
                className={selectClass}
                value={value.side}
                onChange={(e) => set({ side: Number(e.target.value) as TreeScope['side'] })}
              >
                {([0, 1, 2, 3] as const).map((side) => (
                  <option key={side} value={side}>
                    {t.scope.side[side]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-sm text-ink-muted">
            {t.scope.sideHint[value.side]}{' '}
            {count !== null && <span className="tabular-nums">{t.scope.people(count)}</span>}
          </p>
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
        </>
      )}
    </fieldset>
  )
}
