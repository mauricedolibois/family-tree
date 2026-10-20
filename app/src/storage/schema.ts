// src/storage/schema.ts
// How a family tree is stored (column trees.data).

export type Gender = 'MALE' | 'FEMALE'
export type MediaKind = 'image' | 'video' | 'pdf' | 'other'

export type StoredMedia = {
  id: string
  url: string
  kind: MediaKind
  title?: string | null
  createdAt?: string | null
}

export type StoredProfile = {
  birthDate?: string | null
  birthPlace?: string | null
  /** Name at birth, e.g. before marriage */
  maidenName?: string | null
  deathDate?: string | null
  /** Deceased even if the date of death is unknown (only stored when true) */
  deceased?: boolean
  country?: string | null
  job?: string | null
  city?: string | null
  comments?: string | null
  titleImageUrl?: string | null
  media?: StoredMedia[]
}

export type StoredMemberV3 = {
  id: string
  name: string
  gender: Gender
  spouseId?: string | null
  /** Derived from the parents' childrenIds, which are the source of truth */
  parentIds?: string[]
  childrenIds: string[]
  /** Adoption belongs to the parent→child edge: which children did THIS parent adopt? */
  adoptedChildrenIds?: string[]
  profile?: StoredProfile
}

export type StoredTree = {
  version: 3
  rootId: string
  members: Record<string, StoredMemberV3>
}
