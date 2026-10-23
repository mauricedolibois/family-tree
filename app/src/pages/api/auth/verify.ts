// Email verification. POST with the token from the link confirms the address and
// signs the user in; POST with an email sends a fresh link (same answer either way).

import type { NextApiRequest, NextApiResponse } from 'next'
import { consumeAuthToken, findUserByEmail, getUser, looksLikeEmail, normalizeEmail, updateUser } from '@/lib/accounts'
import { sendVerification } from '@/lib/accountMail'
import { canSendMail } from '@/lib/mail'
import { setSessionCookie } from '@/lib/session'
import { hashToken, isTokenShaped } from '@/lib/tokens'
import { clientIp, isLimited, recordAttempt } from '@/lib/rateLimit'
import { logError } from '@/lib/log'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }
  const { token, email } = (req.body || {}) as { token?: unknown; email?: unknown }
  try {
    if (token !== undefined) {
      if (!isTokenShaped(token)) return res.status(404).json({ error: 'invalid link' })
      const userId = await consumeAuthToken(hashToken(token), 'verify')
      const user = userId ? await getUser(userId) : null
      if (!user || user.disabled_at) return res.status(404).json({ error: 'invalid link' })
      if (!user.email_verified_at) await updateUser(user.id, { email_verified_at: new Date().toISOString() })
      setSessionCookie(res, { uid: user.id, epoch: user.session_epoch })
      return res.status(200).json({ ok: true })
    }

    if (typeof email !== 'string' || !looksLikeEmail(email.trim()))
      return res.status(400).json({ error: 'missing fields' })
    if (!canSendMail()) return res.status(200).json({ ok: true, mail: false })
    const keys = [`email:${normalizeEmail(email)}`, `ip:${clientIp(req)}`]
    if (await isLimited('forgot', keys, { max: 5, windowMinutes: 60, onlyFailures: false })) {
      return res.status(429).json({ error: 'too many attempts' })
    }
    await recordAttempt('forgot', keys, true)
    const user = await findUserByEmail(email)
    if (user && !user.disabled_at && !user.email_verified_at) await sendVerification(user)
    return res.status(200).json({ ok: true, mail: true })
  } catch (err) {
    logError('api/auth/verify', err)
    return res.status(500).json({ error: 'internal error' })
  }
}
