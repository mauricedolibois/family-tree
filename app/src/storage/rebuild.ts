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
 * - Dann Spouses verknüpfen (idempotent)
 * - Dann Parent→Child je *Parent* verknüpfen (einseitig pro Parent) und Adoption je Kante setzen
 *   → nutzt `parent.addChild(child, { adopted })`, damit `adoptedChildrenIds` korrekt gefüllt wird.
 */
export function buildTreeFromStored(stored: StoredTree): RebuiltGraph {
  if (!stored || stored.version !== 3) {
    throw new Error('Unsupported stored tree version')
  }

  const byId: Record<string, Member> = {}

  // 1) Instanzen anlegen (+ Profile + adoptierte-Kinder-Liste)
  for (const mId of Object.keys(stored.members)) {
    const rec = stored.members[mId] as StoredMemberV3
    const inst = new Member(rec.name, rec.gender, rec.id)

    // Profile direkt anheften (optional/falls genutzt)
    if (rec.profile) {
      ;(inst as any).profile = { ...rec.profile }
    }

    // Adoption-Flags aus Persistenz an die Runtime-Instanz hängen
    inst.adoptedChildrenIds = Array.isArray(rec.adoptedChildrenIds)
      ? rec.adoptedChildrenIds.slice()
      : []

    byId[mId] = inst
  }

  // 2) Spouse-Beziehungen herstellen (idempotent)
  for (const mId of Object.keys(stored.members)) {
    const rec = stored.members[mId] as StoredMemberV3
    const me = byId[mId]
    const sId = rec.spouseId ?? null
    if (!sId) continue
    const sp = byId[sId]
    if (sp && me.spouse?.id !== sp.id && sp.spouse?.id !== me.id) {
      me.addSpouse(sp)
    }
  }

  // 3) Eltern-Kind-Verknüpfungen je Parent (inkl. Adoption je Kante)
  //    Wichtig: wir gehen **pro Parent** über dessen childrenIds und verlinken
  //    parent.addChild(child, { adopted: ... }). Das baut beidseitig parent↔child
  //    und setzt das Adoptiv-Flag NUR für diesen Parent.
  for (const pId of Object.keys(stored.members)) {
    const prec = stored.members[pId] as StoredMemberV3
    const parent = byId[pId]
    if (!parent) continue

    const kids = Array.isArray(prec.childrenIds) ? prec.childrenIds : []
    const adoptedSet = new Set<string>(
      Array.isArray(prec.adoptedChildrenIds) ? prec.adoptedChildrenIds : []
    )

    for (let i = 0; i < kids.length; i++) {
      const cId = kids[i]
      const child = byId[cId]
      if (!child) continue

      // einseitig pro Parent verknüpfen + Adoption auf der Kante setzen
      parent.addChild(child, { adopted: adoptedSet.has(cId) })
    }
  }

  const root = byId[stored.rootId]
  if (!root) throw new Error('Root not found in stored tree')

  return { root: root as IMember, byId: byId as Record<string, IMember> }
}
