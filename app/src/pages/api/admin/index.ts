// Everything the admin page shows: users with their trees, trees, open invitations

import { listDeletedTrees, listOpenInvites, listTrees, listUsers } from '@/lib/accounts'
import { withAdmin } from '@/lib/auth'
import { canSendMail } from '@/lib/mail'
import { schemaStatus } from '@/lib/schema'
import { serviceKeyFromExample } from '@/lib/supabaseServer'

export default withAdmin('api/admin', async (req, res, admin) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end()
  }
  const [users, trees, trash, invites, schema] = await Promise.all([
    listUsers(),
    listTrees(),
    listDeletedTrees(),
    listOpenInvites(),
    schemaStatus(),
  ])
  return res.status(200).json({
    me: admin.id,
    mail: canSendMail(),
    exampleSecret: serviceKeyFromExample(),
    // Admins can only get here with a database that has accounts, so never 'missing'
    schema: schema.state === 'outdated' ? { have: schema.have, need: schema.need } : null,
    users,
    trees,
    trash,
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      treeId: i.tree_id,
      tree: i.tree_name,
      role: i.role,
      admin: i.make_admin,
      inviter: i.inviter_name,
      expiresAt: i.expires_at,
    })),
  })
})
