// A user's role in a tree: PUT {role} sets it (a part of the tree set on the members
// page stays; moderators always get the whole tree), DELETE removes the membership

import { getTree, getUser, parseRole, removeMembership, setMembership } from '@/lib/accounts'
import { withAdmin } from '@/lib/auth'
import { isUuid, treeIdParam } from '@/lib/ids'

export default withAdmin('api/admin/users/[id]/trees/[treeId]', async (req, res) => {
  const userId = req.query.id
  const treeId = treeIdParam(req.query.treeId)
  if (!isUuid(userId) || !treeId) return res.status(400).json({ error: 'invalid id' })
  if (!(await getUser(userId)) || !(await getTree(treeId))) return res.status(404).json({ error: 'not found' })

  if (req.method === 'PUT') {
    const role = parseRole((req.body || {}).role)
    if (!role) return res.status(400).json({ error: 'invalid role' })
    await setMembership(userId, treeId, role)
    return res.status(200).json({ ok: true })
  }
  if (req.method === 'DELETE') {
    await removeMembership(userId, treeId)
    return res.status(200).json({ ok: true })
  }
  res.setHeader('Allow', 'PUT, DELETE')
  return res.status(405).end()
})
