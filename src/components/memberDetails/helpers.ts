// src/components/member-details/helpers.ts
import { IMember } from '@/types/IMember'
import {
  type MediaKind,
  type StoredMedia,
  type StoredMember,
  type StoredTree,
} from '@/storage/schema'

/** Tiefensuche nach Member (inkl. Spouse) */
export function findByName(root: IMember | null, name: string | null): IMember | null {
  if (!root || !name) return null
  if (root.name === name) return root
  if (root.spouse?.name === name) return root.spouse
  for (const c of root.children ?? []) {
    const hit = findByName(c, name)
    if (hit) return hit
  }
  return null
}

export function findParentName(stored: StoredTree, childName: string): string | null {
  for (const m of Object.values(stored.members)) {
    if (m.childrenNames?.includes(childName)) return m.name
  }
  return null
}

function coupleHasChildrenStored(stored: StoredTree, m: StoredMember): boolean {
  if ((m.childrenNames?.length ?? 0) > 0) return true
  if (m.spouseName) {
    const spouse = stored.members[m.spouseName]
    if (spouse && (spouse.childrenNames?.length ?? 0) > 0) return true
  }
  return false
}

export function canDeleteStored(stored: StoredTree, targetName: string): boolean {
  if (targetName === stored.rootName) return false
  const t = stored.members[targetName]
  if (!t) return false
  if ((t.childrenNames?.length ?? 0) > 0) return false
  if (t.spouseName && coupleHasChildrenStored(stored, t)) return false
  return true
}

export function deleteLeafInStored(stored: StoredTree, targetName: string): boolean {
  const t = stored.members[targetName]
  if (!t) return false
  if (t.spouseName) {
    const spouse = stored.members[t.spouseName]
    if (spouse && spouse.spouseName === t.name) spouse.spouseName = null
    t.spouseName = null
  }
  const parentName = findParentName(stored, targetName)
  if (parentName) {
    const p = stored.members[parentName]
    if (p && p.childrenNames) {
      p.childrenNames = p.childrenNames.filter((n) => n !== targetName)
    }
  }
  delete stored.members[targetName]
  return true
}

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
