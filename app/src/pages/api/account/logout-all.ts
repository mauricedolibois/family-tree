// Signs the user out on every device; this browser gets a fresh session.

import { bumpSessionEpoch } from '@/lib/accounts'
import { withUser } from '@/lib/auth'
import { setSessionCookie } from '@/lib/session'

export default withUser('api/account/logout-all', async (req, res, user) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }
  setSessionCookie(res, { uid: user.id, epoch: await bumpSessionEpoch(user.id) })
  return res.status(200).json({ ok: true })
})
