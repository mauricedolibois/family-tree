// One member of a tree: PUT {role, scope?} changes the role and the part of the tree
// they are limited to (null: the whole tree; moderators always have the whole tree),
// PUT {personId} who they are in the tree (null: nobody), DELETE removes them.

// Moderators manage everyone in their tree except themselves, so nobody locks
// themselves out by accident; admins can change their own membership too.

import { linkPerson, parseRole, removeMembership, roleIn, setMembership } from '@/lib/accounts'
import { managedTree, withUser } from '@/lib/auth'
import { isUuid } from '@/lib/ids'
import { personInput, scopeInput } from '@/lib/treeScope'

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
    const body = req.body || {}
    const personId = await personInput(body.personId, tree.id)
    if (personId === 'invalid') return res.status(400).json({ error: 'invalid person' })
    if (personId !== undefined) {
      if (!(await linkPerson(memberId, tree.id, personId, 'moderator'))) {
        return res.status(409).json({ error: 'person taken' })
      }
      if (body.role === undefined) return res.status(200).json({ ok: true })
    }
    const role = parseRole(body.role)
    if (!role) return res.status(400).json({ error: 'invalid role' })
    const scope = await scopeInput(body.scope, tree.id)
    if (scope === 'invalid') return res.status(400).json({ error: 'invalid scope' })
    if (scope && role === 'moderator') return res.status(400).json({ error: 'moderators see the whole tree' })
    await setMembership(memberId, tree.id, role, scope)
  } else {
    await removeMembership(memberId, tree.id)
  }
  return res.status(200).json({ ok: true })
})
