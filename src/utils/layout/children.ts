// src/utils/layout/children.ts
import type { ChildGroup, ParentOrderIndex } from './types'
import type { PositionedNode, MemberLite } from '@/types/family'
import { buildBlocksForChildRow } from './blocks'
import { MIN_BLOCK_GAP } from '@/config/layout'
import { dbg } from './debug'

export function registerChildGroup(
  childGroupsByGen: Map<number, ChildGroup[]>,
  childGroupOfId: Map<string, string>,
  genVal: number,
  order: number,
  ids: string[]
) {
  if (!childGroupsByGen.has(genVal)) childGroupsByGen.set(genVal, [])
  childGroupsByGen.get(genVal)!.push({ order, ids })
  const key = `${genVal}#${order}`
  for (const id of ids) childGroupOfId.set(id, key)
}

export function augmentGroupsWithSingletons(
  childGen: number,
  childGroupsByGen: Map<number, ChildGroup[]>,
  childGroupOfId: Map<string, string>,
  row: PositionedNode[],
  parentOrderIndex: ParentOrderIndex
) {
  const existing = childGroupsByGen.get(childGen) ?? []
  const hasGroupId = new Set<string>()
  for (const g of existing) for (const id of g.ids) hasGroupId.add(id)

  const singles = row.map(n => n.id).filter(id => !hasGroupId.has(id))
  if (!singles.length) return

  const groupByOrder = new Map<number, ChildGroup>()
  for (const g of existing) if (!groupByOrder.has(g.order)) groupByOrder.set(g.order, g)

  const singlesByOrder = new Map<number, string[]>()
  for (const id of singles) {
    const ord = parentOrderIndex.get(id) ?? 1e9
    if (!singlesByOrder.has(ord)) singlesByOrder.set(ord, [])
    singlesByOrder.get(ord)!.push(id)
  }

  const byId: Record<string, PositionedNode> = {}
  for (const n of row) byId[n.id] = n

  for (const [order, ids] of Array.from(singlesByOrder.entries())) {
    ids.sort((a, b) => (byId[a]?.x ?? 0) - (byId[b]?.x ?? 0))
    const existingGroup = groupByOrder.get(order)
    if (existingGroup) {
      existingGroup.ids.push(...ids)
      const key = `${childGen}#${order}`
      for (const id of ids) childGroupOfId.set(id, key)
    } else {
      registerChildGroup(childGroupsByGen, childGroupOfId, childGen, order, ids)
    }
  }

  dbg('augmentGroupsWithSingletons (grouped)', {
    gen: childGen,
    orders: Array.from(singlesByOrder.keys()).sort((a, b) => a - b)
  })
}

export function mergeChildGroupsBySpouses(
  childGen: number,
  childGroupsByGen: Map<number, ChildGroup[]>,
  row: PositionedNode[]
) {
  const groups = childGroupsByGen.get(childGen)
  if (!groups || groups.length <= 1 || row.length === 0) return

  const groupOfId = new Map<string, number>()
  for (let gi = 0; gi < groups.length; gi++) for (const id of groups[gi].ids) groupOfId.set(id, gi)

  const parent: number[] = groups.map((_, i) => i)
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])))
  const unite = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra }

  const byId: Record<string, PositionedNode> = {}
  for (const n of row) byId[n.id] = n

  for (const n of row) {
    const sId = (n.data as MemberLite | undefined)?.spouseId
    if (!sId || !byId[sId]) continue
    const ga = groupOfId.get(n.id)
    const gb = groupOfId.get(sId)
    if (ga == null || gb == null) continue
    if (ga !== gb) unite(ga, gb)
  }

  const buckets = new Map<number, { order: number; ids: string[] }>()
  for (let gi = 0; gi < groups.length; gi++) {
    const root = find(gi)
    if (!buckets.has(root)) buckets.set(root, { order: groups[gi].order, ids: [] })
    const b = buckets.get(root)!
    b.order = Math.min(b.order, groups[gi].order)
    b.ids.push(...groups[gi].ids)
  }

  const merged = Array.from(buckets.values()).sort((a, b) => a.order - b.order)
  childGroupsByGen.set(childGen, merged)
}

/** interne Hilfsfunktion: Order aus einem membership-Key extrahieren */
function orderFromKey(key: string | undefined): number {
  if (!key) return 1e9
  const hashPos = key.indexOf('#')
  return hashPos >= 0 ? Number(key.slice(hashPos + 1)) : 1e9
}

/**
 * Zentriere Kinder-Blöcke (in vorgegebener Reihenfolge) möglichst unter die Eltern-Zentren,
 * verhindere Überlappungen durch zwei Sweeps (L→R, R→L).
 */
function alignChildBlocksToParents(
  blocks: { nodes: PositionedNode[]; left: number; right: number; width: number }[],
  desiredCenters: number[],
  gap: number
) {
  if (blocks.length === 0) return

  let firstLeft = desiredCenters[0] - blocks[0].width / 2
  blocks[0].left = firstLeft
  blocks[0].right = firstLeft + blocks[0].width

  for (let i = 1; i < blocks.length; i++) {
    const wantLeft = desiredCenters[i] - blocks[i].width / 2
    const minLeft = blocks[i - 1].right + gap
    const left = Math.max(wantLeft, minLeft)
    blocks[i].left = left
    blocks[i].right = left + blocks[i].width
  }

  for (let i = blocks.length - 2; i >= 0; i--) {
    const wantLeft = desiredCenters[i] - blocks[i].width / 2
    const maxRight = blocks[i + 1].left - gap
    const newRight = Math.min(blocks[i].right, maxRight)
    const newLeft = Math.min(Math.max(wantLeft, blocks[i].left), newRight - blocks[i].width)
    blocks[i].left = newLeft
    blocks[i].right = newLeft + blocks[i].width
  }

  for (const blk of blocks) {
    const currentLeft = Math.min(...blk.nodes.map(n => n.x))
    const dx = blk.left - currentLeft
    if (dx !== 0) for (const n of blk.nodes) n.x += dx
  }
}

