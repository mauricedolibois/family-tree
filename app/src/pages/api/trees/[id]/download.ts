// The whole tree with its photos and documents as one ZIP file, for everyone who
// may see the tree (they can see every photo in it anyway).

import { loadTree } from '@/lib/db'
import { treeAccess, withUser } from '@/lib/auth'
import { getTree } from '@/lib/accounts'
import { treeIdParam } from '@/lib/ids'
import { downloadName, writeExport } from '@/lib/treeArchive'

export const config = { api: { responseLimit: false } }

export default withUser('api/trees/[id]/download', async (req, res, user) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end()
  }
  const treeId = treeIdParam(req.query.id)
  const access = treeId ? await treeAccess(user, treeId) : null
  const tree = treeId && access ? await getTree(treeId) : null
  const loaded = tree ? await loadTree(tree.id) : null
  if (!tree || !loaded) return res.status(404).json({ error: 'not found' })

  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName(tree.name, new Date())}"`)
  await writeExport(res, {
    name: tree.name,
    tree: loaded.tree,
    mayRead: async (id) => id === tree.id || !!(await treeAccess(user, id)),
  })
})
