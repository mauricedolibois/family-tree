'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

type SelectedCtx = {
  selectedName: string | null
  openDetails: (name: string) => void
  closeDetails: () => void
  isDetailsOpen: boolean
}

const SelectedMemberContext = createContext({} as SelectedCtx)

export const SelectedMemberProvider = ({
  children,
}: {
  children: ReactNode
}) => {
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const isDetailsOpen = !!selectedName

  return (
    <SelectedMemberContext.Provider
      value={{
        selectedName,
        isDetailsOpen,
        openDetails: (name) => setSelectedName(name),
        closeDetails: () => setSelectedName(null),
      }}
    >
      {children}
    </SelectedMemberContext.Provider>
  )
}

export const useSelectedMember = () => useContext(SelectedMemberContext)
