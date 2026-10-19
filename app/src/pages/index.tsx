import type { GetServerSideProps } from 'next'
import Head from 'next/head'
import { getFamilyIdFromReq } from '@/lib/session'
import { getFamilyNameById } from '@/lib/db'
import { localeFromRequest } from '@/i18n/server'
import type { Locale } from '@/i18n/locales'
import { useI18n } from '@/i18n/I18nProvider'
import { MESSAGES } from '@/i18n/messages'
import { FamilyProvider } from '@/components/app/FamilyProvider'
import { ViewProvider } from '@/components/app/ViewProvider'
import { ToastProvider } from '@/components/app/Toast'
import { TopBar } from '@/components/app/TopBar'
import { TreeCanvas } from '@/components/tree/TreeCanvas'
import { PersonPanel } from '@/components/person/PersonPanel'
import { ExportSheet } from '@/components/print/ExportSheet'
import { Tour } from '@/components/intro/Tour'

type Props = { familyName: string; locale: Locale }

export const getServerSideProps: GetServerSideProps<Props> = async ({ req }) => {
  const fid = getFamilyIdFromReq(req)
  const locale = localeFromRequest(req)
  // A failed lookup must not redirect: /auth would send a signed-in visitor straight back
  const familyName = fid ? await getFamilyNameById(fid).catch(() => MESSAGES[locale].app.familyFallback) : null
  if (!fid || !familyName) {
    return { redirect: { destination: '/auth', permanent: false } }
  }
  return { props: { familyName, locale } }
}

export default function Home({ familyName }: Props) {
  const { t } = useI18n()
  return (
    <>
      <Head>
        <title>{t.app.familyTitle(familyName)}</title>
      </Head>
      <FamilyProvider familyName={familyName}>
        <ViewProvider>
          <ToastProvider>
            <div className="flex h-dvh flex-col overflow-hidden print:hidden">
              <TopBar />
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
