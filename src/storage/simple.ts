// src/storage/simple.ts
'use client'

import { FamilyTree } from '@/models/FamilyTree'
import { IMember } from '@/types/IMember'
import { Gender } from '@/types/Gender'
import { setupShanFamilyTree } from '@/utils'

/** ---------- v3: ID-basiertes, minimalistisches LocalStorage-Schema ---------- */
type StoredMemberV3 = {
  id: string
  name: string
  gender: Gender
  spouseId: string | null
  childrenIds: string[]
  // (ohne Profile/Medien – dafür nimmst du dein "richtiges" schema.ts)
}

type StoredTreeV3 = {
  version: 3
  rootId: string
  members: Record<string, StoredMemberV3> // key = id
}

const STORAGE_KEY = 'familyTree.v3.simple'

const hasLS = () =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

/* ---------- load/save ---------- */
function loadStored(): StoredTreeV3 | null {
  if (!hasLS()) return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.version === 3 ? (parsed as StoredTreeV3) : null
  } catch {
    return null
  }
}

function saveStored(data: StoredTreeV3) {
  if (!hasLS()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {}
}

/* ---------- serialize (Graph -> v3) ---------- */
function serializeFromRoot(root: IMember): StoredTreeV3 {
  const members: Record<string, StoredMemberV3> = {}
  const seen = new Set<string>()
  const stack: IMember[] = [root]

  while (stack.length) {
    const m = stack.pop()!
    if (!m || seen.has(m.id)) continue
    seen.add(m.id)

    const children = Array.isArray(m.children) ? m.children : []
    const spouse = m.spouse ?? null

    members[m.id] = {
      id: m.id,
      name: m.name,
      gender: m.gender,
      spouseId: spouse ? spouse.id : null,
      childrenIds: children.map((c) => c.id),
    }

    if (spouse && !seen.has(spouse.id)) stack.push(spouse)
    if (children.length) {
      for (const c of children) if (!seen.has(c.id)) stack.push(c)
    }
  }

  return { version: 3, rootId: root.id, members }
}

/* ---------- rebuild (v3 -> FamilyTree) ----------
   - erzeugt Instanzen und verknüpft Ehen
   - hängt Kinder KANONISCH an (gemischtgeschlechtlich: Mutter; sonst: ausgewählter Parent)
   - nutzt ausschließlich IDs, nie Namen
*/
function buildTreeFromStored(data: StoredTreeV3): FamilyTree {
  const { rootId, members: store } = data
  const all = Object.values(store)
  if (all.length === 0) {
    // Fallback: leer -> Default-Seed
    return setupShanFamilyTree()
  }

  // 1) Grundgerüst: Tree mit Dummy-Eltern erzeugen, danach Root überschreiben
  const dummy = new FamilyTree('tmp-a', 'tmp-b')

  // 2) Map ID -> Member-Instanz
  const inst = new Map<string, import('@/models/Member').Member>()
  for (const rec of all) {
    inst.set(rec.id, new (require('@/models/Member').Member)(rec.name, rec.gender))
  }

  // 3) Ehen verknüpfen (einmalig)
  for (const rec of all) {
    const a = inst.get(rec.id)!
    const b = rec.spouseId ? inst.get(rec.spouseId) : null
    if (!b) continue
    // um Doppelheirat zu vermeiden: nur verbinden, wenn beide noch Single sind
    if (!a.spouse && !b.spouse) a.addSpouse(b)
  }

  // 4) Kinder anhängen – kanonisch
  // Regel:
  //  - gemischtgeschlechtlich: Mutter hängt Kinder an
  //  - sonst: der aktuell betrachtete Parent hängt an
  const attached = new Set<string>()
  for (const rec of all) {
    if (!rec.childrenIds?.length) continue
    const parent = inst.get(rec.id)!
    const spouse = rec.spouseId ? inst.get(rec.spouseId)! : null

    // Bestimme, ob hier die Mutter ist
    let canonicalParent = parent
    if (spouse && spouse.gender !== parent.gender) {
      canonicalParent = parent.gender === Gender.FEMALE ? parent : spouse
    }

    // Kinder anhängen (einmalig pro Kind)
    for (const childId of rec.childrenIds) {
      if (attached.has(childId)) continue
      const child = inst.get(childId)
      if (!child) continue
      canonicalParent.addChild(child)
      attached.add(childId)
    }
  }

  // 5) Root setzen
  const newRoot = inst.get(rootId) ?? inst.values().next().value
  if (newRoot) dummy.root = newRoot

  return dummy
}

/* ---------- public API ---------- */
export function getOrInitFamilyTree(): FamilyTree {
  const existing = loadStored()
  if (existing) return buildTreeFromStored(existing)

  const seed = setupShanFamilyTree()
  saveStored(serializeFromRoot(seed.root))
  return seed
}

export function persistFamilyTree(ft: FamilyTree) {
  saveStored(serializeFromRoot(ft.root))
}

export function clearFamilyTreeStorage() {
  if (!hasLS()) return
  localStorage.removeItem(STORAGE_KEY)
}
