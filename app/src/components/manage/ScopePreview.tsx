// src/components/manage/ScopePreview.tsx
// What a part of the tree gives a member, before it is saved (family/scope.ts): a
// small tree with every person's level (edit, details only, view), and a list that
// says why. Tapping a person offers to change their level, to add their blood line
// or to end the part there. Big trees open in full screen.

import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchContentRef } from 'react-zoom-pan-pinch'
import { Expand, Eye, Flag, Focus, GitBranch, Lock, Minus, PenLine, Pencil, Plus, Shrink, X } from 'lucide-react'
import { lifeYears } from '@/family/format'
import type { Tree } from '@/family/model'
import {
  describeScope,
  diffScopes,
  linePeople,
  startOf,
  type LockReason,
  type ScopeEntry,
  type ScopeStatus,
  type TreeScope,
} from '@/family/scope'
import { Connectors } from '@/components/tree/Connectors'
import { PersonCard, type CardState } from '@/components/tree/PersonCard'
import { useTreeLayout } from '@/components/tree/useTreeLayout'
import { BUTTON_FACTOR, useWheelZoom, zoomBy } from '@/components/tree/zoom'
import { Button } from '@/components/ui/Button'
import { InfoTip } from '@/components/ui/InfoTip'
import { useI18n } from '@/i18n/I18nProvider'

/** How far the preview zooms out and in */
const LIMITS = { min: 0.05, max: 1.6 }

/** Names shown in a sentence before "and n more" */
const NAMES_SHOWN = 4

export type ScopeActions = {
  addLine: (personId: string) => void
  removeLine: (personId: string) => void
  toggleStop: (personId: string) => void
  /** Exceptions for one person: only to see (lock), details only (unlock), or neither */
  setExceptions: (personId: string, exceptions: { lock: boolean; unlock: boolean }) => void
}

/** What a member may do with a person of their part */
export type Level = 'edit' | 'details' | 'view'

const levelOf = (e: ScopeEntry): Level => (e.status === 'locked' ? 'view' : e.detailsOnly ? 'details' : 'edit')

const LEVEL_ICON = { edit: Pencil, details: PenLine, view: Lock } as const

/** The three levels with an example each, behind an "i" */
export function RightsHelp() {
  const { t } = useI18n()
  const r = t.members.rights
  return (
    <InfoTip label={r.title} wide>
      <span className="block font-semibold">{r.title}</span>
      <span className="mt-1 block text-ink-muted">{r.intro}</span>
      {(['edit', 'details', 'view'] as const).map((level) => {
        const Icon = LEVEL_ICON[level]
        return (
          <span key={level} className="mt-2 flex gap-2">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent-deep" />
            <span>
              <span className="block font-semibold">{r.levels[level].title}</span>
              <span className="block">{r.levels[level].text}</span>
              <span className="block italic text-ink-muted">{r.levels[level].example}</span>
            </span>
          </span>
        )
      })}
      <span className="mt-2 block text-ink-muted">{r.outro}</span>
    </InfoTip>
  )
}

/** "Hans, Ute and 3 more", for reasons and changes */
export function useNames(tree: Tree) {
  const { t } = useI18n()
  return (ids: string[]) => {
    const names = ids.slice(0, NAMES_SHOWN).map((id) => tree.members[id]?.name ?? '?')
    const rest = ids.length - names.length
    return rest > 0 ? `${names.join(', ')} ${t.members.preview.more(rest)}` : names.join(', ')
  }
}

/** Why someone is locked, in words */
function useReasonText(tree: Tree) {
  const { t } = useI18n()
  const p = t.members.preview
  const names = useNames(tree)
  return (reason: LockReason) =>
    reason.kind === 'spouse' || reason.kind === 'manual'
      ? p.reason[reason.kind]
      : p.reason[reason.kind](names(reason.via))
}

