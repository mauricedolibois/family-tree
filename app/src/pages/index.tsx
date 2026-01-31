import Drawer from '@/components/Drawer'
import FamilyTree from '@/components/FamilyTree'
import MotherOfGirls from '@/components/MotherOfGirls'
import SearchMember from '@/components/SearchMember'
import SearchRelationship from '@/components/SearchRelationship'
import MemberDetailsModal from '@/components/memberDetails/MemberDetailsModal'
import { Poppins } from 'next/font/google'
import { useState } from 'react'
import type { GetServerSideProps } from 'next'
import * as cookie from 'cookie'
import { getFamilyNameById } from '@/lib/accounts'
import { Search, LogOut } from 'lucide-react'

const poppins = Poppins({ subsets: ['latin'], weight: '400' })

type Props = { familyName: string }

export const getServerSideProps: GetServerSideProps<Props> = async ({ req }) => {
  const parsed = cookie.parse(req.headers.cookie || '')
  const fid = parsed.fid
  if (!fid) {
    return {
      redirect: { destination: '/auth', permanent: false },
    }
  }

  const familyName = (await getFamilyNameById(fid)) ?? 'Unbekannt'
  return { props: { familyName } }
}

export default function Home({ familyName }: Props) {
  const [isOpen, setIsOpen] = useState(false)

  const showDrawer = () => setIsOpen(true)
  const closeDrawer = () => setIsOpen(false)

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/auth'
  }

  return (
    <main
      className={`bg-[color:var(--color-surface-100)] flex min-h-screen flex-col items-center justify-start ${poppins.className}`}
    >
      {/* Topbar */}
      <header className="fixed top-0 left-0 w-full z-50 bg-[color:var(--color-primary)] text-white shadow-md">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3">
          {/* Titel links */}
          <h1 className="text-lg sm:text-2xl font-medium">
            Stammbaum {familyName}
          </h1>

          {/* Rechts: Search + Logout */}
          <div className="flex items-center gap-3">
            <button
              onClick={showDrawer}
              className="flex items-center gap-2 bg-white text-[color:var(--color-primary)] rounded-full px-3 sm:px-4 py-1 text-sm sm:text-base font-medium hover:bg-[color:var(--color-surface-50)] transition"
              title="Mitglieder suchen"
              aria-label="Mitglieder suchen"
            >
              <Search className="h-6 w-6" />
              <span className="hidden sm:inline">Suchen</span>
            </button>

            <button
              onClick={logout}
              className="flex items-center gap-2 border border-red-500 text-red-500 rounded-full px-3 sm:px-4 py-1 text-sm sm:text-base hover:bg-red-500 hover:text-white transition"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="h-6 w-6" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>
{/* Content füllt den Screen unter der Topbar */}
<div className="w-full flex-1">
  <div className="w-full h-[calc(100vh-64px)]">
    <FamilyTree />
  </div>
  <MemberDetailsModal />
</div>
      {/* Drawer für Suche etc. */}
      <Drawer isOpen={isOpen} onClose={closeDrawer}>
        <div className="flex flex-col gap-8">
          <SearchRelationship />
          <span className="w-full mr-4 h-[0.5px] bg-gray-300"></span>
          <SearchMember />
          <span className="w-full mr-4 h-[0.5px] bg-gray-300"></span>
          <MotherOfGirls />
        </div>
      </Drawer>
    </main>
  )
}
