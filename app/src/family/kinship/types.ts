// src/family/kinship/types.ts
// Language-neutral description of how two people are related. The words for
// each language live in ./words/.

import type { Gender } from '../model'

/** One relation, seen from a person towards another */
export type Rel =
  | { kind: 'parent' }
  /** greats: 0 = grandparent, 1 = great-grandparent, … */
  | { kind: 'grandparent'; greats: number }
  /** beyond the named great-greats */
  | { kind: 'ancestor'; generations: number }
  | { kind: 'child' }
  | { kind: 'grandchild'; greats: number }
  | { kind: 'descendant'; generations: number }
  | { kind: 'sibling'; half: boolean }
  /** greats: 0 = nephew/niece, 1 = great-nephew/niece, … */
  | { kind: 'nibling'; greats: number }
  /** a sibling's descendant too far down to have a common name */
  | { kind: 'niblingDescendant' }
  /** greats: 0 = uncle/aunt, 1 = great-uncle/aunt, … */
  | { kind: 'pibling'; greats: number }
  /** an uncle or aunt too far up to have a common name */
  | { kind: 'piblingAncestor'; generations: number }
  /** degree 1 = first cousin; removed = generations apart */
  | { kind: 'cousin'; degree: number; removed: number }
  | { kind: 'spouse' }
  /** colloquial husband/wife, used inside chains ("your husband's niece") */
  | { kind: 'partner' }
  | { kind: 'childInLaw' }
  | { kind: 'parentInLaw' }
  | { kind: 'siblingInLaw' }
  | { kind: 'stepParent' }
  | { kind: 'stepChild' }
  /** a blood relation of one's spouse, e.g. an uncle by marriage */
  | { kind: 'byMarriage'; of: Rel }

/** A relation word and the gender of the person it refers to */
export type KinStep = { rel: Rel; gender: Gender }

export type Kinship = KinStep & {
  /** related by marriage rather than descent */
  byMarriage: boolean
  /**
   * People in between, read from B towards A, e.g. the niece [of the husband]
   * or the daughter [of the brother] [of the husband]
   */
  via: KinStep[]
}

export type Connection = {
  /** B as seen from A */
  kinship: Kinship
  /** A as seen from B */
  reverse: Kinship
  /** Everyone on the path from A to B */
  path: string[]
  /** Closest common ancestors (a couple or one person); empty if one descends from the other or for in-laws */
  common: string[]
  /** When there is no common term: number of people between A and B */
  detour: number | null
}

/** A named person or "you" */
export type Party = { name: string } | 'you'

/** A term split into its main word and an optional note ("cousin" + "once removed") */
export type Term = { head: string; note: string }

/** What every language provides to put a relation into words */
export type KinshipWords = {
  term(rel: Rel, gender: Gender): Term
  /** From your point of view, e.g. on the info sheet: "your great-grandfather" */
  label(k: Kinship): string
  /** Without reference to anyone, as a heading */
  title(k: Kinship): { title: string; note: string }
  /** Full sentence with B as subject and A as object */
  sentence(k: Kinship, subject: Party, object: Party): string
}

/** Relations whose term carries a note such as "3 generations back" */
export function hasNote(rel: Rel): boolean {
  switch (rel.kind) {
    case 'ancestor':
    case 'descendant':
    case 'piblingAncestor':
      return true
    case 'cousin':
      return rel.removed > 0
    case 'byMarriage':
      return hasNote(rel.of)
    default:
      return false
  }
}

const sameRel = (a: Rel, b: Rel) => JSON.stringify(a) === JSON.stringify(b)

/** Same relation, gender and chain, i.e. the same words in any language */
export function sameKinship(a: Kinship, b: Kinship): boolean {
  return (
    a.gender === b.gender &&
    sameRel(a.rel, b.rel) &&
    a.via.length === b.via.length &&
    a.via.every((v, i) => v.gender === b.via[i].gender && sameRel(v.rel, b.via[i].rel))
  )
}
