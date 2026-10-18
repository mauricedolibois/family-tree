// src/storage/schema.ts
// So wird ein Stammbaum gespeichert (Spalte family_trees.tree_json).

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
  deathDate?: string | null
  /** verstorben – auch wenn das Sterbedatum unbekannt ist (nur gespeichert, wenn ja) */
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
  /** abgeleitet aus den childrenIds der Eltern (Quelle der Wahrheit) */
  parentIds?: string[]
  childrenIds: string[]
  /** Adoption ist eine Eigenschaft der Eltern→Kind-Kante: welche Kinder hat DIESES Elternteil adoptiert? */
  adoptedChildrenIds?: string[]
  profile?: StoredProfile
}

export type StoredTree = {
  version: 3
  rootId: string
  members: Record<string, StoredMemberV3>
}
