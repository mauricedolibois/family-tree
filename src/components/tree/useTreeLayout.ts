// src/components/tree/useTreeLayout.ts
// Berechnet das Layout im Hintergrund. Während eine neue Berechnung läuft,
// bleibt das alte Bild stehen – kein Flackern beim Bearbeiten.

import { useEffect, useRef, useState } from 'react'
import type { Tree } from '@/family/model'
import { computeTreeLayout } from '@/family/layout/compute'
import type { TreeLayout } from '@/family/layout/types'

export function useTreeLayout(tree: Tree) {
  const [layout, setLayout] = useState<TreeLayout | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = useRef(0)

  useEffect(() => {
    const id = ++run.current
    let cancelled = false
    ;(async () => {
      try {
        const { runElkInWorker } = await import('@/family/layout/elkClient')
        const next = await computeTreeLayout(tree, runElkInWorker)
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
  }, [tree])

  return { layout, error }
}
