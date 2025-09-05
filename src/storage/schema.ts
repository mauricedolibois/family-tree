import { IMember } from '@/types/IMember'
import { Gender } from '@/types/Gender'


/* ===== v3 (neu, ID-basiert) ===== */
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
  parentIds?: string[] 
  childrenIds: string[]
  profile?: StoredProfile
}

export type StoredTree = {
  version: 3
  rootId: string
  members: Record<string, StoredMemberV3> // key = id
}


/* ===== Serialize (Graph -> Stored, ID-basiert) ===== */
export function serializeFromRoot(root: IMember, existing?: StoredTree | null): StoredTree {
  const prev = existing && existing.version === 3 ? existing : null
  const members: Record<string, StoredMemberV3> = {}
  const seen = new Set<string>()
  const stack: IMember[] = [root]

  while (stack.length) {
    const m = stack.pop()!
    if (!m || !m.id || seen.has(m.id)) continue
    seen.add(m.id)

    const prevProfile = prev?.members[m.id]?.profile
    const children = Array.isArray(m.children) ? m.children : []
    const spouseId = m.spouse?.id ?? null

    members[m.id] = {
      id: m.id,
      name: m.name,
      gender: m.gender,
      spouseId,
      parentIds: m.parents.map((p) => p.id),      // 👈 add this
      childrenIds: children.map((c) => c.id),
      profile: prevProfile
        ? {
            birthDate: prevProfile.birthDate ?? null,
            deathDate: prevProfile.deathDate ?? null,
            country: prevProfile.country ?? null,
            job: prevProfile.job ?? null,
            city: prevProfile.city ?? null,
            comments: prevProfile.comments ?? null,
            titleImageUrl: prevProfile.titleImageUrl ?? null,
            media: Array.isArray(prevProfile.media) ? prevProfile.media : [],
          }
        : {
            birthDate: null,
            deathDate: null,
            country: null,
            job: null,
            city: null,
            comments: null,
            titleImageUrl: null,
            media: [],
          },
    }

    // reach everything connected:
    if (m.spouse) stack.push(m.spouse)
    if (children.length) stack.push(...children)
    if (Array.isArray(m.parents) && m.parents.length) stack.push(...m.parents) // 👈 NEW
  }

  return { version: 3, rootId: root.id, members }
}
