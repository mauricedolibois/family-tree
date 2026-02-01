// src/utils/familyLayout.ts
import type { IMember } from '@/types/IMember'
import {
  MemberId, MemberLite, UnionId,
  PositionedNode, Edge, LayoutResult,
} from '@/types/family'
import {
  CARD_W, CARD_H, MIN_H_GAP, MIN_COUPLE_GAP, MIN_BLOCK_GAP, MIN_CHILD_GAP,
  MIN_V_GAP, UNION_DY, UNION_W, UNION_H
} from '@/config/layout'

import { filterBloodline, type BloodlineFilterOptions } from '@/utils/bloodline'

// layout modules
import { DEBUG_LAYOUT, dbg } from './layout/debug'
import { symmetrize, unionId, assignGenerations } from './layout/helpers'
import { enforceSpouseAdjacencyInRow, spouseLeftRight } from './layout/spouses'
import { buildBlocksForParentRow, packBlocksLeftToRight } from './layout/blocks'
import type { ChildGroup, ParentOrderIndex } from './layout/types'
import {
  registerChildGroup,
  augmentGroupsWithSingletons,
  enforceChildGroupOrderForGen,
  mergeChildGroupsBySpouses,
} from './layout/children'

// ordering
import {
  buildSupernodeLayers,
  minimizeCrossings,
  computeMemberUpstreamIndexMulti,
  type UnitId,
} from './layout/ordering'

// ————— helpers —————
function rowPersons(all: PositionedNode[], gen: number) {
  return all.filter(n => n.kind === 'person' && n.gen === gen)
}
function recenterRow(nodesInRow: PositionedNode[], targetWidth: number) {
  if (!nodesInRow.length) return
  const L = Math.min(...nodesInRow.map(n => n.x))
  const R = Math.max(...nodesInRow.map(n => n.x + n.w))
  const width = R - L
  const offset = (targetWidth - width) / 2 - L
  if (Math.abs(offset) < 0.5) return
  for (let i = 0; i < nodesInRow.length; i++) nodesInRow[i].x += offset
}

function birthDateToUtcMs(value?: string | null): number | null {
  if (!value) return null
  const trimmed = value.trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (m) {
    const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3])
    if (!Number.isNaN(y) && !Number.isNaN(mo) && !Number.isNaN(d)) {
      return Date.UTC(y, mo - 1, d)
    }
  }
  m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed)
  if (m) {
    const d = Number(m[1]); const mo = Number(m[2]); const y = Number(m[3])
    if (!Number.isNaN(y) && !Number.isNaN(mo) && !Number.isNaN(d)) {
      return Date.UTC(y, mo - 1, d)
    }
  }
  const parsed = Date.parse(trimmed)
  return Number.isNaN(parsed) ? null : parsed
}

function coupleOrderByGender(
  aId: string,
  bId: string,
  map: Record<MemberId, MemberLite>,
  nodesById: Map<string, PositionedNode>
): [string, string] {
  const aNode = nodesById.get(aId)
  const bNode = nodesById.get(bId)
  if (aNode && bNode) {
    const [L, R] = spouseLeftRight(aNode, bNode)
    return [L.id, R.id]
  }
  const gA = map[aId]?.gender?.toString().toUpperCase() || 'OTHER'
  const gB = map[bId]?.gender?.toString().toUpperCase() || 'OTHER'
  if (gA === 'MALE' && gB === 'FEMALE') return [aId, bId]
  if (gA === 'FEMALE' && gB === 'MALE') return [bId, aId]
  return aId < bId ? [aId, bId] : [bId, aId]
}

function computeParentOrderForRow(
  row: PositionedNode[],
  map: Record<MemberId, MemberLite>
): Map<string, number> {
  const byId: Record<string, PositionedNode> = {}
  for (const n of row) byId[n.id] = n
  const sorted = row.slice().sort((a, b) => a.x - b.x)
  const visited = new Set<string>()
  const order = new Map<string, number>()
  let idx = 0

  for (const n of sorted) {
    if (visited.has(n.id)) continue
    const sId = map[n.id]?.spouseId ?? null
    if (sId && byId[sId] && !visited.has(sId)) {
      const [L, R] = spouseLeftRight(n, byId[sId])
      order.set(L.id, idx)
      order.set(R.id, idx)
      visited.add(L.id); visited.add(R.id)
      idx += 1
    } else {
      order.set(n.id, idx)
      visited.add(n.id)
      idx += 1
    }
  }
  return order
}

function sortChildIdsByAge(ids: string[], map: Record<MemberId, MemberLite>): string[] {
  if (ids.length <= 1) return ids.slice()
  const withMeta = ids.map((id, idx) => {
    const birthDate = map[id]?.raw?.profile?.birthDate ?? null
    return { id, idx, ts: birthDateToUtcMs(birthDate) }
  })
  withMeta.sort((a, b) => {
    if (a.ts != null && b.ts != null && a.ts !== b.ts) return a.ts - b.ts
    if (a.ts != null) return -1
    if (b.ts != null) return 1
    return a.idx - b.idx
  })
  return withMeta.map(x => x.id)
}

