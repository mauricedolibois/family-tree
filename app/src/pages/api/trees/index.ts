// Trees the signed-in user can open

import { treesOf } from '@/lib/accounts'
import { withUser } from '@/lib/auth'

export default withUser('api/trees', async (req, res, user) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end()
  }
  return res.status(200).json({ trees: await treesOf(user) })
})
