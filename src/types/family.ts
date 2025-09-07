// Use your app's IMember definition (with required fields like `gender`)
import type { IMember } from '@/types/IMember'

export type MemberId = string

export type MemberLite = {
  id: MemberId
  name: string
  gender: IMember['gender'] | 'OTHER'
  spouseId?: MemberId | null
  parentIds: MemberId[]
  childrenIds: MemberId[]
  /** NEW: per-parent adoption flags (child ids adopted by THIS member) */
  adoptedChildrenIds?: MemberId[]
  raw: IMember
}

export type UnionId = `U:${MemberId}:${MemberId}`

export type NodeKind = 'person' | 'union'

export type PositionedNode = {
  id: string
  kind: NodeKind
  gen: number
  x: number
  y: number
  w: number
  h: number
  data?: MemberLite | { a: MemberLite; b?: MemberLite | null }
}

export type Edge = {
  id: string
  from: string
  to: string
  fromSide?: 'top' | 'bottom'
  toSide?: 'top' | 'bottom'
  /** NEW: render hint → dashed if true */
  adopted?: boolean
}

export type LayoutResult = {
  nodes: PositionedNode[]
  edges: Edge[]
  width: number
  height: number
  minGen: number
  maxGen: number
}