function enforceChildOrderByParent(
  gen: number,
  nodesById: Map<string, PositionedNode>,
  map: Record<MemberId, MemberLite>,
  orderIndex: Map<string, number>,
  birthTsById: Map<string, number>,
  ownerIndex?: Map<string, number>
) {
  const row = rowPersons(Array.from(nodesById.values()), gen)
  if (!row.length) return

  const byId: Record<string, PositionedNode> = {}
  for (const n of row) byId[n.id] = n

  const baseOrderFor = (id: string) => {
    const directOwner = ownerIndex?.get(id)
    if (directOwner != null) return directOwner
    const direct = orderIndex.get(id)
    if (direct != null) return direct
    return 1e9
  }

  const effectiveOrder = new Map<string, number>()
  for (const n of row) {
    if (effectiveOrder.has(n.id)) continue
    const sId = map[n.id]?.spouseId ?? null
    if (sId && byId[sId]) {
      const a = baseOrderFor(n.id)
      const b = baseOrderFor(sId)
      let ord = 1e9
      if (a !== 1e9 && b !== 1e9) {
        ord = Math.min(a, b)
      } else if (a !== 1e9) {
        ord = a
      } else if (b !== 1e9) {
        ord = b
      }
      effectiveOrder.set(n.id, ord)
      effectiveOrder.set(sId, ord)
    } else {
      effectiveOrder.set(n.id, baseOrderFor(n.id))
    }
  }

  const groups = new Map<number, string[]>()
  for (const n of row) {
    const ord = effectiveOrder.get(n.id) ?? 1e9
    if (!groups.has(ord)) groups.set(ord, [])
    groups.get(ord)!.push(n.id)
  }

  const orders = Array.from(groups.keys()).sort((a, b) => a - b)

  for (const ord of orders) {
    const ids = groups.get(ord) ?? []
    ids.sort((a, b) => {
      const ta = birthTsById.get(a)
      const tb = birthTsById.get(b)
      if (ta != null && tb != null && ta !== tb) return ta - tb
      if (ta != null) return -1
      if (tb != null) return 1
      return (byId[a]?.x ?? 0) - (byId[b]?.x ?? 0)
    })

    const used = new Set<string>()
    type Unit = { ids: string[]; key: number }
    const units: Unit[] = []

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      if (used.has(id)) continue
      const sId = map[id]?.spouseId ?? null
      const hasSpouse =
        sId && byId[sId] && !used.has(sId) && (effectiveOrder.get(sId) ?? 1e9) === ord
      if (hasSpouse) {
        const [L, R] = spouseLeftRight(byId[id], byId[sId])
        const ta = birthTsById.get(L.id)
        const tb = birthTsById.get(R.id)
        const key = Math.min(
          ta != null ? ta : Number.POSITIVE_INFINITY,
          tb != null ? tb : Number.POSITIVE_INFINITY
        )
        units.push({ ids: [L.id, R.id], key })
        used.add(L.id)
        used.add(R.id)
      } else {
        const key = birthTsById.get(id) ?? Number.POSITIVE_INFINITY
        units.push({ ids: [id], key })
        used.add(id)
      }
    }

    units.sort((a, b) => a.key - b.key)

    const groupLeft = Math.min(...ids.map(id => byId[id]?.x ?? 0))
    const groupRight = Math.max(...ids.map(id => (byId[id]?.x ?? 0) + (byId[id]?.w ?? CARD_W)))
    const groupWidth = Math.max(0, groupRight - groupLeft)
    const totalWidth =
      units.reduce((s, u) => s + (u.ids.length === 2 ? (CARD_W * 2 + MIN_COUPLE_GAP) : CARD_W), 0) +
      (units.length > 1 ? (units.length - 1) * MIN_CHILD_GAP : 0)
    let cursor = groupLeft
    if (totalWidth <= groupWidth && Number.isFinite(groupWidth)) {
      cursor = groupLeft + (groupWidth - totalWidth) / 2
    }

    for (const u of units) {
      if (u.ids.length === 2) {
        const leftId = u.ids[0]
        const rightId = u.ids[1]
        const leftNode = byId[leftId]
        const rightNode = byId[rightId]
        if (leftNode) leftNode.x = cursor
        if (rightNode) rightNode.x = cursor + CARD_W + MIN_COUPLE_GAP
        cursor += (CARD_W * 2 + MIN_COUPLE_GAP + MIN_CHILD_GAP)
      } else {
        const onlyId = u.ids[0]
        const node = byId[onlyId]
        if (node) node.x = cursor
        cursor += CARD_W + MIN_CHILD_GAP
      }
    }
  }
}