export function ScopePreview({ tree, scope, actions }: { tree: Tree; scope: TreeScope; actions: ScopeActions }) {
  const { t } = useI18n()
  const p = t.members.preview
  const described = useMemo(() => describeScope(tree, scope), [tree, scope])
  const [selected, setSelected] = useState<string | null>(null)
  const [full, setFull] = useState(false)
  const count = (...s: ScopeStatus[]) => [...described.values()].filter((e) => s.includes(e.status)).length
  const levels = [...described.values()].filter((e) => e.status === 'editable' || e.status === 'locked').map(levelOf)
  const at = (level: Level) => levels.filter((l) => l === level).length
  const sees = count('editable', 'locked', ...(scope.hideRest ? [] : (['readonly'] as const)))
  const notShared = count('hidden', 'readonly')

  // Full screen: Escape leaves it, and the page behind does not scroll
  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
    }
  }, [full])

  const summary = (
    <p className="text-[15px] text-ink">
      {p.sentence(sees, at('edit'), at('details'), at('view'))}{' '}
      {notShared > 0 && <span className="text-ink-muted">{p.notShared(notShared)}</span>}
    </p>
  )
  const miniTree = (
    <MiniTree
      tree={tree}
      scope={scope}
      described={described}
      selected={selected}
      onSelect={setSelected}
      full={full}
      onFull={setFull}
    />
  )
  const details =
    selected && described.get(selected) ? (
      <Selected
        tree={tree}
        scope={scope}
        id={selected}
        entry={described.get(selected)!}
        actions={actions}
        onClose={() => setSelected(null)}
      />
    ) : (
      <p className="text-sm text-ink-muted">{p.tapHint}</p>
    )

  if (full) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={p.title}
        className="page-backdrop fixed inset-0 z-[80] flex flex-col bg-canvas"
      >
        <div className="flex items-start gap-3 border-b border-card-rule px-3 py-2 sm:px-5">
          <div className="min-w-0 flex-1">
            <h3 className="section-heading flex items-center gap-1">
              {p.title}
              <RightsHelp />
            </h3>
            {summary}
          </div>
          <Button size="sm" icon={<Shrink className="h-4 w-4" />} onClick={() => setFull(false)}>
            {p.exitFullscreen}
          </Button>
        </div>
        {/* The tree takes the room; the tapped person beside it, or below it on phones */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="min-h-0 flex-1 p-2 sm:p-3">{miniTree}</div>
          <div className="flex max-h-[45%] flex-col gap-3 overflow-y-auto border-t border-card-rule p-3 lg:max-h-none lg:w-96 lg:border-l lg:border-t-0">
            {details}
            <Legend />
          </div>
        </div>
      </div>
    )
  }

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-control border border-card-rule bg-canvas-raised/40 p-3">
      <div>
        <h3 className="section-heading flex items-center gap-1">
          {p.title}
          <RightsHelp />
        </h3>
        <div className="mt-1">{summary}</div>
      </div>
      {miniTree}
      <Legend />
      {details}
      <PeopleList tree={tree} scope={scope} described={described} onSelect={setSelected} />
    </section>
  )
}

// Selection gets its own mark (CardMarks): the selected look is the accent colour,
// the same as a line's frame, and a selected person looked like a line of their own
const cardState = (status: ScopeStatus): CardState => (status === 'editable' || status === 'locked' ? 'line' : 'dimmed')

