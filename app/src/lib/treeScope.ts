// src/lib/treeScope.ts
// Server side of members limited to a part of a tree (family/scope.ts): checking a
// part a moderator sets, and which photos and documents a member whose part hides
// the rest may open.

import { loadTree } from './db'
import { mediaUrls, parseMediaUrl } from './media'
import { parseScope, viewFor, type TreeScope } from '@/family/scope'

/**
 * The part sent with a role change or an invitation: undefined when none was sent,
 * null for the whole tree, 'invalid' for a malformed part or a line's person or stop
 * who is not in the tree.
 */
export async function scopeInput(value: unknown, treeId: string): Promise<TreeScope | null | undefined | 'invalid'> {
  if (value === undefined) return undefined
  if (value === null) return null
  const scope = parseScope(value)
  if (!scope) return 'invalid'
  const loaded = await loadTree(treeId)
  const members = loaded?.tree.members
  const known = (id: string) => !!members?.[id]
  return scope.lines.every((l) => known(l.person)) && scope.stops.every(known) ? scope : 'invalid'
}

/**
 * A person of the tree sent with an invitation or a member change: undefined when
 * none was sent, null to unlink, 'invalid' for someone who is not in the tree.
 */
export async function personInput(value: unknown, treeId: string): Promise<string | null | undefined | 'invalid'> {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string' || !value || value.length > 100) return 'invalid'
  const loaded = await loadTree(treeId)
  return loaded?.tree.members[value] ? value : 'invalid'
}

// Photos and documents: those of the people in the part, and what the member
// uploaded themselves a short while ago (shown before it is saved with a person).
// Kept in memory for a few seconds, because a page asks for many photos at once.

const FRESH_MS = 30_000
/** On a file not in the list, reload at most this often (a photo was just saved) */
const RELOAD_MS = 2_000
const UPLOAD_MS = 60 * 60_000

const visibleFiles = new Map<string, { at: number; files: Set<string> }>()
const uploads = new Map<string, number>()

const key = (...parts: string[]) => parts.join('\n')

function prune(now: number) {
  for (const [k, v] of visibleFiles) if (now - v.at > FRESH_MS) visibleFiles.delete(k)
  for (const [k, at] of uploads) if (now - at > UPLOAD_MS) uploads.delete(k)
}

async function filesOf(treeId: string, scope: TreeScope): Promise<Set<string>> {
  const loaded = await loadTree(treeId)
  const files = new Set<string>()
  if (!loaded) return files
  for (const url of mediaUrls(viewFor(loaded.tree, scope))) {
    const ref = parseMediaUrl(url)
    if (ref?.treeId === treeId) files.add(ref.file)
  }
  return files
}

/** Remembers a file the member just uploaded, so they can see it before saving */
export function rememberUpload(userId: string, treeId: string, file: string) {
  uploads.set(key(userId, treeId, file), Date.now())
}

export async function mayOpenInPart(userId: string, treeId: string, scope: TreeScope, file: string): Promise<boolean> {
  const now = Date.now()
  prune(now)
  if (uploads.has(key(userId, treeId, file))) return true
  const k = key(userId, treeId, JSON.stringify(scope))
  const cached = visibleFiles.get(k)
  if (cached && (cached.files.has(file) || now - cached.at < RELOAD_MS)) return cached.files.has(file)
  const files = await filesOf(treeId, scope)
  visibleFiles.set(k, { at: now, files })
  return files.has(file)
}
