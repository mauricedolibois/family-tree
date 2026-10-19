import type { GetServerSideProps } from 'next'
import Head from 'next/head'
import { serialize } from 'cookie'
import { getTree, treesOf } from '@/lib/accounts'
import { canEdit, treeAccess } from '@/lib/auth'
import { treeIdParam } from '@/lib/ids'
import { LAST_TREE_COOKIE, requirePageUser } from '@/lib/pageAuth'
import { FamilyProvider } from '@/components/app/FamilyProvider'
import { ViewProvider } from '@/components/app/ViewProvider'
import { ToastProvider } from '@/components/app/Toast'
import { TopBar, type Viewer } from '@/components/app/TopBar'
import { TreeCanvas } from '@/components/tree/TreeCanvas'
import { PersonPanel } from '@/components/person/PersonPanel'
import { ExportSheet } from '@/components/print/ExportSheet'
import { Tour } from '@/components/intro/Tour'
import { localeFromRequest } from '@/i18n/server'
import type { Locale } from '@/i18n/locales'
import { useI18n } from '@/i18n/I18nProvider'

type Props = { treeId: string; familyName: string; editable: boolean; viewer: Viewer; locale: Locale }

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const auth = await requirePageUser(ctx)
  if (auth.redirect) return { redirect: auth.redirect }
  const { user } = auth
  const treeId = treeIdParam(ctx.params?.id)
  const access = treeId ? await treeAccess(user, treeId) : null
  const tree = treeId && access ? await getTree(treeId) : null
  // Unknown trees and trees without access look the same
  if (!treeId || !access || !tree) return { notFound: true }

  // Remembered so the start page opens this tree next time
  ctx.res.setHeader(
    'Set-Cookie',
    serialize(LAST_TREE_COOKIE, treeId, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 }),
  )
  const trees = await treesOf(user)
  return {
    props: {
      treeId,
      familyName: tree.name,
      editable: canEdit(access),
      viewer: { name: user.name, isAdmin: user.is_admin, treeCount: trees.length },
      locale: localeFromRequest(ctx.req),
    },
  }
}

export default function TreePage({ treeId, familyName, editable, viewer }: Props) {
  const { t } = useI18n()
  return (
    <>
      <Head>
        <title>{t.app.familyTitle(familyName)}</title>
      </Head>
      <FamilyProvider key={treeId} treeId={treeId} familyName={familyName} canEdit={editable}>
        <ViewProvider>
          <ToastProvider>
            <div className="flex h-dvh flex-col overflow-hidden print:hidden">
              <TopBar viewer={viewer} />
              <main className="relative min-h-0 flex-1">
                <TreeCanvas />
                <PersonPanel />
              </main>
            </div>
            <ExportSheet />
            <Tour />
          </ToastProvider>
        </ViewProvider>
      </FamilyProvider>
    </>
  )
}
