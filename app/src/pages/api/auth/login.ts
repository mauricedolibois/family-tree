import type { NextApiRequest, NextApiResponse } from 'next'
import { findUserByEmail, looksLikeEmail, normalizeEmail } from '@/lib/accounts'
import { emailVerificationRequired } from '@/lib/features'
import { checkPassword } from '@/lib/passwords'
import { setSessionCookie } from '@/lib/session'
import { clientIp, isLimited, recordAttempt } from '@/lib/rateLimit'
import { logError } from '@/lib/log'

const FAILURES_PER_EMAIL = 8
const FAILURES_PER_IP = 20
const WINDOW_MINUTES = 15

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }

  const { email, password } = (req.body || {}) as { email?: unknown; password?: unknown }
  if (typeof email !== 'string' || typeof password !== 'string' || !looksLikeEmail(email.trim()) || !password) {
    return res.status(400).json({ error: 'missing fields' })
  }

  const keys = [`email:${normalizeEmail(email)}`, `ip:${clientIp(req)}`]
  try {
    const limited =
      (await isLimited('login', [keys[0]], {
        max: FAILURES_PER_EMAIL,
        windowMinutes: WINDOW_MINUTES,
        onlyFailures: true,
      })) ||
      (await isLimited('login', [keys[1]], { max: FAILURES_PER_IP, windowMinutes: WINDOW_MINUTES, onlyFailures: true }))
    if (limited) return res.status(429).json({ error: 'too many attempts' })

    const user = await findUserByEmail(email)
    const ok = await checkPassword(password, user?.pass_hash)
    await recordAttempt('login', keys, !!user && ok)
    if (!user || !ok) return res.status(401).json({ error: 'invalid credentials' })
    // Only revealed after the right password, so it does not help guessing addresses
    if (user.disabled_at) return res.status(403).json({ error: 'disabled' })
    if (emailVerificationRequired() && !user.email_verified_at) return res.status(403).json({ error: 'unverified' })

    setSessionCookie(res, { uid: user.id, epoch: user.session_epoch })
    return res.status(200).json({ ok: true })
  } catch (err) {
    logError('api/auth/login', err)
    return res.status(500).json({ error: 'internal error' })
  }
}
