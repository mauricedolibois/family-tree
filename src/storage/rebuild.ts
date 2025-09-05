import { FamilyTree } from '@/models/FamilyTree'
import { Member } from '@/models/Member'
import { Gender } from '@/types/Gender'
import type { IMember } from '@/types/IMember'
import type { StoredTree, StoredMemberV3 } from './schema'

export function buildTreeFromStored(data: StoredTree): FamilyTree {
  if (data.version !== 3) {
    throw new Error('StoredTree version mismatch: expected v3 (id-based).')
  }

  const { members: store, rootId } = data

  // 1) Instanzen bauen (id, name, gender)
  const byId = new Map<string, Member>()
  for (const rec of Object.values(store)) {
    const m = new Member(rec.name, rec.gender)
    // Member-Klasse hat id-Feld – setzen:
    ;(m as any).id = rec.id
    byId.set(rec.id, m)
  }

  // 2) Spouses verknüpfen (einmalig, id-basiert)
  const linked = new Set<string>()
  for (const rec of Object.values(store)) {
    if (!rec.spouseId) continue
    const a = byId.get(rec.id)
    const b = byId.get(rec.spouseId)
    if (!a || !b) continue
    const key = rec.id < rec.spouseId ? `${rec.id}-${rec.spouseId}` : `${rec.spouseId}-${rec.id}`
    if (linked.has(key)) continue
    a.addSpouse(b)
    linked.add(key)
  }

  // 3) Kinder verknüpfen (kanonisch: Mutter bei gemischtgeschlechtlich)
  for (const rec of Object.values(store)) {
    if (!rec.childrenIds?.length) continue
    const parent = byId.get(rec.id)
    if (!parent) continue

    const spouse = rec.spouseId ? byId.get(rec.spouseId) ?? null : null

    for (const cid of rec.childrenIds) {
      const child = byId.get(cid)
      if (!child) continue

      if (spouse && spouse.gender !== parent.gender) {
        const mother = parent.gender === Gender.FEMALE ? parent : spouse
        // Doppelte verhindern
        if (!mother.children.some((c) => c === child)) mother.addChild(child)
      } else {
        if (!parent.children.some((c) => c === child)) parent.addChild(child)
      }
    }
  }

  // 4) FamilyTree mit richtigem Root (per id)
  const tmp = new FamilyTree('tmp-a', 'tmp-b')
  const root = byId.get(rootId) ?? Array.from(byId.values())[0]
  if (!root) throw new Error('No root found after rebuild.')
  tmp.root = root

  // 5) Profile/Medien anreichern (id-basiert)
  attachProfilesById(tmp, data)

  return tmp
}

function attachProfilesById(ft: FamilyTree, data: StoredTree) {
  const map = new Map<string, IMember>()
  const visit = (node: IMember | null) => {
    if (!node) return
    map.set(node.id, node)
    if (node.spouse) map.set(node.spouse.id, node.spouse)
    for (const c of node.children ?? []) visit(c)
  }
  visit(ft.root as IMember)

  for (const rec of Object.values(data.members)) {
    const m = map.get(rec.id)
    if (m) (m as IMember).profile = rec.profile ?? undefined
  }
}
