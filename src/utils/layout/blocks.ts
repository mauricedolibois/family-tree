// src/utils/layout/blocks.ts
import type { Block } from './types'
import type { MemberLite, PositionedNode } from '@/types/family'
import { CARD_W, MIN_COUPLE_GAP, MIN_H_GAP } from '@/config/layout'
import { spouseLeftRight, enforceSpouseAdjacencyInRow } from './spouses'
import { dbg } from './debug'

// Parent-Row: Paare werden zu einem Block zusammengezogen
export function buildBlocksForParentRow(row: PositionedNode[]): Block[] {
  const byId: Record<string, PositionedNode> = {}
  for (const n of row) byId[n.id] = n
  const seen = new Set<string>()
  const blocks: Block[] = []
  const sorted = row.slice().sort((a, b) => a.x - b.x)

  for (const n of sorted) {
    if (seen.has(n.id)) continue
    const sId = (n.data as MemberLite | undefined)?.spouseId
    if (sId && byId[sId] && !seen.has(sId)) {
      const [L, R] = spouseLeftRight(n, byId[sId])
      const nodes = [L, R]
      const left = Math.min(...nodes.map(z => z.x))
      const right = Math.max(...nodes.map(z => z.x + z.w))
      blocks.push({ nodes, left, right, width: right - left })
      seen.add(L.id); seen.add(R.id)
    } else {
      const left = n.x, right = n.x + n.w
      blocks.push({ nodes: [n], left, right, width: right - left })
      seen.add(n.id)
    }
  }
  blocks.sort((a, b) => a.left - b.left)
  return blocks
}

// Child-Row: Gruppe = „Kinder derselben Eltern“ (membership-Key)
export function buildBlocksForChildRow(row: PositionedNode[], membership: Map<string, string>): Block[] {
  const buckets = new Map<string, PositionedNode[]>()
  for (const n of row) {
    const key = membership.get(n.id) || `__solo_${n.id}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(n)
  }

  // innerhalb Gruppe Paare nebeneinander, kompakt
  for (const arr of buckets.values()) enforceSpouseAdjacencyInRow(arr)

  const blocks: Block[] = []
  for (const arr of buckets.values()) {
    const left = Math.min(...arr.map(n => n.x))
    const right = Math.max(...arr.map(n => n.x + n.w))
    blocks.push({ nodes: arr, left, right, width: right - left })
  }
  // Sortierung NACH LINKS bleibt hier bestehen; der Aufrufer darf danach umsortieren.
  blocks.sort((a, b) => a.left - b.left)
  return blocks
}

// Packe Blöcke kompakt nach links (stabile Reihenfolge vorgegeben durch die Sortierung des Aufrufer)
export function packBlocksLeftToRight(blocks: Block[], gapBetweenBlocks: number) {
  if (blocks.length <= 1) return
  // NICHT neu sortieren – Aufrufer bestimmt Reihenfolge!
  let prevRight = blocks[0].left
  for (let i = 0; i < blocks.length; i++) {
    const blk = blocks[i]
    const desiredLeft = (i === 0 ? prevRight : prevRight + gapBetweenBlocks)
    const dx = desiredLeft - blk.left
    if (dx !== 0) {
      for (const n of blk.nodes) n.x += dx
      blk.left += dx
      blk.right += dx
    }
    prevRight = blk.right
  }
  dbg('packBlocksLeftToRight', { count: blocks.length })
}
