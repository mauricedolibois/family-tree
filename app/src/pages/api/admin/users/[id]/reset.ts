// Password reset link for an account, mailed if possible and returned to the admin

import { getUser } from '@/lib/accounts'
import { issueReset } from '@/lib/accountMail'
import { withAdmin } from '@/lib/auth'
import { isUuid } from '@/lib/ids'

export default withAdmin('api/admin/users/[id]/reset', async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }
  if (!isUuid(req.query.id)) return res.status(400).json({ error: 'invalid id' })
  const user = await getUser(req.query.id)
  if (!user) return res.status(404).json({ error: 'not found' })
  return res.status(200).json(await issueReset(user))
})
