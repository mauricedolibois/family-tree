import { MemberId, MemberLite } from '@/types/family'

export type BloodlineFilterOptions = {
  includeSpouses?: boolean // Ehepartner anzeigen, aber NIE über Ehe weiter traversieren
}

/**
 * Strikte Blutlinie:
 * - Vorfahren: rekursiv nur über parentIds ↑
 * - Nachfahren: rekursiv nur über childrenIds ↓
 * - KEIN Wechsel über Kinder zu deren anderem Elternteil
 * - Optional: Ehepartner beibehalten (sichtbar), aber traversal stoppt dort
 */
export function filterBloodline(
  full: Record<MemberId, MemberLite>,
  seedId: MemberId,
  opts: BloodlineFilterOptions = {}
): Record<MemberId, MemberLite> {
  if (!full[seedId]) return full

  const includeSpouses = !!opts.includeSpouses
  const keep = new Set<MemberId>()

  // ↑ Vorfahren
  const upQ: MemberId[] = [seedId]
  const seenUp = new Set<MemberId>()
  while (upQ.length) {
    const cur = upQ.shift()!
    if (seenUp.has(cur)) continue
    seenUp.add(cur)
    keep.add(cur)
    const m = full[cur]
    if (!m) continue
    // nur nach oben zu Eltern
    for (let i = 0; i < m.parentIds.length; i++) {
      const p = m.parentIds[i]
      if (full[p] && !seenUp.has(p)) upQ.push(p)
    }
  }

  // ↓ Nachfahren
  const downQ: MemberId[] = [seedId]
  const seenDown = new Set<MemberId>()
  while (downQ.length) {
    const cur = downQ.shift()!
    if (seenDown.has(cur)) continue
    seenDown.add(cur)
    keep.add(cur)
    const m = full[cur]
    if (!m) continue
    // nur nach unten zu Kindern
    for (let i = 0; i < m.childrenIds.length; i++) {
      const c = m.childrenIds[i]
      if (full[c] && !seenDown.has(c)) downQ.push(c)
    }
  }

  // Optional: Ehepartner nur hinzufügen (nicht traversieren)
  if (includeSpouses) {
    const arr = Array.from(keep)
    for (let i = 0; i < arr.length; i++) {
      const id = arr[i]
      const s = full[id]?.spouseId ?? null
      if (s && full[s]) keep.add(s)
    }
  }

  // Gefilterte Map zusammenbauen + Beziehungen auf Keep beschränken
  const filtered: Record<MemberId, MemberLite> = {}
  const ids = Array.from(keep)
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    const m = full[id]
    if (!m) continue
    filtered[id] = {
      ...m,
      parentIds: m.parentIds.filter(pid => keep.has(pid)),
      childrenIds: m.childrenIds.filter(cid => keep.has(cid)),
      spouseId: m.spouseId && keep.has(m.spouseId) ? m.spouseId : null,
    }
  }

  return filtered
}
