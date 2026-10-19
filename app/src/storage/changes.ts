// src/storage/changes.ts
// Was hat sich zwischen zwei Ständen geändert? Kurz in Worten, für die Notiz einer Sicherung.

import type { StoredMemberV3, StoredTree } from './schema'

const MAX_NAMES = 3

function names(list: string[]): string {
  if (list.length <= MAX_NAMES) return list.join(', ')
  return `${list.slice(0, MAX_NAMES).join(', ')} und ${list.length - MAX_NAMES} weitere`
}

/** Angaben einer Person ohne die Verweise auf andere */
const core = (m: StoredMemberV3) => JSON.stringify({ name: m.name, gender: m.gender, profile: m.profile ?? null })

/**
 * z. B. „hinzugefügt: Lena Hornberger; bearbeitet: Karl Niehren“.
 * null, wenn beide Stände gleich sind.
 */
export function describeChange(before: StoredTree, after: StoredTree): string | null {
  const b = before.members ?? {}
  const a = after.members ?? {}
  const added = Object.keys(a).filter((id) => !b[id])
  const removed = Object.keys(b).filter((id) => !a[id])
  const kept = Object.keys(a).filter((id) => b[id])
  const edited = kept.filter((id) => core(a[id]) !== core(b[id]))
  const relinked = kept.filter((id) => core(a[id]) === core(b[id]) && JSON.stringify(a[id]) !== JSON.stringify(b[id]))

  const parts: string[] = []
  if (added.length) parts.push(`hinzugefügt: ${names(added.map((id) => a[id].name))}`)
  if (removed.length) parts.push(`entfernt: ${names(removed.map((id) => b[id].name))}`)
  if (edited.length) parts.push(`bearbeitet: ${names(edited.map((id) => a[id].name))}`)
  // Neue oder entfernte Personen ändern immer auch die Verweise ihrer Verwandten – das ist keine eigene Nachricht wert
  if (relinked.length && !added.length && !removed.length) {
    parts.push(`Verbindungen geändert: ${names(relinked.map((id) => a[id].name))}`)
  }
  if (!parts.length && before.rootId !== after.rootId) parts.push('Startperson geändert')
  return parts.length ? parts.join('; ') : null
}
