// src/components/member-details/helpers.ts
import type { IMember } from '@/types/IMember'
import type { MediaKind, StoredMedia, StoredTree } from '@/storage/schema'

/* -------------------------------------------------------
 * Tree-Suche (Runtime-Struktur) – ID-basiert
 * ----------------------------------------------------- */

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
 * Felder: members: Record<id, { id, childrenIds?: string[], spouseId?: string|null }>, rootId?: string|null
 * ----------------------------------------------------- */

function findParentIds(stored: StoredTree, childId: string): string[] {
  const parents: string[] = []
  for (const m of Object.values(stored.members)) {
    const arr = m.childrenIds ?? []
    if (arr.includes(childId)) parents.push(m.id)
  }
  return parents
}

export function findParentId(stored: StoredTree, childId: string): string | null {
  const ids = findParentIds(stored, childId)
  return ids.length ? ids[0] : null
}

function countParentsOf(stored: StoredTree, childId: string): number {
  return findParentIds(stored, childId).length
}

type DeletePolicy = {
  allowTopDeletion?: boolean
  allowRootDeletion?: boolean
  /**
   * Wie mit Kindern umgehen, die nach dem Entfernen sonst elternlos wären?
   * - 'block' (Default): Löschen verhindern
   * - 'promote': Kind bleibt ohne Eltern (Top-Node)
   * - 'relinkToSpouse': falls spouse existiert → Kind an spouse hängen, sonst wie 'promote'
   */
  orphanStrategy?: 'block' | 'promote' | 'relinkToSpouse'
  /**
   * Präferenz für neue Root, falls die alte gelöscht wurde.
   */
  preferNewRoot?: 'spouse' | 'child' | 'any'
}

const DEFAULT_POLICY: Required<DeletePolicy> = {
  allowTopDeletion: false,
  allowRootDeletion: false,
  orphanStrategy: 'block',
  preferNewRoot: 'spouse',
}

/**
 * Prüft, ob ein Member gemäß Policy löschbar ist.
 * - Bottom-Leaf (keine Kinder): immer ok (Root nur, wenn erlaubt)
 * - Top-Deletion: abhängig von Policy und orphanStrategy
 *   - 'block': Kinder müssen derzeit ≥ 2 Eltern haben
 *   - 'promote' / 'relinkToSpouse': immer ok (wir fangen Kinder später ab)
 */
export function canDeleteStoredById(
  stored: StoredTree,
  targetId: string,
  policy: DeletePolicy = {}
): boolean {
  const p = { ...DEFAULT_POLICY, ...policy }
  const t = stored.members[targetId]
  if (!t) return false

  const isRoot = stored.rootId === targetId
  if (isRoot && !p.allowRootDeletion) return false

  const children = t.childrenIds ?? []
  const spouseId = t.spouseId ?? null
  const parents = findParentIds(stored, targetId)

  // 1) Keine Kinder → ok
  if (children.length === 0) return true

  // 2) Top-Deletion?
  const isTopNode = parents.length === 0
  if (isTopNode && p.allowTopDeletion) {
    if (p.orphanStrategy === 'block') {
      // Blockiere nur, wenn ein Kind sonst Vollwaise würde
      for (const cid of children) {
        const numParentsNow = countParentsOf(stored, cid)
        if (numParentsNow <= 1) return false
      }
      return true
    }
    // 'promote' oder 'relinkToSpouse' → erlauben, Handling erfolgt in delete
    return true
  }

  // 3) Nicht-Top mit Kindern → derzeit NICHT entsorgen (würde Mittel-Knoten zerreißen)
  return false
}

/**
 * Sichere Löschung:
 * - Entfernt Ehe-Backlink
 * - Entfernt targetId aus ALLEN parents.childrenIds
 * - Behandelt Kinder je nach orphanStrategy:
 *   • 'block'   → wird nie hier landen (vorher geblockt)
 *   • 'promote' → tut nichts weiter (Kind wird Top-Node)
 *   • 'relinkToSpouse' → wenn spouse existiert: hängt Kind an spouse.childrenIds
 * - Wählt neue Root gemäß preferNewRoot
 */
