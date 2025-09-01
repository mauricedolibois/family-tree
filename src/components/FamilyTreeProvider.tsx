'use client'

import React, {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { FamilyTree } from '@/models/FamilyTree'
import { IMember } from '@/types/IMember'
import { buildTreeFromStored } from '@/storage/rebuild'
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
}

const FamilyTreeContext = createContext({} as Ctx)

export const FamilyTreeProvider = ({ children }: { children: ReactNode }) => {
  const [familyTree, setFamilyTree] = useState<FamilyTree | null>(null)
  const [storedSnapshot, setStoredSnapshot] = useState<StoredTree | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAuthed, setIsAuthed] = useState<boolean>(true)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch('/api/family', { cache: 'no-store' })
        if (res.status === 401) {
          if (mounted) {
            setIsAuthed(false)
            setError('UNAUTHORIZED')
            setIsLoaded(true)
          }
          return
        }
        if (!res.ok) throw new Error(`GET /api/family ${res.status}`)
        const data = (await res.json()) as StoredTree
        const ft = buildTreeFromStored(data)
        if (!mounted) return
        setIsAuthed(true)
        setFamilyTree(ft)
        setStoredSnapshot(data)
        setIsLoaded(true)
      } catch {
        // Dev-Fallback, optional
        const seed = setupShanFamilyTree()
        setFamilyTree(seed)
        setStoredSnapshot(serializeFromRoot(seed.root))
        setIsLoaded(true)
        setError('Server storage unavailable; using in-memory seed.')
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!familyTree || error === 'UNAUTHORIZED') return
    const payload = serializeFromRoot(familyTree.root, storedSnapshot ?? undefined)
    const t = setTimeout(() => {
      fetch('/api/family', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {})
      setStoredSnapshot(payload)
    }, 100)
    return () => clearTimeout(t)
  }, [familyTree]) // error-dep hier nicht nötig

  const applyStored = (stored: StoredTree) => {
    const ft = buildTreeFromStored(stored)
    setFamilyTree(ft)
    setStoredSnapshot(stored)
  }

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
    [familyTree, isLoaded, error, isAuthed, storedSnapshot],
  )

  // nur ein neutrales Loading anzeigen, aber KEIN Auth-UI hier
  if (!isLoaded) return <div>Loading…</div>
  if (!familyTree && isAuthed) return <div>Kein Stammbaum geladen.</div>

  return (
    <FamilyTreeContext.Provider value={value}>
      {children}
    </FamilyTreeContext.Provider>
  )
}

export const useFamilyTree = () => useContext(FamilyTreeContext)
