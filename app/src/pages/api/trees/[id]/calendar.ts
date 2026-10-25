// Birthday calendar subscription link of a tree: GET returns it to any member,
// POST issues a new one (editors); the old link stops working. The tree's feed holds
// every birthday, so members whose part hides the rest get a link of their own
// instead, whose feed shows only what they see; they may renew that one.

import { getCalendarToken, getMemberCalendarToken, renewCalendarToken, renewMemberCalendarToken } from '@/lib/db'
import { canEdit, seesWholeTree, treeMembership, withUser } from '@/lib/auth'
import { treeIdParam } from '@/lib/ids'

const icsPath = (token: string) => `/api/kalender/${token}.ics`

export default withUser('api/trees/[id]/calendar', async (req, res, user) => {
  const treeId = treeIdParam(req.query.id)
  const membership = treeId ? await treeMembership(user, treeId) : null
  if (!treeId || !membership) return res.status(404).json({ error: 'not found' })
  // Members whose part hides the rest have a link of their own
  const own = !seesWholeTree(membership)
  if (req.method === 'GET') {
    const token = own ? await getMemberCalendarToken(user.id, treeId) : await getCalendarToken(treeId)
    return res.status(200).json({ path: icsPath(token) })
  }
  if (req.method === 'POST') {
    // Renewing their own link cuts off nobody else
    if (own) return res.status(200).json({ path: icsPath(await renewMemberCalendarToken(user.id, treeId)) })
    // Renewing the tree's link cuts off everyone else's: not for members limited to a part
    if (!canEdit(membership.role) || membership.scope) return res.status(403).json({ error: 'read only' })
    return res.status(200).json({ path: icsPath(await renewCalendarToken(treeId)) })
  }
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).end()
})
