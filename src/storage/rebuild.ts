// src/storage/rebuild.ts
import { Member } from '@/models/Member'
import type { StoredTree, StoredMemberV3 } from './schema'
import type { IMember } from '@/types/IMember'

export type RebuiltGraph = {
  root: IMember
  byId: Record<string, IMember>
}

/**
 * Baut den Runtime-Graph *vollständig*:
 * - Erst alle Instanzen erzeugen (damit IDs auflösbar sind)
 * - Dann Relationen setzen (Spouse beidseitig, Parent<->Child beidseitig)
 * - Gibt zusätzlich ein byId-Register zurück, damit *alle* Knoten zugreifbar sind.
 */
export function buildTreeFromStored(stored: StoredTree): RebuiltGraph {
  if (!stored || stored.version !== 3) {
    throw new Error('Unsupported stored tree version')
  }

  const byId: Record<string, Member> = {}

  // 1) Instanzen anlegen
  for (const mId of Object.keys(stored.members)) {
    const m = stored.members[mId] as StoredMemberV3
    byId[mId] = new Member(m.name, m.gender, m.id)
    // Profile direkt anheften (optional/falls genutzt)
    if (m.profile) {
      (byId[mId] as any).profile = { ...m.profile }
    }
  }

  // 2) Relationen setzen
  for (const mId of Object.keys(stored.members)) {
    const sm = stored.members[mId] as StoredMemberV3
    const me = byId[mId]

    // Spouse (beidseitig, idempotent)
    if (sm.spouseId) {
      const sp = byId[sm.spouseId]
      if (sp && me.spouse?.id !== sp.id) {
        me.addSpouse(sp)
      }
    }

    // Parents <-> Child (beidseitig, ohne Auto-Heiraten)
    const parentIds = sm.parentIds ?? []
    for (const pId of parentIds) {
      const p = byId[pId]
      if (p && !me.parents.some(x => x.id === p.id)) {
        // Nur eine Seite, Member.addParent macht beidseitig
        me.addParent(p)
      }
    }

    // Children <-> Parent (zur Absicherung, falls parentIds fehlten)
    for (const cId of sm.childrenIds ?? []) {
      const c = byId[cId]
      if (c && !me.children.some(x => x.id === c.id)) {
        me.addChild(c) // addChild verknüpft beidseitig + ggf. spouse.children
      }
    }
  }

  const root = byId[stored.rootId]
  if (!root) throw new Error('Root not found in stored tree')

  // Runtime-Typ auf IMember abbilden
  return { root: root as IMember, byId: byId as Record<string, IMember> }
}
