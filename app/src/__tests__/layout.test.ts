/**
 * @jest-environment node
 */
import ELK from 'elkjs/lib/elk.bundled.js'
import { computeTreeLayout, countCrossings } from '@/family/layout/compute'
import { addRelative, starterTree } from '@/family/edit'
import { CARD } from '@/family/layout/types'
import type { Tree } from '@/family/model'

const elk = new ELK()
const run = (g: unknown) => elk.layout(g as never) as never

/** Several generations with in-law families (made up) */
function bigFamily(): Tree {
  let t = starterTree()
  const root = t.rootId
  const add = (
    ref: string,
    relation: 'CHILD' | 'SPOUSE' | 'PARENT',
    name: string,
    gender: 'MALE' | 'FEMALE',
    birth?: string,
  ) => {
    const r = addRelative(t, ref, { relation, name, gender })
    t = r.tree
    if (birth) t.members[r.id].profile = { ...t.members[r.id].profile, birthDate: birth }
    return r.id
  }
  const kid = Object.values(t.members).find((m) => m.id !== root && m.childrenIds.length === 0)!.id
  const k2 = add(root, 'CHILD', 'Zweites Kind', 'MALE', '1950-01-01')
  const k3 = add(root, 'CHILD', 'Drittes Kind', 'FEMALE', '1945-01-01')
  const s1 = add(kid, 'SPOUSE', 'Partner Eins', 'MALE')
  add(s1, 'PARENT', 'Schwiegervater', 'MALE')
  const s3 = add(k3, 'SPOUSE', 'Partner Drei', 'MALE')
  add(s3, 'PARENT', 'Andere Mutter', 'FEMALE')
  add(root, 'CHILD', 'Viertes Kind', 'FEMALE', '1960-01-01')
  add(root, 'CHILD', 'Fünftes Kind', 'MALE', '1940-01-01')
  add(root, 'CHILD', 'Sechstes Kind', 'FEMALE', '1952-01-01')
  for (const [p, n] of [
    [kid, 'Enkel A'],
    [kid, 'Enkel B'],
    [k3, 'Enkel C'],
    [k2, 'Enkel D'],
  ] as const)
    add(p, 'CHILD', n, 'MALE')
  return t
}

describe('Layout', () => {
  it('lays out a tree without crossing lines', async () => {
    const layout = await computeTreeLayout(bigFamily(), run)
    expect(layout.cards).toHaveLength(Object.keys(bigFamily().members).length)
    expect(countCrossings(layout)).toBe(0)
  })

  it('spouses sit directly next to each other at the same height', async () => {
    const t = bigFamily()
    const layout = await computeTreeLayout(t, run)
    const box = new Map(layout.cards.map((c) => [c.id, c]))
    for (const m of layout.marriages) {
      const a = box.get(m.a)!
      const b = box.get(m.b)!
      expect(a.y).toBe(b.y)
      expect(Math.abs(a.x - b.x)).toBe(CARD.w + CARD.coupleGap)
    }
    expect(layout.marriages.length).toBeGreaterThan(0)
  })

  it('children sit below their parents', async () => {
    const t = bigFamily()
    const layout = await computeTreeLayout(t, run)
    const box = new Map(layout.cards.map((c) => [c.id, c]))
    for (const p of Object.values(t.members))
      for (const c of p.childrenIds) expect(box.get(c)!.y).toBeGreaterThan(box.get(p.id)!.y)
  })

  it('siblings without their own family are ordered by age', async () => {
    const t = bigFamily()
    const layout = await computeTreeLayout(t, run)
    const box = new Map(layout.cards.map((c) => [c.id, c]))
    const loose = layout.connectors
      .filter((c) => c.parents.includes(t.rootId))
      .map((c) => c.child)
      .filter((id) => !t.members[id].spouseId && t.members[id].childrenIds.length === 0)
    expect(loose.length).toBe(3)
    const byX = [...loose].sort((a, b) => box.get(a)!.x - box.get(b)!.x)
    const byBirth = [...loose].sort((a, b) =>
      (t.members[a].profile?.birthDate ?? '9999').localeCompare(t.members[b].profile?.birthDate ?? '9999'),
    )
    expect(byX).toEqual(byBirth)
  })

  it('siblings with their own family are ordered by age as well', async () => {
    let t = starterTree()
    const add = (
      ref: string,
      relation: 'CHILD' | 'SPOUSE',
      name: string,
      gender: 'MALE' | 'FEMALE',
      birth?: string,
    ) => {
      const r = addRelative(t, ref, { relation, name, gender })
      t = r.tree
      if (birth) t.members[r.id].profile = { ...t.members[r.id].profile, birthDate: birth }
      return r.id
    }
    const root = t.rootId
    const kids = [
      add(root, 'CHILD', 'Mittlere', 'FEMALE', '1950-01-01'),
      add(root, 'CHILD', 'Jüngster', 'MALE', '1960-01-01'),
      add(root, 'CHILD', 'Ältester', 'MALE', '1940-01-01'),
    ]
    for (const k of kids) {
      const sp = add(k, 'SPOUSE', `Partner von ${k}`, t.members[k].gender === 'MALE' ? 'FEMALE' : 'MALE')
      add(k, 'CHILD', `Kind von ${k}`, 'MALE')
      expect(t.members[sp]).toBeDefined()
    }
    const layout = await computeTreeLayout(t, run)
    const x = new Map(layout.cards.map((c) => [c.id, c.x]))
    const byX = [...kids].sort((a, b) => x.get(a)! - x.get(b)!)
    expect(byX.map((id) => t.members[id].name)).toEqual(['Ältester', 'Mittlere', 'Jüngster'])
    expect(countCrossings(layout)).toBe(0)
  })

  it('side branches without further links sit on the outside', async () => {
    let t = starterTree()
    const add = (ref: string, relation: 'CHILD' | 'SPOUSE' | 'PARENT', name: string, gender: 'MALE' | 'FEMALE') => {
      const r = addRelative(t, ref, { relation, name, gender })
      t = r.tree
      return r.id
    }
    // Grandpa → son A (married to W, whose father is in the tree too) and son B with his own family
    const a = t.rootId
    const w = t.members[a].spouseId!
    const opa = add(a, 'PARENT', 'Opa', 'MALE')
    add(w, 'PARENT', 'Vater von W', 'MALE')
    const b = add(opa, 'CHILD', 'Sohn B', 'MALE')
    add(b, 'SPOUSE', 'Frau von B', 'FEMALE')
    add(b, 'CHILD', 'Kind von B', 'FEMALE')
    const layout = await computeTreeLayout(t, run)
    const x = new Map(layout.cards.map((c) => [c.id, c.x]))
    // A sits between his brother and his wife's family
    expect(x.get(b)!).toBeLessThan(x.get(a)!)
    expect(x.get(a)!).toBeLessThan(x.get(w)!)
    expect(countCrossings(layout)).toBe(0)
  })
})
