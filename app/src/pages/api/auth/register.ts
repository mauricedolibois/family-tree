// Public sign-up: a new account with a tree of its own. Off unless ALLOW_REGISTRATION=true;
// otherwise people join through invitation links.

import type { NextApiRequest, NextApiResponse } from 'next'
import { createTree, createUser, findUserByEmail, looksLikeEmail, setMembership } from '@/lib/accounts'
import { emailVerificationRequired, registrationOpen } from '@/lib/features'
import { cleanName, hashPassword, validPassword } from '@/lib/passwords'
import { setSessionCookie } from '@/lib/session'
import { clientIp, isLimited, recordAttempt } from '@/lib/rateLimit'
import { logError } from '@/lib/log'
import { sendVerification } from '@/lib/accountMail'
import { starterTree } from '@/family/edit'
import { localeFromRequest } from '@/i18n/server'

const REGISTRATIONS_PER_IP_PER_DAY = 5

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }
  if (!registrationOpen()) return res.status(403).json({ error: 'registration closed' })

  const body = (req.body || {}) as { name?: unknown; email?: unknown; password?: unknown; treeName?: unknown }
  const name = cleanName(body.name)
  const treeName = cleanName(body.treeName)
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  if (!name || !treeName || !looksLikeEmail(email)) return res.status(400).json({ error: 'missing fields' })
  if (!validPassword(body.password, [name, email])) return res.status(400).json({ error: 'invalid password' })

  const ipKey = `ip:${clientIp(req)}`
  const locale = localeFromRequest(req)
  try {
    const limits = { max: REGISTRATIONS_PER_IP_PER_DAY, windowMinutes: 24 * 60, onlyFailures: false }
    if (await isLimited('register', [ipKey], limits)) return res.status(429).json({ error: 'too many attempts' })
    if (await findUserByEmail(email)) return res.status(409).json({ error: 'email taken' })

    const user = await createUser({ email, name, passHash: await hashPassword(body.password), locale })
    const tree = await createTree(treeName, starterTree(locale))
    // Whoever creates a tree runs it
    await setMembership(user.id, tree.id, 'moderator')
    await recordAttempt('register', [ipKey], true)

    if (emailVerificationRequired()) {
      await sendVerification(user)
      return res.status(200).json({ ok: true, verify: true })
    }
    setSessionCookie(res, { uid: user.id, epoch: user.session_epoch })
    return res.status(200).json({ ok: true, treeId: tree.id })
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === '23505') return res.status(409).json({ error: 'email taken' })
    logError('api/auth/register', err)
    return res.status(500).json({ error: 'internal error' })
  }
}
