// "Forgot password": mails a reset link. The answer is the same whether or not the
// address has an account, so nobody can probe for addresses.

import type { NextApiRequest, NextApiResponse } from 'next'
import { findUserByEmail, looksLikeEmail, normalizeEmail } from '@/lib/accounts'
import { issueReset } from '@/lib/accountMail'
import { canSendMail } from '@/lib/mail'
import { clientIp, isLimited, recordAttempt } from '@/lib/rateLimit'
import { logError } from '@/lib/log'

const PER_EMAIL_PER_HOUR = 3
const PER_IP_PER_HOUR = 10

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }
  // Without mail an admin has to hand out reset links
  if (!canSendMail()) return res.status(200).json({ ok: true, mail: false })

  const { email } = (req.body || {}) as { email?: unknown }
  if (typeof email !== 'string' || !looksLikeEmail(email.trim()))
    return res.status(400).json({ error: 'missing fields' })

  const keys = [`email:${normalizeEmail(email)}`, `ip:${clientIp(req)}`]
  try {
    const hour = { windowMinutes: 60, onlyFailures: false }
    if (
      (await isLimited('forgot', [keys[0]], { ...hour, max: PER_EMAIL_PER_HOUR })) ||
      (await isLimited('forgot', [keys[1]], { ...hour, max: PER_IP_PER_HOUR }))
    ) {
      return res.status(429).json({ error: 'too many attempts' })
    }
    await recordAttempt('forgot', keys, true)
    const user = await findUserByEmail(email)
    if (user && !user.disabled_at) await issueReset(user)
    return res.status(200).json({ ok: true, mail: true })
  } catch (err) {
    logError('api/auth/forgot', err)
    return res.status(500).json({ error: 'internal error' })
  }
}
