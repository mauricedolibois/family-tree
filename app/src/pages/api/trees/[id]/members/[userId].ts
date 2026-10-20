// One member of a tree: PUT {role} changes the role, DELETE removes them from the tree.
// Moderators manage everyone in their tree except themselves, so nobody locks
// themselves out by accident; admins can change their own membership too.

import { parseRole, removeMembership, roleIn, setMembership } from '@/lib/accounts'
import { managedTree, withUser } from '@/lib/auth'
import { isUuid } from '@/lib/ids'

export default withUser('api/trees/[id]/members/[userId]', async (req, res, user) => {
  if (req.method !== 'PUT' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'PUT, DELETE')
    return res.status(405).end()
  }
  const tree = await managedTree(req, res, user)
  if (!tree) return
  const memberId = req.query.userId
  if (!isUuid(memberId)) return res.status(400).json({ error: 'invalid id' })
  if (memberId === user.id && !user.is_admin) return res.status(400).json({ error: 'self' })
  // Only people who already belong to the tree; new people join by invitation
  if (!(await roleIn(memberId, tree.id))) return res.status(404).json({ error: 'not found' })

  if (req.method === 'PUT') {
    const role = parseRole((req.body || {}).role)
    if (!role) return res.status(400).json({ error: 'invalid role' })
    await setMembership(memberId, tree.id, role)
  } else {
    await removeMembership(memberId, tree.id)
  }
  return res.status(200).json({ ok: true })
})
