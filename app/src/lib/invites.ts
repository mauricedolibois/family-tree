// Creating invitation links, shared by the admin page and the members page of a tree.

import { createInvite, looksLikeEmail, type Role, type UserRow } from './accounts'
import { mailInvite } from './accountMail'
import { hashToken, newToken } from './tokens'

const MAX_DAYS = 30
const DEFAULT_DAYS = 7

/** Optional address from a request body: null when empty, undefined when invalid */
export function inviteEmail(value: unknown): string | null | undefined {
  const email = typeof value === 'string' ? value.trim() : ''
  if (!email) return null
  return looksLikeEmail(email) ? email : undefined
}

/** Validity in days, 1 to 30 */
export const inviteDays = (value: unknown) => Math.min(Math.max(Math.round(Number(value) || DEFAULT_DAYS), 1), MAX_DAYS)

/**
 * Creates the invitation and mails it when an address is given and mail works.
 * The link is returned either way, so it can also be passed on by hand.
 */
export async function issueInvite(input: {
  inviter: Pick<UserRow, 'id' | 'name'>
  email: string | null
  tree: { id: string; name: string } | null
  role: Role | null
  makeAdmin: boolean
  days: number
}): Promise<{ id: string; path: string; mailed: boolean }> {
  const token = newToken()
  const invite = await createInvite({
    tokenHash: hashToken(token),
    email: input.email,
    treeId: input.tree?.id ?? null,
    role: input.tree ? input.role : null,
    makeAdmin: input.makeAdmin,
    createdBy: input.inviter.id,
    expiresAt: new Date(Date.now() + input.days * 24 * 60 * 60 * 1000),
  })
  const path = `/invite/${token}`
  const mailed = input.email
    ? await mailInvite({
        to: input.email,
        path,
        inviter: input.inviter.name,
        tree: input.tree?.name ?? null,
      })
    : false
  return { id: invite.id, path, mailed }
}
