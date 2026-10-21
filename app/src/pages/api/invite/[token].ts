// Invitation links. GET describes the invitation; POST accepts it, either by
// creating a new account or, when signed in, by joining with the current one.

import type { NextApiRequest, NextApiResponse } from 'next'
import {
  claimInvite,
  createUser,
  deleteUser,
  findInvite,
  findUserByEmail,
  inviteIsOpen,
  looksLikeEmail,
  normalizeEmail,
  setMembership,
  updateUser,
  type InviteDetails,
  type UserRow,
} from '@/lib/accounts'
import { currentUser, queryParam } from '@/lib/auth'
import { emailVerificationRequired } from '@/lib/features'
import { cleanName, hashPassword, validPassword } from '@/lib/passwords'
import { setSessionCookie } from '@/lib/session'
import { hashToken, isTokenShaped } from '@/lib/tokens'
import { clientIp, isLimited, recordAttempt } from '@/lib/rateLimit'
import { sendVerification } from '@/lib/accountMail'
import { logError } from '@/lib/log'
import { localeFromRequest } from '@/i18n/server'

async function grant(invite: InviteDetails, user: UserRow) {
  if (invite.make_admin && !user.is_admin) await updateUser(user.id, { is_admin: true })
  if (invite.tree_id && invite.role) await setMembership(user.id, invite.tree_id, invite.role, invite.scope)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const token = queryParam(req.query.token)
  if (!isTokenShaped(token)) return res.status(404).json({ error: 'invalid link' })

  try {
    const invite = await findInvite(hashToken(token))
    if (!invite) return res.status(404).json({ error: 'invalid link' })
    // An invitation to a deleted tree is as good as expired
    if (!inviteIsOpen(invite) || invite.tree_deleted) return res.status(410).json({ error: 'expired' })
    const me = await currentUser(req)

    if (req.method === 'GET') {
      return res.status(200).json({
        tree: invite.tree_name,
        role: invite.role,
        admin: invite.make_admin,
        email: invite.email,
        inviter: invite.inviter_name,
        signedInAs: me ? { name: me.name, email: me.email } : null,
      })
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST')
      return res.status(405).end()
    }

    const ipKey = `ip:${clientIp(req)}`
    if (await isLimited('invite', [ipKey], { max: 20, windowMinutes: 60, onlyFailures: true })) {
      return res.status(429).json({ error: 'too many attempts' })
    }

    // Signed in: join with the current account
    if (me) {
      if (invite.email && invite.email !== normalizeEmail(me.email)) {
        await recordAttempt('invite', [ipKey], false)
        return res.status(403).json({ error: 'wrong account' })
      }
      if (!(await claimInvite(invite.id, me.id))) return res.status(410).json({ error: 'expired' })
      await grant(invite, me)
      return res.status(200).json({ ok: true, treeId: invite.tree_id })
    }

    // New account
    const body = (req.body || {}) as { name?: unknown; email?: unknown; password?: unknown }
    const name = cleanName(body.name)
    const email = invite.email ?? (typeof body.email === 'string' ? body.email.trim() : '')
    if (!name || !looksLikeEmail(email)) return res.status(400).json({ error: 'missing fields' })
    if (!validPassword(body.password)) return res.status(400).json({ error: 'invalid password' })
    if (await findUserByEmail(email)) return res.status(409).json({ error: 'email taken' })

    // An invite bound to an address was addressed by an admin, so the address counts as checked
    const verified = !!invite.email || !emailVerificationRequired()
    const user = await createUser({
      email,
      name,
      passHash: await hashPassword(body.password),
      verified: !!invite.email,
      locale: localeFromRequest(req),
    })
    if (!(await claimInvite(invite.id, user.id))) {
      // Someone else used the link in the meantime: do not leave an account behind
      await deleteUser(user.id)
      return res.status(410).json({ error: 'expired' })
    }
    await grant(invite, user)
    await recordAttempt('invite', [ipKey], true)

    if (!verified) {
      await sendVerification(user)
      return res.status(200).json({ ok: true, verify: true })
    }
    setSessionCookie(res, { uid: user.id, epoch: user.session_epoch })
    return res.status(200).json({ ok: true, treeId: invite.tree_id })
  } catch (err) {
    if ((err as { code?: string })?.code === '23505') return res.status(409).json({ error: 'email taken' })
    logError('api/invite', err)
    return res.status(500).json({ error: 'internal error' })
  }
}