/**
 * Sortiert & packt Kinder-Blöcke nach Eltern-Order (stabil) und richtet sie unter den Eltern-Zentren aus.
 * Zusätzlich: **feinere Sortierung** innerhalb einer Gruppe über fineOrderIndex (Barycenter der Eltern-Units).
 *
 * @param desiredCenterByOrder Optional: Map<order, centerX> aus den Union-Zentren pro Eltern-Block.
 * @param fineOrderIndex Optional: Map<childId, number> – kleiner = weiter links (aus Parent-Unit-Indizes)
 */
export function enforceChildGroupOrderForGen(
  childGen: number,
  childGroupsByGen: Map<number, ChildGroup[]>,
  row: PositionedNode[],
  membershipFromGroups: Map<string, string>, // childId -> groupKey
  parentOrderIndex?: ParentOrderIndex,
  desiredCenterByOrder?: Map<number, number>,
  fineOrderIndex?: Map<string, number>
) {
  // Sichern, dass jedes Kind Membership hat
  {
    // Fallback mit parentOrderIndex
    const ensure = (id: string) => {
      if (membershipFromGroups.has(id)) return
      const ord = parentOrderIndex?.get(id)
      if (ord == null) return
      membershipFromGroups.set(id, `${childGen}#${ord}`)
    }
    for (const n of row) ensure(n.id)
  }

  // Gruppen rekonstruieren: key -> ids
  const tmpGroups = new Map<string, string[]>()
  for (const n of row) {
    const key = membershipFromGroups.get(n.id)
    if (!key) continue
    if (!tmpGroups.has(key)) tmpGroups.set(key, [])
    tmpGroups.get(key)!.push(n.id)
  }
  if (tmpGroups.size <= 1 || row.length === 0) return

  const byId: Record<string, PositionedNode> = {}
  for (const n of row) byId[n.id] = n

  // ChildGroup-Liste mit echter order + feiner Sortierung (fineOrderIndex → x)
  const parsed: ChildGroup[] = []
  for (const [key, ids] of Array.from(tmpGroups.entries())) {
    ids.sort((a, b) => {
      const fa = fineOrderIndex?.get(a)
      const fb = fineOrderIndex?.get(b)
      if (fa != null && fb != null && fa !== fb) return fa - fb
      return (byId[a]?.x ?? 0) - (byId[b]?.x ?? 0)
    })
    parsed.push({ order: orderFromKey(key), ids })
  }
  parsed.sort((a, b) => a.order - b.order)

  // Blöcke aus Membership bauen
  const blocksBuckets = new Map<string, PositionedNode[]>()
  for (const n of row) {
    const key = membershipFromGroups.get(n.id) || `__solo_${n.id}`
    if (!blocksBuckets.has(key)) blocksBuckets.set(key, [])
    blocksBuckets.get(key)!.push(n)
  }

  // innerhalb Gruppe: Paare nebeneinander
  for (const arr of blocksBuckets.values()) {
    // reuse your spouse adjacency util in caller's pipeline if needed
    // (hier weglassen, da wir nur x-Shift anwenden)
    arr.sort((a, b) => (byId[a.id]?.x ?? 0) - (byId[b.id]?.x ?? 0))
  }

  let blocks = Array.from(blocksBuckets.values()).map(arr => {
    const left = Math.min(...arr.map(n => n.x))
    const right = Math.max(...arr.map(n => n.x + n.w))
    return { nodes: arr, left, right, width: right - left }
  })

  // Reihenfolge der Blöcke strikt nach parsed.order
  const orderIndex = new Map<string, number>() // id -> orderRank
  parsed.forEach((g, idx) => g.ids.forEach(id => orderIndex.set(id, idx)))
  blocks.sort((A, B) => {
    const aMin = Math.min(...A.nodes.map(n => orderIndex.get(n.id) ?? 1e9))
    const bMin = Math.min(...B.nodes.map(n => orderIndex.get(n.id) ?? 1e9))
    return aMin - bMin
  })

  // gewünschte Zentren je Block
  const desiredCenters: number[] = blocks.map(blk => {
    const anyId = blk.nodes[0]?.id
    const key = anyId ? membershipFromGroups.get(anyId) : undefined
    const ord = orderFromKey(key)
    const fromParent = desiredCenterByOrder?.get(ord)
    if (fromParent != null && !Number.isNaN(fromParent)) return fromParent
    const xs = blk.nodes.map(n => n.x + n.w / 2)
    return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length) : 0
  })

  alignChildBlocksToParents(blocks, desiredCenters, MIN_BLOCK_GAP)

  for (let i = 0; i < blocks.length; i++) {
    const ids = blocks[i].nodes.map(n => n.id)
    console.debug('[familyLayout] child-row order check', { gen: childGen, idx: i, ids })
  }
}
