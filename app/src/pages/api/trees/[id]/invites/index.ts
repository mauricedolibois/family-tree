// Invite someone to this tree (moderators and admins). Moderators can grant every
// tree role, but never admin rights.

import { parseRole } from '@/lib/accounts'
import { managedTree, withUser } from '@/lib/auth'
import { inviteDays, inviteEmail, issueInvite } from '@/lib/invites'
import { isLimited, recordAttempt } from '@/lib/rateLimit'

// Invitations can send mail to any address, so moderators get a limit; admins do not
const INVITES_PER_HOUR = 20

export default withUser('api/trees/[id]/invites', async (req, res, user) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }
  const tree = await managedTree(req, res, user)
  if (!tree) return
  const body = (req.body || {}) as { email?: unknown; role?: unknown; days?: unknown }
  const email = inviteEmail(body.email)
  if (email === undefined) return res.status(400).json({ error: 'invalid email' })
  const role = parseRole(body.role)
  if (!role) return res.status(400).json({ error: 'invalid role' })

  const key = [`create:${user.id}`]
  if (!user.is_admin) {
    const limits = { max: INVITES_PER_HOUR, windowMinutes: 60, onlyFailures: false }
    if (await isLimited('invite', key, limits)) return res.status(429).json({ error: 'too many attempts' })
    await recordAttempt('invite', key, true)
  }

  const result = await issueInvite({
    inviter: user,
    email,
    tree,
    role,
    makeAdmin: false,
    days: inviteDays(body.days),
  })
  return res.status(200).json(result)
})
