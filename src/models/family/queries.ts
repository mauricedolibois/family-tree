import { Member } from '@/models/Member'
import { Relationship, SearchableRelationship } from '@/types/Relationship'
import { isFemale, isMale, getSpouse } from '@/utils'
import {
  traverse,
  parentOf,
  fatherOf,
  motherOf,
  childrenOf,
  siblingsOf,
  spouseOf,
  // ID-Varianten
  parentOfId,
  fatherOfId,
  motherOfId,
  childrenOfId,
  siblingsOfId,
  spouseOfId,
} from './traverse'

/* ---------- Name-basiert (bestehend) ---------- */
export function getByRelationship(root: Member, name: string, rel: Relationship): Member[] | Member | null {
  switch (rel) {
    case 'PATERNAL-UNCLE': return paternalUncles(root, name)
    case 'MATERNAL-UNCLE': return maternalUncles(root, name)
    case 'PATERNAL-AUNT':  return paternalAunts(root, name)
    case 'MATERNAL-AUNT':  return maternalAunts(root, name)
    case 'SISTER-IN-LAW':  return sisterInLaws(root, name)
    case 'BROTHER-IN-LAW': return brotherInLaws(root, name)
    case 'COUSIN':         return cousins(root, name)
    case 'FATHER':         return fatherOf(root, name)
    case 'MOTHER':         return motherOf(root, name)
    case 'CHILD':          return childrenOf(root, name)
    case 'SON':            return childrenOf(root, name).filter(isMale)
    case 'DAUGHTER':       return childrenOf(root, name).filter(isFemale)
    case 'BROTHER':        return siblingsOf(root, name).filter(isMale)
    case 'SISTER':         return siblingsOf(root, name).filter(isFemale)
    case 'GRAND-CHILD':    return grandChildren(root, name)
    case 'GRAND-DAUGHTER': return grandChildren(root, name).filter(isFemale)
    case 'GRAND-SON':      return grandChildren(root, name).filter(isMale)
    case 'SIBLING':        return siblingsOf(root, name)
    case 'SPOUSE':         return spouseOf(root, name)
    default:               return null
  }
}

export function getRelationship(root: Member, memberName: string, relativeName: string): SearchableRelationship | null {
  let member: [Member | null, number | null] = [null, null]
  let relative: [Member | null, number | null] = [null, null]

  traverse(root, (m, depth) => {
    if (!member[0]) {
      if (m.name === memberName) member = [m, depth]
      else if (m.spouse?.name === memberName) member = [m.spouse, depth]
    }
    if (!relative[0]) {
      if (m.name === relativeName) relative = [m, depth]
      else if (m.spouse?.name === relativeName) relative = [m.spouse, depth]
    }
  })

  return computeRelCore(root, member, relative)
}

/* ---------- NEU: ID-basiert ---------- */

export function getByRelationshipId(root: Member, id: string, rel: Relationship): Member[] | Member | null {
  switch (rel) {
    case 'PATERNAL-UNCLE': return paternalUnclesId(root, id)
    case 'MATERNAL-UNCLE': return maternalUnclesId(root, id)
    case 'PATERNAL-AUNT':  return paternalAuntsId(root, id)
    case 'MATERNAL-AUNT':  return maternalAuntsId(root, id)
    case 'SISTER-IN-LAW':  return sisterInLawsId(root, id)
    case 'BROTHER-IN-LAW': return brotherInLawsId(root, id)
    case 'COUSIN':         return cousinsId(root, id)
    case 'FATHER':         return fatherOfId(root, id)
    case 'MOTHER':         return motherOfId(root, id)
    case 'CHILD':          return childrenOfId(root, id)
    case 'SON':            return childrenOfId(root, id).filter(isMale)
    case 'DAUGHTER':       return childrenOfId(root, id).filter(isFemale)
    case 'BROTHER':        return siblingsOfId(root, id).filter(isMale)
    case 'SISTER':         return siblingsOfId(root, id).filter(isFemale)
    case 'GRAND-CHILD':    return grandChildrenId(root, id)
    case 'GRAND-DAUGHTER': return grandChildrenId(root, id).filter(isFemale)
    case 'GRAND-SON':      return grandChildrenId(root, id).filter(isMale)
    case 'SIBLING':        return siblingsOfId(root, id)
    case 'SPOUSE':         return spouseOfId(root, id)
    default:               return null
  }
}

