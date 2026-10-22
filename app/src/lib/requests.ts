// What members ask moderators for: to be linked to a person in the tree ("that's
// me", person_claims) and for another blood line at a locked person
// (access_requests). Each member has at most one open request of each kind per tree.

import { getSupaAdmin } from './supabaseServer'
import type { BloodLine } from '@/family/scope'

const db = () => getSupaAdmin()

export type PersonClaim = {
  id: string
  userId: string
  userName: string
  personId: string
  createdAt: string
}

export type AccessRequest = {
  id: string
  userId: string
  userName: string
  line: BloodLine
  createdAt: string
}

type Row = { id: string; user_id: string; created_at: string; users: { name: string } | null }

/** Open claims of a tree, or of one member */
export async function openClaims(treeId: string, userId?: string): Promise<PersonClaim[]> {
  let query = db()
    .from('person_claims')
    .select('id,user_id,person_id,created_at,users!person_claims_user_id_fkey(name)')
    .eq('tree_id', treeId)
    .is('decided_at', null)
  if (userId) query = query.eq('user_id', userId)
  const { data, error } = await query.order('created_at')
  if (error) throw error
  return ((data ?? []) as unknown as Array<Row & { person_id: string }>).map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.users?.name ?? '?',
    personId: r.person_id,
    createdAt: r.created_at,
  }))
}

/** A new claim; false when the member has an open one already */
export async function createClaim(treeId: string, userId: string, personId: string): Promise<boolean> {
  const { error } = await db().from('person_claims').insert({ tree_id: treeId, user_id: userId, person_id: personId })
  if (error?.code === '23505') return false
  if (error) throw error
  return true
}

/** Open access requests of a tree, or of one member */
export async function openAccessRequests(treeId: string, userId?: string): Promise<AccessRequest[]> {
  let query = db()
    .from('access_requests')
    .select('id,user_id,line,created_at,users!access_requests_user_id_fkey(name)')
    .eq('tree_id', treeId)
    .is('decided_at', null)
  if (userId) query = query.eq('user_id', userId)
  const { data, error } = await query.order('created_at')
  if (error) throw error
  return ((data ?? []) as unknown as Array<Row & { line: BloodLine }>).map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.users?.name ?? '?',
    line: r.line,
    createdAt: r.created_at,
  }))
}

/** A new access request; false when the member has an open one already */
export async function createAccessRequest(treeId: string, userId: string, line: BloodLine): Promise<boolean> {
  const { error } = await db().from('access_requests').insert({ tree_id: treeId, user_id: userId, line })
  if (error?.code === '23505') return false
  if (error) throw error
  return true
}

/**
 * Records the decision on an open claim or request of this tree, once even with
 * concurrent requests; true if this call decided it.
 */
export async function decide(
  table: 'person_claims' | 'access_requests',
  id: string,
  treeId: string,
  decidedBy: string,
  approved: boolean,
): Promise<boolean> {
  const { data, error } = await db()
    .from(table)
    .update({ decided_at: new Date().toISOString(), decided_by: decidedBy, approved })
    .eq('id', id)
    .eq('tree_id', treeId)
    .is('decided_at', null)
    .select('id')
  if (error) throw error
  return (data ?? []).length === 1
}
