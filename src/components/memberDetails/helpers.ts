// src/components/member-details/helpers.ts
import type { IMember } from '@/types/IMember'
import type {
  MediaKind,
  StoredMedia,
  StoredMemberV3,
  StoredTree,
} from '@/storage/schema'

/* -------------------------------------------------------
 * Tree-Suche (Runtime-Struktur) – ID-basiert
 * ----------------------------------------------------- */

/** Tiefensuche nach Member (inkl. Spouse) – ID-basiert */
export function findById(root: IMember | null, id: string | null): IMember | null {
  if (!root || !id) return null
  if (root.id === id) return root
  if (root.spouse?.id === id) return root.spouse
  for (const c of root.children ?? []) {
    const hit = findById(c, id)
    if (hit) return hit
  }
  return null
}

/* -------------------------------------------------------
 * StoredTree (Persistenz) – ausschließlich ID-basiert
 * ----------------------------------------------------- */

/** Parent-ID zu einem Kind finden (direkt, nicht „Großeltern“) */
export function findParentId(stored: StoredTree, childId: string): string | null {
  for (const m of Object.values(stored.members)) {
    if (m.childrenIds?.includes(childId)) return m.id
  }
  return null
}

/** Nur eigene Kinder zählen (Ehepartner-Kinder ignorieren) */
export function canDeleteStoredById(stored: StoredTree, targetId: string): boolean {
  if (targetId === stored.rootId) return false
  const t = stored.members[targetId]
  if (!t) return false
  if ((t.childrenIds?.length ?? 0) > 0) return false
  return true
}

/** Blatt (ID) löschen: Ehe lösen, aus Elternliste entfernen, Member löschen */
export function deleteLeafInStored(stored: StoredTree, targetId: string): boolean {
  const t = stored.members[targetId]
  if (!t) return false

  // Ehe lösen (bidirektional)
  if (t.spouseId) {
    const spouse = stored.members[t.spouseId]
    if (spouse && spouse.spouseId === t.id) spouse.spouseId = null
    t.spouseId = null
  }

  // Aus Eltern-Kind-Liste entfernen
  const parentId = findParentId(stored, targetId)
  if (parentId) {
    const p = stored.members[parentId]
    if (p && p.childrenIds) {
      p.childrenIds = p.childrenIds.filter((id) => id !== targetId)
    }
  }

  delete stored.members[targetId]
  return true
}

/* -------------------------------------------------------
 * Media-Helfer
 * ----------------------------------------------------- */

export const inferKind = (file: File): MediaKind => {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type === 'application/pdf') return 'pdf'
  return 'other'
}

export const newId = () => Math.random().toString(36).slice(2)

/** Dateiname/Label aus title oder URL extrahieren */
export function fileLabel(m: StoredMedia): string {
  if (m.title && m.title.trim()) return m.title.trim()
  try {
    const u = new URL(m.url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    const path = u.pathname
    const base = path.substring(path.lastIndexOf('/') + 1)
    return decodeURIComponent(base)
  } catch {
    const parts = m.url.split('?')[0].split('#')[0].split('/')
    return decodeURIComponent(parts[parts.length - 1] || m.url)
  }
}
