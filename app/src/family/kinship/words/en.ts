// English kinship terms (British usage, matching the day-first dates).

import type { Gender } from '../../model'
import type { KinStep, Kinship, KinshipWords, Party, Rel, Term } from '../types'

const pick = (g: Gender, male: string, female: string) => (g === 'FEMALE' ? female : male)
const word = (head: string, note = ''): Term => ({ head, note })
const greats = (n: number) => 'great-'.repeat(n)

const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']
const ordinal = (n: number) => ORDINALS[n] ?? `${n}th`
const TIMES = ['', 'once', 'twice']
const removed = (n: number) => `${TIMES[n] ?? `${n} times`} removed`

function term(rel: Rel, g: Gender): Term {
  switch (rel.kind) {
    case 'parent':
      return word(pick(g, 'father', 'mother'))
    case 'grandparent':
      return word(greats(rel.greats) + pick(g, 'grandfather', 'grandmother'))
    case 'ancestor':
      return word('ancestor', `${rel.generations} generations back`)
    case 'child':
      return word(pick(g, 'son', 'daughter'))
    case 'grandchild':
      return word(greats(rel.greats) + pick(g, 'grandson', 'granddaughter'))
    case 'descendant':
      return word('descendant', `${rel.generations} generations down`)
    case 'sibling':
      return word((rel.half ? 'half-' : '') + pick(g, 'brother', 'sister'))
    case 'nibling':
      return word(greats(rel.greats) + pick(g, 'nephew', 'niece'))
    case 'niblingDescendant':
      return word('descendant of a sibling')
    case 'pibling':
      return word(greats(rel.greats) + pick(g, 'uncle', 'aunt'))
    case 'piblingAncestor':
      return word(pick(g, 'uncle', 'aunt'), `${rel.generations} generations back`)
    case 'cousin':
      return word(
        rel.degree === 1 ? 'cousin' : `${ordinal(rel.degree)} cousin`,
        rel.removed ? removed(rel.removed) : '',
      )
    case 'spouse':
    case 'partner':
      return word(pick(g, 'husband', 'wife'))
    case 'childInLaw':
      return word(pick(g, 'son-in-law', 'daughter-in-law'))
    case 'parentInLaw':
      return word(pick(g, 'father-in-law', 'mother-in-law'))
    case 'siblingInLaw':
      return word(pick(g, 'brother-in-law', 'sister-in-law'))
    case 'stepParent':
      return word(pick(g, 'stepfather', 'stepmother'))
    case 'stepChild':
      return word(pick(g, 'stepson', 'stepdaughter'))
    case 'byMarriage': {
      const t = term(rel.of, g)
      return word(`${t.head} by marriage`, t.note)
    }
  }
}

const head = (s: KinStep) => term(s.rel, s.gender).head
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const possessive = (name: string) => `${name}’s`

/** "of the sister of your husband": the last person belongs to `owner` */
function viaChain(via: KinStep[], owner: string): string {
  return via.map((v, i) => `of ${i === via.length - 1 ? owner : 'the'} ${head(v)}`).join(' ')
}

const withNote = (text: string, note: string) => (note ? `${text}, ${note}` : text)

export const en: KinshipWords = {
  term,

  label(k: Kinship) {
    const t = term(k.rel, k.gender)
    return withNote(k.via.length ? capitalize(`${t.head} ${viaChain(k.via, 'your')}`) : `Your ${t.head}`, t.note)
  },

  title(k: Kinship) {
    const t = term(k.rel, k.gender)
    return { title: capitalize(k.via.length ? `${t.head} ${viaChain(k.via, 'the')}` : t.head), note: t.note }
  },

  sentence(k: Kinship, subject: Party, object: Party) {
    const t = term(k.rel, k.gender)
    const start = subject === 'you' ? 'You are' : `${subject.name} is`
    const owner = object === 'you' ? 'your' : possessive(object.name)
    const rel = k.via.length ? `the ${t.head} ${viaChain(k.via, owner)}` : `${owner} ${t.head}`
    return `${withNote(`${start} ${rel}`, t.note)}.`
  },
}