export function getRelationshipById(root: Member, memberId: string, relativeId: string): SearchableRelationship | null {
  let member: [Member | null, number | null] = [null, null]
  let relative: [Member | null, number | null] = [null, null]

  traverse(root, (m, depth) => {
    if (!member[0]) {
      if (m.id === memberId) member = [m, depth]
      else if (m.spouse?.id === memberId) member = [m.spouse, depth]
    }
    if (!relative[0]) {
      if (m.id === relativeId) relative = [m, depth]
      else if (m.spouse?.id === relativeId) relative = [m.spouse, depth]
    }
  })

  return computeRelCore(root, member, relative)
}

/* ---------- Kernlogik (geteilt) ---------- */

function computeRelCore(
  root: Member,
  member: [Member | null, number | null],
  relative: [Member | null, number | null]
): SearchableRelationship | null {
  if (!member[0]) throw new Error(`member not found`)
  if (!relative[0]) throw new Error(`relative not found`)

  const [mNode, mDepth] = member as [Member, number]
  const [rNode, rDepth] = relative as [Member, number]

  if (mDepth - rDepth >= 2) return 'ANCESTOR'
  if (rDepth - mDepth >= 2) return 'DESCENDANT'

  if (mDepth === rDepth) {
    if (mNode.spouse?.id === rNode.id) return 'SPOUSE'

    const siblings = siblingsOfId(root, mNode.id)
    if (siblings.some((s) => s.id === rNode.id)) return isMale(rNode) ? 'BROTHER' : 'SISTER'

    const spSiblings = mNode.spouse ? siblingsOfId(root, mNode.spouse.id) : []
    const inLaws = [...siblings.map(getSpouse), ...spSiblings]
    const isInLaw = inLaws.some((x) => x && x.id === rNode.id)
    if (isInLaw) {
      const p = inLaws.find((x) => x && x.id === rNode.id)!
      return isMale(p!) ? 'BROTHER-IN-LAW' : 'SISTER-IN-LAW'
    }

    const cs = cousinsId(root, mNode.id)
    if (cs.some((c) => c.id === rNode.id)) return 'COUSIN'
    const csInLaws = cs.map(getSpouse)
    if (csInLaws.some((x) => x && x.id === rNode.id)) return 'COUSIN-IN-LAW'
  } else if (mDepth - rDepth === 1) {
    const p = parentOfId(root, mNode.id)
    if (p?.id === rNode.id || p?.spouse?.id === rNode.id)
      return isMale(rNode) ? 'FATHER' : 'MOTHER'

    const pInLaw = mNode.spouse ? parentOfId(root, mNode.spouse.id) : null
    if (pInLaw?.id === rNode.id || pInLaw?.spouse?.id === rNode.id)
      return isMale(rNode) ? 'FATHER-IN-LAW' : 'MOTHER-IN-LAW'
  } else if (rDepth - mDepth === 1) {
    const kids = childrenOfId(root, mNode.id)
    if (kids.some((k) => k.id === rNode.id)) return isMale(rNode) ? 'SON' : 'DAUGHTER'
    if (kids.some((k) => k.spouse?.id === rNode.id)) return isMale(rNode) ? 'SON-IN-LAW' : 'DAUGHTER-IN-LAW'
  }
  return null
}

/* ---------- Gruppen (Name + ID Varianten) ---------- */

export function grandChildren(root: Member, name: string): Member[] {
  const out: Member[] = []
  traverse(root, (m) => {
    if (m.name === name || m.spouse?.name === name) {
      for (const c of m.children) out.push(...c.children)
    }
  })
  return out
}

export function grandChildrenId(root: Member, id: string): Member[] {
  const out: Member[] = []
  traverse(root, (m) => {
    if (m.id === id || m.spouse?.id === id) {
      for (const c of m.children) out.push(...c.children)
    }
  })
  return out
}

export function cousins(root: Member, name: string): Member[] {
  const result: Member[] = []
  const p = parentOf(root, name)
  if (!p) return result
  const pSibs = [
    ...siblingsOf(root, p.name),
    ...(p.spouse?.name ? siblingsOf(root, p.spouse.name) : []),
  ]
  for (const s of pSibs) result.push(...s.children)
  return result
}

export function cousinsId(root: Member, id: string): Member[] {
  const result: Member[] = []
  const p = parentOfId(root, id)
  if (!p) return result
  const pSibs = [
    ...siblingsOfId(root, p.id),
    ...(p.spouse?.id ? siblingsOfId(root, p.spouse.id) : []),
  ]
  for (const s of pSibs) result.push(...s.children)
  return result
}

