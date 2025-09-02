'use client'

import React, {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { FamilyTree } from '@/models/FamilyTree'
import { IMember } from '@/types/IMember'
import { buildTreeFromStored } from '@/storage/rebuild'
import { StoredTree, serializeFromRoot } from '@/storage/schema'
import { setupShanFamilyTree } from '@/utils'
import { serializeTagged } from '@/debug/serializeTagged'

interface Ctx {
  root: IMember
  familyTree: FamilyTree
  setFamilyTree: (tree: FamilyTree) => void
  memberNames?: string[]
  isLoaded: boolean
  error?: string | null
  isAuthed: boolean
  applyStored: (stored: StoredTree) => void
  storedSnapshot?: StoredTree
}

const FamilyTreeContext = createContext({} as Ctx)

export const FamilyTreeProvider = ({ children }: { children: ReactNode }) => {
  const [familyTree, setFamilyTree] = useState<FamilyTree | null>(null)
  const [storedSnapshot, setStoredSnapshot] = useState<StoredTree | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAuthed, setIsAuthed] = useState<boolean>(true)

  // Guards gegen späte Responses & Persist-Races
  const loadReqIdRef = useRef(0)      // zählt GET-Requests
  const mutateEpochRef = useRef(0)    // zählt lokale applyStored()-Mutationen
  const persistIdRef = useRef(0)      // zählt laufende Persist-Operationen

  /** WICHTIG: lokal anwenden + Mutations-Epoch erhöhen */
  const applyStored = (stored: StoredTree) => {
    mutateEpochRef.current += 1
    const ft = buildTreeFromStored(stored)
    setFamilyTree(ft)
    setStoredSnapshot(stored)
  }

  /* -------- Initial GET (StrictMode-sicher) -------- */
  useEffect(() => {
    const myReqId = ++loadReqIdRef.current
    let aborted = false

    ;(async () => {
      try {
        const res = await fetch('/api/family', { cache: 'no-store' })
        if (aborted) return
        // Nur neueste Antwort akzeptieren
        if (myReqId !== loadReqIdRef.current) return

        if (res.status === 401) {
          setIsAuthed(false)
          setError('UNAUTHORIZED')
          setIsLoaded(true)
          return
        }
        if (!res.ok) throw new Error(`GET /api/family ${res.status}`)

        const data = (await res.json()) as StoredTree
        // Wenn seit dem GET-Start bereits eine lokale Mutation stattfand, GET ignorieren
        if (mutateEpochRef.current > 0) {
          setIsLoaded(true) // trotzdem aus Loading raus
          return
        }

        const ft = buildTreeFromStored(data)
        setIsAuthed(true)
        setFamilyTree(ft)
        setStoredSnapshot(data)
        setIsLoaded(true)
      } catch {
        // Dev-Fallback (optional)
        const seed = setupShanFamilyTree()
        //const snap = serializeFromRoot(seed.root)
        const snap = serializeTagged('UI-Init-Error', seed.root)
        const ft = buildTreeFromStored(snap)
        setFamilyTree(ft)
        setStoredSnapshot(snap)
        setIsLoaded(true)
        setError('Server storage unavailable; using in-memory seed.')
      }
    })()

    return () => {
      aborted = true
    }
  }, [])

  /* -------- Persist bei Änderungen -------- */
  /* -------- Persist bei Änderungen (Race-safe) -------- */
useEffect(() => {
  if (!familyTree || error === 'UNAUTHORIZED') return

  // Snapshot der aktuellen Mutation
  const myEpoch = mutateEpochRef.current
  // eindeutige Persist-ID für dieses Schedule
  const myPersistId = ++persistIdRef.current

  const t = setTimeout(() => {
    // Wenn seitdem eine NEUERE Mutation passierte: abbrechen
    if (myEpoch !== mutateEpochRef.current) return
    // Wenn dies nicht mehr der jüngste Persist-Job ist: abbrechen
    if (myPersistId !== persistIdRef.current) return

    // WICHTIG: payload JETZT erst berechnen (aktueller Tree!)
    const payload = serializeFromRoot(
      familyTree.root,
      storedSnapshot ?? undefined
    )
  

    fetch('/api/family', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {})

    setStoredSnapshot(payload)
  }, 100)

  return () => clearTimeout(t)
}, [familyTree, error])

  const value = useMemo(
    () => ({
      familyTree: familyTree!,
      setFamilyTree,
      root: familyTree?.root as IMember,
      memberNames: familyTree?.getMemberNames?.(),
      isLoaded,
      error,
      isAuthed,
      applyStored,
      storedSnapshot: storedSnapshot ?? undefined,
    }),
    [familyTree, isLoaded, error, isAuthed, storedSnapshot]
  )

  if (!isLoaded) return <div>Loading…</div>
  if (!familyTree && isAuthed) return <div>Kein Stammbaum geladen.</div>

  return (
    <FamilyTreeContext.Provider value={value}>
      {children}
    </FamilyTreeContext.Provider>
  )
}

export const useFamilyTree = () => useContext(FamilyTreeContext)
