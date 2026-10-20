// One version of the tree as a ZIP file with its photos, like the download of the
// current tree. For the tree's moderators and admins.

import { managedTree, treeAccess, withUser } from '@/lib/auth'
import { loadVersion } from '@/lib/db'
import { downloadName, writeExport } from '@/lib/treeArchive'

export const config = { api: { responseLimit: false } }

export default withUser('api/trees/[id]/history/[versionId]/download', async (req, res, user) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end()
  }
  const tree = await managedTree(req, res, user)
  if (!tree) return
  const versionId = Number(req.query.versionId)
  const version = Number.isSafeInteger(versionId) && versionId > 0 ? await loadVersion(tree.id, versionId) : null
  if (!version) return res.status(404).json({ error: 'not found' })

  res.setHeader('Content-Type', 'application/zip')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${downloadName(tree.name, new Date(version.created_at))}"`,
  )
  await writeExport(res, {
    name: tree.name,
    tree: version.tree,
    mayRead: async (id) => id === tree.id || !!(await treeAccess(user, id)),
  })
})
