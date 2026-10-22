// src/components/tree/TreeCanvas.tsx
// The tree as a zoomable, pannable canvas with the view switcher and relation card on top.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'
import { Maximize, Minus, Plus } from 'lucide-react'
import { lineageOf, lineageView, subTree } from '@/family/model'
import { findConnection } from '@/family/kinship'
import type { CardBox, TreeLayout } from '@/family/layout/types'
import { useFamily } from '@/components/app/FamilyProvider'
import { useView } from '@/components/app/ViewProvider'
import { PersonCard, type CardState } from './PersonCard'
import { Connectors } from './Connectors'
import { useTreeLayout } from './useTreeLayout'
import { ViewModes } from './ViewModes'
import { LineScopeCard } from './LineScopeCard'
import { Minimap, type ViewState } from './Minimap'
import { RelationCard } from '@/components/relation/RelationCard'
import { BirthdaysCard } from '@/components/birthdays/BirthdaysCard'
import { useI18n } from '@/i18n/I18nProvider'

const MIN_SCALE = 0.05
const MAX_SCALE = 2.2
const READING_SCALE = 0.9
/** Do not blow up small trees (e.g. a short path) */
const MAX_FIT_SCALE = 1.1
/** Minimum fit scale for a line on phones; anything smaller is unreadable */
const SMALLEST_OVERVIEW = 0.3
/** From this width on, cards sit left of the tree instead of above it */
const WIDE = 768