function MiniTree({
  tree,
  scope,
  described,
  selected,
  onSelect,
  full,
  onFull,
}: {
  tree: Tree
  scope: TreeScope
  described: Map<string, ScopeEntry>
  selected: string | null
  onSelect: (id: string | null) => void
  full: boolean
  onFull: (full: boolean) => void
}) {
  const { t } = useI18n()
  const p = t.members.preview
  const start = startOf(scope)
  const { layout } = useTreeLayout(tree, start || null)
  const api = useRef<ReactZoomPanPinchContentRef | null>(null)
  const box = useRef<HTMLDivElement | null>(null)
  // In full screen the wheel zooms; on the page it scrolls the page past the preview
  useWheelZoom(api, LIMITS, full)
  const owners = linePeople(scope)
  const stops = new Set(scope.stops)
  const part = useMemo(
    () => new Set([...described].filter(([, e]) => e.status === 'editable' || e.status === 'locked').map(([id]) => id)),
    [described],
  )

  const fit = (time = 0) => {
    const el = box.current
    if (!layout || !el || !api.current) return
    const scale = Math.min(1, (el.clientWidth / layout.width) * 0.94, (el.clientHeight / layout.height) * 0.94)
    api.current.setTransform(
      (el.clientWidth - layout.width * scale) / 2,
      (el.clientHeight - layout.height * scale) / 2,
      scale,
      time,
    )
  }
  // Fit again whenever the layout or the box size changes
  useEffect(() => {
    fit()
    const el = box.current
    if (!el) return
    const observer = new ResizeObserver(() => fit())
    observer.observe(el)
    return () => observer.disconnect()
  }, [layout]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={box}
      className={clsx(
        'page-backdrop relative overflow-hidden rounded-control border border-card-rule',
        full ? 'h-full' : 'h-[22rem]',
      )}
    >
      <TransformWrapper
        ref={api}
        minScale={LIMITS.min}
        maxScale={LIMITS.max}
        limitToBounds={false}
        doubleClick={{ disabled: true }}
        // Zoomed by the buttons, by pinching, and in full screen by the wheel (useWheelZoom)
        wheel={{ disabled: true }}
      >
        <TransformComponent wrapperClass="!h-full !w-full" contentClass="">
          <div className="relative" style={{ width: layout?.width ?? 1, height: layout?.height ?? 1 }}>
            {layout && (
              <>
                <Connectors
                  width={layout.width}
                  height={layout.height}
                  connectors={layout.connectors}
                  marriages={layout.marriages}
                  lineage={part}
                  drawKey={JSON.stringify(scope)}
                />
                {layout.cards.map((c) => {
                  const person = tree.members[c.id]
                  const entry = described.get(c.id)
                  if (!person || !entry) return null
                  return (
                    <div key={c.id}>
                      <PersonCard
                        person={person}
                        box={c}
                        state={cardState(entry.status)}
                        pressed={c.id === selected}
                        isMe={false}
                        onSelect={(id) => onSelect(id === selected ? null : id)}
                      />
                      <CardMarks
                        box={c}
                        locked={entry.status === 'locked'}
                        readonly={entry.status === 'readonly'}
                        detailsOnly={!!entry.detailsOnly}
                        line={owners.has(c.id)}
                        stop={stops.has(c.id)}
                        selected={c.id === selected}
                      />
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </TransformComponent>
      </TransformWrapper>
      {!layout && (
        <div className="absolute inset-0 grid place-items-center text-sm text-ink-muted">{t.tree.drawing}</div>
      )}
      <div className="surface absolute bottom-2 right-2 flex overflow-hidden rounded-control border border-frame/50 shadow-card">
        {[
          {
            label: t.tree.zoomIn,
            icon: <Plus className="h-4 w-4" />,
            run: () => zoomBy(api, BUTTON_FACTOR, LIMITS, undefined, 200),
          },
          {
            label: t.tree.zoomOut,
            icon: <Minus className="h-4 w-4" />,
            run: () => zoomBy(api, 1 / BUTTON_FACTOR, LIMITS, undefined, 200),
          },
          { label: p.fit, icon: <Focus className="h-4 w-4" />, run: () => fit(300) },
          full
            ? { label: p.exitFullscreen, icon: <Shrink className="h-4 w-4" />, run: () => onFull(false) }
            : { label: p.fullscreen, icon: <Expand className="h-4 w-4" />, run: () => onFull(true) },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={b.run}
            aria-label={b.label}
            title={b.label}
            className="grid h-9 w-9 place-items-center border-r border-card-rule/70 text-ink-muted last:border-r-0 hover:bg-accent-soft/60 hover:text-ink"
          >
            {b.icon}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Marks on top of a card: a clear frame and lock for locked people, badges for lines and stops */
function CardMarks({
  box,
  locked,
  readonly,
  detailsOnly,
  line,
  stop,
  selected,
}: {
  box: { x: number; y: number; w: number; h: number }
  locked: boolean
  readonly: boolean
  detailsOnly: boolean
  line: boolean
  stop: boolean
  selected: boolean
}) {
  const { t } = useI18n()
  const p = t.members.preview
  if (!locked && !readonly && !detailsOnly && !line && !stop && !selected) return null
  const badge = 'flex items-center gap-1 rounded-full px-2.5 py-1 text-[15px] font-semibold shadow-card'
  return (
    <div
      className={clsx(
        'pointer-events-none absolute z-20 rounded-card',
        locked && 'bg-danger/10 ring-[3px] ring-danger',
        detailsOnly && 'outline-dashed outline-[3px] outline-offset-2 outline-accent-deep',
        line && !locked && 'ring-[3px] ring-accent',
      )}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    >
      {selected && (
        <div className="absolute -inset-2 rounded-[calc(var(--radius-card)+0.5rem)] border-2 border-ink shadow-lifted" />
      )}
      <div className="absolute -top-5 right-2 flex gap-1">
        {line && (
          <span className={clsx(badge, 'bg-accent text-on-accent')}>
            <GitBranch className="h-4 w-4" />
            {p.line}
          </span>
        )}
        {stop && (
          <span className={clsx(badge, 'bg-primary text-on-primary')}>
            <Flag className="h-4 w-4" />
            {p.stop}
          </span>
        )}
        {locked && (
          <span className={clsx(badge, 'bg-danger text-on-primary')}>
            <Lock className="h-4 w-4" />
            {p.status.locked}
          </span>
        )}
        {detailsOnly && (
          <span className={clsx(badge, 'bg-accent-deep text-on-primary')}>
            <PenLine className="h-4 w-4" />
            {p.detailsOnly}
          </span>
        )}
        {readonly && (
          <span className={clsx(badge, 'bg-card font-normal text-ink-muted')}>
            <Eye className="h-4 w-4" />
          </span>
        )}
      </div>
    </div>
  )
}

function Legend() {
  const { t } = useI18n()
  const p = t.members.preview
  const item = (swatch: string, label: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={clsx('inline-block h-3.5 w-5 rounded-[4px] border', swatch)} />
      {label}
    </span>
  )
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-muted">
      {item('border-frame/80 bg-card', p.status.editable)}
      {item('border-card-rule bg-card outline-dashed outline-2 outline-offset-1 outline-accent-deep', p.detailsOnly)}
      {item('border-danger bg-danger/15 ring-2 ring-danger', p.status.locked)}
      {item('border-accent bg-card ring-2 ring-accent', p.line)}
      {item('border-card-rule bg-card opacity-40', `${p.status.hidden} / ${p.status.readonly}`)}
    </div>
  )
}

/** The tapped person: state, why, and what can be done about it */
function Selected({
  tree,
  scope,
  id,
  entry,
  actions,
  onClose,
}: {
  tree: Tree
  scope: TreeScope
  id: string
  entry: ScopeEntry
  actions: ScopeActions
  onClose: () => void
}) {
  const { t } = useI18n()
  const p = t.members.preview
  const reasonText = useReasonText(tree)
  const person = tree.members[id]
  const isLine = linePeople(scope).has(id)
  const isStop = scope.stops.includes(id)
  const inPart = entry.status === 'editable' || entry.status === 'locked'
  const reason = entry.reason
  // The level this person has without exceptions: what the moderator changes from
  const natural = useMemo(() => {
    const without = (ids: string[]) => ids.filter((x) => x !== id)
    const e = describeScope(tree, { ...scope, lock: without(scope.lock), unlock: without(scope.unlock) }).get(id)
    return e ? { level: levelOf(e), reason: e.reason } : null
  }, [tree, scope, id])
  // Full rights at the edge come with the line of someone beyond it
  const edge = natural?.reason && 'via' in natural.reason ? natural.reason : null
  const beyond = edge ? edge.via.filter((v) => !linePeople(scope).has(v)).slice(0, 3) : []
  const choices: Level[] = natural?.level === 'edit' ? ['edit', 'details', 'view'] : ['details', 'view']
  const choose = (level: Level) =>
    actions.setExceptions(id, {
      lock: level === 'view' && natural?.level !== 'view',
      unlock: level === 'details' && natural?.level !== 'details',
    })

  return (
    <div
      className={clsx(
        'flex flex-col gap-2 rounded-control border p-3',
        entry.status === 'locked' ? 'border-danger/60 bg-danger-soft/60' : 'border-card-rule bg-card',
      )}
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[15px] text-ink">
          <span className="font-semibold">{person?.name}</span>
          {person && lifeYears(person) && <span className="text-ink-muted"> ({lifeYears(person)})</span>}
          <span className="block text-sm text-ink-muted">
            {entry.detailsOnly ? p.detailsOnly : p.status[entry.status]}
          </span>
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.sheet.close}
          className="grid h-8 w-8 place-items-center rounded-full text-ink-muted hover:bg-canvas-raised"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {reason && (
        <p className="flex items-start gap-2 text-sm text-ink">
          {entry.detailsOnly ? (
            <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-accent-deep" />
          ) : (
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          )}
          <span>
            {reasonText(reason)}
            {entry.detailsOnly && <span className="block text-ink-muted">{p.detailsOnlyHint}</span>}
          </span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {beyond.map((v) => (
          <Button
            key={v}
            size="sm"
            variant="primary"
            icon={<GitBranch className="h-4 w-4" />}
            onClick={() => actions.addLine(v)}
          >
            {p.addLineOf(tree.members[v]?.name ?? '?')}
          </Button>
        ))}
        {!isLine && (
          <Button size="sm" icon={<GitBranch className="h-4 w-4" />} onClick={() => actions.addLine(id)}>
            {p.addLineOf(person?.name ?? '?')}
          </Button>
        )}
        {isLine && scope.lines.length > 1 && (
          <Button size="sm" variant="danger" onClick={() => actions.removeLine(id)}>
            {t.members.access.removeLine(person?.name ?? '?')}
          </Button>
        )}
        {inPart && !isLine && (
          <Button size="sm" icon={<Flag className="h-4 w-4" />} onClick={() => actions.toggleStop(id)}>
            {isStop ? t.members.access.unstop(person?.name ?? '?') : p.stopHere}
          </Button>
        )}
      </div>
      {/* The level for this one person; the people of the lines always have full rights */}
      {inPart && natural && (
        <div className="flex flex-col gap-1 border-t border-card-rule pt-2">
          {isLine ? (
            <p className="text-sm text-ink-muted">{p.lineFull}</p>
          ) : (
            <>
              <div role="radiogroup" aria-label={p.levelLabel} className="flex flex-col gap-1">
                <span className="field-label">{p.levelLabel}</span>
                {/* One row per level: three options with "(default)" do not fit side by side in a narrow column */}
                {choices.map((level) => {
                  const Icon = LEVEL_ICON[level]
                  const on = levelOf(entry) === level
                  return (
                    <button
                      key={level}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => choose(level)}
                      className={clsx(
                        'flex min-h-9 items-center gap-2 rounded-control border px-2.5 py-1.5 text-left text-sm transition-colors',
                        on
                          ? 'border-primary bg-primary font-medium text-on-primary-accent'
                          : 'border-card-rule text-ink hover:border-accent',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{t.members.rights.levels[level].title}</span>
                      {level === natural.level && <span className="text-[13px] opacity-75">{p.standard}</span>}
                    </button>
                  )
                })}
              </div>
              <p className="text-[13px] text-ink-muted">
                {t.members.rights.levels[levelOf(entry)].text}
                {edge && ` ${p.edgeFull}`}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Everyone grouped by state; the locked ones with their reason */
function PeopleList({
  tree,
  scope,
  described,
  onSelect,
}: {
  tree: Tree
  scope: TreeScope
  described: Map<string, ScopeEntry>
  onSelect: (id: string) => void
}) {
  const { t } = useI18n()
  const p = t.members.preview
  const reasonText = useReasonText(tree)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = [...described]
    .filter(([id]) => !q || tree.members[id]?.name.toLowerCase().includes(q))
    .sort(([a], [b]) => (tree.members[a]?.name ?? '').localeCompare(tree.members[b]?.name ?? ''))
  const with_ = (s: ScopeStatus) => shown.filter(([, e]) => e.status === s)
  const editable = with_('editable')

  const row = (id: string, e: ScopeEntry, note?: string) => {
    const person = tree.members[id]
    return (
      <li key={id}>
        <button
          type="button"
          onClick={() => onSelect(id)}
          className="flex w-full items-start gap-2 rounded-control px-2 py-1.5 text-left hover:bg-canvas-raised"
        >
          {e.status === 'locked' && <Lock className="mt-1 h-3.5 w-3.5 shrink-0 text-danger" />}
          <span className="min-w-0 flex-1">
            <span className="text-[15px] text-ink">{person?.name}</span>
            {person && lifeYears(person) && <span className="text-sm text-ink-muted"> ({lifeYears(person)})</span>}
            {note && <span className="block text-[13px] text-ink-muted">{note}</span>}
          </span>
        </button>
      </li>
    )
  }
  const group = (title: string, items: [string, ScopeEntry][], note?: (e: ScopeEntry) => string | undefined) =>
    items.length > 0 && (
      <div>
        <p className="px-2 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
          {title} ({items.length})
        </p>
        <ul>{items.map(([id, e]) => row(id, e, note?.(e)))}</ul>
      </div>
    )
  const note = (e: ScopeEntry) => (e.detailsOnly ? p.detailsOnly : e.reason ? reasonText(e.reason) : undefined)

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        className="field h-9 text-sm"
        placeholder={p.search}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {scope.lines.map((l) =>
        group(
          `${p.status.editable} · ${t.members.access.lineOf(tree.members[l.person]?.name ?? '?')}`,
          editable.filter(([, e]) => e.lines[0] === l.person),
          note,
        ),
      )}
      {group(
        `${p.status.editable} · ${p.marriedIn}`,
        editable.filter(([, e]) => !e.lines.length),
        note,
      )}
      {group(p.status.locked, with_('locked'), note)}
      {(['readonly', 'hidden'] as const).map((s) => {
        const items = with_(s)
        if (!items.length) return null
        return (
          <details key={s}>
            <summary className="cursor-pointer px-2 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
              {p.status[s]} ({items.length})
            </summary>
            <ul>{items.map(([id, e]) => row(id, e))}</ul>
          </details>
        )
      })}
    </div>
  )
}

/** What saving would change for a member who has a part already */
export function ScopeChanges({
  tree,
  before,
  after,
}: {
  tree: Tree
  before: TreeScope | null
  after: TreeScope | null
}) {
  const { t } = useI18n()
  const p = t.members.preview
  const names = useNames(tree)
  const diff = useMemo(() => diffScopes(tree, before, after), [tree, before, after])
  const rows = [
    { ids: diff.gained, label: p.gained, tone: 'text-ink' },
    { ids: diff.unlocked, label: p.unlocked, tone: 'text-ink' },
    { ids: diff.locked, label: p.newlyLocked, tone: 'text-danger' },
    { ids: diff.lost, label: p.lost, tone: 'text-danger' },
  ].filter((r) => r.ids.length)
  return (
    <div className="rounded-control border border-card-rule bg-card p-3">
      <p className="section-heading mb-1">{p.changes}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">{p.noChanges}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {rows.map((r) => (
            <li key={r.label(0)}>
              <span className={clsx('font-semibold', r.tone)}>{r.label(r.ids.length)}:</span>{' '}
              <span className="text-ink-muted">{names(r.ids)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
