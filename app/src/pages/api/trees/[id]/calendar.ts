// Birthday calendar subscription link of a tree: GET returns it to any member,
// POST issues a new one (editors); the old link stops working. The feed holds every
// birthday of the tree, so members limited to a part of it get neither.

import { getCalendarToken, renewCalendarToken } from '@/lib/db'
import { canEdit, seesWholeTree, treeMembership, withUser } from '@/lib/auth'
import { treeIdParam } from '@/lib/ids'

const icsPath = (token: string) => `/api/kalender/${token}.ics`

export default withUser('api/trees/[id]/calendar', async (req, res, user) => {
  const treeId = treeIdParam(req.query.id)
  const membership = treeId ? await treeMembership(user, treeId) : null
  if (!treeId || !membership) return res.status(404).json({ error: 'not found' })
  if (!seesWholeTree(membership)) return res.status(403).json({ error: 'outside scope' })
  if (req.method === 'GET') return res.status(200).json({ path: icsPath(await getCalendarToken(treeId)) })
  if (req.method === 'POST') {
    // Renewing cuts off everyone else's link: not for members limited to a part
    if (!canEdit(membership.role) || membership.scope) return res.status(403).json({ error: 'read only' })
    return res.status(200).json({ path: icsPath(await renewCalendarToken(treeId)) })
  }
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).end()
})
