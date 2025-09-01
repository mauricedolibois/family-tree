// src/pages/index.tsx
import Drawer from '@/components/Drawer'
import FamilyTree from '@/components/FamilyTree'
import MotherOfGirls from '@/components/MotherOfGirls'
import SearchMember from '@/components/SearchMember'
import SearchRelationship from '@/components/SearchRelationship'
import { Button } from '@zendeskgarden/react-buttons'
import { Poppins } from 'next/font/google'
import { useState } from 'react'
import type { GetServerSideProps } from 'next'
import * as cookie from 'cookie'
import { useRouter } from 'next/router'
import { getFamilyNameById } from '@/lib/accounts'
import MemberDetailsModal from '@/components/memberDetails/MemberDetailsModal'

const poppins = Poppins({ subsets: ['latin'], weight: '300' })

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
  const router = useRouter()

  const showDrawer = () => setIsOpen(true)
  const closeDrawer = () => setIsOpen(false)

  const logout = async () => {
  await fetch('/api/auth/logout', { method: 'POST' })
  // harter Reload, damit alter State + Cookies weg sind
  window.location.href = '/auth'
}

  return (
    <main
      className={`bg-white flex min-h-screen flex-col items-center justify-start p-2 ${poppins.className} text-center`}
    >
      {/* Header mit Familiennamen und Logout */}
      <div className="w-full flex justify-between items-center mb-10">
        <h1 className="text-4xl m-0 font-medium text-slate-700">
          Stammbaum {familyName}
        </h1>
        <Button
        isBasic
        onClick={showDrawer}
        title="Search family members"
        aria-label="Search family members"
      >
        Search family members
      </Button>
        <Button isBasic onClick={logout}>
          Logout
        </Button>
      </div>

      

      <FamilyTree />
      <MemberDetailsModal />
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
