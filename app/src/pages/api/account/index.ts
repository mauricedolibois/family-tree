// The signed-in user's own account. GET returns it with its trees; PATCH changes
// name, language, email or password (the last two need the current password).

import {
  bumpSessionEpoch,
  findUserByEmail,
  looksLikeEmail,
  normalizeEmail,
  toPublicUser,
  treesOf,
  updateUser,
  type UserPatch,
} from '@/lib/accounts'
import { withUser } from '@/lib/auth'
import { checkPassword, cleanName, hashPassword, validPassword } from '@/lib/passwords'
import { emailVerificationRequired } from '@/lib/features'
import { sendVerification } from '@/lib/accountMail'
import { setSessionCookie } from '@/lib/session'
import { isLocale } from '@/i18n/locales'

export default withUser('api/account', async (req, res, user) => {
  if (req.method === 'GET') {
    return res.status(200).json({ user: toPublicUser(user), trees: await treesOf(user) })
  }
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'GET, PATCH')
    return res.status(405).end()
  }

  const body = (req.body || {}) as {
    name?: unknown
    locale?: unknown
    email?: unknown
    currentPassword?: unknown
    newPassword?: unknown
  }
  const patch: UserPatch = {}

  if (body.name !== undefined) {
    const name = cleanName(body.name)
    if (!name) return res.status(400).json({ error: 'invalid name' })
    patch.name = name
  }
  if (body.locale !== undefined) {
    if (!isLocale(body.locale)) return res.status(400).json({ error: 'invalid locale' })
    patch.locale = body.locale
  }

  const wantsEmail = typeof body.email === 'string' && normalizeEmail(body.email) !== user.email
  const wantsPassword = body.newPassword !== undefined
  if (wantsEmail || wantsPassword) {
    if (typeof body.currentPassword !== 'string' || !(await checkPassword(body.currentPassword, user.pass_hash))) {
      return res.status(403).json({ error: 'wrong password' })
    }
  }
  if (wantsEmail) {
    const email = (body.email as string).trim()
    if (!looksLikeEmail(email)) return res.status(400).json({ error: 'invalid email' })
    if (await findUserByEmail(email)) return res.status(409).json({ error: 'email taken' })
    patch.email = normalizeEmail(email)
    patch.email_verified_at = emailVerificationRequired() ? null : user.email_verified_at
  }
  if (wantsPassword) {
    if (!validPassword(body.newPassword)) return res.status(400).json({ error: 'invalid password' })
    patch.pass_hash = await hashPassword(body.newPassword)
  }

  if (Object.keys(patch).length) await updateUser(user.id, patch)
  if (wantsEmail && emailVerificationRequired()) {
    await sendVerification({ ...user, email: patch.email!, name: patch.name ?? user.name })
  }
  // A new password ends every other session; this browser stays signed in
  if (wantsPassword) setSessionCookie(res, { uid: user.id, epoch: await bumpSessionEpoch(user.id) })
  return res.status(200).json({ ok: true })
})