export function computeLayout(map: Record<MemberId, MemberLite>, rootId: MemberId): LayoutResult {
  if (DEBUG_LAYOUT) console.groupCollapsed('[familyLayout] computeLayout')

  symmetrize(map)
  const gen = assignGenerations(map, rootId)

  // Global layer order (median sweeps)
  const build = buildSupernodeLayers({ gen, map })
  // Align ordering with the "first parents anchor" rule for child couples
  {
    const fullEdges = build.graph.edges.slice()
    const isCoupleUnit = (id: string) => id.startsWith('C:')
    let prevKey = ''
    for (let iter = 0; iter < 3; iter++) {
      const anchorByChild = new Map<string, string>()
      const parentsByChild = new Map<string, Set<string>>()
      for (const e of fullEdges) {
        if (!isCoupleUnit(e.to)) continue
        if (!parentsByChild.has(e.to)) parentsByChild.set(e.to, new Set())
        parentsByChild.get(e.to)!.add(e.from)
      }
      for (const [childU, parents] of parentsByChild.entries()) {
        let best: string | null = null
        let bestIdx = Number.POSITIVE_INFINITY
        for (const p of parents) {
          const idx = build.graph.indexOfUnit.get(p)
          if (idx == null) continue
          if (idx < bestIdx) {
            bestIdx = idx
            best = p
          }
        }
        if (best) anchorByChild.set(childU, best)
      }

      const key = Array.from(anchorByChild.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([c, p]) => `${c}->${p}`)
        .join('|')
      if (key === prevKey) break
      prevKey = key

      build.graph.edges = fullEdges.filter((e) => {
        if (!isCoupleUnit(e.to)) return true
        const anchor = anchorByChild.get(e.to)
        return !anchor || e.from === anchor
      })
      minimizeCrossings(build.graph, 6)
    }
  }

  // Multi-level upstream index (parents+grandparents+great-grandparents)
  const upstreamIndex = computeMemberUpstreamIndexMulti(gen, map, build, 3)
  const birthTsById = new Map<string, number>()
  for (const m of Object.values(map)) {
    const ts = birthDateToUtcMs(m.raw?.profile?.birthDate ?? null)
    if (ts != null) birthTsById.set(m.id, ts)
  }

  // Helpers
  const orderedUnitsByGenIndex = build.graph.layers.map(L => L.map(u => u))
  const unitMembers = new Map<UnitId, string[]>()
  for (const L of build.graph.layers) for (const u of L) unitMembers.set(u.id, u.memberIds)

  // Node stores
  const nodesById = new Map<string, PositionedNode>()
  const unionById = new Map<string, PositionedNode>()
  const edges: Edge[] = []
  const lockedAsParent = new Set<string>()

  // child groups + mapping
  const childGroupsByGen = new Map<number, ChildGroup[]>()
  const childGroupOfId = new Map<string, string>()
  const parentOrderIndexByGen = new Map<number, ParentOrderIndex>()
  const fineOrderIndexByGen = new Map<number, Map<string, number>>() // childId -> fine index
  const lockedIdsByGen = new Map<number, Set<string>>() // keep spouses together once placed
  const childOwnerOrderByGen = new Map<number, Map<string, number>>() // childId -> parent block order
  const parentGroupOrderByGen = new Map<number, Map<string, number>>() // parentId -> group order

  const genY: Record<number, number> = {}
  for (let g = build.minGen; g <= build.maxGen; g++) genY[g] = (g - build.minGen) * (CARD_H + MIN_V_GAP)

  // upserts
  const upsertPersonNode = (
    id: string, genVal: number, x: number, y: number, dataFromMap: MemberLite | undefined
  ): PositionedNode | null => {
    if (!dataFromMap) return null
    const existing = nodesById.get(id)
    if (existing) {
      existing.gen = genVal; existing.x = x; existing.y = y
      existing.w = CARD_W; existing.h = CARD_H; existing.data = dataFromMap
      return existing
    }
    const node: PositionedNode = { id, kind: 'person', gen: genVal, x, y, w: CARD_W, h: CARD_H, data: dataFromMap }
    nodesById.set(id, node)
    return node
  }
  const getPerson = (id: string) => nodesById.get(id)
  const upsertUnionNode = (
    id: string, genVal: number, x: number, y: number, data: { a: MemberLite; b?: MemberLite | null }
  ): PositionedNode => {
    const existing = unionById.get(id)
    if (existing) { existing.gen = genVal; existing.x = x; existing.y = y; existing.w = UNION_W; existing.h = UNION_H; existing.data = data; return existing }
    const node: PositionedNode = { id, kind: 'union', gen: genVal, x, y, w: UNION_W, h: UNION_H, data }
    unionById.set(id, node)
    return node
  }

  const isAdoptedEdge = (parentIds: string[], childId: string): boolean => {
    const pA = parentIds[0] ? map[parentIds[0]] : undefined
    const pB = parentIds[1] ? map[parentIds[1]] : undefined
    const aHas = !!pA?.adoptedChildrenIds?.includes(childId)
    const bHas = !!pB?.adoptedChildrenIds?.includes(childId)
    return aHas || bHas
  }

  // ---------- 1) Eltern in globaler Reihenfolge platzieren, Paare „strangbewusst“ drehen ----------
  const X_GAP = MIN_H_GAP
  for (let g = build.minGen; g <= build.maxGen; g++) {
    const layerIdx = g - build.minGen
    const units = orderedUnitsByGenIndex[layerIdx] ?? []
    let cursorX = 0
    for (let ui = 0; ui < units.length; ui++) {
      const U = units[ui]
      const members = unitMembers.get(U.id) ?? []
      if (members.length === 2) {
        const aId = members[0], bId = members[1]
        const upA = upstreamIndex.get(aId)
        const upB = upstreamIndex.get(bId)
        let leftId = aId, rightId = bId
        if (upA != null && upB != null && upA > upB) {
          leftId = bId; rightId = aId
        }
        const left  = upsertPersonNode(leftId,  g, cursorX, genY[g], map[leftId])!
        const right = upsertPersonNode(rightId, g, cursorX + CARD_W + MIN_COUPLE_GAP, genY[g], map[rightId])!
        lockedAsParent.add(left.id); lockedAsParent.add(right.id)
        cursorX = right.x + CARD_W + X_GAP
      } else if (members.length === 1) {
        const p = upsertPersonNode(members[0], g, cursorX, genY[g], map[members[0]])!
        lockedAsParent.add(p.id)
        cursorX = p.x + CARD_W + X_GAP
      }
    }
  }

  // leicht komprimieren (nur Eltern, Reihenfolge bleibt)
  for (let g = build.minGen; g <= build.maxGen; g++) {
    const row = rowPersons(Array.from(nodesById.values()), g)
    enforceSpouseAdjacencyInRow(row)
    const blocks = buildBlocksForParentRow(row)
    packBlocksLeftToRight(blocks, MIN_BLOCK_GAP)
  }

  // ---------- 2) Eltern-Blöcke aus realen Nodes bilden — MIT EXKLUSIVEN KINDERN ----------
  type PBlock = {
    gen: number
    parentIds: string[]
    childrenIds: string[]
    x: number
    width: number
    // sortX steuert ausschließlich die Order (damit Single-Parent-Blöcke L/R neben dem Paar stehen)
    sortX: number
    // groupKey: gleich für zusammengehörige Blöcke (z. B. Couple + exklusive Kinder)
    groupKey: string
  }
  const blocksByGen = new Map<number, PBlock[]>()

  for (let g = build.minGen; g <= build.maxGen; g++) {
    const row = rowPersons(Array.from(nodesById.values()), g).sort((a, b) => a.x - b.x)
    const perGen: PBlock[] = []
    const seenCouple = new Set<string>() // mark spouses paired in a couple block

    const byId: Record<string, PositionedNode> = {}
    for (const n of row) byId[n.id] = n

    for (const n of row) {
      if (seenCouple.has(n.id)) continue
      const sId = (n.data as MemberLite | undefined)?.spouseId
      if (sId && byId[sId] && !seenCouple.has(sId)) {
        // Couple block: gemeinsame Kinder (Schnittmenge)
        const L = n.x <= byId[sId].x ? n : byId[sId]
        const R = L === n ? byId[sId] : n
        const parentIds = [L.id, R.id]
        const coupleKey = `C:${[L.id, R.id].sort().join('|')}`
        const left = L.x
        const width = (R.x + R.w) - L.x
        const aKids = sortChildIdsByAge(map[L.id]?.childrenIds ?? [], map)
        const bKids = sortChildIdsByAge(map[R.id]?.childrenIds ?? [], map)
        const shared: string[] = []
        const exclL: string[] = []
        const exclR: string[] = []
        const bSet = new Set(bKids)
        const aSet = new Set(aKids)
        for (const k of aKids) if (bSet.has(k) && map[k]) shared.push(k)
        for (const k of aKids) if (!bSet.has(k) && map[k]) exclL.push(k)
        for (const k of bKids) if (!aSet.has(k) && map[k]) exclR.push(k)

        const center = left + width / 2

        // Couple block with shared children (sortX = center)
        perGen.push({ gen: g, parentIds, childrenIds: shared, x: left, width, sortX: center, groupKey: coupleKey })
        seenCouple.add(L.id); seenCouple.add(R.id)

        // Single-parent blocks for exclusive kids:
        // - linke exklusive Kinder LINKS vom Paar (leicht vorziehen)
        if (exclL.length) {
          const lx = L.x
          perGen.push({
            gen: g, parentIds: [L.id], childrenIds: exclL,
            x: lx, width: L.w, sortX: lx - 0.001, // garantiert links eingeordnet
            groupKey: coupleKey
          })
        }
        // - rechte exklusive Kinder RECHTS vom Paar (leicht nachschieben)
        if (exclR.length) {
          const rx = R.x
          perGen.push({
            gen: g, parentIds: [R.id], childrenIds: exclR,
            x: rx, width: R.w, sortX: rx + R.w + 0.001, // garantiert rechts eingeordnet
            groupKey: coupleKey
          })
        }

      } else {
        // Single parent (ohne sichtbaren Partner)
        const parentIds = [n.id]
        const kids = sortChildIdsByAge(map[n.id]?.childrenIds ?? [], map).filter(id => !!map[id])
        perGen.push({
          gen: g, parentIds, childrenIds: kids, x: n.x, width: n.w, sortX: n.x + n.w / 2,
          groupKey: `S:${n.id}`
        })
      }
    }

    // sort blocks by sortX (nicht schlicht x, damit Single-L/R fair positioniert werden)
    perGen.sort((A, B) => A.sortX - B.sortX)
    blocksByGen.set(g, perGen)
  }

  // ---------- 3) Unions + Kinder platzieren; ParentOrderIndex & feine Indizes (multi-level) ----------
  const parentCentersByGen = new Map<number, Map<number, number[]>>() // childGen -> order -> centers[]
  function placeChildrenUnderBlock(b: PBlock, blockOrder: number) {
    if (b.childrenIds.length === 0) return
    const childIds = sortChildIdsByAge(b.childrenIds.filter(cid => !!map[cid]), map)
    if (!childIds.length) return

    const yUnion = genY[b.gen] + CARD_H + UNION_DY
    let unionCenterX: number
    if (b.parentIds.length === 2) {
      const a = getPerson(b.parentIds[0])!, c = getPerson(b.parentIds[1])!
      const axC = a.x + a.w / 2, bxC = c.x + c.w / 2
      unionCenterX = Math.min(axC, bxC) + Math.abs(axC - bxC) / 2
    } else {
      const p = getPerson(b.parentIds[0])!
      unionCenterX = p.x + p.w / 2
    }

    const uid: string =
      b.parentIds.length === 2
        ? (unionId(b.parentIds[0] as MemberId, b.parentIds[1] as MemberId) as string)
        : `U:${b.parentIds[0]}:_`

    const unionNode = upsertUnionNode(
      uid, b.gen,
      unionCenterX - UNION_W / 2,
      yUnion,
      b.parentIds.length === 2
        ? { a: map[b.parentIds[0]]!, b: map[b.parentIds[1]]! }
        : { a: map[b.parentIds[0]]!, b: null }
    )

    const childGen = b.gen + 1
    const yChild = genY[childGen] ?? (childGen - build.minGen) * (CARD_H + MIN_V_GAP)
    genY[childGen] = yChild

    if (!lockedIdsByGen.has(childGen)) lockedIdsByGen.set(childGen, new Set())
    const locked = lockedIdsByGen.get(childGen)!
    const wasLocked = new Set(locked)

    // ensure fineIndex map for this child generation
    if (!fineOrderIndexByGen.has(childGen)) fineOrderIndexByGen.set(childGen, new Map())
    const fineIdxMap = fineOrderIndexByGen.get(childGen)!

    type ChildUnit = { childId: string; ids: string[]; width: number }
    const units: ChildUnit[] = []
    const used = new Set<string>()
    for (const cid of childIds) {
      if (used.has(cid)) continue
      if (locked.has(cid)) {
        used.add(cid)
        continue
      }
      const spouseId = map[cid]?.spouseId ?? null
      const ownerMap = childOwnerOrderByGen.get(childGen)
      const spouseOrder = spouseId ? ownerMap?.get(spouseId) : undefined
      const hasSpouse =
        !!(spouseId && map[spouseId] && !used.has(spouseId)) &&
        (spouseOrder == null || spouseOrder === blockOrder)
      if (hasSpouse) {
        const [leftId, rightId] = coupleOrderByGender(cid, spouseId!, map, nodesById)
        units.push({
          childId: cid,
          ids: [leftId, rightId],
          width: CARD_W * 2 + MIN_COUPLE_GAP,
        })
        used.add(leftId)
        used.add(rightId)
        locked.add(leftId)
        locked.add(rightId)
      } else {
        units.push({ childId: cid, ids: [cid], width: CARD_W })
        used.add(cid)
        locked.add(cid)
      }
    }

    const totalUnitsWidth =
      units.reduce((s, u) => s + u.width, 0) +
      (units.length > 1 ? (units.length - 1) * MIN_CHILD_GAP : 0)
    let startX = unionCenterX - totalUnitsWidth / 2

    const newChildIds: string[] = []
    for (const cid of childIds) {
      const adopted = isAdoptedEdge(b.parentIds, cid)
      // fine parent index (multi-level barycenter up to depth 3)
      const pUnits: number[] = []
      const parents = (map[cid]?.parentIds ?? [])
      for (const pId of parents) {
        const u = build.unitOfMember.get(pId)
        const idx = u != null ? build.graph.indexOfUnit.get(u) : undefined
        if (idx != null) pUnits.push(idx)
        // grandparents
        const gp = (map[pId]?.parentIds ?? [])
        for (const gpId of gp) {
          const ugp = build.unitOfMember.get(gpId)
          const idxgp = ugp != null ? build.graph.indexOfUnit.get(ugp) : undefined
          if (idxgp != null) pUnits.push(idxgp + 0.25 * Math.sign(idxgp))
          // great-grandparents (kleiner Einfluss)
          const ggp = (map[gpId]?.parentIds ?? [])
          for (const ggpId of ggp) {
            const uggp = build.unitOfMember.get(ggpId)
            const idxggp = uggp != null ? build.graph.indexOfUnit.get(uggp) : undefined
            if (idxggp != null) pUnits.push(idxggp + 0.1 * Math.sign(idxggp))
          }
        }
      }
      if (pUnits.length && !wasLocked.has(cid)) {
        pUnits.sort((a, b) => a - b)
        const mid = Math.floor(pUnits.length / 2)
        const med = (pUnits.length % 2 === 1) ? pUnits[mid] : (pUnits[mid - 1] + pUnits[mid]) / 2
        const avg = pUnits.reduce((s, v) => s + v, 0) / pUnits.length
        fineIdxMap.set(cid, (med + avg) / 2 + blockOrder * 1e-3)
      }

      edges.push({
        id: `e-${uid}-${cid}`,
        from: unionNode.id,
        to: cid,
        fromSide: 'bottom',
        toSide: 'top',
        adopted,
      })
      if (!wasLocked.has(cid)) newChildIds.push(cid)
    }

    for (const u of units) {
      if (u.ids.length === 2) {
        const leftId = u.ids[0]
        const rightId = u.ids[1]
        upsertPersonNode(leftId, childGen, startX, genY[childGen], map[leftId])
        upsertPersonNode(
          rightId,
          childGen,
          startX + CARD_W + MIN_COUPLE_GAP,
          genY[childGen],
          map[rightId]
        )
      } else {
        const onlyId = u.ids[0]
        upsertPersonNode(onlyId, childGen, startX, genY[childGen], map[onlyId])
      }
      startX += u.width + MIN_CHILD_GAP
    }

    const unitIds: string[] = []
    for (const u of units) unitIds.push(...u.ids)

    if (unitIds.length) {
      if (!parentOrderIndexByGen.has(childGen)) parentOrderIndexByGen.set(childGen, new Map())
      const idx = parentOrderIndexByGen.get(childGen)!
      newChildIds.forEach(id => { if (!idx.has(id)) idx.set(id, blockOrder) })
      unitIds.forEach(id => { if (!idx.has(id)) idx.set(id, blockOrder) })

      registerChildGroup(childGroupsByGen, childGroupOfId, childGen, blockOrder, unitIds)

      if (!parentCentersByGen.has(childGen)) parentCentersByGen.set(childGen, new Map())
      const centersForGen = parentCentersByGen.get(childGen)!
      if (!centersForGen.has(blockOrder)) centersForGen.set(blockOrder, [])
      centersForGen.get(blockOrder)!.push(unionCenterX)
    }

    // Parent → Union edges
    if (b.parentIds.length === 2) {
      if (getPerson(b.parentIds[0])) edges.push({ id: `e-${b.parentIds[0]}-${uid}`, from: b.parentIds[0], to: uid, fromSide: 'bottom', toSide: 'top' })
      if (getPerson(b.parentIds[1])) edges.push({ id: `e-${b.parentIds[1]}-${uid}`, from: b.parentIds[1], to: uid, fromSide: 'bottom', toSide: 'top' })
    } else {
      if (getPerson(b.parentIds[0])) edges.push({ id: `e-${b.parentIds[0]}-${uid}`, from: b.parentIds[0], to: uid, fromSide: 'bottom', toSide: 'top' })
    }
  }

  // Reihenfolge der Blöcke pro Gen (nach sortX), Kinder setzen
  for (let g = build.minGen; g <= build.maxGen; g++) {
    const blocks = (blocksByGen.get(g) ?? []).slice().sort((A, B) => A.sortX - B.sortX)
    blocksByGen.set(g, blocks)
    const parentRow = rowPersons(Array.from(nodesById.values()), g)
    if (!parentGroupOrderByGen.has(g)) {
      parentGroupOrderByGen.set(g, computeParentOrderForRow(parentRow, map))
    }
    const parentGroupOrder = parentGroupOrderByGen.get(g)!

    const childGen = g + 1
    if (!childOwnerOrderByGen.has(childGen)) childOwnerOrderByGen.set(childGen, new Map())
    const owner = childOwnerOrderByGen.get(childGen)!
    const groupOrderByKey = new Map<string, number>()

    const resolveBlockOrder = (b: PBlock, fallback: number) => {
      if (b.parentIds.length === 2) {
        const aOrd = parentGroupOrder.get(b.parentIds[0])
        const bOrd = parentGroupOrder.get(b.parentIds[1])
        if (aOrd != null && bOrd != null) return Math.min(aOrd, bOrd)
        if (aOrd != null) return aOrd
        if (bOrd != null) return bOrd
      } else {
        const ord = parentGroupOrder.get(b.parentIds[0])
        if (ord != null) return ord
      }
      return fallback
    }

    for (let i = 0; i < blocks.length; i++) {
      const key = blocks[i].groupKey
      const blockOrder = resolveBlockOrder(blocks[i], i)
      const prev = groupOrderByKey.get(key)
      if (prev == null || blockOrder < prev) groupOrderByKey.set(key, blockOrder)
    }

    for (let i = 0; i < blocks.length; i++) {
      const key = blocks[i].groupKey
      const groupOrder = groupOrderByKey.get(key) ?? resolveBlockOrder(blocks[i], i)
      const kids = blocks[i].childrenIds ?? []
      for (const cid of kids) if (!owner.has(cid)) owner.set(cid, groupOrder)
    }
    for (let i = 0; i < blocks.length; i++) {
      const key = blocks[i].groupKey
      const groupOrder = groupOrderByKey.get(key) ?? resolveBlockOrder(blocks[i], i)
      placeChildrenUnderBlock(blocks[i], groupOrder)
    }
  }

  // ---------- 4) Kindergruppen packen & unter Eltern-Zentren ausrichten ----------
  {
    const gensWithAny = Array.from(new Set(Array.from(nodesById.values()).map(n => n.gen))).sort((a, b) => a - b)
    for (const g of gensWithAny) {
      if (g <= build.minGen) continue
      const row = rowPersons(Array.from(nodesById.values()), g)
      if (row.length === 0) continue

      const idx = parentOrderIndexByGen.get(g) ?? new Map()

      augmentGroupsWithSingletons(g, childGroupsByGen, childGroupOfId, row, idx)
      mergeChildGroupsBySpouses(g, childGroupsByGen, row)

      const membership = new Map<string, string>()
      for (const gr of (childGroupsByGen.get(g) ?? [])) {
        const key = `${g}#${gr.order}`
        for (const id of gr.ids) membership.set(id, key)
      }

      // Spouse override: keep couples together and anchor to the first parents' order
      {
        const ownerIdx = childOwnerOrderByGen.get(g)
        const orderFor = (id: string) => {
          const o = ownerIdx?.get(id)
          if (o != null) return o
          const p = idx.get(id)
          if (p != null) return p
          return 1e9
        }
        const byId: Record<string, PositionedNode> = {}
        for (const n of row) byId[n.id] = n
        const forced = new Map<string, number>()
        for (const n of row) {
          if (forced.has(n.id)) continue
          const sId = (n.data as MemberLite | undefined)?.spouseId ?? null
          if (!sId || !byId[sId]) continue
          const a = orderFor(n.id)
          const b = orderFor(sId)
          if (a === 1e9 && b === 1e9) continue
          const ord = Math.min(a, b)
          forced.set(n.id, ord)
          forced.set(sId, ord)
        }
        for (const [id, ord] of forced.entries()) {
          membership.set(id, `${g}#${ord}`)
        }
      }

      // desired centers aus Union-Zentren mitteln
      const desiredCenterByOrder = new Map<number, number>()
      const centers = parentCentersByGen.get(g)
      if (centers) {
        for (const [order, arr] of centers.entries()) {
          if (arr.length) desiredCenterByOrder.set(order, arr.reduce((a, b) => a + b, 0) / arr.length)
        }
      }

      const fineIdx = fineOrderIndexByGen.get(g)
      enforceChildGroupOrderForGen(
        g,
        childGroupsByGen,
        row,
        membership,
        idx,
        desiredCenterByOrder,
        fineIdx,
        birthTsById
      )

      const ownerIdx = childOwnerOrderByGen.get(g)
      enforceChildOrderByParent(g, nodesById, map, idx, birthTsById, ownerIdx)
    }
  }

  // ---------- 5) Vertikalabstände & Recentern ----------
  const allGens = Array.from(new Set(Array.from(nodesById.values()).map(n => n.gen))).sort((a, b) => a - b)
  const rowY: Record<number, number> = {}
  for (const g of allGens) {
    const row = rowPersons(Array.from(nodesById.values()), g)
    rowY[g] = row.length ? row[0].y : ((g - build.minGen) * (CARD_H + MIN_V_GAP))
  }
  for (let i = 0; i < allGens.length - 1; i++) {
    const g = allGens[i], ng = allGens[i + 1]
    const neededY = rowY[g] + CARD_H + MIN_V_GAP
    if (rowY[ng] < neededY) {
      const dy = neededY - rowY[ng]
      for (const n of Array.from(nodesById.values())) if (n.gen >= ng) n.y += dy
      for (const u of Array.from(unionById.values())) if (u.gen >= ng) u.y += dy
      for (let j = i + 1; j < allGens.length; j++) rowY[allGens[j]] += dy
    }
  }

  const rowsByGen = new Map<number, PositionedNode[]>()
  for (const n of Array.from(nodesById.values())) {
    if (!rowsByGen.has(n.gen)) rowsByGen.set(n.gen, [])
    rowsByGen.get(n.gen)!.push(n)
  }

  let maxRowWidth = 0
  for (const arr of rowsByGen.values()) {
    if (!arr.length) continue
    const L = Math.min(...arr.map(n => n.x))
    const R = Math.max(...arr.map(n => n.x + n.w))
    const W = R - L
    if (W > maxRowWidth) maxRowWidth = W
  }
  for (const [_, arr] of Array.from(rowsByGen.entries())) recenterRow(arr, maxRowWidth)

  // Union-X nachziehen
  for (const u of Array.from(unionById.values())) {
    const data = u.data as { a: MemberLite; b?: MemberLite | null }
    if (data?.a && data?.b) {
      const aN = nodesById.get(data.a.id)!, bN = nodesById.get(data.b!.id)!
      const ax = aN.x + aN.w / 2, bx = bN.x + bN.w / 2
      u.x = Math.min(ax, bx) + Math.abs(ax - bx) / 2 - UNION_W / 2
    } else if (data?.a) {
      const pN = nodesById.get(data.a.id)!
      u.x = (pN.x + pN.w / 2) - UNION_W / 2
    }
  }

  // ---------- 6) Bounds ----------
  const personNodes = Array.from(nodesById.values())
  const unionNodes = Array.from(unionById.values())
  const allNodes = personNodes.concat(unionNodes)
  if (allNodes.length === 0) {
    if (DEBUG_LAYOUT) console.groupEnd()
    return { nodes: [], edges: [], width: 800, height: 600, minGen: build.minGen, maxGen: build.maxGen }
  }
  const minX = Math.min(...allNodes.map(n => n.x))
  const minY = Math.min(...allNodes.map(n => n.y))
  const dx = minX < 0 ? -minX + 60 : 60
  const dy = minY < 0 ? -minY + 60 : 60
  for (const n of allNodes) { n.x += dx; n.y += dy }
  const maxX = Math.max(...allNodes.map(n => n.x + n.w))
  const maxY = Math.max(...allNodes.map(n => n.y + n.h))
  const width = maxX + 60
  const height = maxY + 60

  if (DEBUG_LAYOUT) {
    dbg('result sizes', { width, height, nodes: allNodes.length, edges: edges.length })
    console.groupEnd()
  }

  return { nodes: allNodes, edges, width, height, minGen: build.minGen, maxGen: build.maxGen }
}

