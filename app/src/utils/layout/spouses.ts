// src/utils/layout/spouses.ts
import type { MemberLite, PositionedNode } from '@/types/family'
import { CARD_W, MIN_COUPLE_GAP, MIN_H_GAP } from '@/config/layout'

function genderOf(n?: PositionedNode) {
  return (n?.data as MemberLite | undefined)?.gender?.toString().toUpperCase() || 'OTHER'
}

export function spouseLeftRight(a: PositionedNode, b: PositionedNode): [PositionedNode, PositionedNode] {
  const gA = genderOf(a), gB = genderOf(b)
  if (gA === 'MALE' && gB === 'FEMALE') return [a, b]
  if (gA === 'FEMALE' && gB === 'MALE') return [b, a]
  return (a.x <= b.x) ? [a, b] : [b, a]
}

export function enforceSpouseAdjacencyInRow(row: PositionedNode[]) {
  if (row.length === 0) return
  const byId: Record<string, PositionedNode> = {}
  for (const n of row) byId[n.id] = n

  const visited = new Set<string>()
  const groups: PositionedNode[][] = []

  for (const n of row) {
    if (visited.has(n.id)) continue
    const sId = (n.data as MemberLite | undefined)?.spouseId
    if (sId && byId[sId] && !visited.has(sId)) {
      const [L, R] = spouseLeftRight(n, byId[sId])
      groups.push([L, R])
      visited.add(L.id); visited.add(R.id)
    } else {
      groups.push([n])
      visited.add(n.id)
    }
  }

  const minX = Math.min(...row.map(n => n.x))
  let cx = minX
  for (const g of groups) {
    if (g.length === 2) {
      g[0].x = cx
      g[1].x = cx + CARD_W + MIN_COUPLE_GAP
      cx = g[1].x + CARD_W + MIN_H_GAP
    } else {
      g[0].x = cx
      cx = g[0].x + CARD_W + MIN_H_GAP
    }
  }
}
