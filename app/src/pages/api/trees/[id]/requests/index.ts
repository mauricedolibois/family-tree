// What members of a tree ask for (lib/requests.ts). GET: the member's own open
// requests and those they may decide. POST {kind: 'claim', personId}: "that's me",
// to be confirmed by a moderator or a close relative (moderators are linked right
// away). POST {kind: 'access', personId}: another blood line at a person the member
// may not fully edit (locked or details only), for the moderators to decide.

import { linkedPeople, linkPerson } from '@/lib/accounts'
import { canManage, treeMembership, withUser } from '@/lib/auth'
import { loadTree } from '@/lib/db'
import { treeIdParam } from '@/lib/ids'
import { createAccessRequest, createClaim, openAccessRequests, openClaims } from '@/lib/requests'
import { isCloseRelative, requestedLine, scopeSets, viewFor } from '@/family/scope'

export default withUser('api/trees/[id]/requests', async (req, res, user) => {
  const treeId = treeIdParam(req.query.id)
  const membership = treeId ? await treeMembership(user, treeId) : null
  const loaded = treeId && membership ? await loadTree(treeId) : null
  if (!treeId || !membership || !loaded) return res.status(404).json({ error: 'not found' })
  const tree = loaded.tree
  const moderator = canManage(membership.role)
  const nameOf = (id: string) => tree.members[id]?.name ?? '?'

  if (req.method === 'GET') {
    const [claims, access] = await Promise.all([openClaims(treeId), moderator ? openAccessRequests(treeId) : []])
    const mayDecide = (personId: string) =>
      moderator || (!!membership.personId && isCloseRelative(tree, membership.personId, personId))
    const myAccess = moderator ? access.filter((a) => a.userId === user.id) : await openAccessRequests(treeId, user.id)
    return res.status(200).json({
      mine: {
        claim: claims.find((c) => c.userId === user.id) ?? null,
        access: myAccess[0] ?? null,
      },
      claims: claims
        .filter((c) => c.userId !== user.id && mayDecide(c.personId))
        .map((c) => ({ ...c, personName: nameOf(c.personId) })),
      access: access.map((a) => ({ ...a, personName: nameOf(a.line.person) })),
    })
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).end()
  }
  const body = (req.body || {}) as { kind?: unknown; personId?: unknown }
  const personId = typeof body.personId === 'string' ? body.personId : ''
  // Only people the member can see
  if (!viewFor(tree, membership.scope).members[personId]) return res.status(400).json({ error: 'invalid person' })

  if (body.kind === 'claim') {
    if (membership.personId) return res.status(400).json({ error: 'linked already' })
    if ((await linkedPeople(treeId)).has(personId)) return res.status(409).json({ error: 'person taken' })
    if (moderator) {
      if (!(await linkPerson(user.id, treeId, personId, 'moderator'))) {
        return res.status(409).json({ error: 'person taken' })
      }
      return res.status(200).json({ ok: true, linked: true })
    }
    if (!(await createClaim(treeId, user.id, personId))) return res.status(409).json({ error: 'request open' })
    return res.status(200).json({ ok: true, linked: false })
  }

  if (body.kind === 'access') {
    // Asking makes sense only where the member may not change everything
    const sets = membership.scope && scopeSets(tree, membership.scope)
    if (!sets || !(sets.locked.has(personId) || sets.detailsOnly.has(personId))) {
      return res.status(400).json({ error: 'not locked' })
    }
    if (!(await createAccessRequest(treeId, user.id, requestedLine(personId)))) {
      return res.status(409).json({ error: 'request open' })
    }
    return res.status(200).json({ ok: true })
  }

  return res.status(400).json({ error: 'invalid kind' })
})
