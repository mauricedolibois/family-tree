import { Member } from '@/models/Member'
import { Gender } from '@/types/Gender'
import { isMemberOrSpouse } from '@/utils'

/** BFS Traversal ab Root */
export function traverse(root: Member, cb: (current: Member, depth: number) => void): void {
  const queue: [Member, number][] = [[root, 0]]
  const seen = new Set<Member>()
  while (queue.length > 0) {
    const [node, depth] = queue.shift()!
    if (seen.has(node)) continue
    seen.add(node)
    cb(node, depth)
    for (const child of node.children) queue.push([child, depth + 1])
    if (node.spouse) queue.push([node.spouse, depth]) // Ehepartner auf gleicher Ebene
  }
}

/* -------------------- Name-basierte Helfer (bestehen bleiben) -------------------- */

export function find(root: Member, name: string): Member | null {
  let found: Member | null = null
  traverse(root, (m) => {
    if (found) return
    if (isMemberOrSpouse(name)(m)) found = m
  })
  return found
}

export function parentOf(root: Member, name: string): Member | null {
  let parent: Member | null = null
  traverse(root, (m) => {
    if (parent) return
    if (m.children.some((c) => c.name === name)) parent = m
  })
  return parent
}

export function fatherOf(root: Member, name: string): Member | null {
  const p = parentOf(root, name)
  if (!p) return null
  return p.gender === Gender.MALE ? p : p.spouse
}

export function motherOf(root: Member, name: string): Member | null {
  const p = parentOf(root, name)
  if (!p) return null
  return p.gender === Gender.FEMALE ? p : p.spouse
}

export function childrenOf(root: Member, name: string): Member[] {
  let kids: Member[] = []
  traverse(root, (m) => {
    if (isMemberOrSpouse(name)(m)) kids = m.children
  })
  return kids
}

export function siblingsOf(root: Member, name: string): Member[] {
  let sibs: Member[] = []
  traverse(root, (m) => {
    const child = m.children.find((c) => c.name === name)
    if (child) sibs = m.children.filter((c) => c !== child)
  })
  return sibs
}

export function spouseOf(root: Member, name: string): Member | null {
  let sp: Member | null = null
  traverse(root, (m) => {
    if (sp) return
    if (m.name === name) sp = m.spouse ?? null
    else if (m.spouse?.name === name) sp = m
  })
  return sp
}

/* -------------------- NEU: ID-basierte Helfer -------------------- */

export function findById(root: Member, id: string): Member | null {
  let found: Member | null = null
  traverse(root, (m) => {
    if (found) return
    if (m.id === id || m.spouse?.id === id) found = (m.id === id ? m : m.spouse)!
  })
  return found
}

export function parentOfId(root: Member, childId: string): Member | null {
  let parent: Member | null = null
  traverse(root, (m) => {
    if (parent) return
    if (m.children.some((c) => c.id === childId)) parent = m
  })
  return parent
}

export function fatherOfId(root: Member, id: string): Member | null {
  const p = parentOfId(root, id)
  if (!p) return null
  return p.gender === Gender.MALE ? p : p.spouse
}

export function motherOfId(root: Member, id: string): Member | null {
  const p = parentOfId(root, id)
  if (!p) return null
  return p.gender === Gender.FEMALE ? p : p.spouse
}

export function childrenOfId(root: Member, id: string): Member[] {
  let kids: Member[] = []
  traverse(root, (m) => {
    if (m.id === id || m.spouse?.id === id) kids = m.children
  })
  return kids
}

export function siblingsOfId(root: Member, id: string): Member[] {
  let sibs: Member[] = []
  traverse(root, (m) => {
    const child = m.children.find((c) => c.id === id)
    if (child) sibs = m.children.filter((c) => c.id !== id)
  })
  return sibs
}

export function spouseOfId(root: Member, id: string): Member | null {
  let sp: Member | null = null
  traverse(root, (m) => {
    if (sp) return
    if (m.id === id) sp = m.spouse ?? null
    else if (m.spouse?.id === id) sp = m
  })
  return sp
}
