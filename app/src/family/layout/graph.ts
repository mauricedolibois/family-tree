// src/family/layout/graph.ts
//
// Turns the family tree into a graph for the ELK layout engine.
//
// Each couple (or single person) is one box. Lines run from the bottom of the
// box to the children, docking at the top of each child's own card. ELK then
// spreads the boxes over generation rows with as few crossings as possible.

import { buildIndex, parentsOf, type Tree } from '../model'
import { genealogicalOrder } from './order'
import { CARD } from './types'

export type Unit = {
  id: string
  /** 1 or 2 people, left to right */
  members: string[]
}

export type ElkPort = { id: string; x: number; y: number; layoutOptions: Record<string, string> }
export type ElkNode = {
  id: string
  width: number
  height: number
  ports: ElkPort[]
  layoutOptions: Record<string, string>
}
export type ElkEdge = { id: string; sources: string[]; targets: string[] }
export type ElkGraph = { id: string; layoutOptions: Record<string, string>; children: ElkNode[]; edges: ElkEdge[] }

export type EdgeMeta = { parents: string[]; child: string; adopted: boolean }

export type LayoutGraph = {
  graph: ElkGraph
  units: Map<string, Unit>
  unitOf: Map<string, string>
  edgeMeta: Map<string, EdgeMeta>
}

const LAYOUT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.thoroughness': '40',
  'elk.layered.mergeEdges': 'true',
  // Use the given order (order.ts) as a preference
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.spacing.nodeNodeBetweenLayers': '84',
  'elk.spacing.nodeNode': '36',
  'elk.layered.spacing.edgeNodeBetweenLayers': '24',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '10',
  'elk.spacing.edgeEdge': '10',
}

const birthKey = (tree: Tree, id: string) => tree.members[id]?.profile?.birthDate ?? '9999'

export type GraphOptions = {
  /** Couples whose sides are swapped (default: man left, woman right) */
  flipped?: Set<string>
  /** Extra ELK options */
  elk?: Record<string, string>
  /** Person the tree is arranged around (automatic otherwise) */
  focusId?: string | null
  /** Fixed box order; defaults to the family-tree order */
  order?: string[]
}

export function buildLayoutGraph(tree: Tree, opts: GraphOptions = {}): LayoutGraph {
  const flipped = opts.flipped ?? new Set<string>()
  const ix = buildIndex(tree)
  const units = new Map<string, Unit>()
  const unitOf = new Map<string, string>()

  // People sorted by year of birth. ELK treats the order as a preference, so
  // siblings end up in age order where possible.
  const people = Object.keys(tree.members).sort(
    (a, b) => birthKey(tree, a).localeCompare(birthKey(tree, b)) || a.localeCompare(b),
  )

  for (const id of people) {
    if (unitOf.has(id)) continue
    const p = tree.members[id]
    const spouse =
      p.spouseId && tree.members[p.spouseId] && tree.members[p.spouseId].spouseId === id ? p.spouseId : null
    let members = [id]
    if (spouse) {
      const [man, woman] = p.gender === 'FEMALE' ? [spouse, id] : [id, spouse]
      members = [man, woman]
    }
    const unitId = `u:${[...members].sort().join('+')}`
    if (flipped.has(unitId)) members = [...members].reverse()
    units.set(unitId, { id: unitId, members })
    for (const m of members) unitOf.set(m, unitId)
  }

  // Hand boxes to ELK in family-tree order (see order.ts)
  const known = opts.order?.filter((id) => units.has(id)) ?? []
  const order = known.length === units.size ? known : genealogicalOrder(ix, units, unitOf, opts.focusId ?? null)
  const children: ElkNode[] = []
  for (const u of order.map((id) => units.get(id)!)) {
    const width = u.members.length * CARD.w + (u.members.length - 1) * CARD.coupleGap
    const ports: ElkPort[] = []
    u.members.forEach((pid, k) => {
      const cx = k * (CARD.w + CARD.coupleGap) + CARD.w / 2
      ports.push({ id: `${u.id}|in|${pid}`, x: cx, y: 0, layoutOptions: { 'elk.port.side': 'NORTH' } })
      if (u.members.length === 2) {
        // Children of only this parent dock below that parent's own card
        ports.push({ id: `${u.id}|out|${pid}`, x: cx, y: CARD.h, layoutOptions: { 'elk.port.side': 'SOUTH' } })
      }
    })
    ports.push({ id: `${u.id}|out`, x: width / 2, y: CARD.h, layoutOptions: { 'elk.port.side': 'SOUTH' } })
    children.push({ id: u.id, width, height: CARD.h, ports, layoutOptions: { 'elk.portConstraints': 'FIXED_POS' } })
  }

  const edges: ElkEdge[] = []
  const edgeMeta = new Map<string, EdgeMeta>()
  const seen = new Set<string>()
  const rank = new Map(order.map((id, i) => [id, i]))
  const byOrder = [...people].sort((a, b) => rank.get(unitOf.get(a)!)! - rank.get(unitOf.get(b)!)!)
  for (const child of byOrder) {
    const parents = parentsOf(ix, child)
    if (parents.length === 0) continue
    // Group by parent box: both parents in one couple → a single line from the middle
    const byUnit = new Map<string, string[]>()
    for (const p of parents) {
      const u = unitOf.get(p)!
      byUnit.set(u, [...(byUnit.get(u) ?? []), p])
    }
    for (const [u, ps] of byUnit) {
      const unit = units.get(u)!
      const fromBoth = ps.length === unit.members.length
      const source = fromBoth ? `${u}|out` : `${u}|out|${ps[0]}`
      const id = `e|${u}|${child}`
      if (seen.has(id)) continue
      seen.add(id)
      edges.push({ id, sources: [source], targets: [`${unitOf.get(child)}|in|${child}`] })
      edgeMeta.set(id, { parents: ps, child, adopted: ps.some((p) => ix.adopted.get(p)?.has(child)) })
    }
  }

  return {
    graph: { id: 'root', layoutOptions: { ...LAYOUT_OPTIONS, ...opts.elk }, children, edges },
    units,
    unitOf,
    edgeMeta,
  }
}
