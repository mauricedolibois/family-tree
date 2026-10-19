// src/components/tree/useTreeLayout.ts
// Computes the layout in the background. The previous layout stays on screen
// while a new one is calculated, so editing does not flicker.

import { useEffect, useRef, useState } from 'react'
import type { Tree } from '@/family/model'
import { computeTreeLayout } from '@/family/layout/compute'
import type { TreeLayout } from '@/family/layout/types'

/** @param focusId person the layout is arranged around (line, relation) */
export function useTreeLayout(tree: Tree, focusId: string | null = null) {
  const [layout, setLayout] = useState<TreeLayout | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = useRef(0)

  useEffect(() => {
    const id = ++run.current
    let cancelled = false
    ;(async () => {
      try {
        const { runElkInWorker } = await import('@/family/layout/elkClient')
        const next = await computeTreeLayout(tree, runElkInWorker, focusId)
        if (!cancelled && id === run.current) {
          setLayout(next)
          setError(null)
        }
      } catch (e) {
        console.error('[useTreeLayout]', e)
        if (!cancelled) setError('Der Baum konnte nicht angeordnet werden.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tree, focusId])

  return { layout, error }
}
