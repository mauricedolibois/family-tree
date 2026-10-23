// src/components/tree/Minimap.tsx
// Small overview of the whole tree on desktop: every card as a dot-sized box and
// the visible part as a frame. Clicking or dragging in it moves the view there.
// Shown only while part of the tree is out of view, on top of the zoom buttons.

import { useRef } from 'react'
import type { TreeLayout } from '@/family/layout/types'
import { useI18n } from '@/i18n/I18nProvider'

/** Largest size of the map in pixels */
const MAX_W = 220
const MAX_H = 150
/** Below this many people the tree is easy to see as a whole */
const MIN_CARDS = 8

export type ViewState = { x: number; y: number; scale: number; width: number; height: number }

export function Minimap({
  layout,
  view,
  highlight,
  onMove,
}: {
  layout: TreeLayout
  view: ViewState
  /** Selected person, own person: stand out on the map */
  highlight: Set<string>
  /** Centre the view on this point of the layout */
  onMove: (x: number, y: number) => void
}) {
  const { t } = useI18n()
  const svg = useRef<SVGSVGElement | null>(null)
  const dragging = useRef(false)

  // The visible part in layout coordinates
  const left = -view.x / view.scale
  const top = -view.y / view.scale
  const w = view.width / view.scale
  const h = view.height / view.scale
  const slack = Math.max(layout.width, layout.height) * 0.01
  const allVisible =
    left <= slack && top <= slack && left + w >= layout.width - slack && top + h >= layout.height - slack
  if (layout.cards.length < MIN_CARDS || allVisible) return null

  const fit = Math.min(MAX_W / layout.width, MAX_H / layout.height)
  const moveTo = (e: React.PointerEvent) => {
    const r = svg.current?.getBoundingClientRect()
    if (!r) return
    onMove(((e.clientX - r.left) / r.width) * layout.width, ((e.clientY - r.top) / r.height) * layout.height)
  }

  return (
    <div className="hidden border-b border-card-rule/70 p-1.5 md:block">
      <svg
        ref={svg}
        role="img"
        aria-label={t.tree.minimap}
        width={layout.width * fit}
        height={layout.height * fit}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="block cursor-pointer touch-none"
        onPointerDown={(e) => {
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          moveTo(e)
        }}
        onPointerMove={(e) => dragging.current && moveTo(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <g className="text-ink-faint" fillOpacity={0.55}>
          {layout.cards.map((c) => (
            <rect
              key={c.id}
              x={c.x}
              y={c.y}
              width={c.w}
              height={c.h}
              rx={c.h * 0.15}
              fill="currentColor"
              className={highlight.has(c.id) ? 'text-accent' : undefined}
            />
          ))}
        </g>
        <rect
          x={left}
          y={top}
          width={w}
          height={h}
          className="text-primary"
          fill="currentColor"
          fillOpacity={0.08}
          stroke="currentColor"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}
