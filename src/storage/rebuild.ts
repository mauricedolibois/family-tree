// src/storage/rebuild.ts
import { FamilyTree } from '@/models/FamilyTree'
import { Gender } from '@/types/Gender'
import type { IMember } from '@/types/IMember'
import type { StoredTree } from './schema'

/**
 * Baue einen FamilyTree aus StoredTree-Daten.
 * - legt zuerst Root + ggf. Root-Spouse an
 * - fügt dann Ehen hinzu
 * - fügt Kinder hinzu (Mutter-Heuristik wie gehabt)
 * - WICHTIG: hängt am Ende die Profile aus StoredTree an die Member-Instanzen
 */
export function buildTreeFromStored(data: StoredTree): FamilyTree {
  // 1) Root + evtl. Root-Spouse
  const rootStored = data.members[data.rootName]
  const rootSpouseName = rootStored?.spouseName ?? ''
  const ft = new FamilyTree(data.rootName, rootSpouseName)

  const present = new Set<string>([data.rootName])
  if (rootSpouseName) present.add(rootSpouseName)

  const q: string[] = [data.rootName]
  if (rootSpouseName) q.push(rootSpouseName)
  const processedChildren = new Set<string>()

  // 2) Ehen + Kinder iterativ hinzufügen
  while (q.length) {
    const name = q.shift()!
    const stored = data.members[name]
    if (!stored) continue

    // 2a) Ehen (nur einmal)
    const sName = stored.spouseName ?? ''
    if (sName && !present.has(sName)) {
      const spouseStored = data.members[sName]
      if (spouseStored) {
        ft.addMember(name, spouseStored.name, spouseStored.gender, 'SPOUSE')
        present.add(sName)
        q.push(sName)
      }
    }

    // 2b) Kinder (nur einmal je Paar)
    if (!processedChildren.has(name) && stored.childrenNames?.length) {
      const spouse = sName ? data.members[sName] ?? null : null
      const hasFemaleParent =
        stored.gender === Gender.FEMALE ||
        (spouse && spouse.gender === Gender.FEMALE)

      // Wenn es eine Mutter im Paar gibt, nur die Mutter fügt Kinder hinzu.
      // Sonst als Tiebreaker Alphabet (stabil).
      let thisParentAdds = true
      if (hasFemaleParent) {
        thisParentAdds = stored.gender === Gender.FEMALE
      } else if (spouse) {
        thisParentAdds = stored.name < spouse.name
      }

      if (thisParentAdds) {
        const motherName =
          stored.gender === Gender.FEMALE
            ? stored.name
            : spouse?.gender === Gender.FEMALE
            ? spouse.name
            : stored.name

        for (const childName of stored.childrenNames) {
          const child = data.members[childName]
          if (!child) continue
          ft.addMember(motherName, child.name, child.gender, 'CHILD')
          if (!present.has(child.name)) {
            present.add(child.name)
            q.push(child.name)
          }
        }

        processedChildren.add(name)
        if (spouse?.name) processedChildren.add(spouse.name)
      }
    }
  }

  // 3) Profile an die Member-Knoten mappen
  attachProfiles(ft, data)

  return ft
}

/** Hänge die Profile aus StoredTree an die IMember-Instanzen im FamilyTree. */
function attachProfiles(ft: FamilyTree, data: StoredTree) {
  // Falls dein FamilyTree eine schnelle Suche hat, gerne verwenden:
  const maybeFind = (ft as any).findMember as
    | ((name: string) => IMember | null)
    | undefined
  if (typeof maybeFind === 'function') {
    for (const [name, rec] of Object.entries(data.members)) {
      const m = maybeFind.call(ft, name)
      if (m) {
        ;(m as IMember).profile = rec.profile ?? undefined
      }
    }
    return
  }

  // Fallback: DFS über den Baum und Map nach Namen aufbauen
  const map = new Map<string, IMember>()
  const visit = (node: IMember | null) => {
    if (!node) return
    map.set(node.name, node)
    if (node.spouse) map.set(node.spouse.name, node.spouse)
    for (const c of node.children ?? []) visit(c)
  }
  visit(ft.root as IMember)

  for (const [name, rec] of Object.entries(data.members)) {
    const m = map.get(name)
    if (m) {
      ;(m as IMember).profile = rec.profile ?? undefined
    }
  }
}
