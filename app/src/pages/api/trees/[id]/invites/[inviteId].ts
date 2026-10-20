// Revoke an open invitation of this tree (moderators and admins)

import { revokeInvite } from '@/lib/accounts'
import { managedTree, withUser } from '@/lib/auth'
import { isUuid } from '@/lib/ids'

export default withUser('api/trees/[id]/invites/[inviteId]', async (req, res, user) => {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE')
    return res.status(405).end()
  }
  const tree = await managedTree(req, res, user)
  if (!tree) return
  const inviteId = req.query.inviteId
  if (!isUuid(inviteId)) return res.status(400).json({ error: 'invalid id' })
  // Only invitations of this tree, so a moderator cannot touch other trees' links
  if (!(await revokeInvite(inviteId, tree.id))) return res.status(404).json({ error: 'not found' })
  return res.status(200).json({ ok: true })
})
