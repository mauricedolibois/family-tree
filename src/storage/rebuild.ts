// src/storage/rebuild.ts
import { FamilyTree } from '@/models/FamilyTree'
import { Member } from '@/models/Member'
import { Gender } from '@/types/Gender'
import type { IMember } from '@/types/IMember'
import type { StoredTree } from './schema'

/** Kind kanonisch anhängen:
 *  - gemischtgeschlechtlich → Mutter hängt an
 *  - sonst → gewählter Parent hängt an
 */
function attachChildCanonically(parent: Member, child: Member) {
  const spouse = parent.spouse
  if (spouse && spouse.gender !== parent.gender) {
    const mother = parent.gender === Gender.FEMALE ? parent : spouse
    mother.addChild(child)
  } else {
    parent.addChild(child)
  }
}

/** Spouses einmalig verknüpfen (alphabetische Ordnung vermeidet Doppelheirat) */
function linkSpousesOnce(a: Member, b: Member) {
  if (!a.spouse && !b.spouse) a.addSpouse(b) // gleichgeschlechtlich erlaubt
}

/**
 * Robuster Wiederaufbau aus StoredTree (v2):
 * - Single-Root ok
 * - gleichgeschlechtliche Ehen ok
 * - Kinder ohne Ehe ok
 * - Profile/Medien werden nachträglich gemappt
 */
export function buildTreeFromStored(data: StoredTree): FamilyTree {
  const { rootName, members: store } = data

  // 1) Alle Personeninstanzen erzeugen
  const inst = new Map<string, Member>()
  for (const rec of Object.values(store)) {
    inst.set(rec.name, new Member(rec.name, rec.gender))
  }

  // 2) Ehen verknüpfen (nur einmal)
  for (const rec of Object.values(store)) {
    if (!rec.spouseName) continue
    const a = inst.get(rec.name)
    const b = inst.get(rec.spouseName)
    if (!a || !b) continue
    if (rec.name < rec.spouseName) linkSpousesOnce(a, b)
  }

  // 3) Kinder anhängen (je Paar/Single genau eine Seite zuständig)
  const attachedChildren = new Set<string>() // verhindert Doppelanhängen
  for (const rec of Object.values(store)) {
    if (!rec.childrenNames || rec.childrenNames.length === 0) continue

    const parent = inst.get(rec.name)
    if (!parent) continue

    const spouseName = rec.spouseName ?? null
    const spouseRec = spouseName ? store[spouseName] ?? null : null
    const spouseInst = spouseName ? inst.get(spouseName!) ?? null : null

    // Entscheiden, ob DIESER parent die Kinder anhängt
    let thisParentAdds = true
    if (spouseRec) {
      if (rec.gender !== spouseRec.gender) {
        // gemischtgeschlechtlich → nur die Mutter hängt an
        thisParentAdds = rec.gender === Gender.FEMALE
      } else {
        // gleichgeschlechtlich → alphabetische Stabilisierung
        thisParentAdds = rec.name < spouseRec.name
      }
    } // Single: bleibt true

    if (!thisParentAdds) continue

    // Kanonischer "Parent", an den wirklich angehängt wird
    const canonicalParent =
      spouseRec && rec.gender !== spouseRec.gender && rec.gender !== Gender.FEMALE
        ? (spouseInst ?? parent) // Spouse ist die Mutter
        : parent

    for (const childName of rec.childrenNames) {
      if (attachedChildren.has(childName)) continue
      const childInst = inst.get(childName)
      if (!childInst) continue
      attachChildCanonically(canonicalParent, childInst)
      attachedChildren.add(childName)
    }
  }

  // 4) FamilyTree-Instanz erstellen und Root korrekt setzen
  //    Dummy-Instanz & dann Root explizit setzen → Single-Root wird akzeptiert.
  const ft = new FamilyTree('tmp-a', 'tmp-b')
  const rootInst = inst.get(rootName) ?? Array.from(inst.values())[0]
  if (rootInst) ft.root = rootInst

  // 5) Profile/Medien nachträglich an Member knüpfen
  attachProfiles(ft, data)

  return ft
}

/** Profile & Medien aus StoredTree auf IMember-Instanzen mappen */
function attachProfiles(ft: FamilyTree, data: StoredTree) {
  const byName = new Map<string, IMember>()
  const visit = (node: IMember | null) => {
    if (!node) return
    byName.set(node.name, node)
    if (node.spouse) byName.set(node.spouse.name, node.spouse)
    for (const c of node.children ?? []) visit(c)
  }
  visit(ft.root as IMember)

  for (const [name, rec] of Object.entries(data.members)) {
    const m = byName.get(name)
    if (m) {
      ;(m as IMember).profile = rec.profile ?? undefined
    }
  }
}
