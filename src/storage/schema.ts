import { IMember } from '@/types/IMember'
import { Gender } from '@/types/Gender'

/* ===== v1 (alt) ===== */
export type StoredMemberV1 = {
  name: string
  gender: Gender
  spouseName?: string | null
  childrenNames: string[]
}

export type StoredTreeV1 = {
  version: 1
  rootName: string
  members: Record<string, StoredMemberV1>
}

/* ===== v2 (neu) ===== */
export type MediaKind = 'image' | 'video' | 'pdf' | 'other'

export type StoredMedia = {
  id: string // z.B. filename oder uuid
  url: string // /uploads/...
  kind: MediaKind
  title?: string | null
  createdAt?: string | null // ISO
}

export type StoredProfile = {
  birthDate?: string | null // ISO YYYY-MM-DD
  deathDate?: string | null // ISO YYYY-MM-DD
  country?: string | null
  job?:string | null
  city?: string | null
  comments?: string | null
  titleImageUrl?: string | null // Hauptbild-URL
  media?: StoredMedia[] // beliebige Medien
}

export type StoredMember = {
  name: string
  gender: Gender
  spouseName?: string | null
  childrenNames: string[]
  profile?: StoredProfile
}

export type StoredTree = {
  version: 2
  rootName: string
  members: Record<string, StoredMember>
}

/* ===== Migration v1 -> v2 ===== */
export function migrateToV2(data: StoredTreeV1 | StoredTree): StoredTree {
  if ((data as StoredTree).version === 2) return data as StoredTree
  const v1 = data as StoredTreeV1
  const members: Record<string, StoredMember> = {}
  for (const m of Object.values(v1.members)) {
    members[m.name] = {
      name: m.name,
      gender: m.gender,
      spouseName: m.spouseName ?? null,
      childrenNames: m.childrenNames ?? [],
      profile: {
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
  }
  return { version: 2, rootName: v1.rootName, members }
}

/* ===== Serialize (Graph -> Stored) mit Erhalt vorhandener Profile (merge) ===== */
export function serializeFromRoot(
  root: IMember,
  existing?: StoredTree | null,
): StoredTree {

  const prev = existing && existing.version === 2 ? existing : null
  const members: Record<string, StoredMember> = {}
  const seen = new Set<string>()
  const stack: IMember[] = [root]

  while (stack.length) {
    const m = stack.pop()!
    if (!m || seen.has(m.name)) continue
    seen.add(m.name)

    const prevProfile = prev?.members[m.name]?.profile

    // Kinder und Spouse reinholen
    const children = Array.isArray(m.children) ? m.children : []
    const spouseName = m.spouse?.name ?? null

    members[m.name] = {
      name: m.name,
      gender: m.gender,
      spouseName,
      childrenNames: children.map((c) => c.name),
      // Profile zusammenführen/erhalten
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
            city: null,
            job: null,
            comments: null,
            titleImageUrl: null,
            media: [],
          },
    }

    if (m.spouse) stack.push(m.spouse)
    if (children.length) stack.push(...children)
  }

  const result: StoredTree = { version: 2, rootName: root.name, members }
  return result
}
