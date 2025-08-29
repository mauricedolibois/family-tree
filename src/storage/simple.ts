// src/storage/simple.ts
'use client'

import { FamilyTree } from '@/models/FamilyTree'
import { IMember } from '@/types/IMember'
import { Gender } from '@/types/Gender'
import { setupShanFamilyTree } from '@/utils'

type StoredMember = {
  name: string
  gender: Gender
  spouseName?: string | null
  childrenNames: string[]
}

type StoredTree = {
  version: 1
  rootName: string
  members: Record<string, StoredMember>
}

const STORAGE_KEY = 'familyTree.v1'

const hasLS = () =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

/* ---------- load/save ---------- */
function loadStored(): StoredTree | null {
  if (!hasLS()) return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.version === 1 ? (parsed as StoredTree) : null
  } catch {
    return null
  }
}

function saveStored(data: StoredTree) {
  if (!hasLS()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {}
}

/* ---------- serialize ---------- */
function serializeFromRoot(root: IMember): StoredTree {
  const members: Record<string, StoredMember> = {}
  const seen = new Set<string>()
  const stack: IMember[] = [root]

  while (stack.length) {
    const m = stack.pop()!
    if (!m || seen.has(m.name)) continue
    seen.add(m.name)

    members[m.name] = {
      name: m.name,
      gender: m.gender,
      spouseName: m.spouse?.name ?? null,
      childrenNames: (m.children ?? []).map((c) => c.name),
    }

    if (m.spouse) stack.push(m.spouse)
    if (m.children?.length) stack.push(...m.children)
  }

  return { version: 1, rootName: root.name, members }
}

/* ---------- deserialize (BFS vom Root) ---------- */
function buildTreeFromStored(data: StoredTree): FamilyTree {
  const rootStored = data.members[data.rootName]
  const rootSpouseName = rootStored?.spouseName ?? '' // Konstruktor erwartet 2 Strings
  const ft = new FamilyTree(data.rootName, rootSpouseName)

  // Buchhaltung: wer ist bereits im Tree vorhanden?
  const present = new Set<string>()
  present.add(data.rootName)
  if (rootSpouseName) present.add(rootSpouseName)

  // BFS-Queue startet am Root (nur über bereits existierende Personen expandieren!)
  const q: string[] = [data.rootName]
  if (rootSpouseName) q.push(rootSpouseName)

  // um doppelte Kinder-Anlage zu vermeiden:
  // Regel: Falls es eine Mutter gibt -> nur sie legt Kinder an.
  // Falls keine Mutter bekannt -> der lexikografisch kleinere Elternname legt Kinder an.
  const visitedForChildren = new Set<string>() // markiert, dass dieser Elternteil seine Kinder bereits angelegt hat

  while (q.length) {
    const name = q.shift()!
    const stored = data.members[name]
    if (!stored) continue

    // 1) Spouse sicherstellen (falls nicht Root-Paar und noch nicht verbunden)
    const sName = stored.spouseName ?? ''
    if (sName && !present.has(sName)) {
      const spouseStored = data.members[sName]
      if (spouseStored) {
        // name existiert sicher im Baum, also addMember(name, spouse, 'SPOUSE') ist gültig
        ft.addMember(name, spouseStored.name, spouseStored.gender, 'SPOUSE')
        present.add(sName)
        q.push(sName)
      }
    }

    // 2) Kinder nur einmal anlegen (Mutter-first-Policy)
    if (!visitedForChildren.has(name) && stored.childrenNames?.length) {
      const spouse = stored.spouseName
        ? data.members[stored.spouseName] ?? null
        : null

      const hasFemaleParent =
        stored.gender === Gender.FEMALE ||
        (spouse && spouse.gender === Gender.FEMALE)

      // Soll dieser Parent die Kinder anlegen?
      let thisParentAdds = true
      if (hasFemaleParent) {
        thisParentAdds = stored.gender === Gender.FEMALE
      } else if (spouse) {
        thisParentAdds = stored.name < spouse.name
      }

      if (thisParentAdds) {
        // Muttername bestimmen (falls vorhanden), sonst aktueller Parent
        const motherName =
          stored.gender === Gender.FEMALE
            ? stored.name
            : spouse?.gender === Gender.FEMALE
            ? spouse.name
            : stored.name

        for (const childName of stored.childrenNames) {
          const child = data.members[childName]
          if (!child) continue
          // Mutter existiert sicher im Tree (entweder stored ist Mutter oder spouse wurde oben verknüpft)
          ft.addMember(motherName, child.name, child.gender, 'CHILD')
          if (!present.has(child.name)) {
            present.add(child.name)
            q.push(child.name)
          }
        }
        visitedForChildren.add(name)
        if (spouse?.name) visitedForChildren.add(spouse.name) // verhindert doppelte Anlage beim Partner
      }
    }
  }

  return ft
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
