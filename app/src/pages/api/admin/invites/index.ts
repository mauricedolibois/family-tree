// Create an invitation link: for a tree with a role, for admin rights, or both.
// Mailed when an address is given and mail works; the link is returned either way.

import { createInvite, getTree, looksLikeEmail, type Role } from '@/lib/accounts'
import { withAdmin } from '@/lib/auth'
import { mailInvite } from '@/lib/accountMail'
import { treeIdParam } from '@/lib/ids'
import { hashToken, newToken } from '@/lib/tokens'

const MAX_DAYS = 30
const DEFAULT_DAYS = 7

export default withAdmin('api/admin/invites', async (req, res, admin) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }
  const body = (req.body || {}) as {
    email?: unknown
    treeId?: unknown
    role?: unknown
    admin?: unknown
    days?: unknown
  }
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null
  if (email && !looksLikeEmail(email)) return res.status(400).json({ error: 'invalid email' })
  const makeAdmin = body.admin === true
  const familyId = body.treeId ? treeIdParam(String(body.treeId)) : null
  const role: Role | null = familyId ? (body.role === 'viewer' ? 'viewer' : 'editor') : null
  if (body.treeId && !familyId) return res.status(400).json({ error: 'invalid tree' })
  if (!familyId && !makeAdmin) return res.status(400).json({ error: 'nothing to grant' })
  const tree = familyId ? await getTree(familyId) : null
  if (familyId && !tree) return res.status(404).json({ error: 'tree not found' })
  const days = Math.min(Math.max(Math.round(Number(body.days) || DEFAULT_DAYS), 1), MAX_DAYS)

  const token = newToken()
  const invite = await createInvite({
    tokenHash: hashToken(token),
    email,
    familyId,
    role,
    makeAdmin,
    createdBy: admin.id,
    expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
  })
  const path = `/invite/${token}`
  const mailed = email
    ? await mailInvite({ to: email, path, inviter: admin.name, tree: tree?.name ?? null, locale: admin.locale })
    : false
  return res.status(200).json({ id: invite.id, path, mailed })
})
