// src/utils/layout/ordering.ts
// Median/Barycenter layer ordering (Sugiyama-style)
// - Couples are treated as supernodes (stay adjacent).
// - We minimize crossings by alternating top-down/bottom-up sweeps.
// - Output is an ordered list of "units" per generation (each unit = couple or single).

import type { MemberLite } from '@/types/family'

export type UnitId = string // either "C:<idA>:<idB>" for couples or "S:<id>" for singles
export type GenIndex = number

export type Unit = {
  id: UnitId
  gen: GenIndex
  memberIds: string[] // one or two members (couple)
  // computed during ordering:
  order: number
}

export type Layer = Unit[]

export type EdgeU = {
  from: UnitId // parent unit id (gen k)
  to: UnitId   // child unit id (gen k+1)
}

type GraphU = {
  layers: Layer[] // index by gen-minGen
  edges: EdgeU[]
  genOfUnit: Map<UnitId, GenIndex>
  indexOfUnit: Map<UnitId, number> // keeps current positions within layers
}

export type SupernodeBuild = {
  graph: GraphU
  minGen: number
  maxGen: number
  unitOfMember: Map<string, UnitId> // resolves memberId -> unitId
}

/** Build couple-id in sorted order for stability */
export function coupleUnitId(a: string, b: string) {
  const [x, y] = [a, b].sort()
  return `C:${x}:${y}`
}
export function singleUnitId(a: string) {
  return `S:${a}`
}

type BuildOpts = {
  gen: Record<string, number>
  map: Record<string, MemberLite>
}

/** Build layers with couple/single units and parent→child edges between units */
export function buildSupernodeLayers(opts: BuildOpts): SupernodeBuild {
  const { gen, map } = opts
  const members = Object.values(map).filter(m => m.id in gen)

  // group by gen
  const byGen = new Map<number, MemberLite[]>()
  for (const m of members) {
    const g = gen[m.id]
    if (!byGen.has(g)) byGen.set(g, [])
    byGen.get(g)!.push(m)
  }
  const gens = Array.from(byGen.keys())
  const minGen = gens.length ? Math.min(...gens) : 0
  const maxGen = gens.length ? Math.max(...gens) : 0
  const idxOfGen = (g: number) => g - minGen

  // build units per gen (couples as one unit)
  const layers: Layer[] = Array.from({ length: maxGen - minGen + 1 }, () => [])
  const usedInCouple = new Set<string>()
  for (const g of gens) {
    const arr = byGen.get(g) ?? []
    const byId: Record<string, MemberLite> = {}
    for (const m of arr) byId[m.id] = m
    for (const m of arr) {
      if (usedInCouple.has(m.id)) continue
      const sId = m.spouseId && byId[m.spouseId] ? m.spouseId : null
      if (sId) {
        const uid = coupleUnitId(m.id, sId)
        layers[idxOfGen(g)].push({ id: uid, gen: g, memberIds: [m.id, sId], order: 0 })
        usedInCouple.add(m.id); usedInCouple.add(sId)
      } else {
        const uid = singleUnitId(m.id)
        layers[idxOfGen(g)].push({ id: uid, gen: g, memberIds: [m.id], order: 0 })
      }
    }
  }

  // initial stable ordering: by id for determinism
  for (const L of layers) L.sort((a, b) => a.id.localeCompare(b.id))
  for (const [_, L] of layers.entries()) L.forEach((u, i) => (u.order = i))

  // edges: from parent unit (gen k) -> child unit (gen k+1)
  const unitOfMember = new Map<string, UnitId>()
  for (const L of layers) for (const u of L) for (const id of u.memberIds) unitOfMember.set(id, u.id)

  const edges: EdgeU[] = []
  for (const m of members) {
    const g = gen[m.id]
    for (const cId of m.childrenIds) {
      if (!(cId in gen)) continue
      const gc = gen[cId]
      if (gc !== g + 1) continue // only downward edges to next layer
      const fromU = unitOfMember.get(m.id)
      const childUnit = unitOfMember.get(cId)
      if (fromU && childUnit) edges.push({ from: fromU, to: childUnit })
    }
  }

  // index maps
  const genOfUnit = new Map<UnitId, number>()
  const indexOfUnit = new Map<UnitId, number>()
  for (const [_, L] of layers.entries()) {
    for (let i = 0; i < L.length; i++) {
      genOfUnit.set(L[i].id, L[i].gen)
      indexOfUnit.set(L[i].id, i)
    }
  }

  const g: GraphU = { layers, edges, genOfUnit, indexOfUnit }
  return { graph: g, minGen, maxGen, unitOfMember }
}

