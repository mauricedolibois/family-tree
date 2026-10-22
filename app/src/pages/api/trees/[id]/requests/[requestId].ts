// Deciding a request (lib/requests.ts): PUT {kind: 'claim' | 'access', approve}.
// A claim ("that's me") is decided by a moderator or by a member whose confirmed
// person is a parent, child, sibling or spouse of the claimed person; never by the
// member who asked. Access requests are for moderators: approving adds the asked
// line to the member's part.

import { linkedPeople, linkPerson, membershipIn, setMembership } from '@/lib/accounts'
import { canManage, treeMembership, withUser } from '@/lib/auth'
import { loadTree } from '@/lib/db'
import { isUuid, treeIdParam } from '@/lib/ids'
import { decide, openAccessRequests, openClaims } from '@/lib/requests'
import { isCloseRelative, parseScope, withLine } from '@/family/scope'

export default withUser('api/trees/[id]/requests/[requestId]', async (req, res, user) => {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT')
    return res.status(405).end()
  }
  const treeId = treeIdParam(req.query.id)
  const requestId = req.query.requestId
  const membership = treeId ? await treeMembership(user, treeId) : null
  const loaded = treeId && membership ? await loadTree(treeId) : null
  if (!treeId || !membership || !loaded || !isUuid(requestId)) return res.status(404).json({ error: 'not found' })
  const moderator = canManage(membership.role)
  const body = (req.body || {}) as { kind?: unknown; approve?: unknown }
  const approve = body.approve === true

  if (body.kind === 'claim') {
    const claim = (await openClaims(treeId)).find((c) => c.id === requestId)
    if (!claim) return res.status(404).json({ error: 'not found' })
    const relative = !!membership.personId && isCloseRelative(loaded.tree, membership.personId, claim.personId)
    if (claim.userId === user.id || !(moderator || relative)) return res.status(403).json({ error: 'forbidden' })
    if (approve && (await linkedPeople(treeId)).has(claim.personId)) {
      return res.status(409).json({ error: 'person taken' })
    }
    // Decided first: of two members deciding at once only one gets through, so a
    // rejection is never followed by a link. The unique index still guards the person.
    if (!(await decide('person_claims', claim.id, treeId, user.id, approve))) {
      return res.status(409).json({ error: 'decided already' })
    }
    if (approve && !(await linkPerson(claim.userId, treeId, claim.personId, moderator ? 'moderator' : 'relative'))) {
      return res.status(409).json({ error: 'person taken' })
    }
    return res.status(200).json({ ok: true })
  }

  if (body.kind === 'access') {
    if (!moderator) return res.status(403).json({ error: 'forbidden' })
    const request = (await openAccessRequests(treeId)).find((r) => r.id === requestId)
    if (!request) return res.status(404).json({ error: 'not found' })
    // Decided first, as for claims: only the member who decided widens the part
    if (!(await decide('access_requests', request.id, treeId, user.id, approve))) {
      return res.status(409).json({ error: 'decided already' })
    }
    if (approve) {
      const member = await membershipIn(request.userId, treeId)
      const line = parseScope({ lines: [request.line] })?.lines[0]
      // Someone who has the whole tree meanwhile needs no line
      if (member?.scope && line) {
        await setMembership(request.userId, treeId, member.role, withLine(member.scope, line))
      }
    }
    return res.status(200).json({ ok: true })
  }

  return res.status(400).json({ error: 'invalid kind' })
})
