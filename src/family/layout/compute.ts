// src/family/layout/compute.ts
//
// Berechnet die Positionen aller Karten und Linien. ELK selbst wird von
// außen hereingereicht (im Browser in einem Web Worker, in Tests direkt).

import type { Tree } from '../model'
import { buildLayoutGraph, type ElkGraph, type LayoutGraph } from './graph'
import { CARD, type CardBox, type Connector, type MarriageLine, type Point, type TreeLayout } from './types'

type ElkSection = { startPoint: Point; endPoint: Point; bendPoints?: Point[] }
type ElkResult = {
  width?: number
  height?: number
  children?: Array<{ id: string; x?: number; y?: number; width?: number }>
  edges?: Array<{ id: string; sections?: ElkSection[] }>
}

export type RunElk = (graph: ElkGraph) => Promise<ElkResult>

const MARGIN = 32

function centerOfUnit(res: ElkResult, unitId: string): number | null {
  const n = res.children?.find((c) => c.id === unitId)
  return n && n.x !== undefined && n.width !== undefined ? n.x + n.width / 2 : null
}

/**
 * Paare, bei denen Mann und Frau die Seiten tauschen sollten, weil die Eltern
 * der rechten Person weiter links stehen (oder umgekehrt). Spart Kreuzungen.
 */
function couplesToFlip(lg: LayoutGraph, res: ElkResult, tree: Tree, already: Set<string>): Set<string> {
  const out = new Set(already)
  const parentX = (pid: string): number | null => {
    const ps = Object.values(tree.members).filter((m) => m.childrenIds.includes(pid))
    const xs = ps.map((p) => centerOfUnit(res, lg.unitOf.get(p.id)!)).filter((x): x is number => x !== null)
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
  }
  for (const u of lg.units.values()) {
    if (u.members.length !== 2) continue
    const center = centerOfUnit(res, u.id)
    if (center === null) continue
    const [left, right] = u.members
    const lx = parentX(left)
    const rx = parentX(right)
    const shouldFlip =
      lx !== null && rx !== null ? lx > rx : lx !== null ? lx > center : rx !== null ? rx < center : false
    if (shouldFlip) {
      if (out.has(u.id)) out.delete(u.id)
      else out.add(u.id)
    }
  }
  return out
}

/**
 * Geschwister ohne Partner und Kinder sind austauschbar: Sie hängen an
 * derselben Linie und haben sonst keine Verbindungen. Ihre Plätze werden
 * nach Geburtsdatum vergeben, ohne neue Kreuzungen zu erzeugen.
 */
function sortLooseSiblings(tree: Tree, layout: TreeLayout) {
  const loose = (id: string) => {
    const p = tree.members[id]
    return p && !p.spouseId && p.childrenIds.length === 0
  }
  const groups = new Map<string, Connector[]>()
  for (const c of layout.connectors) {
    if (!loose(c.child)) continue
    const key = c.parents.slice().sort().join('+')
    groups.set(key, [...(groups.get(key) ?? []), c])
  }
  const cardOf = new Map(layout.cards.map((c) => [c.id, c]))
  const born = (id: string) => tree.members[id]?.profile?.birthDate ?? '9999'
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const rows = new Map<number, Connector[]>()
    for (const c of group) {
      const y = cardOf.get(c.child)!.y
      rows.set(y, [...(rows.get(y) ?? []), c])
    }
    for (const row of rows.values()) {
      if (row.length < 2) continue
      const slots = row
        .map((c) => ({ card: { ...cardOf.get(c.child)! }, points: c.points }))
        .sort((a, b) => a.card.x - b.card.x)
      const people = row.map((c) => c.child).sort((a, b) => born(a).localeCompare(born(b)))
      people.forEach((id, i) => {
        const card = cardOf.get(id)!
        card.x = slots[i].card.x
        card.y = slots[i].card.y
        row.find((c) => c.child === id)!.points = slots[i].points
      })
    }
  }
}

function toLayout(lg: LayoutGraph, res: ElkResult, tree: Tree): TreeLayout {
  const cards: CardBox[] = []
  const marriages: MarriageLine[] = []
  for (const n of res.children ?? []) {
    const unit = lg.units.get(n.id)
    if (!unit) continue
    const x0 = (n.x ?? 0) + MARGIN
    const y0 = (n.y ?? 0) + MARGIN
    unit.members.forEach((pid, k) => {
      cards.push({ id: pid, x: x0 + k * (CARD.w + CARD.coupleGap), y: y0, w: CARD.w, h: CARD.h })
    })
    if (unit.members.length === 2) {
      const y = y0 + CARD.h / 2
      marriages.push({
        id: unit.id,
        a: unit.members[0],
        b: unit.members[1],
        from: { x: x0 + CARD.w, y },
        to: { x: x0 + CARD.w + CARD.coupleGap, y },
      })
    }
  }

  const connectors: Connector[] = []
  for (const e of res.edges ?? []) {
    const meta = lg.edgeMeta.get(e.id)
    if (!meta || !e.sections?.length) continue
    const points: Point[] = []
    for (const s of e.sections) {
      for (const p of [s.startPoint, ...(s.bendPoints ?? []), s.endPoint]) {
        const q = { x: p.x + MARGIN, y: p.y + MARGIN }
        const last = points[points.length - 1]
        if (!last || last.x !== q.x || last.y !== q.y) points.push(q)
      }
    }
    connectors.push({ id: e.id, parents: meta.parents, child: meta.child, points, adopted: meta.adopted })
  }

  const layout: TreeLayout = {
    cards,
    marriages,
    connectors,
    width: (res.width ?? 0) + MARGIN * 2,
    height: (res.height ?? 0) + MARGIN * 2,
  }
  sortLooseSiblings(tree, layout)
  return layout
}

export async function computeTreeLayout(tree: Tree, runElk: RunElk): Promise<TreeLayout> {
  if (Object.keys(tree.members).length === 0) return { cards: [], marriages: [], connectors: [], width: 0, height: 0 }

  const first = buildLayoutGraph(tree)
  const firstRes = await runElk(first.graph)
  const flips = couplesToFlip(first, firstRes, tree, new Set())
  if (flips.size === 0) return toLayout(first, firstRes, tree)

  const second = buildLayoutGraph(tree, flips)
  return toLayout(second, await runElk(second.graph), tree)
}

/** Anzahl echter Kreuzungen zwischen Verbindungslinien (für Tests) */
export function countCrossings(layout: TreeLayout): number {
  type Seg = { owner: string; a: Point; b: Point }
  const segs: Seg[] = []
  for (const c of layout.connectors) {
    const owner = c.parents.slice().sort().join('+')
    for (let i = 0; i < c.points.length - 1; i++) segs.push({ owner, a: c.points[i], b: c.points[i + 1] })
  }
  let n = 0
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i]
      const t = segs[j]
      if (s.owner === t.owner) continue
      const sh = s.a.y === s.b.y
      const th = t.a.y === t.b.y
      if (sh === th) continue
      const h = sh ? s : t
      const v = sh ? t : s
      const x = v.a.x
      const y = h.a.y
      const inH = x > Math.min(h.a.x, h.b.x) + 0.5 && x < Math.max(h.a.x, h.b.x) - 0.5
      const inV = y > Math.min(v.a.y, v.b.y) + 0.5 && y < Math.max(v.a.y, v.b.y) - 0.5
      if (inH && inV) n++
    }
  return n
}
