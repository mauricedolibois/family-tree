// Spanish kinship terms. Informal "tú" like the rest of the interface.

import type { Gender } from '../../model'
import type { KinStep, Kinship, KinshipWords, Party, Rel, Term } from '../types'

const pick = (g: Gender, male: string, female: string) => (g === 'FEMALE' ? female : male)
const word = (head: string, note = ''): Term => ({ head, note })
const generations = (n: number) => (n === 1 ? 'una generación' : `${n} generaciones`)

/** abuelo, bisabuelo, tatarabuelo, trastatarabuelo */
const GREAT_PREFIX = ['', 'bis', 'tatara', 'trastatara']
const ORDINAL = ['', '', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno', 'décimo']
const feminine = (ordinal: string) => ordinal.replace(/o$/, 'a')

/** abuelo/abuela with the right prefix; "tatara" + "abuelo" contracts to "tatarabuelo" */
function greatWord(greats: number, g: Gender, male: string, female: string): string {
  const prefix = GREAT_PREFIX[greats] ?? ''
  const base = pick(g, male, female)
  return prefix.endsWith('a') && base.startsWith('a') ? prefix + base.slice(1) : prefix + base
}

function term(rel: Rel, g: Gender): Term {
  switch (rel.kind) {
    case 'parent':
      return word(pick(g, 'padre', 'madre'))
    case 'grandparent':
      return word(greatWord(rel.greats, g, 'abuelo', 'abuela'))
    case 'ancestor':
      return word(pick(g, 'antepasado', 'antepasada'), `${generations(rel.generations)} atrás`)
    case 'child':
      return word(pick(g, 'hijo', 'hija'))
    case 'grandchild':
      return word(greatWord(rel.greats, g, 'nieto', 'nieta'))
    case 'descendant':
      return word('descendiente', `${generations(rel.generations)} después`)
    case 'sibling':
      return word(rel.half ? pick(g, 'medio hermano', 'media hermana') : pick(g, 'hermano', 'hermana'))
    case 'nibling':
      return word(
        rel.greats === 0
          ? pick(g, 'sobrino', 'sobrina')
          : `${pick(g, 'sobrino', 'sobrina')} ${greatWord(rel.greats - 1, g, 'nieto', 'nieta')}`,
      )
    case 'niblingDescendant':
      return word('descendiente de un hermano')
    case 'pibling':
      return word(
        rel.greats === 0
          ? pick(g, 'tío', 'tía')
          : `${pick(g, 'tío', 'tía')} ${greatWord(rel.greats - 1, g, 'abuelo', 'abuela')}`,
      )
    case 'piblingAncestor':
      return word(pick(g, 'tío', 'tía'), `${generations(rel.generations)} atrás`)
    case 'cousin': {
      const base = pick(g, 'primo', 'prima')
      const ord = ORDINAL[rel.degree]
      const head =
        rel.degree === 1
          ? base
          : ord
          ? `${base} ${g === 'FEMALE' ? feminine(ord) : ord}`
          : `${base} en ${rel.degree}.º grado`
      return word(head, rel.removed ? `con ${generations(rel.removed)} de diferencia` : '')
    }
    case 'spouse':
      return word(pick(g, 'esposo', 'esposa'))
    case 'partner':
      return word(pick(g, 'marido', 'mujer'))
    case 'childInLaw':
      return word(pick(g, 'yerno', 'nuera'))
    case 'parentInLaw':
      return word(pick(g, 'suegro', 'suegra'))
    case 'siblingInLaw':
      return word(pick(g, 'cuñado', 'cuñada'))
    case 'stepParent':
      return word(pick(g, 'padrastro', 'madrastra'))
    case 'stepChild':
      return word(pick(g, 'hijastro', 'hijastra'))
    case 'byMarriage': {
      const t = term(rel.of, g)
      return word(`${t.head} ${pick(g, 'político', 'política')}`, t.note)
    }
  }
}

const head = (s: KinStep) => term(s.rel, s.gender).head
const withArticle = (s: KinStep) => `${s.gender === 'FEMALE' ? 'la' : 'el'} ${head(s)}`
/** del hermano, de la hermana */
const ofArticle = (s: KinStep) => (s.gender === 'FEMALE' ? `de la ${head(s)}` : `del ${head(s)}`)

/** "de la hermana de tu marido"; with `yours` the last person belongs to "you" */
function viaChain(via: KinStep[], yours: boolean): string {
  return via.map((v, i) => (yours && i === via.length - 1 ? `de tu ${head(v)}` : ofArticle(v))).join(' ')
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const withNote = (text: string, note: string) => (note ? `${text}, ${note}` : text)

export const es: KinshipWords = {
  term,

  label(k: Kinship) {
    const t = term(k.rel, k.gender)
    return withNote(capitalize(k.via.length ? `${t.head} ${viaChain(k.via, true)}` : `tu ${t.head}`), t.note)
  },

  title(k: Kinship) {
    const t = term(k.rel, k.gender)
    return { title: capitalize(k.via.length ? `${t.head} ${viaChain(k.via, false)}` : t.head), note: t.note }
  },

  sentence(k: Kinship, subject: Party, object: Party) {
    const t = term(k.rel, k.gender)
    const start = subject === 'you' ? 'Tú eres' : `${subject.name} es`
    let rel: string
    if (object === 'you') rel = k.via.length ? `${withArticle(k)} ${viaChain(k.via, true)}` : `tu ${t.head}`
    else rel = `${withArticle(k)}${k.via.length ? ` ${viaChain(k.via, false)}` : ''} de ${object.name}`
    return `${withNote(`${start} ${rel}`, t.note)}.`
  },
}
