// src/components/app/ViewProvider.tsx
//
// Was gerade angezeigt wird: ausgewählte Person, „Linie von …“- oder
// Beziehungsansicht, wer „ich“ bin (für „Dein Urgroßvater“) und
// Sprung-Anfragen an den Baum.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_LINE_SCOPE, type LineScope } from '@/family/model'
import { useFamily } from './FamilyProvider'

/** Beziehungsansicht: zwei Personen, eine davon darf noch fehlen */
export type RelationPick = { from: string | null; to: string | null }

type ViewCtx = {
  selectedId: string | null
  select: (id: string | null) => void
  /** Ansicht auf die Linie dieser Person beschränken (null = ganze Familie) */
  lineId: string | null
  showLine: (id: string | null) => void
  /** Wie weit die Linie reicht (Generationen, Seitenlinien) */
  lineScope: LineScope
  setLineScope: (scope: LineScope) => void
  /** Nur den Weg zwischen zwei Personen zeigen (null = aus) */
  relation: RelationPick | null
  showRelation: (pick: RelationPick | null) => void
  /** Die Person, aus deren Sicht Verwandtschaft beschrieben wird */
  meId: string | null
  setMe: (id: string | null) => void
  /** Einführung läuft */
  tourOpen: boolean
  setTourOpen: (open: boolean) => void
  /** PDF-Export geöffnet */
  exportOpen: boolean
  setExportOpen: (open: boolean) => void
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
const scopeKey = 'stammbaum:linie'

export function ViewProvider({ children }: { children: ReactNode }) {
  const { index, familyName } = useFamily()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [lineId, setLineId] = useState<string | null>(null)
  const [relation, setRelation] = useState<RelationPick | null>(null)
  const [lineScope, setLineScopeState] = useState<LineScope>(DEFAULT_LINE_SCOPE)
  const [meId, setMeId] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState<ViewCtx['focusRequest']>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)

  // „Ich“ wird nur auf diesem Gerät gemerkt
  useEffect(() => {
    try {
      const stored = localStorage.getItem(meKey(familyName))
      if (stored) setMeId(stored)
    } catch {
      /* privates Fenster o. Ä. – dann eben ohne */
    }
  }, [familyName])

  // Umfang der Linie ebenfalls nur auf diesem Gerät
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(scopeKey) ?? 'null')
      if (stored && typeof stored === 'object' && [0, 1, 2, 3].includes(stored.side)) setLineScopeState(stored)
    } catch {
      /* egal */
    }
  }, [])

  const setLineScope = useCallback((scope: LineScope) => {
    setLineScopeState(scope)
    try {
      localStorage.setItem(scopeKey, JSON.stringify(scope))
    } catch {
      /* egal */
    }
  }, [])

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

  // Linie und Beziehung schließen sich aus; showLine(null) heißt „ganze Familie“
  const showLine = useCallback((id: string | null) => {
    setLineId(id)
    setRelation(null)
  }, [])
  const showRelation = useCallback((pick: RelationPick | null) => {
    setRelation(pick)
    if (pick) setLineId(null)
  }, [])

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
      showLine,
      lineScope,
      setLineScope,
      relation: relation && { from: valid(relation.from), to: valid(relation.to) },
      showRelation,
      meId: valid(meId),
      setMe,
      exportOpen,
      setExportOpen,
      tourOpen,
      setTourOpen,
      focusRequest,
      focusOn,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      selectedId,
      lineId,
      lineScope,
      setLineScope,
      relation,
      meId,
      setMe,
      focusRequest,
      focusOn,
      showLine,
      showRelation,
      exportOpen,
      tourOpen,
      index,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
