// Password reset with a one-time link. GET checks the link, POST sets the new
// password, signs out every other session and signs this browser in.

import type { NextApiRequest, NextApiResponse } from 'next'
import { bumpSessionEpoch, consumeAuthToken, getUser, peekAuthToken, updateUser } from '@/lib/accounts'
import { hashPassword, validPassword } from '@/lib/passwords'
import { setSessionCookie } from '@/lib/session'
import { hashToken, isTokenShaped } from '@/lib/tokens'
import { queryParam } from '@/lib/auth'
import { logError } from '@/lib/log'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method === 'GET') {
      const token = queryParam(req.query.token)
      if (!isTokenShaped(token)) return res.status(404).json({ error: 'invalid link' })
      const userId = await peekAuthToken(hashToken(token), 'reset')
      const user = userId ? await getUser(userId) : null
      if (!user || user.disabled_at) return res.status(404).json({ error: 'invalid link' })
      return res.status(200).json({ email: user.email })
    }

    if (req.method === 'POST') {
      const { token, password } = (req.body || {}) as { token?: unknown; password?: unknown }
      if (!isTokenShaped(token)) return res.status(404).json({ error: 'invalid link' })
      if (!validPassword(password)) return res.status(400).json({ error: 'invalid password' })
      const userId = await consumeAuthToken(hashToken(token), 'reset')
      const user = userId ? await getUser(userId) : null
      if (!user || user.disabled_at) return res.status(404).json({ error: 'invalid link' })

      // Following the link proves access to the mailbox, so the address counts as verified
      await updateUser(user.id, {
        pass_hash: await hashPassword(password),
        email_verified_at: user.email_verified_at ?? new Date().toISOString(),
      })
      const epoch = await bumpSessionEpoch(user.id)
      setSessionCookie(res, { uid: user.id, epoch })
      return res.status(200).json({ ok: true })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).end()
  } catch (err) {
    logError('api/auth/reset', err)
    return res.status(500).json({ error: 'internal error' })
  }
}