/** compute median of neighbor positions; fallback to current index */
function medianOf(list: number[], fallback: number) {
  if (!list.length) return fallback
  const a = list.slice().sort((x, y) => x - y)
  const mid = Math.floor(a.length / 2)
  return (a.length % 2 === 1) ? a[mid] : (a[mid - 1] + a[mid]) / 2
}

/** run a sweep (down=true top→bottom, else bottom→top) using median heuristic */
function sweep(graph: GraphU, down: boolean) {
  const { layers, edges, indexOfUnit } = graph
  const span = layers.length
  const start = down ? 1 : span - 2
  const end = down ? span : -1
  const step = down ? 1 : -1
  for (let li = start; li !== end; li += step) {
    const fixedLayer = layers[li - step] // previous layer is fixed
    const fixedIndex = new Map<string, number>()
    for (let i = 0; i < fixedLayer.length; i++) fixedIndex.set(fixedLayer[i].id, i)

    const cur = layers[li]
    const neighbors = new Map<string, number[]>()
    for (const u of cur) neighbors.set(u.id, [])

    for (const e of edges) {
      if (down) {
        // fixed = li-1, moving = li
        const fromIdx = fixedIndex.get(e.from)
        const toIdx = indexOfUnit.get(e.to)
        if (fromIdx != null && toIdx != null) {
          if (layers[li][toIdx].id === e.to) neighbors.get(e.to)!.push(fromIdx)
        }
      } else {
        // fixed = li+1, moving = li
        const toFixedIdx = fixedIndex.get(e.to)
        const fromIdx = indexOfUnit.get(e.from)
        if (toFixedIdx != null && fromIdx != null) {
          if (layers[li][fromIdx].id === e.from) neighbors.get(e.from)!.push(toFixedIdx)
        }
      }
    }

    // assign barycenters/medians
    const withKey = cur.map((u, i) => {
      const list = neighbors.get(u.id) ?? []
      const key = medianOf(list, i)
      return { u, i, key }
    })

    // stable sort by key, tie-breaker by old order
    withKey.sort((a, b) => (a.key - b.key) || (a.i - b.i))

    // write back
    for (let i = 0; i < withKey.length; i++) {
      cur[i] = withKey[i].u
      cur[i].order = i
      graph.indexOfUnit.set(cur[i].id, i)
    }
  }
}

/** count crossings between consecutive layers (rough measure for early stopping) */
function countCrossings(graph: GraphU) {
  const { layers, edges, indexOfUnit } = graph
  let crosses = 0

  for (let li = 0; li < layers.length - 1; li++) {
    const topUnits = layers[li]
    const botUnits = layers[li + 1]
    const edgesHere = edges.filter(e => {
      return topUnits.some(u => u.id === e.from) && botUnits.some(u => u.id === e.to)
    }).slice().sort((x, y) => {
      const xi = indexOfUnit.get(x.from)!; const xj = indexOfUnit.get(x.to)!
      const yi = indexOfUnit.get(y.from)!; const yj = indexOfUnit.get(y.to)!
      return (xi - yi) || (xj - yj)
    })
    for (let i = 0; i < edgesHere.length; i++) {
      const xi = indexOfUnit.get(edgesHere[i].from)!; const xj = indexOfUnit.get(edgesHere[i].to)!
      for (let j = i + 1; j < edgesHere.length; j++) {
        const yi = indexOfUnit.get(edgesHere[j].from)!; const yj = indexOfUnit.get(edgesHere[j].to)!
        if ((xi < yi && xj > yj) || (xi > yi && xj < yj)) crosses++
      }
    }
  }
  return crosses
}

