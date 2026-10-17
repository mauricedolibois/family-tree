// src/components/tree/TreeCanvas.tsx
// Der Baum als zoombare, verschiebbare Fläche.

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'
import { Maximize, Minus, Plus } from 'lucide-react'
import { lineageOf, lineageView, mostCommonCountry, subTree } from '@/family/model'
import type { CardBox, TreeLayout } from '@/family/layout/types'
import { useFamily } from '@/components/app/FamilyProvider'
import { useView } from '@/components/app/ViewProvider'
import { PersonCard, type CardState } from './PersonCard'
import { Connectors } from './Connectors'
import { useTreeLayout } from './useTreeLayout'
import { ViewModes } from './ViewModes'
import { useToast } from '@/components/app/Toast'

const MIN_SCALE = 0.05
const MAX_SCALE = 2.2
const READING_SCALE = 0.9

export function TreeCanvas() {
  const { tree, index } = useFamily()
  const { selectedId, select, lineId, showLine, meId, focusRequest } = useView()
  const { notify } = useToast()
  const api = useRef<ReactZoomPanPinchRef | null>(null)
  const box = useRef<HTMLDivElement | null>(null)
  const pointerDown = useRef<{ x: number; y: number } | null>(null)
  const didInitialView = useRef(false)

  const viewTree = useMemo(() => (lineId ? subTree(tree, lineageView(index, lineId)) : tree), [tree, index, lineId])
  const { layout, error } = useTreeLayout(viewTree)
  const lineage = useMemo(() => (selectedId ? lineageOf(index, selectedId) : null), [index, selectedId])
  const homeCountry = useMemo(() => mostCommonCountry(tree), [tree])
  const cardById = useMemo(() => new Map(layout?.cards.map((c) => [c.id, c]) ?? []), [layout])

  /** Ganze Fläche ins Bild */
  const fitAll = useCallback(
    (l: TreeLayout | null = layout, time = 300) => {
      const el = box.current
      if (!l || !el || !api.current) return
      const scale = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, Math.min(el.clientWidth / l.width, el.clientHeight / l.height) * 0.94),
      )
      api.current.setTransform(
        (el.clientWidth - l.width * scale) / 2,
        (el.clientHeight - l.height * scale) / 2,
        scale,
        time,
        'easeOut',
      )
    },
    [layout],
  )

  /** Eine Karte gut lesbar in die Mitte holen (auf dem Handy oberhalb des Infoblatts) */
  const centerOn = useCallback((card: CardBox, time = 450) => {
    const el = box.current
    if (!el || !api.current) return
    const current = api.current.instance.transformState.scale
    const scale = Math.max(current, READING_SCALE)
    const narrow = el.clientWidth < 768
    const targetX = narrow ? el.clientWidth / 2 : (el.clientWidth - 420) / 2
    // Am Handy liegt das halb offene Infoblatt (46 % der Höhe) über dem Baum
    const sheet = narrow ? window.innerHeight * 0.46 : 0
    const targetY = Math.max(card.h * scale * 0.6 + 56, (el.clientHeight - sheet) / 2)
    api.current.setTransform(
      targetX - (card.x + card.w / 2) * scale,
      targetY - (card.y + card.h / 2) * scale,
      scale,
      time,
      'easeOut',
    )
  }, [])

  // Erste Ansicht: eigene Person, sonst ganzer Baum
  useEffect(() => {
    if (!layout || didInitialView.current) return
    didInitialView.current = true
    const me = meId ? cardById.get(meId) : undefined
    requestAnimationFrame(() => (me ? centerOn(me, 0) : fitAll(layout, 0)))
    if (!meId) {
      // Einmaliger Tipp: mit „Das bin ich“ startet der Baum künftig bei dir
      try {
        if (!localStorage.getItem('stammbaum:tipp-ich')) {
          localStorage.setItem('stammbaum:tipp-ich', '1')
          notify({ message: 'Tipp: Tippe auf dich selbst und wähle „Das bin ich“. Dann startet der Baum bei dir.' })
        }
      } catch {
        /* egal */
      }
    }
  }, [layout, meId, cardById, centerOn, fitAll, notify])

  // Nach Wechsel zwischen „ganze Familie“ und „Linie“ neu einpassen,
  // sobald das neue Layout fertig berechnet ist
  const refitPending = useRef(false)
  const lastLine = useRef(lineId)
  useEffect(() => {
    if (lastLine.current === lineId) return
    lastLine.current = lineId
    refitPending.current = true
  }, [lineId])
  useEffect(() => {
    if (!layout || !refitPending.current) return
    refitPending.current = false
    requestAnimationFrame(() => fitAll(layout))
  }, [layout, fitAll])

  // Sprung zu einer Person (Suche, Verwandte im Infoblatt) – jede Anfrage nur einmal
  const handledFocus = useRef<number | null>(null)
  useEffect(() => {
    if (!focusRequest || handledFocus.current === focusRequest.nonce) return
    const card = cardById.get(focusRequest.id)
    if (card) {
      handledFocus.current = focusRequest.nonce
      centerOn(card)
    } else if (lineId) {
      showLine(null) // nicht in der aktuellen Linie → ganze Familie zeigen, dann erneut versuchen
    }
  }, [focusRequest, cardById, centerOn, lineId, showLine])

  /** Angetippte Karte nachziehen, falls das Infoblatt sie verdecken würde */
  const onSelectCard = useCallback(
    (id: string) => {
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
    [select, cardById, centerOn],
  )

  const stateOf = (id: string): CardState => {
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
    <div ref={box} className="desk relative h-full w-full overflow-hidden">
      <TransformWrapper
        ref={api}
        minScale={MIN_SCALE}
        maxScale={MAX_SCALE}
        limitToBounds={false}
        doubleClick={{ disabled: true }}
        wheel={{ step: 0.12 }}
        panning={{ velocityDisabled: false }}
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
                  drawKey={selectedId ?? ''}
                />
                {layout.cards.map((c) => {
                  const person = index.byId.get(c.id)
                  if (!person) return null
                  const country = person.profile?.country?.trim().toLowerCase()
                  return (
                    <PersonCard
                      key={c.id}
                      person={person}
                      box={c}
                      state={stateOf(c.id)}
                      isMe={c.id === meId}
                      showCountry={!!country && country !== homeCountry}
                      onSelect={onSelectCard}
                    />
                  )
                })}
              </>
            )}
          </div>
        </TransformComponent>
      </TransformWrapper>

      <ViewModes count={count} />

      {error && (
        <p
          role="alert"
          className="absolute inset-x-3 top-14 mx-auto max-w-md rounded-card bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {!layout && !error && (
        <div className="absolute inset-0 grid place-items-center" role="status">
          <p className="parchment rounded-full border border-card-rule px-5 py-2 font-display text-lg text-ink-muted shadow-card">
            Der Baum wird gezeichnet …
          </p>
        </div>
      )}

      {/* Zoom */}
      <div className="parchment absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-3 flex flex-col overflow-hidden rounded-control border border-gilt/50 shadow-card">
        <ZoomButton label="Vergrößern" onClick={() => api.current?.zoomIn(0.35)}>
          <Plus className="h-5 w-5" />
        </ZoomButton>
        <ZoomButton label="Verkleinern" onClick={() => api.current?.zoomOut(0.35)}>
          <Minus className="h-5 w-5" />
        </ZoomButton>
        <ZoomButton label="Ganzen Baum zeigen" onClick={() => fitAll()}>
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
      className="grid h-11 w-11 place-items-center border-b border-card-rule/70 text-ink-muted last:border-b-0 hover:bg-gilt-soft/60 hover:text-ink"
    >
      {children}
    </button>
  )
}
