// src/components/app/ViewProvider.tsx
//
// Was gerade angezeigt wird: ausgewählte Person, „Linie von …“-Ansicht,
// wer „ich“ bin (für „Dein Urgroßvater“) und Sprung-Anfragen an den Baum.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useFamily } from './FamilyProvider'

type ViewCtx = {
  selectedId: string | null
  select: (id: string | null) => void
  /** Ansicht auf die Linie dieser Person beschränken (null = ganze Familie) */
  lineId: string | null
  showLine: (id: string | null) => void
  /** Die Person, aus deren Sicht Verwandtschaft beschrieben wird */
  meId: string | null
  setMe: (id: string | null) => void
  /** Bitte an den Baum, zu einer Person zu springen */
  focusRequest: { id: string; nonce: number } | null
  focusOn: (id: string) => void
}

const Ctx = createContext<ViewCtx | null>(null)

export function useView(): ViewCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useView außerhalb von ViewProvider')
  return ctx
}

const meKey = (family: string) => `stammbaum:ich:${family}`

export function ViewProvider({ children }: { children: ReactNode }) {
  const { index, familyName } = useFamily()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [lineId, setLineId] = useState<string | null>(null)
  const [meId, setMeId] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState<ViewCtx['focusRequest']>(null)

  // „Ich“ wird nur auf diesem Gerät gemerkt
  useEffect(() => {
    try {
      const stored = localStorage.getItem(meKey(familyName))
      if (stored) setMeId(stored)
    } catch {
      /* privates Fenster o. Ä. – dann eben ohne */
    }
  }, [familyName])

  const setMe = useCallback(
    (id: string | null) => {
      setMeId(id)
      try {
        if (id) localStorage.setItem(meKey(familyName), id)
        else localStorage.removeItem(meKey(familyName))
      } catch {
        /* egal */
      }
    },
    [familyName],
  )

  const focusOn = useCallback((id: string) => {
    setSelectedId(id)
    setFocusRequest({ id, nonce: Date.now() })
  }, [])

  // Gelöschte Personen nicht weiter auswählen
  const valid = (id: string | null) => (id && index.byId.has(id) ? id : null)

  const value = useMemo<ViewCtx>(
    () => ({
      selectedId: valid(selectedId),
      select: setSelectedId,
      lineId: valid(lineId),
      showLine: setLineId,
      meId: valid(meId),
      setMe,
      focusRequest,
      focusOn,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, lineId, meId, setMe, focusRequest, focusOn, index],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
