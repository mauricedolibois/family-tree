// Create a tree. It starts with the usual three placeholder people.

import { createTree } from '@/lib/accounts'
import { withAdmin } from '@/lib/auth'
import { cleanName } from '@/lib/passwords'
import { starterTree } from '@/family/edit'
import { localeFromRequest } from '@/i18n/server'

export default withAdmin('api/admin/trees', async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }
  const name = cleanName((req.body || {}).name)
  if (!name) return res.status(400).json({ error: 'invalid name' })
  const tree = await createTree(name, starterTree(localeFromRequest(req)))
  return res.status(200).json({ tree })
})
