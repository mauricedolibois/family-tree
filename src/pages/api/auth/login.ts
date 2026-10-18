import type { NextApiRequest, NextApiResponse } from 'next'
import bcrypt from 'bcryptjs'
import { getFamilyByName } from '@/lib/db'
import { setSessionCookie } from '@/lib/session'
import { clientIp, isLimited, recordAttempt } from '@/lib/rateLimit'
import { logError } from '@/lib/log'

/** Gleiche Rechenzeit auch bei unbekanntem Namen, damit man Namen nicht erraten kann. */
const DUMMY_HASH = '$2b$10$AO0/dUpQlcXQaq9.vwJx9uB5XP25rPin.40YuKS9hGu.4zO.KuSpi'

const FAILURES_PER_NAME = 8
const FAILURES_PER_IP = 20
const WINDOW_MINUTES = 15

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }

  const { familyName, password } = (req.body || {}) as { familyName?: unknown; password?: unknown }
  if (typeof familyName !== 'string' || typeof password !== 'string' || !familyName.trim() || !password) {
    return res.status(400).json({ error: 'missing fields' })
  }

  const name = familyName.trim()
  const keys = [`name:${name.toLowerCase()}`, `ip:${clientIp(req)}`]

  try {
    const limited =
      (await isLimited('login', [keys[0]], {
        max: FAILURES_PER_NAME,
        windowMinutes: WINDOW_MINUTES,
        onlyFailures: true,
      })) ||
      (await isLimited('login', [keys[1]], { max: FAILURES_PER_IP, windowMinutes: WINDOW_MINUTES, onlyFailures: true }))
    if (limited) return res.status(429).json({ error: 'too many attempts' })

    const family = await getFamilyByName(name)
    const ok = await bcrypt.compare(password, family?.pass_hash ?? DUMMY_HASH)
    await recordAttempt('login', keys, !!family && ok)

    if (!family || !ok) return res.status(401).json({ error: 'invalid credentials' })

    setSessionCookie(res, family.id)
    return res.status(200).json({ ok: true })
  } catch (err) {
    logError('api/auth/login', err)
    return res.status(500).json({ error: 'internal error' })
  }
}
