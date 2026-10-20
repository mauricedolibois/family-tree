// Contents of one tree. Members read it; editors and admins save it.

import { canEdit, treeAccess, withUser } from '@/lib/auth'
import { treeIdParam } from '@/lib/ids'
import { loadTree, saveTree, snapshotBeforeSave } from '@/lib/db'
import { starterTree } from '@/family/edit'
import { localeFromRequest } from '@/i18n/server'
import { validateStoredTree } from '@/storage/validate'
import { TREE_VERSION_HEADER as VERSION_HEADER } from '@/storage/version'

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } }

export default withUser('api/trees/[id]', async (req, res, user) => {
  const treeId = treeIdParam(req.query.id)
  const access = treeId ? await treeAccess(user, treeId) : null
  // Same answer for trees that do not exist and trees one may not see
  if (!treeId || !access) return res.status(404).json({ error: 'not found' })
  res.setHeader('X-Tree-Access', access)

  if (req.method === 'GET') {
    const loaded = await loadTree(treeId)
    if (loaded) {
      res.setHeader(VERSION_HEADER, loaded.version)
      return res.status(200).json(loaded.tree)
    }
    // New family: start with a small starter tree
    const starter = starterTree(localeFromRequest(req))
    const saved = await saveTree(treeId, starter, null)
    if (saved.status === 'conflict') return res.status(409).json({ error: 'conflict' })
    res.setHeader(VERSION_HEADER, saved.version)
    return res.status(200).json(starter)
  }

  if (req.method === 'PUT') {
    if (!canEdit(access)) return res.status(403).json({ error: 'read only' })
    const checked = validateStoredTree(req.body)
    if (!checked.ok) return res.status(400).json({ error: 'invalid tree', detail: checked.error })

    const baseVersion = req.headers[VERSION_HEADER]
    if (typeof baseVersion !== 'string' || !baseVersion) {
      return res.status(428).json({ error: 'version required' })
    }

    const current = await loadTree(treeId)
    if (!current) return res.status(404).json({ error: 'not found' })
    if (current.version !== baseVersion) return res.status(409).json({ error: 'conflict' })

    await snapshotBeforeSave(treeId, current.tree, checked.tree, user.id)
    const saved = await saveTree(treeId, checked.tree, baseVersion)
    if (saved.status === 'conflict') return res.status(409).json({ error: 'conflict' })

    res.setHeader(VERSION_HEADER, saved.version)
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, PUT')
  return res.status(405).end()
})
