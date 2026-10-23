// Create an invitation link for admin rights alone. Invitations to a tree are made
// on its members tab, where they always name the person in the tree. Mailed when
// an address is given and mail works; the link is returned either way.

import { withAdmin } from '@/lib/auth'
import { inviteDays, inviteEmail, issueInvite } from '@/lib/invites'

export default withAdmin('api/admin/invites', async (req, res, admin) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }
  const body = (req.body || {}) as { email?: unknown; treeId?: unknown; admin?: unknown; days?: unknown }
  const email = inviteEmail(body.email)
  if (email === undefined) return res.status(400).json({ error: 'invalid email' })
  if (body.treeId) return res.status(400).json({ error: 'invalid tree' })
  if (body.admin !== true) return res.status(400).json({ error: 'nothing to grant' })

  const result = await issueInvite({
    inviter: admin,
    email,
    tree: null,
    role: null,
    makeAdmin: true,
    days: inviteDays(body.days),
  })
  return res.status(200).json(result)
})
