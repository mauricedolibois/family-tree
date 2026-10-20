// src/lib/db.ts
// Server-side access to tree contents, backups and calendar tokens.
// Accounts, memberships and invitations live in ./accounts.ts.

import { randomBytes } from 'crypto'
import { getSupaAdmin } from './supabaseServer'
import type { StoredTree } from '@/storage/schema'
import { changeNote, describeChange, type ChangeSummary } from '@/storage/changes'
import { logError } from './log'

export type LoadedTree = { tree: StoredTree; version: string }

/** null when the tree does not exist or has never been opened (no content yet) */
export async function loadTree(treeId: string): Promise<LoadedTree | null> {
  const { data, error } = await getSupaAdmin().from('trees').select('data,updated_at').eq('id', treeId).maybeSingle()
  if (error) throw error
  if (!data?.data) return null
  return { tree: data.data as StoredTree, version: data.updated_at as string }
}

export type SaveResult = { status: 'saved'; version: string } | { status: 'conflict' }

/**
 * Saves only if the tree has not been changed elsewhere since `baseVersion`
 * (e.g. on a second device); otherwise returns `conflict` instead of silently
 * overwriting. Without `baseVersion` it only fills a tree that has no content yet.
 */
export async function saveTree(treeId: string, tree: StoredTree, baseVersion: string | null): Promise<SaveResult> {
  const update = getSupaAdmin()
    .from('trees')
    .update({ data: tree, updated_at: new Date().toISOString() })
    .eq('id', treeId)
  const guarded = baseVersion ? update.eq('updated_at', baseVersion) : update.is('data', null)
  const { data, error } = await guarded.select('updated_at')
  if (error) throw error
  if (!data || data.length === 0) return { status: 'conflict' }
  return { status: 'saved', version: data[0].updated_at }
}

const peopleIn = (tree: StoredTree) => Object.keys(tree.members ?? {}).length

/**
 * Backs up the current version before every change, noting who changes what, so
 * the history can show it and a version can be restored. The daily backup job
 * prunes these after a while.
 */
export async function snapshotBeforeSave(treeId: string, current: StoredTree, next: StoredTree, userId: string) {
  const change = describeChange(current, next)
  if (!change) return // nothing changed, nothing to back up
  const { error } = await getSupaAdmin()
    .from('tree_backups')
    .insert({
      tree_id: treeId,
      data: current,
      kind: 'change',
      note: changeNote(change).slice(0, 500),
      change,
      people: peopleIn(current),
      created_by: userId,
    })
  // A failed snapshot must not stop the save; the log shows it
  if (error) logError('db.snapshotBeforeSave', error)
}

/**
 * Replaces the whole tree, after backing up the current version with the given
 * kind ("import" or "restore"), so this can be undone the same way. Open editing
 * sessions elsewhere get a conflict on their next save, as after any other change.
 */
export async function replaceTree(
  treeId: string,
  tree: StoredTree,
  backup: { kind: 'import' | 'restore'; note: string; userId: string },
): Promise<string> {
  const current = await loadTree(treeId)
  if (current) {
    const { error } = await getSupaAdmin()
      .from('tree_backups')
      .insert({
        tree_id: treeId,
        data: current.tree,
        kind: backup.kind,
        note: backup.note,
        people: peopleIn(current.tree),
        created_by: backup.userId,
      })
    if (error) throw error
  }
  const { data, error } = await getSupaAdmin()
    .from('trees')
    .update({ data: tree, updated_at: new Date().toISOString() })
    .eq('id', treeId)
    .select('updated_at')
    .single()
  if (error) throw error
  return data.updated_at
}

// ── History ──────────────────────────────────────────────────────────────────

export type VersionKind = 'change' | 'daily' | 'manual' | 'restore' | 'import'

export type VersionSummary = {
  id: number
  created_at: string
  kind: VersionKind
  note: string | null
  change: ChangeSummary | null
  people: number | null
  author: string | null
}

const PAGE = 50

/** Versions of a tree, newest first, 50 at a time (older ones with `before`) */
export async function listVersions(treeId: string, before?: number): Promise<VersionSummary[]> {
  let query = getSupaAdmin()
    .from('tree_backups')
    .select('id,created_at,kind,note,change,people,users(name)')
    .eq('tree_id', treeId)
  if (before) query = query.lt('id', before)
  const { data, error } = await query.order('id', { ascending: false }).limit(PAGE)
  if (error) throw error
  return (data ?? []).map((row) => {
    const { users, ...version } = row as unknown as Omit<VersionSummary, 'author'> & { users: { name: string } | null }
    return { ...version, author: users?.name ?? null }
  })
}

/** One version's tree, only if it belongs to the given tree */
export async function loadVersion(
  treeId: string,
  id: number,
): Promise<{ tree: StoredTree; created_at: string } | null> {
  const { data, error } = await getSupaAdmin()
    .from('tree_backups')
    .select('data,created_at')
    .eq('tree_id', treeId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? { tree: data.data as StoredTree, created_at: data.created_at as string } : null
}

// ── Calendar subscription ─────────────────────────────────────────────────────

const newCalendarToken = () => randomBytes(24).toString('base64url')

/** Calendar subscription token of the tree; created on first use */
export async function getCalendarToken(treeId: string): Promise<string> {
  const read = async () => {
    const { data, error } = await getSupaAdmin().from('trees').select('calendar_token').eq('id', treeId).single()
    if (error) throw error
    return data.calendar_token as string | null
  }
  const existing = await read()
  if (existing) return existing
  // Only set if none exists yet; with two concurrent calls the first one wins
  const { error } = await getSupaAdmin()
    .from('trees')
    .update({ calendar_token: newCalendarToken() })
    .eq('id', treeId)
    .is('calendar_token', null)
  if (error) throw error
  return (await read())!
}

/** New token; the old subscription link stops working */
export async function renewCalendarToken(treeId: string): Promise<string> {
  const token = newCalendarToken()
  const { error } = await getSupaAdmin().from('trees').update({ calendar_token: token }).eq('id', treeId)
  if (error) throw error
  return token
}

export async function getTreeByCalendarToken(token: string): Promise<{ id: string; name: string } | null> {
  // Deleted trees take their calendar with them
  const { data, error } = await getSupaAdmin()
    .from('trees')
    .select('id,name')
    .eq('calendar_token', token)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  return data
}
