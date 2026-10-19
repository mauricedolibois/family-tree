// src/lib/accountMail.ts
// Issues verification, reset and invitation links and mails them when mail is
// enabled. Each function returns the link path, so callers can show it instead.

import { createAuthToken, type UserRow } from './accounts'
import { sendMail } from './mail'
import { hashToken, newToken } from './tokens'

const HOUR = 60 * 60 * 1000
export const VERIFY_HOURS = 24 * 7
export const RESET_HOURS = 2

export type IssuedLink = { path: string; mailed: boolean }

export async function sendVerification(user: Pick<UserRow, 'id' | 'email' | 'name' | 'locale'>): Promise<IssuedLink> {
  const token = newToken()
  await createAuthToken(user.id, 'verify', hashToken(token), new Date(Date.now() + VERIFY_HOURS * HOUR))
  const path = `/verify/${token}`
  const mailed = await sendMail({ kind: 'verify', to: user.email, locale: user.locale, path, name: user.name })
  return { path, mailed }
}

export async function issueReset(user: Pick<UserRow, 'id' | 'email' | 'name' | 'locale'>): Promise<IssuedLink> {
  const token = newToken()
  await createAuthToken(user.id, 'reset', hashToken(token), new Date(Date.now() + RESET_HOURS * HOUR))
  const path = `/reset/${token}`
  const mailed = await sendMail({ kind: 'reset', to: user.email, locale: user.locale, path, name: user.name })
  return { path, mailed }
}

export async function mailInvite(input: {
  to: string
  path: string
  inviter: string
  tree: string | null
  locale: string | null
}): Promise<boolean> {
  return sendMail({
    kind: 'invite',
    to: input.to,
    locale: input.locale,
    path: input.path,
    name: input.inviter,
    tree: input.tree ?? '',
  })
}
