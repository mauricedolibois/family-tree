// The whole tree with its photos and documents as one ZIP file, for everyone who
// may see the tree (they can see every photo in it anyway).

import { loadTree } from '@/lib/db'
import { treeAccess, withUser } from '@/lib/auth'
import { getTree } from '@/lib/accounts'
import { treeIdParam } from '@/lib/ids'
import { writeExport } from '@/lib/treeArchive'

export const config = { api: { responseLimit: false } }

/** ASCII file name for the download, e.g. stammbaum-reiser-2026-10-20.zip */
const fileName = (name: string) =>
  `stammbaum-${
    name
      .normalize('NFKD')
      .replace(/[^\w]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'export'
  }-${new Date().toISOString().slice(0, 10)}.zip`

export default withUser('api/trees/[id]/export', async (req, res, user) => {
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
  res.setHeader('Content-Disposition', `attachment; filename="${fileName(tree.name)}"`)
  await writeExport(res, {
    name: tree.name,
    tree: loaded.tree,
    mayRead: async (id) => id === tree.id || !!(await treeAccess(user, id)),
  })
})
