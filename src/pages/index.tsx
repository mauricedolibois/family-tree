import type { GetServerSideProps } from 'next'
import Head from 'next/head'
import { getFamilyIdFromReq } from '@/lib/session'
import { getFamilyNameById } from '@/lib/db'
import { FamilyProvider } from '@/components/app/FamilyProvider'
import { ViewProvider } from '@/components/app/ViewProvider'
import { ToastProvider } from '@/components/app/Toast'
import { TopBar } from '@/components/app/TopBar'
import { TreeCanvas } from '@/components/tree/TreeCanvas'
import { PersonPanel } from '@/components/person/PersonPanel'
import { ExportSheet } from '@/components/print/ExportSheet'
import { Tour } from '@/components/intro/Tour'

type Props = { familyName: string }

export const getServerSideProps: GetServerSideProps<Props> = async ({ req }) => {
  const fid = getFamilyIdFromReq(req)
  const familyName = fid ? await getFamilyNameById(fid).catch(() => 'Familie') : null
  if (!fid || !familyName) {
    return { redirect: { destination: '/auth', permanent: false } }
  }
  return { props: { familyName } }
}

export default function Home({ familyName }: Props) {
  return (
    <>
      <Head>
        <title>{`Stammbaum ${familyName}`}</title>
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
