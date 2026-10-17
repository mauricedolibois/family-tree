// src/components/tree/Connectors.tsx
// Linien im Baum: Sepiatinte für alle, Blattgold für die ausgewählte Linie.

import { memo } from 'react'
import clsx from 'clsx'
import type { Connector, MarriageLine, Point } from '@/family/layout/types'

/** Polylinie mit abgerundeten Ecken */
export function roundedPath(points: Point[], radius = 10): string {
  if (points.length < 2) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]
    const cur = points[i]
    const next = points[i + 1]
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y)
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y)
    const r = Math.min(radius, inLen / 2, outLen / 2)
    const a = { x: cur.x - ((cur.x - prev.x) / inLen) * r, y: cur.y - ((cur.y - prev.y) / inLen) * r }
    const b = { x: cur.x + ((next.x - cur.x) / outLen) * r, y: cur.y + ((next.y - cur.y) / outLen) * r }
    d += ` L ${a.x} ${a.y} Q ${cur.x} ${cur.y} ${b.x} ${b.y}`
  }
  const last = points[points.length - 1]
  return `${d} L ${last.x} ${last.y}`
}

/** Vierzackiger Stern als Funkeln */
function star(x: number, y: number, r: number): string {
  const k = r * 0.28
  return `M ${x} ${y - r} Q ${x + k} ${y - k} ${x + r} ${y} Q ${x + k} ${y + k} ${x} ${y + r} Q ${x - k} ${y + k} ${
    x - r
  } ${y} Q ${x - k} ${y - k} ${x} ${y - r} Z`
}

/** Funkelpunkte an den Knicken der Goldlinie, höchstens 28 */
function sparklePoints(list: Connector[]): Point[] {
  const pts: Point[] = []
  const seen = new Set<string>()
  for (const c of list) {
    for (const p of c.points.slice(1, -1)) {
      const key = `${Math.round(p.x / 40)}:${Math.round(p.y / 40)}`
      if (seen.has(key)) continue
      seen.add(key)
      pts.push(p)
    }
  }
  return pts.slice(0, 28)
}

type Props = {
  width: number
  height: number
  connectors: Connector[]
  marriages: MarriageLine[]
  /** IDs der hervorgehobenen Linie (oder null) */
  lineage: Set<string> | null
  /** ändert sich bei jeder neuen Auswahl → Goldlinie zeichnet sich neu */
  drawKey: string
}

export const Connectors = memo(function Connectors({ width, height, connectors, marriages, lineage, drawKey }: Props) {
  const inLine = (c: Connector) => !!lineage && lineage.has(c.child) && c.parents.some((p) => lineage.has(p))
  const marriageInLine = (m: MarriageLine) => !!lineage && lineage.has(m.a) && lineage.has(m.b)

  return (
    <svg className="pointer-events-none absolute inset-0 overflow-visible" width={width} height={height} aria-hidden>
      <defs>
        <filter id="gilt-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Sepia-Tinte: weicher Tintenhof plus feste Linie */}
      {/* Farben über style statt Attribut: var() in SVG-Attributen kann Safari nicht überall */}
      <g fill="none" style={{ stroke: 'rgb(var(--line))' }} strokeLinecap="round" strokeLinejoin="round">
        {connectors.map((c) => {
          const d = roundedPath(c.points)
          const dim = lineage && !inLine(c)
          return (
            <g key={c.id} className={clsx('transition-opacity duration-300', dim && 'opacity-25')}>
              <path d={d} strokeWidth={3.4} opacity={0.16} strokeDasharray={c.adopted ? '5 6' : undefined} />
              <path d={d} strokeWidth={1.4} strokeDasharray={c.adopted ? '5 6' : undefined} />
            </g>
          )
        })}
      </g>

      {/* Ehelinien mit ⚭ */}
      {marriages.map((m) => {
        const gold = marriageInLine(m)
        const cx = (m.from.x + m.to.x) / 2
        return (
          <g key={m.id} className={clsx('transition-opacity duration-300', lineage && !gold && 'opacity-30')}>
            <g style={{ stroke: gold ? 'rgb(var(--gilt))' : 'rgb(var(--line))' }} strokeWidth={1.2}>
              <line x1={m.from.x} y1={m.from.y - 2} x2={m.to.x} y2={m.to.y - 2} />
              <line x1={m.from.x} y1={m.from.y + 2} x2={m.to.x} y2={m.to.y + 2} />
            </g>
            <circle
              cx={cx}
              cy={m.from.y}
              r={10}
              style={{ fill: 'rgb(var(--card))', stroke: gold ? 'rgb(var(--gilt))' : 'rgb(var(--card-rule))' }}
              strokeWidth={1}
            />
            {/* ⚭ als zwei verschlungene Ringe */}
            <g
              fill="none"
              style={{ stroke: gold ? 'rgb(var(--gilt-deep))' : 'rgb(var(--ink-muted))' }}
              strokeWidth={1.3}
            >
              <circle cx={cx - 2.6} cy={m.from.y} r={3.6} />
              <circle cx={cx + 2.6} cy={m.from.y} r={3.6} />
            </g>
          </g>
        )
      })}

      {/* Goldene Linie der ausgewählten Person, zeichnet sich wie mit Tinte */}
      {lineage && (
        <g key={drawKey}>
          <g
            fill="none"
            style={{ stroke: 'rgb(var(--gilt))' }}
            strokeWidth={2.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#gilt-glow)"
          >
            {connectors.filter(inLine).map((c) => (
              <path key={c.id} d={roundedPath(c.points)} pathLength={1} className="ink-draw" />
            ))}
          </g>
          <g style={{ fill: 'rgb(var(--gilt-light))' }}>
            {sparklePoints(connectors.filter(inLine)).map((p, i) => (
              <path
                key={i}
                d={star(p.x, p.y, i % 3 === 0 ? 7 : 5)}
                className="sparkle"
                style={{ animationDelay: `${1.1 + (i % 7) * 0.37}s` }}
              />
            ))}
          </g>
        </g>
      )}
    </svg>
  )
})
