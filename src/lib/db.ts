// src/lib/db.ts
import { supaAdmin } from './supabaseServer'

export async function getFamilyByName(name: string) {
  const { data, error } = await supaAdmin
    .from('families')
    .select('*')
    .eq('name', name)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data ?? null
}

export async function createFamily(name: string, pass_hash: string) {
  const { data, error } = await supaAdmin
    .from('families')
    .insert({ name, pass_hash })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getFamilyById(id: string) {
  const { data, error } = await supaAdmin
    .from('families')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function loadFamilyTree(familyId: string) {
  const { data, error } = await supaAdmin
    .from('family_trees')
    .select('tree_json')
    .eq('family_id', familyId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data?.tree_json ?? null
}

export async function saveFamilyTree(familyId: string, json: any) {
  const { error } = await supaAdmin
    .from('family_trees')
    .upsert({ family_id: familyId, tree_json: json, updated_at: new Date().toISOString() })
  if (error) throw error
}
