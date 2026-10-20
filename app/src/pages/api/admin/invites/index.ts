// Create an invitation link: for a tree with a role, for admin rights, or both.
// Mailed when an address is given and mail works; the link is returned either way.

import { getTree, parseRole } from '@/lib/accounts'
import { withAdmin } from '@/lib/auth'
import { treeIdParam } from '@/lib/ids'
import { inviteDays, inviteEmail, issueInvite } from '@/lib/invites'

export default withAdmin('api/admin/invites', async (req, res, admin) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }
  const body = (req.body || {}) as {
    email?: unknown
    treeId?: unknown
    role?: unknown
    admin?: unknown
    days?: unknown
  }
  const email = inviteEmail(body.email)
  if (email === undefined) return res.status(400).json({ error: 'invalid email' })
  const makeAdmin = body.admin === true
  const treeId = body.treeId ? treeIdParam(String(body.treeId)) : null
  if (body.treeId && !treeId) return res.status(400).json({ error: 'invalid tree' })
  if (!treeId && !makeAdmin) return res.status(400).json({ error: 'nothing to grant' })
  const tree = treeId ? await getTree(treeId) : null
  if (treeId && !tree) return res.status(404).json({ error: 'tree not found' })

  const result = await issueInvite({
    inviter: admin,
    email,
    tree,
    role: parseRole(body.role) ?? 'editor',
    makeAdmin,
    days: inviteDays(body.days),
  })
  return res.status(200).json(result)
})