// Utility to build a flat map from your current IMember graph
export function buildFlatMemberMap(root: IMember): Record<MemberId, MemberLite> {
  const flat = new Map<string, IMember>()
  const stack: IMember[] = [root]
  while (stack.length) {
    const m = stack.pop()!
    if (!m || flat.has(m.id)) continue
    flat.set(m.id, m)
    if ((m as any).children) stack.push(...(m as any).children)
    if ((m as any).parents) stack.push(...(m as any).parents)
    if ((m as any).spouse) stack.push((m as any).spouse)
  }

  const map: Record<MemberId, MemberLite> = {}
  for (const m of Array.from(flat.values())) {
    map[m.id] = {
      id: m.id,
      name: m.name,
      gender: (m as any).gender ?? 'OTHER',
      spouseId: (m as any).spouse?.id ?? (m as any).spouseId ?? null,
      parentIds: ((m as any).parentIds ?? []).filter(Boolean),
      childrenIds:
        ((m as any).children?.map((c: IMember) => c.id) ?? (m as any).childrenIds ?? []).filter(Boolean),
      adoptedChildrenIds: Array.isArray((m as any).adoptedChildrenIds)
        ? ((m as any).adoptedChildrenIds as string[]).slice()
        : [],
      raw: m,
    }
  }
  return map
}

export function computeLayoutFiltered(
  full: Record<MemberId, MemberLite>,
  focusId?: MemberId | null,
  opts?: { includeSpouses?: boolean; kinDepth?: import('@/utils/bloodline').KinDepth }
): LayoutResult {
  let sub = full
  if (focusId && full[focusId]) {
    const filterOpts: BloodlineFilterOptions = {
      includeSpouses: !!opts?.includeSpouses,
      kinDepth: (opts?.kinDepth ?? 0) as any,
    }
    sub = filterBloodline(full, focusId, filterOpts)
  }
  const rootId = focusId && sub[focusId] ? focusId : Object.keys(sub)[0]
  return computeLayout(sub, rootId)
}
