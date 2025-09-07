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

// ————— helpers —————

function symmetrize(map: Record<MemberId, MemberLite>) {
  for (const m of Object.values(map)) {
    for (const cId of m.childrenIds) {
      const c = map[cId]
      if (c && !c.parentIds.includes(m.id)) c.parentIds.push(m.id)
    }
    for (const pId of m.parentIds) {
      const p = map[pId]
      if (p && !p.childrenIds.includes(m.id)) p.childrenIds.push(m.id)
    }
  }
}

function unionId(a: MemberId, b: MemberId | null | undefined): UnionId | null {
  if (!a || !b) return null
  const [x, y] = [a, b].sort()
  return `U:${x}:${y}`
}

function assignGenerations(map: Record<MemberId, MemberLite>, rootId: MemberId): Record<MemberId, number> {
  const gen: Record<MemberId, number> = {}
  const q: Array<MemberId> = [rootId]
  gen[rootId] = 0

  while (q.length) {
    const cur = q.shift()!
    const m = map[cur]
    if (!m) continue
    const g = gen[cur]

    for (let i = 0; i < m.parentIds.length; i++) {
      const pId = m.parentIds[i]
      if (!map[pId]) continue
      if (!(pId in gen)) { gen[pId] = g - 1; q.push(pId) }
    }
    for (let i = 0; i < m.childrenIds.length; i++) {
      const cId = m.childrenIds[i]
      if (!map[cId]) continue
      if (!(cId in gen)) { gen[cId] = g + 1; q.push(cId) }
    }
    const sId = m.spouseId ?? null
    if (sId && map[sId] && !(sId in gen)) { gen[sId] = g; q.push(sId) }
  }

  // Paare nivellieren
  for (const m of Object.values(map)) {
    if (m.spouseId && (m.id in gen) && (m.spouseId in gen)) {
      const gA = gen[m.id]
      const gB = gen[m.spouseId]
      if (gA !== gB) {
        const newG = Math.round((gA + gB) / 2)
        gen[m.id] = newG
        gen[m.spouseId] = newG
      }
    }
  }
  return gen
}

function buildUnions(map: Record<MemberId, MemberLite>) {
  const unions: Record<UnionId, { a: MemberLite; b: MemberLite, children: MemberLite[] }> = {}
  for (const m of Object.values(map)) {
    if (!m.spouseId) continue
    const s = map[m.spouseId]
    if (!s) continue
    const set = new Set(m.childrenIds.filter(id => s.childrenIds.includes(id) && !!map[id]))
    if (set.size === 0) continue
    const uid = unionId(m.id, s.id)!
    if (!unions[uid]) unions[uid] = { a: m, b: s, children: [] }
    if (unions[uid].children.length === 0) {
      unions[uid].children = Array.from(set).map(id => map[id]).filter(Boolean)
    }
  }
  return unions
}

function makeAnchorFns(map: Record<MemberId, MemberLite>) {
  const memo: Record<MemberId, MemberId> = {}
  const getParents = (m: MemberLite) => m.parentIds.map(id => map[id]).filter(Boolean) as MemberLite[]
  function anchorOf(id: MemberId): MemberId {
    if (memo[id]) return memo[id]
    const m = map[id]; if (!m) { memo[id] = id; return id }
    const parents = getParents(m)
    if (!parents.length) { memo[id] = id; return id }
    const anchors = parents.map(p => anchorOf(p.id))
    const best = anchors.sort((a, b) => a.localeCompare(b))[0]
    memo[id] = best
    return best
  }
  return { anchorOf }
}

function resolveRowOverlaps(nodesInRow: PositionedNode[], minGap: number) {
  const arr = nodesInRow.slice().sort((a, b) => (a.x - b.x))
  let moved = false
  for (let i = 1; i < arr.length; i++) {
    const prev = arr[i - 1]
    const cur = arr[i]
    const desiredLeft = prev.x + prev.w + minGap
    if (cur.x < desiredLeft) {
      const dx = desiredLeft - cur.x
      cur.x += dx
      moved = true
    }
  }
  return moved
}

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

