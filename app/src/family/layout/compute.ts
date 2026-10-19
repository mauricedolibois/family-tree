// src/family/layout/compute.ts
//
// Computes the positions of all cards and lines. ELK itself is passed in from
// outside (a web worker in the browser, called directly in tests).

import { buildIndex, type Tree, type TreeIndex } from '../model'
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
 * Couples whose partners should swap sides because the right partner's parents
 * sit further left (or the other way round). Saves crossings.
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
 * Siblings without a spouse or children are interchangeable: they hang off the
 * same line and have no other connections. Their slots are assigned by date of
 * birth without introducing new crossings.
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

/** Boxes per generation row, left to right */
function rowsOf(res: ElkResult): string[][] {
  const rows = new Map<number, Array<{ id: string; x: number }>>()
  for (const n of res.children ?? []) {
    const y = Math.round(n.y ?? 0)
    rows.set(y, [...(rows.get(y) ?? []), { id: n.id, x: n.x ?? 0 }])
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, ns]) => ns.sort((a, b) => a.x - b.x).map((n) => n.id))
}

/**
 * Order siblings by age, together with their families below. Only possible where
 * the families are self-contained (nobody in them has parents outside) and sit
 * next to each other in every row, so reordering cannot add crossings.
 * Mutates `rows`; returns true if anything changed.
 */
function sortSiblingFamilies(ix: TreeIndex, lg: LayoutGraph, rows: string[][]): boolean {
  const born = (id: string) => ix.byId.get(id)?.profile?.birthDate ?? '9999'
  const childUnits = (u: string) => {
    const kids = [...new Set(lg.units.get(u)!.members.flatMap((m) => ix.children.get(m) ?? []))]
    const out: string[] = []
    for (const k of kids.sort((a, b) => born(a).localeCompare(born(b)))) {
      const ku = lg.unitOf.get(k)
      if (ku && ku !== u && !out.includes(ku)) out.push(ku)
    }
    return out
  }

  let changed = false
  for (const parent of lg.units.keys()) {
    const kids = childUnits(parent)
    if (kids.length < 2) continue

    // Each family: the child's box and every box below it
    const owner = new Map<string, number>()
    let closed = true
    kids.forEach((k, i) => {
      const stack = [k]
      while (stack.length) {
        const u = stack.pop()!
        if (owner.has(u)) {
          if (owner.get(u) !== i) closed = false
          continue
        }
        owner.set(u, i)
        stack.push(...childUnits(u))
      }
    })
    for (const [u, i] of owner) {
      for (const m of lg.units.get(u)!.members)
        for (const p of ix.parents.get(m) ?? []) {
          const pu = lg.unitOf.get(p)
          if (pu !== parent && owner.get(pu!) !== i) closed = false
        }
    }
    if (!closed) continue

    // In every row the families must form one contiguous block
    const spans: Array<[number, number, number]> = []
    let together = true
    rows.forEach((row, r) => {
      const idx = row.flatMap((u, k) => (owner.has(u) ? [k] : []))
      if (!idx.length) return
      if (idx[idx.length - 1] - idx[0] + 1 !== idx.length) together = false
      spans.push([r, idx[0], idx.length])
    })
    if (!together) continue

    for (const [r, start, len] of spans) {
      const part = rows[r].slice(start, start + len)
      const sorted = [...part].sort((a, b) => owner.get(a)! - owner.get(b)! || part.indexOf(a) - part.indexOf(b))
      if (sorted.join() === part.join()) continue
      rows[r].splice(start, len, ...sorted)
      changed = true
    }
  }
  return changed
}

/** Keep the in-row order exactly as given */
const KEEP_ORDER = { 'elk.layered.crossingMinimization.forceNodeModelOrder': 'true' }

/**
 * For views around one person (line, relation): parents centred above their
 * children and the person centred below their ancestors, like a pedigree chart.
 * The whole-family view keeps the more compact default placement.
 */
const CENTERED = {
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
}

/**
 * @param focusId person the tree is arranged around (e.g. for "line of …")
 */
export async function computeTreeLayout(
  tree: Tree,
  runElk: RunElk,
  focusId: string | null = null,
): Promise<TreeLayout> {
  if (Object.keys(tree.members).length === 0) return { cards: [], marriages: [], connectors: [], width: 0, height: 0 }

  const placement = focusId ? CENTERED : {}

  // 1. Base layout: ELK follows the family-tree order and avoids crossings
  let lg = buildLayoutGraph(tree, { focusId, elk: placement })
  let res = await runElk(lg.graph)

  // 2. Flip couples whose parents sit on the other side
  const flips = couplesToFlip(lg, res, tree, new Set())
  if (flips.size) {
    lg = buildLayoutGraph(tree, { flipped: flips, focusId, elk: placement })
    res = await runElk(lg.graph)
  }
  const layout = toLayout(lg, res, tree)

  // 3. Siblings and their families by age, unless that adds crossings
  const rows = rowsOf(res)
  if (!sortSiblingFamilies(buildIndex(tree), lg, rows)) return layout
  const sortedGraph = buildLayoutGraph(tree, {
    flipped: flips,
    order: rows.flat(),
    elk: { ...placement, ...KEEP_ORDER },
  })
  const sorted = toLayout(sortedGraph, await runElk(sortedGraph.graph), tree)
  return countCrossings(sorted) <= countCrossings(layout) ? sorted : layout
}

/** Number of real crossings between connector lines (used by tests) */
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