export function TreeCanvas() {
  const { tree, index } = useFamily()
  const { t } = useI18n()
  const { selectedId, select, lineId, lineScope, showLine, relation, showRelation, birthdays, meId, focusRequest } =
    useView()
  const api = useRef<ReactZoomPanPinchRef | null>(null)
  const box = useRef<HTMLDivElement | null>(null)
  const overlay = useRef<HTMLDivElement | null>(null)
  const pointerDown = useRef<{ x: number; y: number } | null>(null)
  const didInitialView = useRef(false)
  const [scopeOpen, setScopeOpen] = useState(false)
  // Where the view is, for the minimap
  const [view, setView] = useState<ViewState | null>(null)
  const trackView = useCallback((state: { positionX: number; positionY: number; scale: number }) => {
    const el = box.current
    if (el)
      setView({
        x: state.positionX,
        y: state.positionY,
        scale: state.scale,
        width: el.clientWidth,
        height: el.clientHeight,
      })
  }, [])
  useEffect(() => {
    if (!lineId) setScopeOpen(false)
  }, [lineId])

  // Relation: once both people are chosen, show only the path between them
  const relFrom = relation?.from ?? null
  const relTo = relation?.to ?? null
  const pair = relFrom && relTo ? { from: relFrom, to: relTo } : null
  const connection = useMemo(
    () => (relFrom && relTo ? findConnection(index, relFrom, relTo) : null),
    [index, relFrom, relTo],
  )
  const relationIds = useMemo(
    () =>
      relFrom && relTo ? new Set(connection ? [...connection.path, ...connection.common] : [relFrom, relTo]) : null,
    [relFrom, relTo, connection],
  )

  const viewTree = useMemo(() => {
    if (relationIds) return subTree(tree, relationIds)
    if (lineId) return subTree(tree, lineageView(index, lineId, lineScope))
    return tree
  }, [tree, index, lineId, lineScope, relationIds])
  const { layout, error } = useTreeLayout(viewTree, pair ? pair.from : lineId)
  const lineage = useMemo(() => {
    if (relationIds) return relationIds
    return selectedId ? lineageOf(index, selectedId) : null
  }, [index, selectedId, relationIds])
  const cardById = useMemo(() => new Map(layout?.cards.map((c) => [c.id, c]) ?? []), [layout])

  /**
   * Space taken by the controls in the top left: at the top on phones, on the
   * left on desktop whenever a card (relation, line scope) is open there.
   */
  const insets = useCallback(() => {
    const el = box.current
    const ov = overlay.current
    if (!el || !ov) return { top: 0, left: 0 }
    const b = el.getBoundingClientRect()
    const o = ov.getBoundingClientRect()
    if (el.clientWidth < WIDE) return { top: Math.max(0, o.bottom - b.top + 8), left: 0 }
    const cardOpen = o.height > 64
    return { top: 0, left: cardOpen ? o.right - b.left + 16 : 0 }
  }, [])

  /** Scale at which the whole layout fits the free space */
  const fitScale = useCallback(
    (l: TreeLayout) => {
      const el = box.current
      if (!el) return 1
      const { top, left } = insets()
      const w = el.clientWidth - left
      const h = el.clientHeight - top
      return Math.max(MIN_SCALE, Math.min(MAX_FIT_SCALE, Math.min(w / l.width, h / l.height) * 0.94))
    },
    [insets],
  )

  /** Fit everything without sliding under the controls */
  const fitAll = useCallback(
    (l: TreeLayout | null = layout, time = 300) => {
      const el = box.current
      if (!l || !el || !api.current) return
      const { top, left } = insets()
      const w = el.clientWidth - left
      const h = el.clientHeight - top
      const scale = fitScale(l)
      api.current.setTransform(
        left + (w - l.width * scale) / 2,
        top + (h - l.height * scale) / 2,
        scale,
        time,
        'easeOut',
      )
    },
    [layout, insets, fitScale],
  )

  /**
   * Bring a card to the centre at a readable size (above the info sheet on phones).
   * With `overview`: at that scale, the person in the lower third, ancestors above.
   */
  const centerOn = useCallback(
    (card: CardBox, time = 450, overview?: { scale: number }) => {
      const el = box.current
      if (!el || !api.current) return
      const current = api.current.instance.transformState.scale
      const scale = overview ? overview.scale : Math.max(current, READING_SCALE)
      const narrow = el.clientWidth < WIDE
      const { top, left } = insets()
      const targetX = narrow ? el.clientWidth / 2 : (left + el.clientWidth - 420) / 2
      // On phones the half-open info sheet (46 % of the height) covers the tree
      const sheet = narrow && !overview ? window.innerHeight * 0.46 : 0
      const targetY = overview
        ? top + (el.clientHeight - top) * 0.7
        : Math.max(top + (card.h * scale) / 2 + 8, (top + el.clientHeight - sheet) / 2)
      api.current.setTransform(
        targetX - (card.x + card.w / 2) * scale,
        targetY - (card.y + card.h / 2) * scale,
        scale,
        time,
        'easeOut',
      )
    },
    [insets],
  )

  // Initial view: your own person, otherwise the whole tree
  useEffect(() => {
    if (!layout || didInitialView.current) return
    didInitialView.current = true
    const me = meId ? cardById.get(meId) : undefined
    requestAnimationFrame(() => (me ? centerOn(me, 0) : fitAll(layout, 0)))
  }, [layout, meId, cardById, centerOn, fitAll])

  // After switching views (whole family, line, scope, relation) refit once the
  // new layout has been computed
  const viewKey = pair
    ? `rel:${pair.from}:${pair.to}`
    : lineId
    ? `line:${lineId}:${lineScope.up}:${lineScope.down}:${lineScope.side}`
    : 'all'
  const refitPending = useRef(false)
  const lastView = useRef(viewKey)
  useEffect(() => {
    if (lastView.current === viewKey) return
    lastView.current = viewKey
    refitPending.current = true
  }, [viewKey])
  /** Fit the view; a large line would be tiny on phones, so start readable at the person instead */
  const showView = useCallback(
    (l: TreeLayout) => {
      const focus = lineId ? l.cards.find((c) => c.id === lineId) : undefined
      const narrow = (box.current?.clientWidth ?? 0) < WIDE
      if (focus && narrow && fitScale(l) < SMALLEST_OVERVIEW) centerOn(focus, 450, { scale: SMALLEST_OVERVIEW * 2 })
      else fitAll(l)
    },
    [lineId, fitScale, centerOn, fitAll],
  )
  // React to a new layout only, not to a new showView function; otherwise the
  // old layout would be fitted
  const showViewRef = useRef(showView)
  showViewRef.current = showView
  useEffect(() => {
    if (!layout || !refitPending.current) return
    refitPending.current = false
    requestAnimationFrame(() => showViewRef.current(layout))
  }, [layout])

  // Line scope card opened or closed: the space for the tree has changed
  const lastScopeOpen = useRef(scopeOpen)
  useEffect(() => {
    if (lastScopeOpen.current === scopeOpen) return
    lastScopeOpen.current = scopeOpen
    if (layout && lineId && !refitPending.current) requestAnimationFrame(() => showView(layout))
  }, [scopeOpen, lineId, layout, showView])

  // Jump to a person (search, relatives in the info sheet), each request once
  const handledFocus = useRef<number | null>(null)
  useEffect(() => {
    if (!focusRequest || handledFocus.current === focusRequest.nonce) return
    const card = cardById.get(focusRequest.id)
    if (card) {
      handledFocus.current = focusRequest.nonce
      centerOn(card)
    } else if (lineId || relation) {
      showLine(null) // not in the current view → show the whole family, then retry
    }
  }, [focusRequest, cardById, centerOn, lineId, relation, showLine])

  /** Move a tapped card into view if the info sheet would cover it */
  const onSelectCard = useCallback(
    (id: string) => {
      // Relation still incomplete: the tapped person fills the empty slot
      if (relation && (!relation.from || !relation.to)) {
        if (id === relation.from || id === relation.to) return
        showRelation(relation.from ? { ...relation, to: id } : { ...relation, from: id })
        return
      }
      select(id)
      const el = box.current
      const card = cardById.get(id)
      if (!el || !card || !api.current) return
      const { scale, positionX, positionY } = api.current.instance.transformState
      const right = positionX + (card.x + card.w) * scale
      const bottom = positionY + (card.y + card.h) * scale
      const narrow = el.clientWidth < 768
      const covered = narrow ? bottom > el.clientHeight - window.innerHeight * 0.46 : right > el.clientWidth - 440
      if (covered) centerOn(card)
    },
    [select, cardById, centerOn, relation, showRelation],
  )

  const stateOf = (id: string): CardState => {
    if (relation) {
      if (id === relation.from || id === relation.to || id === selectedId) return 'selected'
      return relationIds ? 'line' : 'normal'
    }
    if (!lineage) return 'normal'
    if (id === selectedId) return 'selected'
    return lineage.has(id) ? 'line' : 'dimmed'
  }

  const onBackgroundClick = (e: React.MouseEvent) => {
    const start = pointerDown.current
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) return
    if ((e.target as HTMLElement).closest('[data-person]')) return
    select(null)
  }

  const count = Object.keys(viewTree.members).length

  return (
    <div ref={box} className="page-backdrop relative h-full w-full overflow-hidden">
      <TransformWrapper
        ref={api}
        minScale={MIN_SCALE}
        maxScale={MAX_SCALE}
        limitToBounds={false}
        doubleClick={{ disabled: true }}
        wheel={{ step: 0.12 }}
        panning={{ velocityDisabled: false }}
        onTransformed={(_, state) => trackView(state)}
      >
        <TransformComponent wrapperClass="!h-full !w-full" contentClass="">
          <div
            className="relative"
            style={{ width: layout?.width ?? 1, height: layout?.height ?? 1 }}
            onPointerDown={(e) => (pointerDown.current = { x: e.clientX, y: e.clientY })}
            onClick={onBackgroundClick}
          >
            {layout && (
              <>
                <Connectors
                  width={layout.width}
                  height={layout.height}
                  connectors={layout.connectors}
                  marriages={layout.marriages}
                  lineage={lineage}
                  drawKey={pair ? viewKey : selectedId ?? ''}
                />
                {layout.cards.map((c) => {
                  const person = index.byId.get(c.id)
                  if (!person) return null
                  return (
                    <PersonCard
                      key={c.id}
                      person={person}
                      box={c}
                      state={stateOf(c.id)}
                      isMe={c.id === meId}
                      onSelect={onSelectCard}
                    />
                  )
                })}
              </>
            )}
          </div>
        </TransformComponent>
      </TransformWrapper>

      <div
        ref={overlay}
        data-tour="overlay"
        className="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-col items-start gap-2 md:right-auto"
      >
        <ViewModes count={count} scopeOpen={scopeOpen} onToggleScope={() => setScopeOpen((v) => !v)} />
        {relation && <RelationCard connection={connection} compact={!!selectedId} />}
        {birthdays && <BirthdaysCard />}
        {lineId && scopeOpen && !relation && (
          <LineScopeCard personId={lineId} count={count} onClose={() => setScopeOpen(false)} />
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="absolute inset-x-3 top-14 mx-auto max-w-md rounded-card bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          {t.tree.layoutFailed}
        </p>
      )}
      {!layout && !error && (
        <div className="absolute inset-0 grid place-items-center" role="status">
          <p className="surface rounded-full border border-card-rule px-5 py-2 font-display text-lg text-ink-muted shadow-card">
            {t.tree.drawing}
          </p>
        </div>
      )}

      {layout && view && (
        <Minimap
          layout={layout}
          view={view}
          highlight={new Set([selectedId, meId].filter((id): id is string => !!id))}
          onMove={(x, y) => {
            const el = box.current
            const scale = api.current?.instance.transformState.scale
            if (el && scale)
              api.current?.setTransform(el.clientWidth / 2 - x * scale, el.clientHeight / 2 - y * scale, scale, 0)
          }}
        />
      )}

      {/* Zoom */}
      <div className="surface absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-3 flex flex-col overflow-hidden rounded-control border border-frame/50 shadow-card">
        <ZoomButton label={t.tree.zoomIn} onClick={() => api.current?.zoomIn(0.35)}>
          <Plus className="h-5 w-5" />
        </ZoomButton>
        <ZoomButton label={t.tree.zoomOut} onClick={() => api.current?.zoomOut(0.35)}>
          <Minus className="h-5 w-5" />
        </ZoomButton>
        <ZoomButton label={t.tree.fitAll} onClick={() => fitAll()}>
          <Maximize className="h-[18px] w-[18px]" />
        </ZoomButton>
      </div>
    </div>
  )
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-11 w-11 place-items-center border-b border-card-rule/70 text-ink-muted last:border-b-0 hover:bg-accent-soft/60 hover:text-ink"
    >
      {children}
    </button>
  )
}
