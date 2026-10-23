// src/lib/pageAuth.ts
// Sign-in checks for getServerSideProps.

import type { IncomingMessage } from 'http'
import type { GetServerSidePropsContext, Redirect } from 'next'
import { parseCookie } from 'cookie'
import { canManage, currentUser, treeAccess, type Access } from './auth'
import { treesOf, type UserRow } from './accounts'
import { treeIdParam } from './ids'
import type { NavContext } from '@/components/app/NavMenu'

/** Only same-site paths, so `next` cannot send people to another site after signing in */
export function safeNext(value: unknown): string | null {
  return typeof value === 'string' && /^\/(?!\/)[^\s\\]*$/.test(value) ? value : null
}

export function loginRedirect(ctx: Pick<GetServerSidePropsContext, 'resolvedUrl'>): { redirect: Redirect } {
  return { redirect: { destination: `/login?next=${encodeURIComponent(ctx.resolvedUrl)}`, permanent: false } }
}

/** The signed-in user, or a redirect to the sign-in page that comes back here afterwards */
export async function requirePageUser(
  ctx: GetServerSidePropsContext,
): Promise<{ user: UserRow; redirect?: undefined } | { user?: undefined; redirect: Redirect }> {
  const user = await currentUser(ctx.req)
  return user ? { user } : loginRedirect(ctx)
}

export const LAST_TREE_COOKIE = 'tree'

/**
 * The tree the user last opened (cookie set by the tree page), if they still have
 * access: pages without a tree of their own (account, administration) lead back to it.
 */
export async function lastTree(
  user: UserRow,
  req: Pick<IncomingMessage, 'headers'>,
): Promise<{ id: string; access: Access } | undefined> {
  const header = req.headers.cookie
  const treeId = treeIdParam(header ? parseCookie(header)[LAST_TREE_COOKIE] : undefined)
  const access = treeId ? await treeAccess(user, treeId) : null
  return treeId && access ? { id: treeId, access } : undefined
}

/** What the menu on a page may offer the user; with a tree for pages that belong to one */
export async function navContext(user: UserRow, tree?: { id: string; access: Access }): Promise<NavContext> {
  const trees = await treesOf(user)
  return {
    isAdmin: user.is_admin,
    treeCount: trees.length,
    ...(tree
      ? {
          tree: {
            id: tree.id,
            name: trees.find((t) => t.id === tree.id)?.name ?? '',
            canManage: canManage(tree.access),
          },
        }
      : {}),
  }
}
