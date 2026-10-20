// Create a tree. It starts with the usual three placeholder people, and whoever
// creates it becomes its moderator (they can step out once others run it).

import { createTree, setMembership } from '@/lib/accounts'
import { withAdmin } from '@/lib/auth'
import { cleanName } from '@/lib/passwords'
import { starterTree } from '@/family/edit'
import { localeFromRequest } from '@/i18n/server'

export default withAdmin('api/admin/trees', async (req, res, admin) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }
  const name = cleanName((req.body || {}).name)
  if (!name) return res.status(400).json({ error: 'invalid name' })
  const tree = await createTree(name, starterTree(localeFromRequest(req)))
  await setMembership(admin.id, tree.id, 'moderator')
  return res.status(200).json({ tree })
})
