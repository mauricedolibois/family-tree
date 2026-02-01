// src/components/SelectedMemberProvider.tsx
'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

type SelectedCtx = {
  selectedId: string | null
  openDetails: (id: string) => void
  closeDetails: () => void
  isDetailsOpen: boolean
}

const SelectedMemberContext = createContext({} as SelectedCtx)

export const SelectedMemberProvider = ({ children }: { children: ReactNode }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const isDetailsOpen = !!selectedId

  return (
    <SelectedMemberContext.Provider
      value={{
        selectedId,
        isDetailsOpen,
        openDetails: (id) => setSelectedId(id),
        closeDetails: () => setSelectedId(null),
      }}
    >
      {children}
    </SelectedMemberContext.Provider>
  )
}

export const useSelectedMember = () => useContext(SelectedMemberContext)
