// German kinship terms. Uses the informal "du" like the rest of the interface.

import type { Gender } from '../../model'
import type { KinStep, Kinship, KinshipWords, Party, Rel, Term } from '../types'

const pick = (g: Gender, male: string, female: string) => (g === 'FEMALE' ? female : male)
const word = (head: string, note = ''): Term => ({ head, note })
const ur = (n: number) => 'Ur'.repeat(n)

/** withUr(2, 'Großonkel') → "Ururgroßonkel" */
const withUr = (n: number, w: string) => (n === 0 ? w : ur(n) + w.charAt(0).toLowerCase() + w.slice(1))

const generationsBack = (n: number) => `${n} Generationen zurück`

function term(rel: Rel, g: Gender): Term {
  switch (rel.kind) {
    case 'parent':
      return word(pick(g, 'Vater', 'Mutter'))
    case 'grandparent':
      return word(
        rel.greats === 0 ? pick(g, 'Großvater', 'Großmutter') : ur(rel.greats) + pick(g, 'großvater', 'großmutter'),
      )
    case 'ancestor':
      return word(pick(g, 'Vorfahr', 'Vorfahrin'), generationsBack(rel.generations))
    case 'child':
      return word(pick(g, 'Sohn', 'Tochter'))
    case 'grandchild':
      return word(rel.greats === 0 ? pick(g, 'Enkel', 'Enkelin') : ur(rel.greats) + pick(g, 'enkel', 'enkelin'))
    case 'descendant':
      return word(pick(g, 'Nachfahre', 'Nachfahrin'), `${rel.generations} Generationen später`)
    case 'sibling':
      return word(rel.half ? pick(g, 'Halbbruder', 'Halbschwester') : pick(g, 'Bruder', 'Schwester'))
    case 'nibling':
      return word(
        rel.greats === 0 ? pick(g, 'Neffe', 'Nichte') : withUr(rel.greats - 1, pick(g, 'Großneffe', 'Großnichte')),
      )
    case 'niblingDescendant':
      return word(`${pick(g, 'Nachfahre', 'Nachfahrin')} eines Geschwisters`)
    case 'pibling':
      return word(
        rel.greats === 0 ? pick(g, 'Onkel', 'Tante') : withUr(rel.greats - 1, pick(g, 'Großonkel', 'Großtante')),
      )
    case 'piblingAncestor':
      return word(pick(g, 'Onkel', 'Tante'), generationsBack(rel.generations))
    case 'cousin': {
      const base = pick(g, 'Cousin', 'Cousine')
      const head = rel.degree === 1 ? base : `${base} ${rel.degree}. Grades`
      if (rel.removed === 0) return word(head)
      return word(head, `${rel.removed === 1 ? 'eine Generation' : `${rel.removed} Generationen`} versetzt`)
    }
    case 'spouse':
      return word(pick(g, 'Ehemann', 'Ehefrau'))
    case 'partner':
      return word(pick(g, 'Mann', 'Frau'))
    case 'childInLaw':
      return word(pick(g, 'Schwiegersohn', 'Schwiegertochter'))
    case 'parentInLaw':
      return word(pick(g, 'Schwiegervater', 'Schwiegermutter'))
    case 'siblingInLaw':
      return word(pick(g, 'Schwager', 'Schwägerin'))
    case 'stepParent':
      return word(pick(g, 'Stiefvater', 'Stiefmutter'))
    case 'stepChild':
      return word(pick(g, 'Stiefsohn', 'Stieftochter'))
    case 'byMarriage': {
      const t = term(rel.of, g)
      return t.note ? word(t.head, `${t.note} (angeheiratet)`) : word(`${t.head} (angeheiratet)`)
    }
  }
}

const article = (g: Gender) => pick(g, 'der', 'die')
const ofArticle = (g: Gender) => pick(g, 'des', 'der')
const your = (g: Gender) => pick(g, 'dein', 'deine')
const ofYour = (g: Gender) => pick(g, 'deines', 'deiner')

const IRREGULAR_GENITIVE: Record<string, string> = { Mann: 'Mannes', Sohn: 'Sohnes' }

/** "des Cousins 2. Grades", "des Neffen", "der Cousine": the word only, without article */
function genitive({ rel, gender }: KinStep): string {
  const { head } = term(rel, gender)
  if (gender === 'FEMALE') return head
  const [first, ...rest] = head.split(' ')
  const gen = IRREGULAR_GENITIVE[first] ?? (/e$/.test(first) ? `${first}n` : /[sßx]$/.test(first) ? first : `${first}s`)
  return [gen, ...rest].join(' ')
}

/** "der Schwester des Ehemanns"; with `yours` the last person belongs to "you" */
function viaChain(via: KinStep[], yours: boolean): string {
  return via
    .map((v, i) => `${yours && i === via.length - 1 ? ofYour(v.gender) : ofArticle(v.gender)} ${genitive(v)}`)
    .join(' ')
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const de: KinshipWords = {
  term,

  label(k: Kinship) {
    const { head, note } = term(k.rel, k.gender)
    const core = k.via.length ? `${head} ${viaChain(k.via, true)}` : `${capitalize(your(k.gender))} ${head}`
    return note ? `${core}, ${note}` : core
  },

  title(k: Kinship) {
    const { head, note } = term(k.rel, k.gender)
    return { title: k.via.length ? `${head} ${viaChain(k.via, false)}` : head, note }
  },

  sentence(k: Kinship, subject: Party, object: Party) {
    const { head, note } = term(k.rel, k.gender)
    const start = subject === 'you' ? 'Du bist' : `${subject.name} ist`
    let rel: string
    if (object === 'you') {
      rel = k.via.length ? `${article(k.gender)} ${head} ${viaChain(k.via, true)}` : `${your(k.gender)} ${head}`
    } else {
      const chain = k.via.length ? ` ${viaChain(k.via, false)}` : ''
      rel = `${article(k.gender)} ${head}${chain} von ${object.name}`
    }
    return `${start} ${rel}${note ? `, ${note}` : ''}.`
  },
}
