// src/utils/bloodline.ts
import type { MemberId, MemberLite } from '@/types/family'

export type KinDepth = 0 | 1 | 2 | 3

export type BloodlineFilterOptions = {
  /** Ehepartner der bereits ausgewählten Personen zusätzlich einblenden */
  includeSpouses?: boolean
  /** 0: direkte Linie; 1: + Geschwister; 2: + Cousins; 3: + Großcousins */
  kinDepth?: KinDepth
}

/**
 * Wählt aus einer flachen Member-Map eine Teilmenge basierend auf:
 * - Fokus-Person
 * - Verwandtschaftstiefe (see KinDepth)
 * - optional: Ehepartner der ausgewählten Personen
 *
 * WICHTIG: includeSpouses fügt NUR die spouse-Knoten der bereits sichtbaren Menge hinzu.
 * Es erweitert keine weiteren Verwandtschaften (keine Eltern/Kinder der spouse).
 */
export function filterBloodline(
  full: Record<MemberId, MemberLite>,
  focusId: MemberId,
  opts?: BloodlineFilterOptions
): Record<MemberId, MemberLite> {
  const kinDepth: KinDepth = (opts?.kinDepth ?? 0) as KinDepth

  const visible = new Set<MemberId>()
  const add = (id?: MemberId | null) => {
    if (!id) return
    if (full[id]) visible.add(id)
  }

  if (!full[focusId]) {
    // Fallback: nichts filtern, gib original zurück
    return full
  }

  // --- Stufe 0: direkte Linie (alle Vorfahren und Nachfahren des Fokus)
  // Vorfahren
  const stackUp: MemberId[] = [focusId]
  const seenUp = new Set<MemberId>()
  while (stackUp.length) {
    const id = stackUp.pop()!
    if (seenUp.has(id)) continue
    seenUp.add(id)
    add(id)
    const m = full[id]
    m?.parentIds?.forEach(pid => {
      if (!seenUp.has(pid)) stackUp.push(pid)
    })
  }
  // Nachfahren
  const stackDown: MemberId[] = [focusId]
  const seenDown = new Set<MemberId>()
  while (stackDown.length) {
    const id = stackDown.pop()!
    if (seenDown.has(id)) continue
    seenDown.add(id)
    add(id)
    const m = full[id]
    m?.childrenIds?.forEach(cid => {
      if (!seenDown.has(cid)) stackDown.push(cid)
    })
  }

  // Helper: Geschwister eines Members
  const siblingsOf = (id: MemberId): MemberId[] => {
    const m = full[id]
    if (!m) return []
    const sibSet = new Set<MemberId>()
    m.parentIds.forEach(pid => {
      const p = full[pid]
      p?.childrenIds?.forEach(cid => {
        if (cid !== id) sibSet.add(cid)
      })
    })
    return Array.from(sibSet)
  }

  // Helper: Cousins eines Members (Kinder der Geschwister der Eltern)
  const cousinsOf = (id: MemberId): MemberId[] => {
    const m = full[id]
    if (!m) return []
    const cousinSet = new Set<MemberId>()
    m.parentIds.forEach(pid => {
      // Geschwister der Eltern
      siblingsOf(pid).forEach(uncleAuntId => {
        const ua = full[uncleAuntId]
        ua?.childrenIds?.forEach(c => cousinSet.add(c))
      })
    })
    return Array.from(cousinSet)
  }

  // Helper: Großcousins: Cousins der Eltern bzw. Kinder der Cousins (per Definition hier: eine Ebene weiter)
  const grandCousinsOf = (id: MemberId): MemberId[] => {
    const res = new Set<MemberId>()
    const m = full[id]
    if (!m) return []
    // (a) Cousins der Eltern
    m.parentIds.forEach(pid => {
      cousinsOf(pid).forEach(cc => res.add(cc))
    })
    // (b) Kinder der Cousins des Members
    cousinsOf(id).forEach(c => {
      full[c]?.childrenIds?.forEach(k => res.add(k))
    })
    return Array.from(res)
  }

  // --- Stufe 1: + Geschwister (der bereits sichtbaren Personen)
  if (kinDepth >= 1) {
    Array.from(visible).forEach(id => {
      siblingsOf(id).forEach(add)
    })
  }

  // --- Stufe 2: + Cousins (der bereits sichtbaren Personen)
  if (kinDepth >= 2) {
    Array.from(visible).forEach(id => {
      cousinsOf(id).forEach(add)
    })
  }

  // --- Stufe 3: + Großcousins
  if (kinDepth >= 3) {
    Array.from(visible).forEach(id => {
      grandCousinsOf(id).forEach(add)
    })
  }

  // --- Ehepartner optional NACH der Selektion hinzufügen
  if (opts?.includeSpouses) {
    // Kopie der aktuellen Sichtbaren, damit spouses auf Basis der finalen Menge gezogen werden
    const now = Array.from(visible)
    for (let i = 0; i < now.length; i++) {
      const id = now[i]
      const sId = full[id]?.spouseId ?? null
      if (sId && full[sId]) {
        visible.add(sId)
      }
    }
  }

  // Ergebnis-Map bauen
  const out: Record<MemberId, MemberLite> = {}
  visible.forEach(id => {
    if (full[id]) out[id] = full[id]
  })
  return out
}
