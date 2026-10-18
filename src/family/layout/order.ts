// src/family/layout/order.ts
//
// Reihenfolge der Kästen von links nach rechts, so wie man einen Stammbaum von
// Hand zeichnen würde: Vorfahren des Mannes links, der Frau rechts, Geschwister
// und ihre Familien außen, Nachkommen darunter. ELK nimmt das als Vorliebe und
// weicht nur ab, wenn sich sonst Linien kreuzen würden.

import { ancestorsOf, parentsOf, type TreeIndex } from '../model'
import type { Unit } from './graph'

type Side = 'left' | 'right'

export function genealogicalOrder(
  ix: TreeIndex,
  units: Map<string, Unit>,
  unitOf: Map<string, string>,
  focusId?: string | null,
): string[] {
  const seq: string[] = []
  const placed = new Set<string>()
  const climbed = new Set<string>()
  const born = (id: string) => ix.byId.get(id)?.profile?.birthDate ?? '9999'

  const emit = (u: string) => {
    if (placed.has(u)) return
    placed.add(u)
    seq.push(u)
  }

  /** Kästen der Kinder eines Kastens, nach Geburt der Kinder */
  const childUnits = (u: string): string[] => {
    const kids = new Set(units.get(u)!.members.flatMap((m) => ix.children.get(m) ?? []))
    const out: string[] = []
    for (const k of [...kids].sort((a, b) => born(a).localeCompare(born(b)))) {
      const ku = unitOf.get(k)
      if (ku && ku !== u && !out.includes(ku)) out.push(ku)
    }
    return out
  }

  /** Eltern-Kästen einer Person (meist einer, bei getrennten Eltern zwei) */
  const parentUnits = (person: string): string[] => [
    ...new Set(
      parentsOf(ix, person)
        .map((p) => unitOf.get(p)!)
        .filter(Boolean),
    ),
  ]

  /** Ein Paar: Herkunft der linken Person links, der rechten rechts, dazwischen das Paar */
  function couple(u: string, kids: boolean) {
    if (placed.has(u)) return
    const [left, right] = units.get(u)!.members
    up(left, 'left')
    emit(u)
    if (kids) for (const c of childUnits(u)) down(c, 'right')
    if (right) up(right, 'right')
  }

  /** Eltern und Geschwister einer Person auf der angegebenen Seite */
  function up(person: string, side: Side) {
    const own = unitOf.get(person)
    for (const p of parentUnits(person)) {
      if (climbed.has(p) || placed.has(p)) continue
      climbed.add(p)
      const siblings = childUnits(p).filter((s) => s !== own && !placed.has(s))
      if (side === 'left') for (const s of siblings) down(s, 'left')
      couple(p, false)
      if (side === 'right') for (const s of siblings) down(s, 'right')
    }
  }

  /** Eine Seitenlinie mit allen Nachkommen; angeheiratete Herkunft nach außen */
  function down(u: string, side: Side) {
    if (placed.has(u)) return
    const members = units.get(u)!.members
    if (side === 'left') for (const m of members) up(m, 'left')
    emit(u)
    for (const c of childUnits(u)) down(c, side)
    if (side === 'right') for (const m of members) up(m, 'right')
  }

  // Ausgangspunkt: die gewünschte Person, sonst das Paar mit den meisten Vorfahren
  const ancestorCount = (u: string) => units.get(u)!.members.reduce((n, m) => n + ancestorsOf(ix, m).size, 0)
  const all = [...units.keys()]
  const focus =
    (focusId && unitOf.get(focusId)) ||
    all.reduce<string | null>((best, u) => (best === null || ancestorCount(u) > ancestorCount(best) ? u : best), null)
  if (focus) couple(focus, true)

  // Was nicht verbunden ist, kommt danach (nach Geburt)
  for (const u of all) if (!placed.has(u)) couple(u, true)
  return seq
}