/** Run alternating median sweeps until convergence or maxIters */
export function minimizeCrossings(graph: GraphU, maxIters = 8) {
  let last = Number.POSITIVE_INFINITY
  for (let it = 0; it < maxIters; it++) {
    sweep(graph, true)   // top → down
    sweep(graph, false)  // bottom → up
    const cur = countCrossings(graph)
    if (cur >= 0 && cur >= last) break
    last = cur
  }
  return graph
}

/**
 * Basic upstream index: median index of parents' units (one generation up).
 */
export function computeMemberUpstreamIndex(
  gen: Record<string, number>,
  map: Record<string, MemberLite>,
  build: SupernodeBuild
): Map<string, number> {
  const upstream = new Map<string, number>()
  const { graph, unitOfMember } = build

  for (const m of Object.values(map)) {
    const g = gen[m.id]
    const parentIdx: number[] = []
    for (const pId of (m.parentIds ?? [])) {
      if (!(pId in gen)) continue
      if (gen[pId] !== g - 1) continue
      const u = unitOfMember.get(pId)
      if (!u) continue
      const idx = graph.indexOfUnit.get(u)
      if (idx != null) parentIdx.push(idx)
    }
    if (parentIdx.length) {
      parentIdx.sort((a, b) => a - b)
      const mid = Math.floor(parentIdx.length / 2)
      upstream.set(m.id, (parentIdx.length % 2 === 1) ? parentIdx[mid] : (parentIdx[mid - 1] + parentIdx[mid]) / 2)
    }
  }
  return upstream
}

/**
 * Multi-level upstream index:
 * considers parents (depth=1), grandparents (depth=2), ... up to `maxDepth`,
 * aggregates via weighted median-ish score (nearer ancestors weigh more).
 */
export function computeMemberUpstreamIndexMulti(
  gen: Record<string, number>,
  map: Record<string, MemberLite>,
  build: SupernodeBuild,
  maxDepth = 2
): Map<string, number> {
  const { graph, unitOfMember } = build
  const out = new Map<string, number>()

  const unitIndex = (memberId: string): number | undefined => {
    const u = unitOfMember.get(memberId)
    return u != null ? graph.indexOfUnit.get(u) ?? undefined : undefined
  }

  const gatherAncestors = (id: string, depth: number, targetGen: number, acc: Array<{idx:number, w:number}>) => {
    if (depth === 0) return
    const m = map[id]; if (!m) return
    for (const pId of (m.parentIds ?? [])) {
      if (!(pId in gen)) continue
      // ensure it's above
      if (gen[pId] !== targetGen - 1) continue
      const idx = unitIndex(pId)
      if (idx != null) {
        const w = 1 / (maxDepth - depth + 1) // nearer = larger weight
        acc.push({ idx, w })
      }
      gatherAncestors(pId, depth - 1, gen[pId], acc)
    }
  }

  for (const m of Object.values(map)) {
    const acc: Array<{idx:number, w:number}> = []
    gatherAncestors(m.id, maxDepth, gen[m.id], acc)
    if (!acc.length) continue
    // weighted median approximation: sort by idx and take median; as tie-breaker use average with weights
    acc.sort((a, b) => a.idx - b.idx)
    const mid = Math.floor(acc.length / 2)
    let val = acc[mid].idx
    // refine with a small weighted average bonus
    const sumW = acc.reduce((s, x) => s + x.w, 0)
    const avg = acc.reduce((s, x) => s + x.idx * x.w, 0) / sumW
    val = (val + avg) / 2
    out.set(m.id, val)
  }

  return out
}
