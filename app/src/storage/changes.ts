// src/storage/changes.ts
// What changed between two versions? A short summary used as the note of a backup
// (shown by admin.backups in the SQL editor).

import type { StoredMemberV3, StoredTree } from './schema'

const MAX_NAMES = 3

function names(list: string[]): string {
  if (list.length <= MAX_NAMES) return list.join(', ')
  return `${list.slice(0, MAX_NAMES).join(', ')} and ${list.length - MAX_NAMES} more`
}

/** A person's own data without links to other people */
const core = (m: StoredMemberV3) => JSON.stringify({ name: m.name, gender: m.gender, profile: m.profile ?? null })

/**
 * e.g. "added: Lena Hornberger; edited: Karl Niehren".
 * null if both versions are equal.
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
  if (added.length) parts.push(`added: ${names(added.map((id) => a[id].name))}`)
  if (removed.length) parts.push(`removed: ${names(removed.map((id) => b[id].name))}`)
  if (edited.length) parts.push(`edited: ${names(edited.map((id) => a[id].name))}`)
  // Adding or removing someone always touches their relatives' links; not worth a separate entry
  if (relinked.length && !added.length && !removed.length) {
    parts.push(`relations changed: ${names(relinked.map((id) => a[id].name))}`)
  }
  if (!parts.length && before.rootId !== after.rootId) parts.push('start person changed')
  return parts.length ? parts.join('; ') : null
}
