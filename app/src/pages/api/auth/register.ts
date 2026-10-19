import type { NextApiRequest, NextApiResponse } from 'next'
import bcrypt from 'bcryptjs'
import { createFamily, getFamilyByName } from '@/lib/db'
import { setSessionCookie } from '@/lib/session'
import { clientIp, isLimited, recordAttempt } from '@/lib/rateLimit'
import { logError } from '@/lib/log'
import { registrationOpen } from '@/lib/features'

const MIN_PASSWORD_LENGTH = 8
const MAX_NAME_LENGTH = 60
const REGISTRATIONS_PER_IP_PER_DAY = 5

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }
  if (!registrationOpen()) return res.status(403).json({ error: 'registration closed' })

  const { familyName, password } = (req.body || {}) as { familyName?: unknown; password?: unknown }
  if (typeof familyName !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'missing fields' })
  }
  const name = familyName.trim()
  if (name.length < 2 || name.length > MAX_NAME_LENGTH) return res.status(400).json({ error: 'invalid name' })
  if (password.length < MIN_PASSWORD_LENGTH) return res.status(400).json({ error: 'password too short' })

  const ipKey = `ip:${clientIp(req)}`

  try {
    if (
      await isLimited('register', [ipKey], {
        max: REGISTRATIONS_PER_IP_PER_DAY,
        windowMinutes: 24 * 60,
        onlyFailures: false,
      })
    ) {
      return res.status(429).json({ error: 'too many attempts' })
    }

    if (await getFamilyByName(name)) return res.status(409).json({ error: 'family exists' })

    const family = await createFamily(name, await bcrypt.hash(password, 12))
    await recordAttempt('register', [ipKey], true)

    setSessionCookie(res, family.id)
    return res.status(200).json({ ok: true })
  } catch (err: any) {
    if (err?.code === '23505') return res.status(409).json({ error: 'family exists' })
    logError('api/auth/register', err)
    return res.status(500).json({ error: 'internal error' })
  }
}
