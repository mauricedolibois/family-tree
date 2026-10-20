// src/lib/auth.ts
// Who is asking, and what may they do with a tree?

import type { IncomingMessage } from 'http'
import type { NextApiRequest, NextApiResponse } from 'next'
import { getTree, getUser, roleIn, type Role, type UserRow } from './accounts'
import { treeIdParam } from './ids'
import { sessionFromReq } from './session'
import { logError } from './log'

/** Signed-in user from the session cookie; null for missing, forged, outdated or disabled sessions */
export async function currentUser(req: Pick<IncomingMessage, 'headers'>): Promise<UserRow | null> {
  const session = sessionFromReq(req)
  if (!session) return null
  const user = await getUser(session.uid)
  if (!user || user.disabled_at || user.session_epoch !== session.epoch) return null
  return user
}

/** What someone may do in a tree: their role there */
export type Access = Role

/**
 * Access to a tree comes only from a membership, for admins too: admin rights are
 * about running the server (accounts, trees, invitations), and everyone who can
 * read a tree appears in its member list. Nobody has access to a tree that does
 * not exist or is in the trash, so its contents, photos and calendar are gone for
 * everyone at once.
 */
export async function treeAccess(user: Pick<UserRow, 'id'>, treeId: string): Promise<Access | null> {
  if (!(await getTree(treeId))) return null
  return roleIn(user.id, treeId)
}

export const canEdit = (access: Access | null) => access === 'moderator' || access === 'editor'

/** Invite people to the tree and manage its members */
export const canManage = (access: Access | null) => access === 'moderator'

type Handler<T> = (req: NextApiRequest, res: NextApiResponse, user: UserRow) => Promise<T> | T

/** API route for signed-in users only; unexpected errors become a logged 500 */
export function withUser<T>(name: string, handler: Handler<T>) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      const user = await currentUser(req)
      if (!user) return res.status(401).json({ error: 'unauthorized' })
      return await handler(req, res, user)
    } catch (err) {
      logError(name, err)
      if (!res.headersSent) res.status(500).json({ error: 'internal error' })
    }
  }
}

/** Like withUser, but for admins only */
export function withAdmin<T>(name: string, handler: Handler<T>) {
  return withUser(name, (req, res, user) => {
    if (!user.is_admin) return res.status(403).json({ error: 'forbidden' })
    return handler(req, res, user)
  })
}

/** First value of a query parameter */
export const queryParam = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value

/**
 * For the member management routes of one tree (/api/trees/[id]/...): the tree if
 * the user is one of its moderators or an admin. Otherwise answers the request
 * (404 without access, as for trees that do not exist; 403 for other members)
 * and returns null.
 */
export async function managedTree(
  req: NextApiRequest,
  res: NextApiResponse,
  user: UserRow,
): Promise<{ id: string; name: string; access: Access } | null> {
  const treeId = treeIdParam(req.query.id)
  const access = treeId ? await treeAccess(user, treeId) : null
  const tree = treeId && access ? await getTree(treeId) : null
  if (!tree || !access) {
    res.status(404).json({ error: 'not found' })
    return null
  }
  if (!canManage(access)) {
    res.status(403).json({ error: 'forbidden' })
    return null
  }
  return { ...tree, access }
}
