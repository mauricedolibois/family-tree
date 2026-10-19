// src/components/app/ViewProvider.tsx
//
// What is on screen: the selected person, the "line of …" or relation view,
// who "me" is (for "Dein Urgroßvater") and jump requests to the tree.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_LINE_SCOPE, type LineScope } from '@/family/model'
import { useFamily } from './FamilyProvider'

/** Relation view: two people, one of them may still be missing */
export type RelationPick = { from: string | null; to: string | null }

type ViewCtx = {
  selectedId: string | null
  select: (id: string | null) => void
  /** Limit the view to this person's line (null = whole family) */
  lineId: string | null
  showLine: (id: string | null) => void
  /** How far the line reaches (generations, collateral lines) */
  lineScope: LineScope
  setLineScope: (scope: LineScope) => void
  /** Show only the path between two people (null = off) */
  relation: RelationPick | null
  showRelation: (pick: RelationPick | null) => void
  /** The person from whose point of view kinship is described */
  meId: string | null
  setMe: (id: string | null) => void
  /** "Upcoming birthdays" panel is open */
  birthdays: boolean
  showBirthdays: (open: boolean) => void
  /** Guided tour is running */
  tourOpen: boolean
  setTourOpen: (open: boolean) => void
  /** PDF export is open */
  exportOpen: boolean
  setExportOpen: (open: boolean) => void
  /** Request for the tree to jump to a person */
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
  const [birthdays, setBirthdays] = useState(false)
  const [lineScope, setLineScopeState] = useState<LineScope>(DEFAULT_LINE_SCOPE)
  const [meId, setMeId] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState<ViewCtx['focusRequest']>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)

  // "Me" is remembered on this device only
  useEffect(() => {
    try {
      const stored = localStorage.getItem(meKey(familyName))
      if (stored) setMeId(stored)
    } catch {
      /* private window or similar: carry on without it */
    }
  }, [familyName])

  // Line scope is per device as well
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(scopeKey) ?? 'null')
      if (stored && typeof stored === 'object' && [0, 1, 2, 3].includes(stored.side)) setLineScopeState(stored)
    } catch {
      /* storage unavailable: ignore */
    }
  }, [])

  const setLineScope = useCallback((scope: LineScope) => {
    setLineScopeState(scope)
    try {
      localStorage.setItem(scopeKey, JSON.stringify(scope))
    } catch {
      /* storage unavailable: ignore */
    }
  }, [])

  const setMe = useCallback(
    (id: string | null) => {
      setMeId(id)
      try {
        if (id) localStorage.setItem(meKey(familyName), id)
        else localStorage.removeItem(meKey(familyName))
      } catch {
        /* storage unavailable: ignore */
      }
    },
    [familyName],
  )

  // Line, relation and birthdays are mutually exclusive; showLine(null) means the whole family
  const showLine = useCallback((id: string | null) => {
    setLineId(id)
    setRelation(null)
    setBirthdays(false)
  }, [])
  const showRelation = useCallback((pick: RelationPick | null) => {
    setRelation(pick)
    if (pick) {
      setLineId(null)
      setBirthdays(false)
    }
  }, [])
  const showBirthdays = useCallback((open: boolean) => {
    setBirthdays(open)
    if (open) {
      setLineId(null)
      setRelation(null)
    }
  }, [])

  const focusOn = useCallback((id: string) => {
    setSelectedId(id)
    setFocusRequest({ id, nonce: Date.now() })
  }, [])

  // Drop the selection when the person was deleted
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
      birthdays,
      showBirthdays,
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
      birthdays,
      showBirthdays,
      exportOpen,
      tourOpen,
      index,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
