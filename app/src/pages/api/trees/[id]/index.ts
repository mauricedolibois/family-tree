// Contents of one tree. Members read it; editors save it. Members limited to a part
// of the tree (family/scope.ts) read only that part if the rest is hidden, and their
// saves change only their part.

import { canEdit, treeMembership, withUser } from '@/lib/auth'
import { treeIdParam } from '@/lib/ids'
import { loadTree, saveTree, snapshotBeforeSave } from '@/lib/db'
import { starterTree } from '@/family/edit'
import { encodeScope, mergeScopedSave, TREE_SCOPE_HEADER, viewFor } from '@/family/scope'
import { localeFromRequest } from '@/i18n/server'
import { validateStoredTree } from '@/storage/validate'
import { TREE_VERSION_HEADER as VERSION_HEADER } from '@/storage/version'

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } }

export default withUser('api/trees/[id]', async (req, res, user) => {
  const treeId = treeIdParam(req.query.id)
  const membership = treeId ? await treeMembership(user, treeId) : null
  // Same answer for trees that do not exist and trees one may not see
  if (!treeId || !membership) return res.status(404).json({ error: 'not found' })
  const { role: access, scope } = membership
  res.setHeader('X-Tree-Access', access)
  if (scope) res.setHeader(TREE_SCOPE_HEADER, encodeScope(scope))

  if (req.method === 'GET') {
    const loaded = await loadTree(treeId)
    if (loaded) {
      // The start person of a hidden-rest part was removed: nothing left to show
      if (scope?.hideRest && !loaded.tree.members[scope.person]) {
        return res.status(403).json({ error: 'scope gone' })
      }
      res.setHeader(VERSION_HEADER, loaded.version)
      return res.status(200).json(viewFor(loaded.tree, scope))
    }
    // New family: start with a small starter tree
    if (scope) return res.status(403).json({ error: 'scope gone' })
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

    let next = checked.tree
    if (scope) {
      // Everything outside the member's part comes from the stored tree, compared in
      // the same cleaned-up form as what was sent (older entries may lack empty fields)
      const stored = validateStoredTree(current.tree)
      const merged = mergeScopedSave(stored.ok ? stored.tree : current.tree, checked.tree, scope)
      if (!merged.ok) return res.status(403).json({ error: merged.error, detail: merged.detail })
      const valid = validateStoredTree(merged.tree)
      if (!valid.ok) return res.status(400).json({ error: 'invalid tree', detail: valid.error })
      next = valid.tree
    }

    await snapshotBeforeSave(treeId, current.tree, next, user.id)
    const saved = await saveTree(treeId, next, baseVersion)
    if (saved.status === 'conflict') return res.status(409).json({ error: 'conflict' })

    res.setHeader(VERSION_HEADER, saved.version)
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, PUT')
  return res.status(405).end()
})