export function deleteMemberSafeInStored(
  stored: StoredTree,
  targetId: string,
  policy: DeletePolicy = {}
): boolean {
  const p = { ...DEFAULT_POLICY, ...policy }
  if (!canDeleteStoredById(stored, targetId, p)) return false

  const t = stored.members[targetId]
  if (!t) return false

  const children = [...(t.childrenIds ?? [])]
  const spouseId = t.spouseId ?? null
  const wasRoot = stored.rootId === targetId

  // 0) Optional: vorbereitende Elternzählung, um später Waisen zu erkennen
  const parentsBefore = new Map<string, number>()
  for (const cid of children) parentsBefore.set(cid, countParentsOf(stored, cid))

  // 1) Ehe-Backlink lösen
  if (spouseId) {
    const s = stored.members[spouseId]
    if (s && s.spouseId === t.id) s.spouseId = null
    t.spouseId = null
  }

  // 2) targetId aus ALLEN Eltern entfernen
  for (const m of Object.values(stored.members)) {
    const arr = m.childrenIds ?? []
    if (arr.includes(targetId)) m.childrenIds = arr.filter((id) => id !== targetId)
  }

  // 3) Kinder behandeln gemäß orphanStrategy
  if (children.length > 0) {
    switch (p.orphanStrategy) {
      case 'relinkToSpouse': {
        const s = spouseId ? stored.members[spouseId] : undefined
        for (const cid of children) {
          // entferne targetId als Parent (sicherheitshalber – falls es irgendwo noch steht)
          for (const m of Object.values(stored.members)) {
            if (m.childrenIds?.includes(cid) && m.id === targetId) {
              m.childrenIds = m.childrenIds.filter((id) => id !== cid)
            }
          }
          // wenn Kind jetzt elternlos ist und spouse existiert → spouse als Parent verknüpfen
          const now = countParentsOf(stored, cid)
          if (now === 0 && s) {
            s.childrenIds = s.childrenIds ?? []
            if (!s.childrenIds.includes(cid)) s.childrenIds.push(cid)
          }
          // wenn now > 0 → nichts tun (Kind hat noch andere Eltern)
        }
        break
      }
      case 'promote': {
        // nichts zu tun – Kinder bleiben ohne Eltern (Top-Nodes)
        break
      }
      case 'block':
      default:
        // sollte nicht vorkommen, da canDeleteStoredById dann false wäre
        // aber wir schützen uns und brechen ab
        return false
    }
  }

  // 4) Member löschen
  delete stored.members[targetId]

  // 5) Root neu setzen, falls nötig
  if (wasRoot) {
    const order: Array<'spouse' | 'child' | 'any'> =
      p.preferNewRoot === 'child'
        ? ['child', 'spouse', 'any']
        : p.preferNewRoot === 'any'
        ? ['any', 'child', 'spouse']
        : ['spouse', 'child', 'any']

    let newRoot: string | null = null
    for (const tier of order) {
      if (newRoot) break
      if (tier === 'spouse' && spouseId && stored.members[spouseId]) {
        newRoot = spouseId
      } else if (tier === 'child') {
        newRoot = children.find((cid) => stored.members[cid]) ?? null
      } else if (tier === 'any') {
        const ids = Object.keys(stored.members)
        newRoot = ids.length ? ids[0] : null
      }
    }
    stored.rootId = newRoot ?? Object.keys(stored.members)[0]!
  }

  return true
}

/** Abwärtskompatibel: klassisches „Leaf“-Löschen (unten), ohne Top-Deletion */
export function deleteLeafInStored(stored: StoredTree, targetId: string): boolean {
  return deleteMemberSafeInStored(stored, targetId, {
    allowTopDeletion: false,
    allowRootDeletion: false,
    orphanStrategy: 'block',
  })
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
