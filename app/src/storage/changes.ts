// src/storage/changes.ts
// What changed between two versions? Stored with every version as `change`, so the
// history can say it in the reader's language, and as a short English note for
// admin.backups in the SQL editor.

import type { StoredMemberV3, StoredTree } from './schema'

/** Names of the people concerned, by what happened to them */
export type ChangeSummary = {
  added: string[]
  removed: string[]
  edited: string[]
  /** Only their links to relatives changed */
  relinked: string[]
  rootChanged: boolean
}

const MAX_NAMES = 3

/** A person's own data without links to other people */
const core = (m: StoredMemberV3) => JSON.stringify({ name: m.name, gender: m.gender, profile: m.profile ?? null })

/** null if both versions are equal */
export function describeChange(before: StoredTree, after: StoredTree): ChangeSummary | null {
  const b = before.members ?? {}
  const a = after.members ?? {}
  const kept = Object.keys(a).filter((id) => b[id])
  const summary: ChangeSummary = {
    added: Object.keys(a)
      .filter((id) => !b[id])
      .map((id) => a[id].name),
    removed: Object.keys(b)
      .filter((id) => !a[id])
      .map((id) => b[id].name),
    edited: kept.filter((id) => core(a[id]) !== core(b[id])).map((id) => a[id].name),
    relinked: [],
    rootChanged: before.rootId !== after.rootId,
  }
  // Adding or removing someone always touches their relatives' links; not worth a separate entry
  if (!summary.added.length && !summary.removed.length) {
    summary.relinked = kept
      .filter((id) => core(a[id]) === core(b[id]) && JSON.stringify(a[id]) !== JSON.stringify(b[id]))
      .map((id) => a[id].name)
  }
  const empty = !summary.added.length && !summary.removed.length && !summary.edited.length && !summary.relinked.length
  if (empty && !summary.rootChanged) return null
  return summary
}

/** "A, B, C" or "A, B, C and 2 more", with the words of the reader's language */
export function nameList(names: string[], more: (n: number) => string): string {
  if (names.length <= MAX_NAMES) return names.join(', ')
  return `${names.slice(0, MAX_NAMES).join(', ')} ${more(names.length - MAX_NAMES)}`
}

/** e.g. "added: Lena Hornberger; edited: Karl Niehren", for the SQL tools */
export function changeNote(c: ChangeSummary): string {
  const list = (names: string[]) => nameList(names, (n) => `and ${n} more`)
  const parts: string[] = []
  if (c.added.length) parts.push(`added: ${list(c.added)}`)
  if (c.removed.length) parts.push(`removed: ${list(c.removed)}`)
  if (c.edited.length) parts.push(`edited: ${list(c.edited)}`)
  if (c.relinked.length) parts.push(`relations changed: ${list(c.relinked)}`)
  if (!parts.length && c.rootChanged) parts.push('start person changed')
  return parts.join('; ')
}
