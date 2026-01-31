// src/utils/layout/types.ts
import type { MemberLite, PositionedNode } from '@/types/family'

export type Block = { nodes: PositionedNode[]; left: number; right: number; width: number }

export type ChildGroup = {
  // stabile Reihenfolge = Eltern-Block-Index (je Generation)
  order: number
  ids: string[]
}

export type ParentOrderIndex = Map<string, number> // childId -> parentBlockIndex
