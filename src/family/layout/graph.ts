// src/family/layout/graph.ts
//
// Übersetzt den Stammbaum in einen Graphen für das Layout-Programm ELK.
//
// Idee: Jedes Paar (oder jede Einzelperson) ist ein Kasten. Von seiner
// Unterkante führen Linien zu den Kindern, die oben an ihrer eigenen Karte
// andocken. ELK verteilt die Kästen dann so auf Generationen-Zeilen, dass sich
// möglichst wenige Linien kreuzen.

import { buildIndex, parentsOf, type Tree } from '../model'
import { genealogicalOrder } from './order'
import { CARD } from './types'

export type Unit = {
  id: string
  /** 1 oder 2 Personen, von links nach rechts */
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
  // Die übergebene Reihenfolge (order.ts) als Vorliebe nehmen
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.spacing.nodeNodeBetweenLayers': '84',
  'elk.spacing.nodeNode': '36',
  'elk.layered.spacing.edgeNodeBetweenLayers': '24',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '10',
  'elk.spacing.edgeEdge': '10',
}

const birthKey = (tree: Tree, id: string) => tree.members[id]?.profile?.birthDate ?? '9999'

export type GraphOptions = {
  /** Paare, bei denen die Seiten getauscht werden (Standard: Mann links, Frau rechts) */
  flipped?: Set<string>
  /** Zusätzliche ELK-Einstellungen */
  elk?: Record<string, string>
  /** Person, um die herum der Baum geordnet wird (sonst automatisch) */
  focusId?: string | null
  /** Feste Reihenfolge der Kästen; ohne Angabe die Stammbaum-Reihenfolge */
  order?: string[]
}

export function buildLayoutGraph(tree: Tree, opts: GraphOptions = {}): LayoutGraph {
  const flipped = opts.flipped ?? new Set<string>()
  const ix = buildIndex(tree)
  const units = new Map<string, Unit>()
  const unitOf = new Map<string, string>()

  // Personen nach Geburtsjahr sortiert: ELK nutzt die Reihenfolge als Vorliebe,
  // dadurch stehen Geschwister möglichst nach Alter.
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

  // Kästen in Stammbaum-Reihenfolge an ELK geben (siehe order.ts)
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
        // Kinder nur dieses Elternteils docken unter der eigenen Karte an
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
    // Nach Eltern-Kasten gruppieren: Eltern im selben Paar → eine Linie aus der Mitte
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
