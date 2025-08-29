// src/components/FamilyTreeProvider.tsx
'use client'

import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { FamilyTree } from '../models/FamilyTree'
import { IMember } from '../types/IMember'
import { buildTreeFromStored } from '../storage/rebuild'
import { StoredTree, serializeFromRoot, migrateToV2 } from '../storage/schema'
import { setupShanFamilyTree } from '../utils'

interface Ctx {
  root: IMember
  familyTree: FamilyTree
  setFamilyTree: (tree: FamilyTree) => void
  applyStored: (stored: StoredTree) => void
  storedSnapshot: StoredTree | null // ⬅️ NEU
  memberNames?: string[]
  isLoaded: boolean
  error?: string | null
}

const FamilyTreeContext = createContext({} as Ctx)

export const FamilyTreeProvider = ({ children }: { children: ReactNode }) => {
  const [familyTree, setFamilyTree] = useState<FamilyTree | null>(null)
  const [storedSnapshot, setStoredSnapshot] = useState<StoredTree | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch('/api/family', { cache: 'no-store' })
        if (!res.ok) throw new Error(`GET /api/family ${res.status}`)
        const raw = await res.json()
        const data = migrateToV2(raw)
        if (!mounted) return
        setStoredSnapshot(data)
        setFamilyTree(buildTreeFromStored(data))
        setIsLoaded(true)
      } catch (e) {
        console.error('Family load failed, fallback to seed:', e)
        const seed = setupShanFamilyTree()
        setFamilyTree(seed)
        setStoredSnapshot(null)
        setIsLoaded(true)
        setError('Server storage unavailable; using in-memory seed.')
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  // Persist, wenn sich der Baum ändert
  useEffect(() => {
    if (!familyTree || error) return
    const payload = serializeFromRoot(
      familyTree.root,
      storedSnapshot ?? undefined,
    )
    setStoredSnapshot(payload)
    const t = setTimeout(() => {
      fetch('/api/family', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((e) => console.error('Persist failed:', e))
    }, 50)
    return () => clearTimeout(t)
    // storedSnapshot absichtlich nicht als dep, sonst Persist-Schleife
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyTree, error])

  const applyStored = (stored: StoredTree) => {
    setStoredSnapshot(stored)
    setFamilyTree(buildTreeFromStored(stored))
  }

  const value = useMemo(
    () => ({
      familyTree: familyTree!,
      setFamilyTree: (t: FamilyTree) => setFamilyTree(t),
      applyStored,
      storedSnapshot, // ⬅️ NEU
      root: familyTree?.root as IMember,
      memberNames: familyTree?.getMemberNames?.(),
      isLoaded,
      error,
    }),
    [familyTree, storedSnapshot, isLoaded, error],
  )

  if (!isLoaded || !familyTree)
    return <div className="p-4 text-sm opacity-70">Loading…</div>
  return (
    <FamilyTreeContext.Provider value={value}>
      {children}
    </FamilyTreeContext.Provider>
  )
}

export const useFamilyTree = () => useContext(FamilyTreeContext)
