// Contents of one tree. Members read it; editors save it. Members limited to a part
// of the tree (family/scope.ts) read only that part if the rest is hidden, along with
// the people of their part that are locked, and their saves change only their part.
// Moderators can read the tree as a member gets it (?as=<user id>), never save so.
// People linked to an account are protected: only moderators delete them, which
// also drops the link.

import { linkedPeople, membershipIn } from '@/lib/accounts'
import { forgetMissingPeople } from '@/lib/requests'
import { canEdit, canManage, treeMembership, withUser } from '@/lib/auth'
import { treeIdParam } from '@/lib/ids'
import { loadTree, saveTree, snapshotBeforeSave } from '@/lib/db'
import { starterTree } from '@/family/edit'
import {
  encodeScope,
  mergeScopedSave,
  scopeSets,
  startOf,
  TREE_ME_HEADER,
  TREE_PREVIEW_HEADER,
  TREE_SCOPE_HEADER,
  viewFor,
} from '@/family/scope'
import { localeFromRequest } from '@/i18n/server'
import { validateStoredTree } from '@/storage/validate'
import { TREE_VERSION_HEADER as VERSION_HEADER } from '@/storage/version'

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } }

export default withUser('api/trees/[id]', async (req, res, user) => {
  const treeId = treeIdParam(req.query.id)
  const own = treeId ? await treeMembership(user, treeId) : null
  // Same answer for trees that do not exist and trees one may not see
  if (!treeId || !own) return res.status(404).json({ error: 'not found' })

  // Moderators can look at the tree as one of its members sees it ("view as"): read only
  const as = typeof req.query.as === 'string' ? req.query.as : null
  if (as && (req.method !== 'GET' || !canManage(own.role))) return res.status(403).json({ error: 'forbidden' })
  const membership = as ? await membershipIn(as, treeId) : own
  if (!membership) return res.status(404).json({ error: 'not found' })
  if (as) res.setHeader(TREE_PREVIEW_HEADER, '1')

  const { role: access, scope, personId } = membership
  res.setHeader('X-Tree-Access', access)
  if (scope) res.setHeader(TREE_SCOPE_HEADER, encodeScope(scope))
  if (personId) res.setHeader(TREE_ME_HEADER, encodeURIComponent(personId))

  if (req.method === 'GET') {
    const loaded = await loadTree(treeId)
    if (loaded) {
      // The start person of a hidden-rest part was removed: nothing left to show
      if (scope?.hideRest && !loaded.tree.members[startOf(scope)]) {
        return res.status(403).json({ error: 'scope gone' })
      }
      res.setHeader(VERSION_HEADER, loaded.version)
      // Sent along and dropped again on saving: who is locked shows only in the whole
      // tree, and which people have an account only the server knows
      const view = viewFor(loaded.tree, scope)
      const sets = scope ? scopeSets(loaded.tree, scope) : null
      const linkedIds = [...(await linkedPeople(treeId)).keys()].filter((id) => view.members[id])
      return res.status(200).json({
        ...view,
        lockedIds: [...(sets?.locked ?? [])],
        detailsOnlyIds: [...(sets?.detailsOnly ?? [])],
        linkedIds,
      })
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

    // Someone with an account is removed only by a moderator
    const linked = await linkedPeople(treeId)
    const removedLinked = [...linked.keys()].some((id) => current.tree.members[id] && !next.members[id])
    if (removedLinked && !canManage(access)) return res.status(403).json({ error: 'linked person' })

    await snapshotBeforeSave(treeId, current.tree, next, user.id)
    const saved = await saveTree(treeId, next, baseVersion)
    if (saved.status === 'conflict') return res.status(409).json({ error: 'conflict' })
    if (Object.keys(current.tree.members).some((id) => !next.members[id])) await forgetMissingPeople(treeId, next)

    res.setHeader(VERSION_HEADER, saved.version)
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, PUT')
  return res.status(405).end()
})
