import type { GetServerSideProps } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { Eye } from 'lucide-react'
import { stringifySetCookie } from 'cookie'
import { getTree, getUser, membershipIn, treesOf } from '@/lib/accounts'
import { canEdit, canManage, treeAccess } from '@/lib/auth'
import { treeIdParam } from '@/lib/ids'
import { LAST_TREE_COOKIE, requirePageUser } from '@/lib/pageAuth'
import { FamilyProvider } from '@/components/app/FamilyProvider'
import { ViewProvider } from '@/components/app/ViewProvider'
import { RequestsProvider } from '@/components/app/RequestsProvider'
import { RequestsBanner } from '@/components/app/RequestsBanner'
import { ToastProvider } from '@/components/app/Toast'
import { TopBar, type Viewer } from '@/components/app/TopBar'
import { TreeCanvas } from '@/components/tree/TreeCanvas'
import { PersonPanel } from '@/components/person/PersonPanel'
import { ExportSheet } from '@/components/print/ExportSheet'
import { Tour } from '@/components/intro/Tour'
import { localeFromRequest } from '@/i18n/server'
import type { Locale } from '@/i18n/locales'
import { useI18n } from '@/i18n/I18nProvider'

/** A moderator looking at the tree as one of its members sees it */
type PreviewAs = { id: string; name: string }

type Props = {
  treeId: string
  familyName: string
  editable: boolean
  viewer: Viewer
  previewAs: PreviewAs | null
  locale: Locale
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const auth = await requirePageUser(ctx)
  if (auth.redirect) return { redirect: auth.redirect }
  const { user } = auth
  const treeId = treeIdParam(ctx.params?.id)
  const access = treeId ? await treeAccess(user, treeId) : null
  const tree = treeId && access ? await getTree(treeId) : null
  // Unknown, deleted and inaccessible trees look the same: back to the start page
  if (!treeId || !access || !tree) return { redirect: { destination: '/?gone=1', permanent: false } }

  // Remembered so the start page opens this tree next time
  ctx.res.setHeader(
    'Set-Cookie',
    stringifySetCookie({
      name: LAST_TREE_COOKIE,
      value: treeId,
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    }),
  )
  // ?as=<user id>: only moderators, only for members of this tree
  const asId = typeof ctx.query.as === 'string' ? ctx.query.as : null
  const target = asId && canManage(access) && (await membershipIn(asId, treeId)) ? await getUser(asId) : null
  const trees = await treesOf(user)
  return {
    props: {
      treeId,
      familyName: tree.name,
      editable: canEdit(access),
      viewer: { name: user.name, isAdmin: user.is_admin, treeCount: trees.length, canManage: canManage(access) },
      previewAs: target ? { id: target.id, name: target.name } : null,
      locale: localeFromRequest(ctx.req),
    },
  }
}

export default function TreePage({ treeId, familyName, editable, viewer, previewAs }: Props) {
  const { t } = useI18n()
  return (
    <>
      <Head>
        <title>{t.app.familyTitle(familyName)}</title>
      </Head>
      <FamilyProvider
        key={`${treeId}:${previewAs?.id ?? ''}`}
        treeId={treeId}
        familyName={familyName}
        canEdit={editable}
        canManage={viewer.canManage}
        previewAs={previewAs?.id ?? null}
      >
        <RequestsProvider>
          <ViewProvider>
            <ToastProvider>
              <div className="flex h-dvh flex-col overflow-hidden print:hidden">
                <TopBar viewer={viewer} />
                {previewAs && <PreviewBanner treeId={treeId} name={previewAs.name} />}
                {!previewAs && <RequestsBanner />}
                <main className="relative min-h-0 flex-1">
                  <TreeCanvas />
                  <PersonPanel />
                </main>
              </div>
              <ExportSheet />
              {!previewAs && <Tour />}
            </ToastProvider>
          </ViewProvider>
        </RequestsProvider>
      </FamilyProvider>
    </>
  )
}

/** Shown while a moderator looks at the tree as a member: nothing can be saved */
function PreviewBanner({ treeId, name }: { treeId: string; name: string }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-frame/60 bg-accent-soft px-4 py-2 text-[15px] text-ink">
      <Eye className="h-4 w-4 shrink-0 text-accent-deep" />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{t.family.previewAs(name)}</span>{' '}
        <span className="text-ink-muted">{t.family.previewHint}</span>
      </span>
      <Link href={`/tree/${treeId}/members`} className="font-semibold text-accent-deep underline">
        {t.family.previewBack}
      </Link>
    </div>
  )
}
