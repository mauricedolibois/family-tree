// The tree with its photos and documents as one ZIP file, for everyone who may see
// the tree (they can see every photo in it anyway). Members whose part hides the
// rest get their part only.

import { loadTree } from '@/lib/db'
import { mayReadAllMedia, treeMembership, withUser } from '@/lib/auth'
import { getTree } from '@/lib/accounts'
import { treeIdParam } from '@/lib/ids'
import { downloadName, writeExport } from '@/lib/treeArchive'
import { startOf, viewFor } from '@/family/scope'

export const config = { api: { responseLimit: false } }

export default withUser('api/trees/[id]/download', async (req, res, user) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end()
  }
  const treeId = treeIdParam(req.query.id)
  const membership = treeId ? await treeMembership(user, treeId) : null
  const tree = treeId && membership ? await getTree(treeId) : null
  const loaded = tree ? await loadTree(tree.id) : null
  if (!tree || !loaded) return res.status(404).json({ error: 'not found' })
  const scope = membership?.scope ?? null
  if (scope?.hideRest && !loaded.tree.members[startOf(scope)]) return res.status(403).json({ error: 'scope gone' })

  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName(tree.name, new Date())}"`)
  await writeExport(res, {
    name: tree.name,
    tree: viewFor(loaded.tree, scope),
    mayRead: async (id) => id === tree.id || (await mayReadAllMedia(user, id)),
  })
})
