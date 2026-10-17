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

/** Mehrere Generationen mit eingeheirateten Familien (erfunden) */
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
  it('ordnet einen Baum ohne Linienkreuzungen an', async () => {
    const layout = await computeTreeLayout(bigFamily(), run)
    expect(layout.cards).toHaveLength(Object.keys(bigFamily().members).length)
    expect(countCrossings(layout)).toBe(0)
  })

  it('Ehepartner stehen direkt nebeneinander auf einer Höhe', async () => {
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

  it('Kinder stehen unter ihren Eltern', async () => {
    const t = bigFamily()
    const layout = await computeTreeLayout(t, run)
    const box = new Map(layout.cards.map((c) => [c.id, c]))
    for (const p of Object.values(t.members))
      for (const c of p.childrenIds) expect(box.get(c)!.y).toBeGreaterThan(box.get(p.id)!.y)
  })

  it('Geschwister ohne eigene Familie stehen nach Alter', async () => {
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
})
