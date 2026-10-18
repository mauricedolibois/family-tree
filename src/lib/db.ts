// src/lib/db.ts
// Alle Datenbankzugriffe des Servers an einer Stelle.

import { randomBytes } from 'crypto'
import { supaAdmin } from './supabaseServer'
import type { StoredTree } from '@/storage/schema'
import { describeChange } from '@/storage/changes'

export type FamilyRow = { id: string; name: string; pass_hash: string; created_at: string }

/** Supabase-Code für „keine Zeile gefunden“ bei .single() */
const NO_ROWS = 'PGRST116'

export async function getFamilyByName(name: string): Promise<FamilyRow | null> {
  const { data, error } = await supaAdmin
    .from('families')
    .select('id,name,pass_hash,created_at')
    .eq('name', name)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function getFamilyNameById(id: string): Promise<string | null> {
  const { data, error } = await supaAdmin.from('families').select('name').eq('id', id).maybeSingle()
  if (error) throw error
  return data?.name ?? null
}

export async function createFamily(name: string, pass_hash: string): Promise<FamilyRow> {
  const { data, error } = await supaAdmin
    .from('families')
    .insert({ name, pass_hash })
    .select('id,name,pass_hash,created_at')
    .single()
  if (error) throw error
  return data
}

export type LoadedTree = { tree: StoredTree; version: string }

export async function loadFamilyTree(familyId: string): Promise<LoadedTree | null> {
  const { data, error } = await supaAdmin
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
 * Speichert nur, wenn der Baum seit `baseVersion` nicht woanders geändert wurde
 * (z. B. auf einem zweiten Gerät). Sonst `conflict` statt stillem Überschreiben.
 * Ohne `baseVersion` wird nur ein neuer Baum angelegt.
 */
export async function saveFamilyTree(
  familyId: string,
  tree: StoredTree,
  baseVersion: string | null,
): Promise<SaveResult> {
  const updated_at = new Date().toISOString()

  if (!baseVersion) {
    const { data, error } = await supaAdmin
      .from('family_trees')
      .insert({ family_id: familyId, tree_json: tree, updated_at })
      .select('updated_at')
      .single()
    if (error?.code === '23505') return { status: 'conflict' } // existiert schon
    if (error) throw error
    return { status: 'saved', version: data.updated_at }
  }

  const { data, error } = await supaAdmin
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
 * Sichert vor jeder Änderung den bisherigen Stand – mit einer Notiz, was danach
 * geändert wurde, damit man im Notfall gezielt zurückgehen kann.
 * Automatische Sicherungen räumt die tägliche Sicherung nach einiger Zeit auf.
 */
export async function snapshotBeforeSave(familyId: string, current: StoredTree, next: StoredTree) {
  const change = describeChange(current, next)
  if (!change) return // nichts geändert, nichts zu sichern
  const note = `automatisch: vor Änderung (${change})`.slice(0, 500)
  const { error } = await supaAdmin
    .from('family_trees_backup')
    .insert({ family_id: familyId, tree_json: current, note })
  if (error) throw error
}

// ── Kalender-Abo ──────────────────────────────────────────────────────────────

const newCalendarToken = () => randomBytes(24).toString('base64url')

/** Schlüssel für das Kalender-Abo der Familie; wird beim ersten Mal angelegt */
export async function getCalendarToken(familyId: string): Promise<string> {
  const read = async () => {
    const { data, error } = await supaAdmin.from('families').select('calendar_token').eq('id', familyId).single()
    if (error) throw error
    return data.calendar_token as string | null
  }
  const existing = await read()
  if (existing) return existing
  // Nur setzen, wenn noch keiner da ist – bei zwei gleichzeitigen Aufrufen gewinnt der erste
  const { error } = await supaAdmin
    .from('families')
    .update({ calendar_token: newCalendarToken() })
    .eq('id', familyId)
    .is('calendar_token', null)
  if (error) throw error
  return (await read())!
}

/** Neuer Schlüssel; der alte Abo-Link funktioniert danach nicht mehr */
export async function renewCalendarToken(familyId: string): Promise<string> {
  const token = newCalendarToken()
  const { error } = await supaAdmin.from('families').update({ calendar_token: token }).eq('id', familyId)
  if (error) throw error
  return token
}

export async function getFamilyByCalendarToken(token: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supaAdmin.from('families').select('id,name').eq('calendar_token', token).maybeSingle()
  if (error) throw error
  return data
}
