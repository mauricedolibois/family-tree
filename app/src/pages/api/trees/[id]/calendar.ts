// Birthday calendar subscription link of a tree: GET returns it to any member,
// POST issues a new one (editors and admins); the old link stops working.

import { getCalendarToken, renewCalendarToken } from '@/lib/db'
import { canEdit, treeAccess, withUser } from '@/lib/auth'
import { treeIdParam } from '@/lib/ids'

const icsPath = (token: string) => `/api/kalender/${token}.ics`

export default withUser('api/trees/[id]/calendar', async (req, res, user) => {
  const treeId = treeIdParam(req.query.id)
  const access = treeId ? await treeAccess(user, treeId) : null
  if (!treeId || !access) return res.status(404).json({ error: 'not found' })
  if (req.method === 'GET') return res.status(200).json({ path: icsPath(await getCalendarToken(treeId)) })
  if (req.method === 'POST') {
    if (!canEdit(access)) return res.status(403).json({ error: 'read only' })
    return res.status(200).json({ path: icsPath(await renewCalendarToken(treeId)) })
  }
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).end()
})
