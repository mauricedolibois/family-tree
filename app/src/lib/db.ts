// src/lib/db.ts
// Server-side access to tree contents, backups and calendar tokens.
// Accounts, memberships and invitations live in ./accounts.ts.

import { randomBytes } from 'crypto'
import { getSupaAdmin } from './supabaseServer'
import type { StoredTree } from '@/storage/schema'
import { describeChange } from '@/storage/changes'
import { logError } from './log'

/** PostgREST code for "no rows" with .single() */
const NO_ROWS = 'PGRST116'

export type LoadedTree = { tree: StoredTree; version: string }

export async function loadFamilyTree(familyId: string): Promise<LoadedTree | null> {
  const { data, error } = await getSupaAdmin()
    .from('family_trees')
    .select('tree_json,updated_at')
    .eq('family_id', familyId)
    .single()
  if (error && error.code !== NO_ROWS) throw error
  if (!data) return null
  return { tree: data.tree_json as StoredTree, version: data.updated_at as string }
}

export type SaveResult = { status: 'saved'; version: string } | { status: 'conflict' }

/**
 * Saves only if the tree has not been changed elsewhere since `baseVersion`
 * (e.g. on a second device); otherwise returns `conflict` instead of silently
 * overwriting. Without `baseVersion` it only creates a new tree.
 */
export async function saveFamilyTree(
  familyId: string,
  tree: StoredTree,
  baseVersion: string | null,
): Promise<SaveResult> {
  const updated_at = new Date().toISOString()

  if (!baseVersion) {
    const { data, error } = await getSupaAdmin()
      .from('family_trees')
      .insert({ family_id: familyId, tree_json: tree, updated_at })
      .select('updated_at')
      .single()
    if (error?.code === '23505') return { status: 'conflict' } // already exists
    if (error) throw error
    return { status: 'saved', version: data.updated_at }
  }

  const { data, error } = await getSupaAdmin()
    .from('family_trees')
    .update({ tree_json: tree, updated_at })
    .eq('family_id', familyId)
    .eq('updated_at', baseVersion)
    .select('updated_at')
  if (error) throw error
  if (!data || data.length === 0) return { status: 'conflict' }
  return { status: 'saved', version: data[0].updated_at }
}

/**
 * Backs up the current version before every change, noting what is about to
 * change so a specific state can be restored if needed. The daily backup job
 * prunes these automatic snapshots after a while.
 */
export async function snapshotBeforeSave(familyId: string, current: StoredTree, next: StoredTree) {
  const change = describeChange(current, next)
  if (!change) return // nothing changed, nothing to back up
  // German on purpose: scripts/daily-backup.mjs prunes automatic backups by this prefix
  const note = `automatisch: vor Änderung (${change})`.slice(0, 500)
  const { error } = await getSupaAdmin()
    .from('family_trees_backup')
    .insert({ family_id: familyId, tree_json: current, note })
  // Without the migration (table missing) still save, just without a backup
  if (error) logError('db.snapshotBeforeSave', error)
}

// ── Calendar subscription ─────────────────────────────────────────────────────

const newCalendarToken = () => randomBytes(24).toString('base64url')

/** Calendar subscription token of the family; created on first use */
export async function getCalendarToken(familyId: string): Promise<string> {
  const read = async () => {
    const { data, error } = await getSupaAdmin().from('families').select('calendar_token').eq('id', familyId).single()
    if (error) throw error
    return data.calendar_token as string | null
  }
  const existing = await read()
  if (existing) return existing
  // Only set if none exists yet; with two concurrent calls the first one wins
  const { error } = await getSupaAdmin()
    .from('families')
    .update({ calendar_token: newCalendarToken() })
    .eq('id', familyId)
    .is('calendar_token', null)
  if (error) throw error
  return (await read())!
}

/** New token; the old subscription link stops working */
export async function renewCalendarToken(familyId: string): Promise<string> {
  const token = newCalendarToken()
  const { error } = await getSupaAdmin().from('families').update({ calendar_token: token }).eq('id', familyId)
  if (error) throw error
  return token
}

export async function getFamilyByCalendarToken(token: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await getSupaAdmin()
    .from('families')
    .select('id,name')
    .eq('calendar_token', token)
    .maybeSingle()
  if (error) throw error
  return data
}
