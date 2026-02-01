// src/utils/layout/helpers.ts
import type { MemberId, MemberLite } from '@/types/family'

export function symmetrize(map: Record<MemberId, MemberLite>) {
  for (const m of Object.values(map)) {
    for (const cId of m.childrenIds) {
      const c = map[cId]
      if (c && !c.parentIds.includes(m.id)) c.parentIds.push(m.id)
    }
    for (const pId of m.parentIds) {
      const p = map[pId]
      if (p && !p.childrenIds.includes(m.id)) p.childrenIds.push(m.id)
    }
  }
}

export function unionId(a: MemberId, b: MemberId | null | undefined): string | null {
  if (!a || !b) return null
  const [x, y] = [a, b].sort()
  return `U:${x}:${y}`
}

export function assignGenerations(map: Record<MemberId, MemberLite>, rootId: MemberId): Record<MemberId, number> {
  const gen: Record<MemberId, number> = {}
  const q: Array<MemberId> = [rootId]
  gen[rootId] = 0

  while (q.length) {
    const cur = q.shift()!
    const m = map[cur]
    if (!m) continue
    const g = gen[cur]
    for (const pId of m.parentIds) if (map[pId] && !(pId in gen)) { gen[pId] = g - 1; q.push(pId) }
    for (const cId of m.childrenIds) if (map[cId] && !(cId in gen)) { gen[cId] = g + 1; q.push(cId) }
    const sId = m.spouseId ?? null
    if (sId && map[sId] && !(sId in gen)) { gen[sId] = g; q.push(sId) }
  }

  // Paare nivellieren
  for (const m of Object.values(map)) {
    if (m.spouseId && (m.id in gen) && (m.spouseId in gen)) {
      const gA = gen[m.id], gB = gen[m.spouseId]
      if (gA !== gB) {
        const newG = Math.round((gA + gB) / 2)
        gen[m.id] = newG
        gen[m.spouseId] = newG
      }
    }
  }
  return gen
}
