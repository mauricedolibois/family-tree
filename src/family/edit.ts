// src/family/edit.ts
//
// Änderungen am Stammbaum als reine Funktionen: Sie verändern den
// übergebenen Baum nie, sondern liefern eine geänderte Kopie zurück.

import type { StoredProfile } from '@/storage/schema'
import { buildIndex, parentsOf, type Gender, type Person, type Tree } from './model'

export type Relation = 'CHILD' | 'SPOUSE' | 'PARENT'

export type NewRelative = {
  relation: Relation
  name: string
  gender: Gender
  /** nur Kind: als adoptiert markieren */
  adopted?: boolean
  /** nur Kind: auch Kind des Ehepartners der Bezugsperson (Standard: ja) */
  alsoChildOfSpouse?: boolean
  /** nur Elternteil: mit dem vorhandenen anderen Elternteil verheiraten */
  marryExistingParent?: boolean
}

export class EditError extends Error {}

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'

export function newId(length = 10): string {
  const bytes = new Uint8Array(length)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (b) => ID_ALPHABET[b & 63]).join('')
}

const emptyProfile = (): StoredProfile => ({
  birthDate: null,
  deathDate: null,
  country: null,
  city: null,
  job: null,
  comments: null,
  titleImageUrl: null,
  media: [],
})

function newPerson(name: string, gender: Gender): Person {
  return {
    id: newId(),
    name: name.trim(),
    gender,
    spouseId: null,
    parentIds: [],
    childrenIds: [],
    adoptedChildrenIds: [],
    profile: emptyProfile(),
  }
}

function clone(tree: Tree): Tree {
  return JSON.parse(JSON.stringify(tree)) as Tree
}

/** parentIds aus den childrenIds neu ableiten, damit beide Seiten zusammenpassen */
export function normalize(tree: Tree): Tree {
  const ix = buildIndex(tree)
  for (const p of Object.values(tree.members)) {
    p.parentIds = [...parentsOf(ix, p.id)]
    p.childrenIds = (p.childrenIds ?? []).filter((c) => tree.members[c])
    p.adoptedChildrenIds = (p.adoptedChildrenIds ?? []).filter((c) => p.childrenIds.includes(c))
    if (p.spouseId && tree.members[p.spouseId]?.spouseId !== p.id) p.spouseId = null
  }
  return tree
}

function link(parent: Person, child: Person, adopted = false) {
  if (!parent.childrenIds.includes(child.id)) parent.childrenIds.push(child.id)
  if (adopted && !parent.adoptedChildrenIds?.includes(child.id)) {
    parent.adoptedChildrenIds = [...(parent.adoptedChildrenIds ?? []), child.id]
  }
}

/** Neue Person in Beziehung zu `refId` anlegen */
export function addRelative(tree: Tree, refId: string, input: NewRelative): { tree: Tree; id: string } {
  const name = input.name.trim()
  if (!name) throw new EditError('Bitte einen Namen eingeben.')

  const next = clone(tree)
  const ref = next.members[refId]
  if (!ref) throw new EditError('Die Bezugsperson wurde nicht gefunden.')
  const person = newPerson(name, input.gender)
  const ix = buildIndex(next)

  switch (input.relation) {
    case 'CHILD': {
      next.members[person.id] = person
      link(ref, person, input.adopted)
      const spouse = ref.spouseId ? next.members[ref.spouseId] : undefined
      if (spouse && (input.alsoChildOfSpouse ?? true)) link(spouse, person, input.adopted)
      break
    }
    case 'SPOUSE': {
      if (ref.spouseId && next.members[ref.spouseId]) {
        throw new EditError(`${ref.name} ist bereits mit ${next.members[ref.spouseId].name} verheiratet.`)
      }
      next.members[person.id] = person
      ref.spouseId = person.id
      person.spouseId = ref.id
      break
    }
    case 'PARENT': {
      const existing = parentsOf(ix, ref.id)
      if (existing.length >= 2) throw new EditError(`${ref.name} hat bereits zwei Eltern.`)
      next.members[person.id] = person
      link(person, ref)
      if (input.marryExistingParent && existing.length === 1) {
        const other = next.members[existing[0]]
        if (other && !other.spouseId) {
          other.spouseId = person.id
          person.spouseId = other.id
        }
      }
      break
    }
  }

  return { tree: normalize(next), id: person.id }
}

export type PersonPatch = {
  name?: string
  gender?: Gender
  profile?: Partial<StoredProfile>
}

export function updatePerson(tree: Tree, id: string, patch: PersonPatch): Tree {
  const next = clone(tree)
  const p = next.members[id]
  if (!p) throw new EditError('Die Person wurde nicht gefunden.')
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) throw new EditError('Der Name darf nicht leer sein.')
    p.name = name
  }
  if (patch.gender) p.gender = patch.gender
  if (patch.profile) p.profile = { ...emptyProfile(), ...p.profile, ...patch.profile }
  return next
}

/**
 * Löschen ist erlaubt für Personen ohne Kinder oder ohne Eltern (ganz oben).
 * Personen in der Mitte würden den Baum zerreißen.
 */
export function canDelete(tree: Tree, id: string): boolean {
  const p = tree.members[id]
  if (!p || Object.keys(tree.members).length <= 1) return false
  const ix = buildIndex(tree)
  return (p.childrenIds ?? []).length === 0 || parentsOf(ix, id).length === 0
}

export function deletePerson(tree: Tree, id: string): Tree {
  if (!canDelete(tree, id)) {
    throw new EditError('Diese Person hat Eltern und Kinder im Baum und kann deshalb nicht gelöscht werden.')
  }
  const next = clone(tree)
  const target = next.members[id]
  const spouse = target.spouseId ? next.members[target.spouseId] : undefined

  if (spouse) spouse.spouseId = null
  for (const m of Object.values(next.members)) {
    m.childrenIds = m.childrenIds.filter((c) => c !== id)
    m.adoptedChildrenIds = (m.adoptedChildrenIds ?? []).filter((c) => c !== id)
  }
  // Kinder, die sonst ohne Eltern dastünden, an den Ehepartner hängen
  const ixAfter = buildIndex({
    ...next,
    members: Object.fromEntries(Object.entries(next.members).filter(([k]) => k !== id)),
  })
  for (const c of target.childrenIds) {
    if (spouse && next.members[c] && parentsOf(ixAfter, c).length === 0) link(spouse, next.members[c])
  }
  delete next.members[id]

  if (next.rootId === id) {
    next.rootId = spouse?.id ?? target.childrenIds.find((c) => next.members[c]) ?? Object.keys(next.members)[0]
  }
  return normalize(next)
}

/** Startbaum für eine neue Familie */
export function starterTree(): Tree {
  const father = newPerson('Vater', 'MALE')
  const mother = newPerson('Mutter', 'FEMALE')
  const child = newPerson('Kind', 'FEMALE')
  father.spouseId = mother.id
  mother.spouseId = father.id
  father.childrenIds = [child.id]
  mother.childrenIds = [child.id]
  child.parentIds = [father.id, mother.id]
  return { version: 3, rootId: father.id, members: { [father.id]: father, [mother.id]: mother, [child.id]: child } }
}
