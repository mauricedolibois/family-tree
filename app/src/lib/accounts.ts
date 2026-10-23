// src/lib/accounts.ts
// Database access for user accounts, tree memberships, invitations and one-time tokens.
// Tree contents and calendar tokens stay in ./db.ts.

import { getSupaAdmin } from './supabaseServer'
import type { StoredTree } from '@/storage/schema'
import { parseScope, type TreeScope } from '@/family/scope'

export type Role = 'viewer' | 'editor' | 'moderator'

export const ROLES: readonly Role[] = ['viewer', 'editor', 'moderator']

/** A role from a request body, or null */
export const parseRole = (value: unknown): Role | null => (ROLES.includes(value as Role) ? (value as Role) : null)

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

export type TreeSummary = { id: string; name: string; role: Role }

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

export async function countUsers(): Promise<number> {
  const { count, error } = await db().from('users').select('id', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
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
  /** limited: the member sees or edits only a part of the tree */
  trees: Array<{ id: string; name: string; role: Role; limited: boolean }>
}

export async function listUsers(): Promise<AdminUserView[]> {
  const { data, error } = await db()
    .from('users')
    .select(`${USER_COLUMNS},memberships(role,scope,tree_id,trees(name,deleted_at))`)
    .order('name')
  if (error) throw error
  return (data ?? []).map((u) => {
    // Without generated types supabase-js types embedded rows as arrays; many-to-one embeds are objects
    const row = u as unknown as UserRow & {
      memberships: Array<{
        role: Role
        scope: unknown
        tree_id: string
        trees: { name: string; deleted_at: string | null } | null
      }>
    }
    return {
      ...toPublicUser(row),
      disabled: !!row.disabled_at,
      created_at: row.created_at,
      trees: row.memberships
        .filter((m) => m.trees && !m.trees.deleted_at)
        .map((m) => ({ id: m.tree_id, name: m.trees?.name ?? '', role: m.role, limited: !!parseScope(m.scope) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }
  })
}

// ── Trees and memberships ───────────────────────────────────────────────────

// Deleted trees (deleted_at set) are invisible everywhere except the admin trash.

export async function listTrees(): Promise<Array<{ id: string; name: string; created_at: string }>> {
  const { data, error } = await db().from('trees').select('id,name,created_at').is('deleted_at', null).order('name')
  if (error) throw error
  return data ?? []
}

export async function getTree(id: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await db().from('trees').select('id,name').eq('id', id).is('deleted_at', null).maybeSingle()
  if (error) throw error
  return data
}

export async function listDeletedTrees(): Promise<Array<{ id: string; name: string; deleted_at: string }>> {
  const { data, error } = await db()
    .from('trees')
    .select('id,name,deleted_at')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Moves a tree to the trash: hidden from everyone at once, its open invitations
 * revoked. Memberships, backups and files stay, so it can be restored.
 */
export async function trashTree(id: string): Promise<boolean> {
  const now = new Date().toISOString()
  const { data, error } = await db()
    .from('trees')
    .update({ deleted_at: now })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
  if (error) throw error
  if (!data?.length) return false
  const { error: inviteError } = await db()
    .from('invites')
    .update({ revoked_at: now })
    .eq('tree_id', id)
    .is('used_at', null)
    .is('revoked_at', null)
  if (inviteError) throw inviteError
  return true
}

export async function restoreTree(id: string): Promise<boolean> {
  const { data, error } = await db()
    .from('trees')
    .update({ deleted_at: null })
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .select('id')
  if (error) throw error
  return !!data?.length
}

/**
 * Deletes a tree from the trash for good: its photos and documents, then the row,
 * which takes backups, memberships and invitations with it. Only for trees that
 * are already in the trash.
 */
export async function purgeTree(id: string): Promise<boolean> {
  const { data: tree, error } = await db()
    .from('trees')
    .select('id')
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .maybeSingle()
  if (error) throw error
  if (!tree) return false
  await removeTree(id)
  return true
}

/** Removes a tree with all its files right away, for instance after a failed import */
export async function removeTree(id: string): Promise<void> {
  const bucket = db().storage.from('media')
  for (;;) {
    const { data: files, error: listError } = await bucket.list(id, { limit: 1000 })
    if (listError) throw listError
    if (!files?.length) break
    const { error: removeError } = await bucket.remove(files.map((f) => `${id}/${f.name}`))
    if (removeError) throw removeError
    if (files.length < 1000) break
  }
  const { error: deleteError } = await db().from('trees').delete().eq('id', id)
  if (deleteError) throw deleteError
}

/** New tree with its starter content; null leaves it empty for an import to fill */
export async function createTree(name: string, starter: StoredTree | null): Promise<{ id: string; name: string }> {
  const { data, error } = await db()
    .from('trees')
    .insert({ name: name.trim(), data: starter })
    .select('id,name')
    .single()
  if (error) throw error
  return data
}

export async function renameTree(id: string, name: string): Promise<void> {
  const { error } = await db().from('trees').update({ name: name.trim() }).eq('id', id).is('deleted_at', null)
  if (error) throw error
}

/** Trees the user can open: their memberships (admins included) */
export async function treesOf(user: Pick<UserRow, 'id'>): Promise<TreeSummary[]> {
  return (await membershipRows(user.id))
    .map((m) => ({ id: m.tree_id, name: m.trees?.name ?? '', role: m.role }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function membershipRows(userId: string) {
  const { data, error } = await db()
    .from('memberships')
    .select('tree_id,role,trees!inner(name)')
    .eq('user_id', userId)
    .is('trees.deleted_at', null)
  if (error) throw error
  return (data ?? []) as unknown as Array<{ tree_id: string; role: Role; trees: { name: string } | null }>
}

export type Membership = {
  role: Role
  scope: TreeScope | null
  /** The person in the tree this account belongs to ("that's me"), once confirmed */
  personId: string | null
}

/** The user's role in the tree, the part of it they are limited to and who they are in it */
export async function membershipIn(userId: string, treeId: string): Promise<Membership | null> {
  const { data, error } = await db()
    .from('memberships')
    .select('role,scope,person_id')
    .eq('user_id', userId)
    .eq('tree_id', treeId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const role = data.role as Role
  // Moderators always have the whole tree; the database enforces it too
  return { role, scope: role === 'moderator' ? null : parseScope(data.scope), personId: data.person_id ?? null }
}

/** How a member's person was confirmed */
export type PersonConfirmation = 'invite' | 'moderator' | 'relative'

/**
 * Links a member to a person in the tree (null unlinks). False when another
 * member of the tree is linked to that person already.
 */
export async function linkPerson(
  userId: string,
  treeId: string,
  personId: string | null,
  confirmedBy: PersonConfirmation,
): Promise<boolean> {
  const { error } = await db()
    .from('memberships')
    .update({ person_id: personId, person_confirmed_by: personId ? confirmedBy : null })
    .eq('user_id', userId)
    .eq('tree_id', treeId)
  if (error?.code === '23505') return false
  if (error) throw error
  return true
}

/** Who is linked to which person in the tree: person id → user id */
export async function linkedPeople(treeId: string): Promise<Map<string, string>> {
  const { data, error } = await db()
    .from('memberships')
    .select('user_id,person_id')
    .eq('tree_id', treeId)
    .not('person_id', 'is', null)
  if (error) throw error
  return new Map((data ?? []).map((r) => [r.person_id as string, r.user_id as string]))
}

export async function roleIn(userId: string, treeId: string): Promise<Role | null> {
  return (await membershipIn(userId, treeId))?.role ?? null
}

/**
 * Adds or changes a membership. scope: the part of the tree the member is limited
 * to, null for the whole tree, left out to keep what they have. Moderators always
 * get the whole tree.
 */
export async function setMembership(
  userId: string,
  treeId: string,
  role: Role,
  scope?: TreeScope | null,
): Promise<void> {
  const row: Record<string, unknown> = { user_id: userId, tree_id: treeId, role }
  if (role === 'moderator') row.scope = null
  else if (scope !== undefined) row.scope = scope
  const { error } = await db().from('memberships').upsert(row, { onConflict: 'user_id,tree_id' })
  if (error) throw error
}

export async function removeMembership(userId: string, treeId: string): Promise<void> {
  const { error } = await db().from('memberships').delete().eq('user_id', userId).eq('tree_id', treeId)
  if (error) throw error
}

export type TreeMember = {
  id: string
  name: string
  email: string
  role: Role
  /** The part of the tree they are limited to; null for the whole tree */
  scope: TreeScope | null
  /** The person in the tree they are, once confirmed */
  personId: string | null
  /** Also runs the server; shown so everyone sees who that is */
  isAdmin: boolean
  verified: boolean
  disabled: boolean
}

/** Members of one tree, for its moderators */
export async function listTreeMembers(treeId: string): Promise<TreeMember[]> {
  const { data, error } = await db()
    .from('memberships')
    .select('role,scope,person_id,users(id,name,email,is_admin,email_verified_at,disabled_at)')
    .eq('tree_id', treeId)
  if (error) throw error
  const rows = (data ?? []) as unknown as Array<{
    role: Role
    scope: unknown
    person_id: string | null
    users: Pick<UserRow, 'id' | 'name' | 'email' | 'is_admin' | 'email_verified_at' | 'disabled_at'> | null
  }>
  return rows
    .filter((r) => r.users)
    .map(({ role, scope, person_id, users: u }) => ({
      id: u!.id,
      name: u!.name,
      email: u!.email,
      role,
      scope: role === 'moderator' ? null : parseScope(scope),
      personId: person_id,
      isAdmin: u!.is_admin,
      verified: !!u!.email_verified_at,
      disabled: !!u!.disabled_at,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ── Invitations ───────────────────────────────────────────────────────────────

export type InviteRow = {
  id: string
  email: string | null
  tree_id: string | null
  role: Role | null
  /** The part of the tree the new member gets; null for the whole tree */
  scope: TreeScope | null
  /** The person in the tree the invited account belongs to, linked on accepting */
  person_id: string | null
  make_admin: boolean
  created_by: string | null
  created_at: string
  expires_at: string
  used_at: string | null
  revoked_at: string | null
}

const INVITE_COLUMNS =
  'id,email,tree_id,role,scope,person_id,make_admin,created_by,created_at,expires_at,used_at,revoked_at'

export async function createInvite(input: {
  tokenHash: string
  email: string | null
  treeId: string | null
  role: Role | null
  scope?: TreeScope | null
  personId?: string | null
  makeAdmin: boolean
  /** null for the first-admin link written at start */
  createdBy: string | null
  expiresAt: Date
}): Promise<InviteRow> {
  const { data, error } = await db()
    .from('invites')
    .insert({
      token_hash: input.tokenHash,
      email: input.email ? normalizeEmail(input.email) : null,
      tree_id: input.treeId,
      role: input.role,
      scope: input.role && input.role !== 'moderator' ? (input.scope ?? null) : null,
      person_id: input.treeId ? (input.personId ?? null) : null,
      make_admin: input.makeAdmin,
      created_by: input.createdBy,
      expires_at: input.expiresAt.toISOString(),
    })
    .select(INVITE_COLUMNS)
    .single()
  if (error) throw error
  return { ...data, scope: parseScope(data.scope) }
}

export type InviteDetails = InviteRow & {
  tree_name: string | null
  inviter_name: string | null
  /** The invitation's tree is in the trash; the invitation must not be used */
  tree_deleted: boolean
}

type InviteJoin = InviteRow & {
  trees: { name: string; deleted_at: string | null } | null
  users: { name: string } | null
}

function inviteDetails(row: InviteJoin): InviteDetails {
  const { trees, users, ...invite } = row
  return {
    ...invite,
    scope: parseScope(invite.scope),
    tree_name: trees?.name ?? null,
    inviter_name: users?.name ?? null,
    tree_deleted: !!trees?.deleted_at,
  }
}

export async function findInvite(tokenHash: string): Promise<InviteDetails | null> {
  const { data, error } = await db()
    .from('invites')
    .select(`${INVITE_COLUMNS},trees(name,deleted_at),users!invites_created_by_fkey(name)`)
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (error) throw error
  return data ? inviteDetails(data as unknown as InviteJoin) : null
}

/** Open = neither used, revoked nor expired */
export const inviteIsOpen = (i: Pick<InviteRow, 'used_at' | 'revoked_at' | 'expires_at'>, now = Date.now()) =>
  !i.used_at && !i.revoked_at && Date.parse(i.expires_at) > now

/** Open invitations, all of them or those of one tree */
export async function listOpenInvites(treeId?: string): Promise<InviteDetails[]> {
  let query = db()
    .from('invites')
    .select(`${INVITE_COLUMNS},trees(name,deleted_at),users!invites_created_by_fkey(name)`)
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
  if (treeId) query = query.eq('tree_id', treeId)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((d) => inviteDetails(d as unknown as InviteJoin)).filter((i) => !i.tree_deleted)
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

/**
 * Revokes an invitation. With a tree only one of that tree that grants no admin
 * rights (those stay with the admins). True if there was one to revoke.
 */
export async function revokeInvite(id: string, treeId?: string): Promise<boolean> {
  let query = db().from('invites').update({ revoked_at: new Date().toISOString() }).eq('id', id)
  if (treeId) query = query.eq('tree_id', treeId).eq('make_admin', false)
  const { data, error } = await query.select('id')
  if (error) throw error
  return (data ?? []).length > 0
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
