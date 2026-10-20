// src/lib/db.ts
// Server-side access to tree contents, backups and calendar tokens.
// Accounts, memberships and invitations live in ./accounts.ts.

import { randomBytes } from 'crypto'
import { getSupaAdmin } from './supabaseServer'
import type { StoredTree } from '@/storage/schema'
import { describeChange } from '@/storage/changes'
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

/**
 * Backs up the current version before every change, noting what is about to
 * change so a specific state can be restored if needed. The daily backup job
 * prunes these snapshots after a while.
 */
export async function snapshotBeforeSave(treeId: string, current: StoredTree, next: StoredTree) {
  const change = describeChange(current, next)
  if (!change) return // nothing changed, nothing to back up
  const { error } = await getSupaAdmin()
    .from('tree_backups')
    .insert({ tree_id: treeId, data: current, kind: 'change', note: change.slice(0, 500) })
  // A failed snapshot must not stop the save; the log shows it
  if (error) logError('db.snapshotBeforeSave', error)
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
  const { data, error } = await getSupaAdmin().from('trees').select('id,name').eq('calendar_token', token).maybeSingle()
  if (error) throw error
  return data
}
