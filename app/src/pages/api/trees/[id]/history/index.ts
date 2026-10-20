// Versions of a tree, newest first (?before=<id> for older ones). For the tree's
// moderators and admins, who can restore them.

import { managedTree, withUser } from '@/lib/auth'
import { listVersions } from '@/lib/db'

export default withUser('api/trees/[id]/history', async (req, res, user) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end()
  }
  const tree = await managedTree(req, res, user)
  if (!tree) return
  const before = Number(req.query.before)
  const versions = await listVersions(tree.id, Number.isSafeInteger(before) && before > 0 ? before : undefined)
  return res.status(200).json({ tree: { id: tree.id, name: tree.name }, versions })
})
