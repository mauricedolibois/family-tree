// src/components/FamilyTreeProvider.tsx
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
import { buildTreeFromStored } from '@/storage/rebuild' // <-- deine neue Version
import { StoredTree, serializeFromRoot } from '@/storage/schema'
import { setupShanFamilyTree } from '@/utils'

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
  /** Neu: Vollständiger ID-Index */
  membersById: Record<string, IMember>
  /** Neu: Komfort-Lookup */
  getById: (id: string) => IMember | null
}

const FamilyTreeContext = createContext({} as Ctx)

export const FamilyTreeProvider = ({ children }: { children: ReactNode }) => {
  const [familyTree, setFamilyTree] = useState<FamilyTree | null>(null)
  const [storedSnapshot, setStoredSnapshot] = useState<StoredTree | null>(null)
  const [membersById, setMembersById] = useState<Record<string, IMember>>({})
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAuthed, setIsAuthed] = useState<boolean>(true)

  const loadReqIdRef = useRef(0)
  const mutateEpochRef = useRef(0)
  const persistIdRef = useRef(0)

  const applyStored = (stored: StoredTree) => {
    mutateEpochRef.current += 1
    const rebuilt = buildTreeFromStored(stored)
    // Falls du noch eine FamilyTree-Klasse brauchst:
    const ft = new FamilyTree(rebuilt.root.name, rebuilt.root.gender) as any
    // Achtung: Wenn du eine echte FamilyTree-Implementierung hast,
    // übergib dort rebuilt.root (nicht neu erzeugen). Hier nur Platzhalter:
    ft.root = rebuilt.root

    setFamilyTree(ft)
    setMembersById(rebuilt.byId)
    setStoredSnapshot(stored)
  }

  useEffect(() => {
    const myReqId = ++loadReqIdRef.current
    let aborted = false

    ;(async () => {
      try {
        const res = await fetch('/api/family', { cache: 'no-store' })
        if (aborted) return
        if (myReqId !== loadReqIdRef.current) return

        if (res.status === 401) {
          setIsAuthed(false)
          setError('UNAUTHORIZED')
          setIsLoaded(true)
          return
        }
        if (!res.ok) throw new Error(`GET /api/family ${res.status}`)

        const data = (await res.json()) as StoredTree
        if (mutateEpochRef.current > 0) {
          setIsLoaded(true)
          return
        }

        const rebuilt = buildTreeFromStored(data)
        const ft = new FamilyTree(rebuilt.root.name, rebuilt.root.gender) as any
        ft.root = rebuilt.root

        setIsAuthed(true)
        setFamilyTree(ft)
        setMembersById(rebuilt.byId)
        setStoredSnapshot(data)
        setIsLoaded(true)
      } catch {
        const seed = setupShanFamilyTree()
        const snap = serializeFromRoot(seed.root)
        const rebuilt = buildTreeFromStored(snap)
        const ft = new FamilyTree(rebuilt.root.name, rebuilt.root.gender) as any
        ft.root = rebuilt.root

        setFamilyTree(ft)
        setMembersById(rebuilt.byId)
        setStoredSnapshot(snap)
        setIsLoaded(true)
        setError('Server storage unavailable; using in-memory seed.')
      }
    })()

    return () => { aborted = true }
  }, [])

  useEffect(() => {
    if (!familyTree || error === 'UNAUTHORIZED') return

    const myEpoch = mutateEpochRef.current
    const myPersistId = ++persistIdRef.current

    const t = setTimeout(() => {
      if (myEpoch !== mutateEpochRef.current) return
      if (myPersistId !== persistIdRef.current) return

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
  }, [familyTree, error, storedSnapshot])

  const getById = (id: string) => membersById[id] ?? null

  const value = useMemo(
    () => ({
      familyTree: familyTree!,
      setFamilyTree,
      root: (familyTree?.root as IMember),
      memberNames: familyTree?.getMemberNames?.(),
      isLoaded,
      error,
      isAuthed,
      applyStored,
      storedSnapshot: storedSnapshot ?? undefined,
      membersById,
      getById,
    }),
    [familyTree, isLoaded, error, isAuthed, storedSnapshot, membersById]
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
