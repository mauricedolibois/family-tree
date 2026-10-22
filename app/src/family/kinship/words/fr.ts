// French kinship terms. Informal "tu" like the rest of the interface.

import type { Gender } from '../../model'
import type { KinStep, Kinship, KinshipWords, Party, Rel, Term } from '../types'

const pick = (g: Gender, male: string, female: string) => (g === 'FEMALE' ? female : male)
const word = (head: string, note = ''): Term => ({ head, note })
const arriere = (n: number) => 'arrière-'.repeat(n)
const generations = (n: number) => (n === 1 ? 'une génération' : `${n} générations`)

function term(rel: Rel, g: Gender): Term {
  switch (rel.kind) {
    case 'parent':
      return word(pick(g, 'père', 'mère'))
    case 'grandparent':
      return word(arriere(rel.greats) + pick(g, 'grand-père', 'grand-mère'))
    case 'ancestor':
      return word('ancêtre', `${generations(rel.generations)} plus haut`)
    case 'child':
      return word(pick(g, 'fils', 'fille'))
    case 'grandchild':
      return word(arriere(rel.greats) + pick(g, 'petit-fils', 'petite-fille'))
    case 'descendant':
      return word(pick(g, 'descendant', 'descendante'), `${generations(rel.generations)} plus bas`)
    case 'sibling':
      return word((rel.half ? 'demi-' : '') + pick(g, 'frère', 'sœur'))
    case 'nibling':
      return word(
        rel.greats === 0 ? pick(g, 'neveu', 'nièce') : arriere(rel.greats - 1) + pick(g, 'petit-neveu', 'petite-nièce'),
      )
    case 'niblingDescendant':
      return word(`${pick(g, 'descendant', 'descendante')} d’un frère ou d’une sœur`)
    case 'pibling':
      return word(
        rel.greats === 0 ? pick(g, 'oncle', 'tante') : arriere(rel.greats - 1) + pick(g, 'grand-oncle', 'grand-tante'),
      )
    case 'piblingAncestor':
      return word(pick(g, 'oncle', 'tante'), `${generations(rel.generations)} plus haut`)
    case 'cousin': {
      const head =
        rel.degree === 1
          ? pick(g, 'cousin', 'cousine')
          : rel.degree === 2
            ? pick(g, 'cousin issu de germain', 'cousine issue de germain')
            : `${pick(g, 'cousin', 'cousine')} au ${rel.degree}e degré`
      return word(head, rel.removed ? `à ${generations(rel.removed)} d’écart` : '')
    }
    case 'spouse':
      return word(pick(g, 'époux', 'épouse'))
    case 'partner':
      return word(pick(g, 'mari', 'femme'))
    case 'childInLaw':
      return word(pick(g, 'gendre', 'belle-fille'))
    case 'parentInLaw':
      return word(pick(g, 'beau-père', 'belle-mère'))
    case 'siblingInLaw':
      return word(pick(g, 'beau-frère', 'belle-sœur'))
    case 'stepParent':
      return word(pick(g, 'beau-père', 'belle-mère'))
    case 'stepChild':
      return word(pick(g, 'beau-fils', 'belle-fille'))
    case 'byMarriage': {
      const t = term(rel.of, g)
      return word(`${t.head} par alliance`, t.note)
    }
  }
}

/** Words starting with a vowel or mute h take l’ and ton */
const elides = (w: string) => /^[aeiouyhàâäéèêëîïôöùûü]/i.test(w)

/** "d’Anton", "de Kurt"; names with h keep "de", as h is usually sounded in the family's names */
const ofName = (name: string) => (/^[aeiouyàâäéèêëîïôöùûü]/i.test(name) ? `d’${name}` : `de ${name}`)

const head = (s: KinStep) => term(s.rel, s.gender).head

/** le père, la mère, l’oncle */
const withArticle = (s: KinStep) => {
  const h = head(s)
  return elides(h) ? `l’${h}` : `${s.gender === 'FEMALE' ? 'la' : 'le'} ${h}`
}

/** du père, de la mère, de l’oncle */
const ofArticle = (s: KinStep) => {
  const h = head(s)
  return elides(h) ? `de l’${h}` : s.gender === 'FEMALE' ? `de la ${h}` : `du ${h}`
}

/** ton père, ta mère, ton épouse */
const yourWord = (s: KinStep) => `${s.gender === 'FEMALE' && !elides(head(s)) ? 'ta' : 'ton'} ${head(s)}`

/** "de la sœur de ton mari"; with `yours` the last person belongs to "you" */
function viaChain(via: KinStep[], yours: boolean): string {
  return via.map((v, i) => (yours && i === via.length - 1 ? `de ${yourWord(v)}` : ofArticle(v))).join(' ')
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const withNote = (text: string, note: string) => (note ? `${text}, ${note}` : text)

export const fr: KinshipWords = {
  term,

  label(k: Kinship) {
    const t = term(k.rel, k.gender)
    const core = k.via.length ? `${t.head} ${viaChain(k.via, true)}` : yourWord(k)
    return withNote(capitalize(core), t.note)
  },

  title(k: Kinship) {
    const t = term(k.rel, k.gender)
    return { title: capitalize(k.via.length ? `${t.head} ${viaChain(k.via, false)}` : t.head), note: t.note }
  },

  sentence(k: Kinship, subject: Party, object: Party) {
    const t = term(k.rel, k.gender)
    const start = subject === 'you' ? 'Tu es' : `${subject.name} est`
    let rel: string
    if (object === 'you') rel = k.via.length ? `${withArticle(k)} ${viaChain(k.via, true)}` : yourWord(k)
    else rel = `${withArticle(k)}${k.via.length ? ` ${viaChain(k.via, false)}` : ''} ${ofName(object.name)}`
    return `${withNote(`${start} ${rel}`, t.note)}.`
  },
}
