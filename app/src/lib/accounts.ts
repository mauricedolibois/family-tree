// src/lib/accounts.ts
// Database access for user accounts, tree memberships, invitations and one-time tokens.
// Tree contents and calendar tokens stay in ./db.ts.

import { getSupaAdmin } from './supabaseServer'
import type { StoredTree } from '@/storage/schema'

export type Role = 'editor' | 'viewer'

export type UserRow = {
  id: string
  email: string
  name: string
  pass_hash: string
  is_admin: boolean
  email_verified_at: string | null
  session_epoch: number
  locale: string | null
  disabled_at: string | null
  created_at: string
}

/** A user as the browser may see it: no password hash, no epoch */
export type PublicUser = Pick<UserRow, 'id' | 'email' | 'name' | 'is_admin' | 'locale'> & { verified: boolean }

export const toPublicUser = (u: UserRow): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  is_admin: u.is_admin,
  locale: u.locale,
  verified: !!u.email_verified_at,
})

export type TreeSummary = { id: string; name: string; role: Role | 'admin' }

const USER_COLUMNS =
  'id,email,name,pass_hash,is_admin,email_verified_at,session_epoch,locale,disabled_at,created_at' as const

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

/** Deliberately loose: one @, something on both sides, a dot in the domain */
export const looksLikeEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254

const db = () => getSupaAdmin()

// ── Users ─────────────────────────────────────────────────────────────────────

/** Addresses are stored in lower case, so an exact match is enough (ilike would treat _ and % as wildcards) */
export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { data, error } = await db().from('users').select(USER_COLUMNS).eq('email', normalizeEmail(email)).maybeSingle()
  if (error) throw error
  return data
}

