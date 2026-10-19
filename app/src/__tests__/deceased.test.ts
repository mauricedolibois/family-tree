/**
 * @jest-environment node
 */
import { ageOf, isDeceased, lifeYears } from '@/family/format'
import { upcomingBirthdays } from '@/family/birthdays'
import { updatePerson } from '@/family/edit'
import type { Person, Tree } from '@/family/model'
import { validateStoredTree } from '@/storage/validate'

const person = (profile: Person['profile']): Person => ({
  id: 'p',
  name: 'Erika Beispiel',
  gender: 'FEMALE',
  spouseId: null,
  parentIds: [],
  childrenIds: [],
  adoptedChildrenIds: [],
  profile,
})

describe('deceased, date unknown', () => {
  it('counts as deceased, with no age up to today', () => {
    const p = person({ birthDate: '1888-10-20', deceased: true })
    expect(isDeceased(p)).toBe(true)
    expect(ageOf(p, new Date(2026, 9, 18))).toBeNull()
    expect(isDeceased(person({ birthDate: '1950' }))).toBe(false)
  })

  it('life dates', () => {
    expect(lifeYears(person({ birthDate: '1888-10-20', deceased: true }))).toBe('1888–†')
    expect(lifeYears(person({ deceased: true }))).toBe('†')
    expect(lifeYears(person({ birthDate: '1888', deathDate: '1950', deceased: true }))).toBe('1888–1950')
    expect(lifeYears(person({ birthDate: '1990' }))).toBe('* 1990')
  })

  it('is left out of birthdays', () => {
    const tree: Tree = { version: 3, rootId: 'p', members: { p: person({ birthDate: '1950-10-20', deceased: true }) } }
    expect(upcomingBirthdays(tree, new Date(2026, 9, 18))).toEqual([])
  })

  it('is stored only when true; garbage is rejected', () => {
    const base = { id: 'p', name: 'P', gender: 'MALE', childrenIds: [] }
    const save = (profile: unknown) =>
      validateStoredTree({ version: 3, rootId: 'p', members: { p: { ...base, profile } } })
    const yes = save({ deceased: true })
    expect(yes.ok && yes.tree.members.p.profile?.deceased).toBe(true)
    const no = save({ deceased: false })
    expect(no.ok && 'deceased' in (no.tree.members.p.profile ?? {})).toBe(false)
    expect(save({ deceased: 'ja' }).ok).toBe(false)
  })

  it('switching it off removes the flag', () => {
    const tree: Tree = { version: 3, rootId: 'p', members: { p: person({ deceased: true }) } }
    const next = updatePerson(tree, 'p', { profile: { deathDate: null, deceased: undefined } })
    expect(JSON.parse(JSON.stringify(next)).members.p.profile.deceased).toBeUndefined()
    expect(isDeceased(next.members.p)).toBe(false)
  })
})