function enforceSpouseAdjacencyInRow(row: PositionedNode[]) {
  if (row.length === 0) return
  const byId: Record<string, PositionedNode> = {}
  for (let i = 0; i < row.length; i++) byId[row[i].id] = row[i]

  const visited = new Set<string>()
  type Group = { nodes: PositionedNode[], width: number }
  const groups: Group[] = []

  for (let i = 0; i < row.length; i++) {
    const n = row[i]
    if (visited.has(n.id)) continue
    const m = n.data as MemberLite | undefined
    const sId = m?.spouseId
    if (sId && byId[sId]) {
      const s = byId[sId]
      if (!visited.has(s.id)) {
        const left = n.x <= s.x ? n : s
        const right = left === n ? s : n
        groups.push({ nodes: [left, right], width: CARD_W + MIN_COUPLE_GAP + CARD_W })
        visited.add(left.id); visited.add(right.id)
        continue
      }
    }
    groups.push({ nodes: [n], width: CARD_W })
    visited.add(n.id)
  }

  groups.sort((A, B) => Math.min(...A.nodes.map(z => z.x)) - Math.min(...B.nodes.map(z => z.x)))

  const minX = Math.min(...row.map(n => n.x))
  let cursorX = minX
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]
    if (g.nodes.length === 2) {
      const L = g.nodes[0], R = g.nodes[1]
      L.x = cursorX
      R.x = cursorX + CARD_W + MIN_COUPLE_GAP
      cursorX = R.x + CARD_W + MIN_H_GAP
    } else {
      const n = g.nodes[0]
      n.x = cursorX
      cursorX = n.x + CARD_W + MIN_H_GAP
    }
  }
}

// ————— main layout —————