export async function getUser(id: string): Promise<UserRow | null> {
  const { data, error } = await db().from('users').select(USER_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function createUser(input: {
  email: string
  name: string
  passHash: string
  isAdmin?: boolean
  verified?: boolean
  locale?: string | null
}): Promise<UserRow> {
  const { data, error } = await db()
    .from('users')
    .insert({
      email: normalizeEmail(input.email),
      name: input.name.trim(),
      pass_hash: input.passHash,
      is_admin: input.isAdmin ?? false,
      email_verified_at: input.verified ? new Date().toISOString() : null,
      locale: input.locale ?? null,
    })
    .select(USER_COLUMNS)
    .single()
  if (error) throw error
  return data
}

export type UserPatch = Partial<
  Pick<UserRow, 'name' | 'email' | 'pass_hash' | 'is_admin' | 'locale' | 'email_verified_at' | 'disabled_at'>
>

export async function updateUser(id: string, patch: UserPatch): Promise<void> {
  const { error } = await db().from('users').update(patch).eq('id', id)
  if (error) throw error
}

/** Ends every session of the user, e.g. after a password change; returns the new epoch */
export async function bumpSessionEpoch(id: string): Promise<number> {
  const user = await getUser(id)
  if (!user) throw new Error('user not found')
  const epoch = user.session_epoch + 1
  const { error } = await db().from('users').update({ session_epoch: epoch }).eq('id', id)
  if (error) throw error
  return epoch
}

export async function deleteUser(id: string): Promise<void> {
  const { error } = await db().from('users').delete().eq('id', id)
  if (error) throw error
}

export async function countActiveAdmins(): Promise<number> {
  const { count, error } = await db()
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('is_admin', true)
    .is('disabled_at', null)
  if (error) throw error
  return count ?? 0
}

export type AdminUserView = PublicUser & {
  disabled: boolean
  created_at: string
  trees: Array<{ id: string; name: string; role: Role }>
}

export async function listUsers(): Promise<AdminUserView[]> {
  const { data, error } = await db()
    .from('users')
    .select(`${USER_COLUMNS},memberships(role,family_id,families(name))`)
    .order('name')
  if (error) throw error
  return (data ?? []).map((u) => {
    // Without generated types supabase-js types embedded rows as arrays; many-to-one embeds are objects
    const row = u as unknown as UserRow & {
      memberships: Array<{ role: Role; family_id: string; families: { name: string } | null }>
    }
    return {
      ...toPublicUser(row),
      disabled: !!row.disabled_at,
      created_at: row.created_at,
      trees: row.memberships
        .map((m) => ({ id: m.family_id, name: m.families?.name ?? '', role: m.role }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }
  })
}

// ── Trees and memberships ───────────────────────────────────────────────────

export async function listTrees(): Promise<Array<{ id: string; name: string; created_at: string }>> {
  const { data, error } = await db().from('families').select('id,name,created_at').order('name')
  if (error) throw error
  return data ?? []
}

export async function getTree(id: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await db().from('families').select('id,name').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/** New tree with its starter content; the old shared password stays empty */
export async function createTree(name: string, starter: StoredTree): Promise<{ id: string; name: string }> {
  const { data, error } = await db().from('families').insert({ name: name.trim() }).select('id,name').single()
  if (error) throw error
  const { error: treeError } = await db()
    .from('family_trees')
    .insert({ family_id: data.id, tree_json: starter, updated_at: new Date().toISOString() })
  if (treeError) throw treeError
  return data
}

export async function renameTree(id: string, name: string): Promise<void> {
  const { error } = await db().from('families').update({ name: name.trim() }).eq('id', id)
  if (error) throw error
}

/** Trees the user can open: all of them for admins, otherwise their memberships */
export async function treesOf(user: Pick<UserRow, 'id' | 'is_admin'>): Promise<TreeSummary[]> {
  if (user.is_admin) {
    const own = new Map((await membershipRows(user.id)).map((m) => [m.family_id, m.role]))
    return (await listTrees()).map((t) => ({ id: t.id, name: t.name, role: own.get(t.id) ?? 'admin' }))
  }
  return (await membershipRows(user.id))
    .map((m) => ({ id: m.family_id, name: m.families?.name ?? '', role: m.role }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function membershipRows(userId: string) {
  const { data, error } = await db().from('memberships').select('family_id,role,families(name)').eq('user_id', userId)
  if (error) throw error
  return (data ?? []) as unknown as Array<{ family_id: string; role: Role; families: { name: string } | null }>
}

export async function roleIn(userId: string, familyId: string): Promise<Role | null> {
  const { data, error } = await db()
    .from('memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('family_id', familyId)
    .maybeSingle()
  if (error) throw error
  return (data?.role as Role | undefined) ?? null
}

export async function setMembership(userId: string, familyId: string, role: Role): Promise<void> {
  const { error } = await db()
    .from('memberships')
    .upsert({ user_id: userId, family_id: familyId, role }, { onConflict: 'user_id,family_id' })
  if (error) throw error
}

export async function removeMembership(userId: string, familyId: string): Promise<void> {
  const { error } = await db().from('memberships').delete().eq('user_id', userId).eq('family_id', familyId)
  if (error) throw error
}

// ── Invitations ───────────────────────────────────────────────────────────────

export type InviteRow = {
  id: string
  email: string | null
  family_id: string | null
  role: Role | null
  make_admin: boolean
  created_by: string | null
  created_at: string
  expires_at: string
  used_at: string | null
  revoked_at: string | null
}

const INVITE_COLUMNS = 'id,email,family_id,role,make_admin,created_by,created_at,expires_at,used_at,revoked_at'

export async function createInvite(input: {
  tokenHash: string
  email: string | null
  familyId: string | null
  role: Role | null
  makeAdmin: boolean
  createdBy: string
  expiresAt: Date
}): Promise<InviteRow> {
  const { data, error } = await db()
    .from('invites')
    .insert({
      token_hash: input.tokenHash,
      email: input.email ? normalizeEmail(input.email) : null,
      family_id: input.familyId,
      role: input.role,
      make_admin: input.makeAdmin,
      created_by: input.createdBy,
      expires_at: input.expiresAt.toISOString(),
    })
    .select(INVITE_COLUMNS)
    .single()
  if (error) throw error
  return data
}

export type InviteDetails = InviteRow & { tree_name: string | null; inviter_name: string | null }

export async function findInvite(tokenHash: string): Promise<InviteDetails | null> {
  const { data, error } = await db()
    .from('invites')
    .select(`${INVITE_COLUMNS},families(name),users!invites_created_by_fkey(name)`)
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as unknown as InviteRow & { families: { name: string } | null; users: { name: string } | null }
  const { families, users, ...invite } = row
  return { ...invite, tree_name: families?.name ?? null, inviter_name: users?.name ?? null }
}

/** Open = neither used, revoked nor expired */
export const inviteIsOpen = (i: Pick<InviteRow, 'used_at' | 'revoked_at' | 'expires_at'>, now = Date.now()) =>
  !i.used_at && !i.revoked_at && Date.parse(i.expires_at) > now

export async function listOpenInvites(): Promise<InviteDetails[]> {
  const { data, error } = await db()
    .from('invites')
    .select(`${INVITE_COLUMNS},families(name),users!invites_created_by_fkey(name)`)
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((d) => {
    const row = d as unknown as InviteRow & { families: { name: string } | null; users: { name: string } | null }
    const { families, users, ...invite } = row
    return { ...invite, tree_name: families?.name ?? null, inviter_name: users?.name ?? null }
  })
}

/** Marks the invite as used, at most once even with concurrent requests; true if this call won */
export async function claimInvite(id: string, userId: string): Promise<boolean> {
  const { data, error } = await db()
    .from('invites')
    .update({ used_at: new Date().toISOString(), used_by: userId })
    .eq('id', id)
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('id')
  if (error) throw error
  return (data ?? []).length === 1
}

export async function revokeInvite(id: string): Promise<void> {
  const { error } = await db().from('invites').update({ revoked_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

// ── One-time tokens: email verification and password reset ──────────────────

export type TokenPurpose = 'verify' | 'reset'

export async function createAuthToken(userId: string, purpose: TokenPurpose, tokenHash: string, expiresAt: Date) {
  const { error } = await db()
    .from('auth_tokens')
    .insert({ token_hash: tokenHash, user_id: userId, purpose, expires_at: expiresAt.toISOString() })
  if (error) throw error
}

/** User id of a valid, unused token; looking it up does not use it */
export async function peekAuthToken(tokenHash: string, purpose: TokenPurpose): Promise<string | null> {
  const { data, error } = await db()
    .from('auth_tokens')
    .select('user_id')
    .eq('token_hash', tokenHash)
    .eq('purpose', purpose)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (error) throw error
  return data?.user_id ?? null
}

/** Uses the token once; the user id if it was valid */
export async function consumeAuthToken(tokenHash: string, purpose: TokenPurpose): Promise<string | null> {
  const { data, error } = await db()
    .from('auth_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .eq('purpose', purpose)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('user_id')
  if (error) throw error
  return data?.[0]?.user_id ?? null
}

/** Validated admin changes to an account; null for invalid input */
export function cleanAdminPatch(body: { isAdmin?: unknown; disabled?: unknown; name?: unknown }): UserPatch | null {
  const patch: UserPatch = {}
  if (body.isAdmin !== undefined) {
    if (typeof body.isAdmin !== 'boolean') return null
    patch.is_admin = body.isAdmin
  }
  if (body.disabled !== undefined) {
    if (typeof body.disabled !== 'boolean') return null
    patch.disabled_at = body.disabled ? new Date().toISOString() : null
  }
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : ''
    if (!name || name.length > 80) return null
    patch.name = name
  }
  return Object.keys(patch).length ? patch : null
}
