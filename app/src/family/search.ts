// src/family/search.ts
// Find people by name, place or year of birth, ignoring accents.

import { normalizeForSearch } from './format'
import type { Person, Tree } from './model'

export function searchPeople(tree: Tree, query: string, limit = 8, exclude: string[] = []): Person[] {
  const q = normalizeForSearch(query.trim())
  if (!q) return []
  const words = q.split(/\s+/)
  return Object.values(tree.members)
    .filter((p) => !exclude.includes(p.id))
    .map((p) => {
      const hay = normalizeForSearch(`${p.name} ${p.profile?.city ?? ''} ${p.profile?.birthDate?.slice(0, 4) ?? ''}`)
      if (!words.every((w) => hay.includes(w))) return null
      const name = normalizeForSearch(p.name)
      const score = name.startsWith(q) ? 0 : name.split(' ').some((part) => part.startsWith(words[0])) ? 1 : 2
      return { p, score }
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name, 'de'))
    .slice(0, limit)
    .map((x) => x.p)
}