export function computeLayout(map: Record<MemberId, MemberLite>, rootId: MemberId): LayoutResult {
  symmetrize(map)
  const gen = assignGenerations(map, rootId)
  const unions = buildUnions(map)
  const { anchorOf } = makeAnchorFns(map)

  // Downward strand labels
  const childStrandDown: Record<MemberId, string> = {}
  for (const u of Object.values(unions)) {
    const aA = anchorOf(u.a.id)
    const bA = anchorOf(u.b.id)
    const label = aA === bA ? aA : [aA, bA].sort()[0]
    for (let i = 0; i < u.children.length; i++) {
      const c = u.children[i]
      if (!childStrandDown[c.id]) childStrandDown[c.id] = label
    }
  }
  for (const m of Object.values(map)) {
    const label = anchorOf(m.id)
    for (let i = 0; i < m.childrenIds.length; i++) {
      const cid = m.childrenIds[i]
      if (!map[cid]) continue
      if (!childStrandDown[cid]) childStrandDown[cid] = label
    }
  }

  // Group by generation (members)
  const gens = new Map<number, MemberLite[]>()
  for (const m of Object.values(map)) {
    if (!(m.id in gen)) continue
    const g = gen[m.id]
    if (!gens.has(g)) gens.set(g, [])
    gens.get(g)!.push(m)
  }

  type Block = {
    gen: number
    parentIds: string[]
    childrenIds: string[]
    strandKey: string
    x: number
    width: number
  }
  const blocksByGen = new Map<number, Block[]>()
  const usedChild = new Set<string>()
  const usedAsCoupleParent = new Set<string>()

  // Couple blocks
  for (const u of Object.values(unions)) {
    const g = gen[u.a.id]
    if (!blocksByGen.has(g)) blocksByGen.set(g, [])
    const childIds = u.children.map(c => c.id).filter(id => !!map[id])
    childIds.forEach(id => usedChild.add(id))
    usedAsCoupleParent.add(u.a.id); usedAsCoupleParent.add(u.b.id)
    const label = g >= 1 ? (childStrandDown[childIds[0]] || anchorOf(u.a.id)) : anchorOf(u.a.id)
    blocksByGen.get(g)!.push({
      gen: g,
      parentIds: [u.a.id, u.b.id].filter(id => !!map[id]).sort(),
      childrenIds: childIds,
      strandKey: label,
      x: 0,
      width: 0,
    })
  }

  /// Single-parent blocks
for (const m of Object.values(map)) {
  const g = gen[m.id]

  // NICHT mehr: if (usedAsCoupleParent.has(m.id)) continue

  // nur Kinder, die NICHT bereits in einem Paar-Block als gemeinsame Kinder benutzt wurden
  const remKids: string[] = []
  for (let i = 0; i < m.childrenIds.length; i++) {
    const cid = m.childrenIds[i]
    if (!map[cid]) continue
    if (!usedChild.has(cid)) remKids.push(cid)
  }

  if (!remKids.length) continue
  if (!blocksByGen.has(g)) blocksByGen.set(g, [])

  const label =
    g >= 1 ? (childStrandDown[remKids[0]] || anchorOf(m.id)) : anchorOf(m.id)

  blocksByGen.get(g)!.push({
    gen: g,
    parentIds: [m.id],         // Single-Parent-Block zusätzlich zum Paar-Block
    childrenIds: remKids,
    strandKey: label,
    x: 0,
    width: 0,
  })
}

  // Singleton blocks
  for (const [g, members] of Array.from(gens.entries())) {
    const existingParents = new Set<string>()
    const blocks = blocksByGen.get(g) ?? []
    for (let i = 0; i < blocks.length; i++) blocks[i].parentIds.forEach(id => existingParents.add(id))
    for (let i = 0; i < members.length; i++) {
      const m = members[i]
      if (existingParents.has(m.id)) continue
      if (!blocksByGen.has(g)) blocksByGen.set(g, [])
      const label = g >= 1 ? (childStrandDown[m.id] || anchorOf(m.id)) : anchorOf(m.id)
      blocksByGen.get(g)!.push({
        gen: g,
        parentIds: [m.id],
        childrenIds: [],
        strandKey: label,
        x: 0,
        width: 0,
      })
    }
  }

  // Order blocks stabil nach Strand + Eltern
  for (const [g, blocks] of Array.from(blocksByGen.entries())) {
    blocks.sort((A, B) => {
      const c = A.strandKey.localeCompare(B.strandKey)
      if (c !== 0) return c
      return A.parentIds.join(',').localeCompare(B.parentIds.join(','))
    })
    blocksByGen.set(g, blocks)
  }

  // Node stores (no duplicates)
  const nodesById = new Map<string, PositionedNode>()
  const unionById = new Map<string, PositionedNode>()
  const edges: Edge[] = []
  const lockedAsParent = new Set<string>()

  // NEU: Kinder-Gruppen pro Generation (für stabile Reihenfolge nach Eltern-Blöcken)
  type ChildGroup = { order: number; ids: string[] }
  const childGroupsByGen = new Map<number, ChildGroup[]>()
  const registerChildGroup = (genVal: number, order: number, ids: string[]) => {
    if (!childGroupsByGen.has(genVal)) childGroupsByGen.set(genVal, [])
    childGroupsByGen.get(genVal)!.push({ order, ids })
  }

  const upsertPersonNode = (
    id: string,
    genVal: number,
    x: number,
    y: number,
    dataFromMap: MemberLite | undefined
  ): PositionedNode | null => {
    if (!dataFromMap) return null
    const existing = nodesById.get(id)
    if (existing) {
      existing.gen = genVal
      existing.x = x
      existing.y = y
      existing.w = CARD_W
      existing.h = CARD_H
      existing.data = dataFromMap
      return existing
    }
    const node: PositionedNode = { id, kind: 'person', gen: genVal, x, y, w: CARD_W, h: CARD_H, data: dataFromMap }
    nodesById.set(id, node)
    return node
  }

  const getPerson = (id: string) => nodesById.get(id)

  const upsertUnionNode = (
    id: string,
    genVal: number,
    x: number,
    y: number,
    data: { a: MemberLite; b?: MemberLite | null }
  ): PositionedNode => {
    const existing = unionById.get(id)
    if (existing) {
      existing.gen = genVal
      existing.x = x
      existing.y = y
      existing.w = UNION_W
      existing.h = UNION_H
      existing.data = data
      return existing
    }
    const node: PositionedNode = { id, kind: 'union', gen: genVal, x, y, w: UNION_W, h: UNION_H, data }
    unionById.set(id, node)
    return node
  }

  const genKeys = Array.from(blocksByGen.keys())
  const minGen = genKeys.length ? Math.min(...genKeys) : 0
  const maxGen = genKeys.length ? Math.max(...genKeys) : 0

  const genY: Record<number, number> = {}
  for (let g = minGen; g <= maxGen; g++) {
    genY[g] = (g - minGen) * (CARD_H + MIN_V_GAP)
  }

  // helper: adoption flag for a block's parents -> child
  const isAdoptedEdge = (parentIds: string[], childId: string): boolean => {
    const pA = parentIds[0] ? map[parentIds[0]] : undefined
    const pB = parentIds[1] ? map[parentIds[1]] : undefined
    const aHas = !!pA?.adoptedChildrenIds?.includes(childId)
    const bHas = !!pB?.adoptedChildrenIds?.includes(childId)
    // OR-Logik (mind. ein Parent adoptiert) → gestrichelt
    // Für AND-Logik (beide adoptiert), statt || einfach && verwenden.
    return aHas || bHas
  }

  // 1) Place parents
  for (let g = minGen; g <= maxGen; g++) {
    const blocks = blocksByGen.get(g) ?? []
    let cursorX = 0
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]
      let localX = cursorX
      const parentNodes: PositionedNode[] = []
      for (let j = 0; j < b.parentIds.length; j++) {
        const pid = b.parentIds[j]
        const y = genY[g]
        const pn = upsertPersonNode(pid, g, localX, y, map[pid])
        if (pn) {
          lockedAsParent.add(pid)
          parentNodes.push(pn)
          localX += CARD_W + (j < b.parentIds.length - 1 ? MIN_COUPLE_GAP : 0)
        }
      }
      if (parentNodes.length === 0) continue
      const firstP = parentNodes[0]
      const lastP = parentNodes[parentNodes.length - 1]
      b.x = firstP.x
      b.width = (lastP.x + lastP.w) - firstP.x
      cursorX = b.x + b.width + MIN_BLOCK_GAP
    }
  }

  // 2) Resolve parent-row overlaps
  for (let g = minGen; g <= maxGen; g++) {
    const row = rowPersons(Array.from(nodesById.values()), g)
    let it = 0
    while (resolveRowOverlaps(row, MIN_H_GAP) && it < 50) it++
  }

  // 3) Unions + children
  function placeChildrenUnderBlock(b: Block, blockOrder: number) {
    if (b.childrenIds.length === 0) return

    const childIds = b.childrenIds.filter(cid => !!map[cid])
    if (childIds.length === 0) return

    const yUnion = genY[b.gen] + CARD_H + UNION_DY

    let unionCenterX: number
    if (b.parentIds.length === 2) {
      const a = getPerson(b.parentIds[0])
      const c = getPerson(b.parentIds[1])
      if (!a || !c) return
      const axC = a.x + a.w / 2
      const bxC = c.x + c.w / 2
      unionCenterX = Math.min(axC, bxC) + Math.abs(axC - bxC) / 2
    } else {
      const p = getPerson(b.parentIds[0])
      if (!p) return
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
    const yChild = genY[childGen] ?? (childGen - minGen) * (CARD_H + MIN_V_GAP)
    genY[childGen] = yChild

    const totalChildrenWidth = childIds.length * CARD_W + (childIds.length - 1) * MIN_CHILD_GAP
    let startX = unionCenterX - totalChildrenWidth / 2

    const placedChildIds: string[] = []

    for (let i = 0; i < childIds.length; i++) {
      const cid = childIds[i]
      const already = nodesById.get(cid)

      const adopted = isAdoptedEdge(b.parentIds, cid)

      if (already && lockedAsParent.has(cid) && already.gen === childGen) {
        edges.push({
          id: `e-${uid}-${cid}`,
          from: unionNode.id,
          to: cid,
          fromSide: 'bottom',
          toSide: 'top',
          adopted,
        })
        placedChildIds.push(cid)
        startX += CARD_W + MIN_CHILD_GAP
        continue
      }

      const cn = upsertPersonNode(cid, childGen, startX, genY[childGen], map[cid])
      if (cn) {
        edges.push({
          id: `e-${uid}-${cid}`,
          from: unionNode.id,
          to: cid,
          fromSide: 'bottom',
          toSide: 'top',
          adopted,
        })
        placedChildIds.push(cid)
        startX += CARD_W + MIN_CHILD_GAP
      }
    }

    // Gruppe der Kinder (dieses Blocks) registrieren
    if (placedChildIds.length) {
      registerChildGroup(childGen, blockOrder, placedChildIds)
    }

    // Edges Parent → Union (ohne adopted-Flag; nur Kind-Kanten sind stilprägend)
    if (b.parentIds.length === 2) {
      if (getPerson(b.parentIds[0])) {
        edges.push({ id: `e-${b.parentIds[0]}-${uid}`, from: b.parentIds[0], to: uid, fromSide: 'bottom', toSide: 'top' })
      }
      if (getPerson(b.parentIds[1])) {
        edges.push({ id: `e-${b.parentIds[1]}-${uid}`, from: b.parentIds[1], to: uid, fromSide: 'bottom', toSide: 'top' })
      }
    } else {
      if (getPerson(b.parentIds[0])) {
        edges.push({ id: `e-${b.parentIds[0]}-${uid}`, from: b.parentIds[0], to: uid, fromSide: 'bottom', toSide: 'top' })
      }
    }
  }

  for (let g = minGen; g <= maxGen; g++) {
    const blocks = blocksByGen.get(g) ?? []
    for (let i = 0; i < blocks.length; i++) placeChildrenUnderBlock(blocks[i], i)
  }

  // NEU: Kindergruppen je Generation in Block-Reihenfolge stabil anordnen
  function enforceChildGroupOrderForGen(childGen: number) {
    const groups = (childGroupsByGen.get(childGen) ?? []).slice().sort((a, b) => a.order - b.order)
    if (groups.length <= 1) return

    let cursor = Number.NEGATIVE_INFINITY
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi]
      const nodes = g.ids.map(id => nodesById.get(id)).filter(Boolean) as PositionedNode[]
      if (!nodes.length) continue

      const minX = Math.min(...nodes.map(n => n.x))
      const maxX = Math.max(...nodes.map(n => n.x + n.w))
      if (gi === 0) {
        cursor = maxX + MIN_BLOCK_GAP
        continue
      }

      const desiredMin = cursor
      if (minX < desiredMin) {
        const dx = desiredMin - minX
        for (let k = 0; k < nodes.length; k++) nodes[k]!.x += dx
      }

      const newMax = Math.max(...nodes.map(n => n.x + n.w))
      cursor = newMax + MIN_BLOCK_GAP
    }
  }

  {
    const gensWithChildren = Array.from(childGroupsByGen.keys()).sort((a, b) => a - b)
    for (let i = 0; i < gensWithChildren.length; i++) {
      enforceChildGroupOrderForGen(gensWithChildren[i])
    }
  }

  // 4) Overlaps for all rows
  const allGens = Array.from(new Set(Array.from(nodesById.values()).map(n => n.gen))).sort((a, b) => a - b)
  for (let i = 0; i < allGens.length; i++) {
    const g = allGens[i]
    const row = rowPersons(Array.from(nodesById.values()), g)
    let it = 0
    while (resolveRowOverlaps(row, MIN_H_GAP) && it < 100) it++
  }

  // 5) Vertical spacing
  const rowY: Record<number, number> = {}
  for (let i = 0; i < allGens.length; i++) {
    const g = allGens[i]
    const row = rowPersons(Array.from(nodesById.values()), g)
    rowY[g] = row.length ? row[0].y : ((g - minGen) * (CARD_H + MIN_V_GAP))
  }
  for (let i = 0; i < allGens.length - 1; i++) {
    const g = allGens[i]
    const ng = allGens[i + 1]
    const neededY = rowY[g] + CARD_H + MIN_V_GAP
    if (rowY[ng] < neededY) {
      const dy = neededY - rowY[ng]
      {
        const people = Array.from(nodesById.values())
        for (let k = 0; k < people.length; k++) {
          const n = people[k]
          if (n.gen >= ng) n.y += dy
        }
      }
      {
        const unionsArr = Array.from(unionById.values())
        for (let k = 0; k < unionsArr.length; k++) {
          const u = unionsArr[k]
          if (u.gen >= ng) u.y += dy
        }
      }
      for (let j = i + 1; j < allGens.length; j++) rowY[allGens[j]] += dy
    }
  }

  // 6) Build rows
  const rowsByGen = new Map<number, PositionedNode[]>()
  {
    const people = Array.from(nodesById.values())
    for (let i = 0; i < people.length; i++) {
      const n = people[i]
      if (!rowsByGen.has(n.gen)) rowsByGen.set(n.gen, [])
      rowsByGen.get(n.gen)!.push(n)
    }
  }

  // 6a) spouse adjacency
  for (const [g, arr] of Array.from(rowsByGen.entries())) {
    enforceSpouseAdjacencyInRow(arr)
    let it = 0
    while (resolveRowOverlaps(arr, MIN_H_GAP) && it < 20) it++
  }

  // 6b) center rows by widest & unions mittig halten
  const rowSpans: Record<number, { L: number, R: number, W: number }> = {}
  let maxRowWidth = 0
  for (const [g, arr] of Array.from(rowsByGen.entries())) {
    if (!arr.length) { rowSpans[g] = { L: 0, R: 0, W: 0 }; continue }
    const L = Math.min(...arr.map(n => n.x))
    const R = Math.max(...arr.map(n => n.x + n.w))
    const W = R - L
    rowSpans[g] = { L, R, W }
    if (W > maxRowWidth) maxRowWidth = W
  }
  for (const [g, arr] of Array.from(rowsByGen.entries())) {
    recenterRow(arr, maxRowWidth)
    const unionsArr = Array.from(unionById.values())
    for (let i = 0; i < unionsArr.length; i++) {
      const u = unionsArr[i]
      if (u.gen !== g) continue
      const data = u.data as { a: MemberLite; b?: MemberLite | null }
      if (data?.a && data?.b) {
        const aN = nodesById.get(data.a.id)!
        const bN = nodesById.get(data.b!.id)!
        const ax = aN.x + aN.w / 2
        const bx = bN.x + bN.w / 2
        u.x = Math.min(ax, bx) + Math.abs(ax - bx) / 2 - UNION_W / 2
      } else if (data?.a) {
        const pN = nodesById.get(data.a.id)!
        u.x = (pN.x + pN.w / 2) - UNION_W / 2
      }
    }
  }

  const personNodes = Array.from(nodesById.values())
  const unionNodes = Array.from(unionById.values())
  const allNodes = personNodes.concat(unionNodes)

  if (allNodes.length === 0) {
    return { nodes: [], edges: [], width: 800, height: 600, minGen: 0, maxGen: 0 }
  }

  const minX = Math.min(...allNodes.map(n => n.x))
  const minY = Math.min(...allNodes.map(n => n.y))
  const dx = minX < 0 ? -minX + 60 : 60
  const dy = minY < 0 ? -minY + 60 : 60
  for (let i = 0; i < allNodes.length; i++) { allNodes[i].x += dx; allNodes[i].y += dy }

  const maxX = Math.max(...allNodes.map(n => n.x + n.w))
  const maxY = Math.max(...allNodes.map(n => n.y + n.h))
  const width = maxX + 60
  const height = maxY + 60

  return { nodes: allNodes, edges, width, height, minGen, maxGen }
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
      // NEU: adoptedChildrenIds aus Runtime übernehmen (falls vorhanden)
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
  } else {
    // Vollansicht: spouses-Flag ohne Wirkung
  }

  const rootId = focusId && sub[focusId] ? focusId : Object.keys(sub)[0]
  return computeLayout(sub, rootId)
}