export function paternalUncles(root: Member, name: string): Member[] {
  const f = fatherOf(root, name)
  if (!f) return []
  const s = siblingsOf(root, f.name)
  return s.reduce<Member[]>((arr, sib) => {
    const u = isMale(sib) ? sib : sib.spouse
    if (u) arr.push(u)
    return arr
  }, [])
}

export function paternalUnclesId(root: Member, id: string): Member[] {
  const f = fatherOfId(root, id)
  if (!f) return []
  const s = siblingsOfId(root, f.id)
  return s.reduce<Member[]>((arr, sib) => {
    const u = isMale(sib) ? sib : sib.spouse
    if (u) arr.push(u)
    return arr
  }, [])
}

export function maternalUncles(root: Member, name: string): Member[] {
  const m = motherOf(root, name)
  if (!m) return []
  const s = siblingsOf(root, m.name)
  return s.reduce<Member[]>((arr, sib) => {
    const u = isMale(sib) ? sib : sib.spouse
    if (u) arr.push(u)
    return arr
  }, [])
}

export function maternalUnclesId(root: Member, id: string): Member[] {
  const m = motherOfId(root, id)
  if (!m) return []
  const s = siblingsOfId(root, m.id)
  return s.reduce<Member[]>((arr, sib) => {
    const u = isMale(sib) ? sib : sib.spouse
    if (u) arr.push(u)
    return arr
  }, [])
}

export function paternalAunts(root: Member, name: string): Member[] {
  const f = fatherOf(root, name)
  if (!f) return []
  const s = siblingsOf(root, f.name)
  return s.reduce<Member[]>((arr, sib) => {
    const a = isFemale(sib) ? sib : sib.spouse
    if (a) arr.push(a)
    return arr
  }, [])
}

export function paternalAuntsId(root: Member, id: string): Member[] {
  const f = fatherOfId(root, id)
  if (!f) return []
  const s = siblingsOfId(root, f.id)
  return s.reduce<Member[]>((arr, sib) => {
    const a = isFemale(sib) ? sib : sib.spouse
    if (a) arr.push(a)
    return arr
  }, [])
}

export function maternalAunts(root: Member, name: string): Member[] {
  const m = motherOf(root, name)
  if (!m) return []
  const s = siblingsOf(root, m.name)
  return s.reduce<Member[]>((arr, sib) => {
    const a = isFemale(sib) ? sib : sib.spouse
    if (a) arr.push(a)
    return arr
  }, [])
}

export function maternalAuntsId(root: Member, id: string): Member[] {
  const m = motherOfId(root, id)
  if (!m) return []
  const s = siblingsOfId(root, m.id)
  return s.reduce<Member[]>((arr, sib) => {
    const a = isFemale(sib) ? sib : sib.spouse
    if (a) arr.push(a)
    return arr
  }, [])
}

export function sisterInLaws(root: Member, name: string): Member[] {
  const out: Member[] = []
  const sp = spouseOf(root, name)
  if (sp) out.push(...siblingsOf(root, sp.name).filter(isFemale))
  const bros = siblingsOf(root, name).filter(isMale)
  out.push(...(bros.map(getSpouse).filter(Boolean) as Member[]))
  return out
}

export function sisterInLawsId(root: Member, id: string): Member[] {
  const out: Member[] = []
  const sp = spouseOfId(root, id)
  if (sp) out.push(...siblingsOfId(root, sp.id).filter(isFemale))
  const bros = siblingsOfId(root, id).filter(isMale)
  out.push(...(bros.map(getSpouse).filter(Boolean) as Member[]))
  return out
}

export function brotherInLaws(root: Member, name: string): Member[] {
  const out: Member[] = []
  const sp = spouseOf(root, name)
  if (sp) out.push(...siblingsOf(root, sp.name).filter(isMale))
  const sis = siblingsOf(root, name).filter(isFemale)
  out.push(...(sis.map(getSpouse).filter(Boolean) as Member[]))
  return out
}

export function brotherInLawsId(root: Member, id: string): Member[] {
  const out: Member[] = []
  const sp = spouseOfId(root, id)
  if (sp) out.push(...siblingsOfId(root, sp.id).filter(isMale))
  const sis = siblingsOfId(root, id).filter(isFemale)
  out.push(...(sis.map(getSpouse).filter(Boolean) as Member[]))
  return out
}
