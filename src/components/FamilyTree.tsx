'use client'

import React, { useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Person } from '@/components/Person'
import { useFamilyTree } from './FamilyTreeProvider'
import { buildFlatMemberMap, computeLayoutFiltered } from '@/utils/familyLayout'
import { spouseLine, edgePath, type EdgeStyle } from '@/utils/paths'
import { INITIAL_SCALE, CARD_W, CARD_H } from '@/config/layout'
import { PositionedNode, MemberLite } from '@/types/family'
import {
  TransformWrapper,
  TransformComponent,
  ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch'
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import GraphOptions, { MemberOption } from '@/components/GraphOptions'
import { Gender } from '@/types/Gender'

export default function FamilyGraph() {
  const { root } = useFamilyTree()
  const apiRef = useRef<ReactZoomPanPinchRef | null>(null)

  // UI-State
  const [panelOpen, setPanelOpen] = useState(false)
  const [edgeStyle, setEdgeStyle] = useState<EdgeStyle>('rounded')
  const [bloodlineMemberId, setBloodlineMemberId] = useState<string>('') // '' = alle
  const [includeSpouses, setIncludeSpouses] = useState<boolean>(false)

  // Basisdaten (voll)
  const baseMap = useMemo(() => buildFlatMemberMap(root), [root])

  // Optionen für Member-Dropdown (mit Avatar-Infos)
  const memberOptions: MemberOption[] = useMemo(() => {
    const list = Object.values(baseMap).map(m => ({
      id: m.id,
      name: m.name,
      gender: (m.raw as any)?.gender ?? m.gender ?? Gender.MALE,
      titleImageUrl: (m.raw as any)?.profile?.titleImageUrl ?? null,
    }))
    // eindeutige + sortiert
    const seen = new Set<string>()
    const uniq = list.filter(x => {
      if (seen.has(x.id)) return false
      seen.add(x.id)
      return true
    })
    return uniq.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    )
  }, [baseMap])

  // Layout auf Basis gefilterter Map
  const { nodes, edges, width, height } = useMemo(() => {
    const focus = bloodlineMemberId || undefined
    return computeLayoutFiltered(baseMap, focus, { includeSpouses })
  }, [baseMap, bloodlineMemberId, includeSpouses])

  // Paare (im aktuellen Layout)
  const couplePairs = useMemo(() => {
    const set = new Set<string>()
    const pairs: Array<[PositionedNode, PositionedNode, string]> = []
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      if (a.kind !== 'person') continue
      const m = a.data as MemberLite
      if (!m?.spouseId) continue
      const b = nodes.find(x => x.id === m.spouseId && x.kind === 'person')
      if (!b) continue
      const key = [a.id, b.id].sort().join('::')
      if (set.has(key)) continue
      set.add(key)
      pairs.push([a, b, key])
    }
    return pairs
  }, [nodes])

  const isInCouple = (m?: MemberLite | null) =>
    !!(m?.spouseId && nodes.some(x => x.kind === 'person' && x.id === m.spouseId))

  return (
    <div
      className="w-full h-full overflow-hidden bg-[color:var(--color-surface-100)] border-4 border-[color:var(--color-primary-800)]"
      data-testid="family-graph-root"
      role="tree"
    >
      <TransformWrapper
        initialScale={INITIAL_SCALE}
        minScale={0.3}
        maxScale={2.5}
        limitToBounds={false}
        centerOnInit
        wheel={{ step: 0.25, disabled: false }}
        pinch={{ disabled: false }}
        doubleClick={{ disabled: true }}
        zoomAnimation={{ animationTime: 200, animationType: 'easeOut' }}
        alignmentAnimation={{ animationTime: 0 }}
        ref={apiRef as any}
      >
        {({ zoomIn, zoomOut, centerView }) => (
          <>
            <TransformComponent wrapperClass="w-full h-full" contentClass="w-full h-full">
              <div className="relative" style={{ width, height }}>
                {/* Edges */}
                <svg className="absolute inset-0" width={width} height={height} aria-hidden="true">
                  <defs>
                    <marker id="dot" markerWidth="6" markerHeight="6" refX="3" refY="3">
                      <circle cx="3" cy="3" r="3" />
                    </marker>
                  </defs>

                  {/* Ehe-Linien (dezent) */}
                  {(() => {
                    const drawn = new Set<string>()
                    const items: ReactElement[] = []
                    for (let i=0;i<nodes.length;i++) {
                      const n = nodes[i]
                      if (n.kind !== 'person') continue
                      const m = n.data as MemberLite
                      const sId = m.spouseId
                      if (!sId) continue
                      const other = nodes.find(x => x.id === sId && x.kind === 'person')
                      if (!other) continue
                      const key = [n.id, other.id].sort().join('::')
                      if (drawn.has(key)) continue
                      drawn.add(key)
                      const seg = spouseLine(n, other)
                      items.push(
                        <line
                          key={`sp-${key}`}
                          x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
                          stroke="var(--color-secondary-800)"
                          strokeWidth={2}
                          opacity={0.35}
                        />
                      )
                    }
                    return items
                  })()}

                  {/* Eltern/Kind-Kanten */}
                  {edges.map(e => {
                    const from = nodes.find(n=>n.id===e.from)!
                    const to = nodes.find(n=>n.id===e.to)!
                    const d = edgePath(from, to, {
                      fromSide: e.fromSide,
                      toSide: e.toSide,
                      style: edgeStyle,
                    })
                    return (
                      <path
                        key={e.id}
                        d={d}
                        fill="none"
                        stroke="var(--color-primary-800)"
                        strokeWidth={2}
                        markerEnd="url(#dot)"
                        opacity={0.9}
                      />
                    )
                  })}
                </svg>

                {/* Paar-Container */}
                {couplePairs.map(([a, b, key]) => {
                  const padding = 12
                  const minX = Math.min(a.x, b.x) - padding
                  const maxX = Math.max(a.x + a.w, b.x + b.w) + padding
                  const top = Math.min(a.y, b.y)
                  const coupleW = maxX - minX
                  const coupleH = CARD_H
                  return (
                    <div
                      key={`couple-${key}`}
                      className="
                        absolute rounded-2xl bg-white
                        border-2 border-solid border-[color:var(--color-primary-800)]
                        shadow-md pointer-events-none
                      "
                      style={{ left: minX, top, width: coupleW, height: coupleH, zIndex: 1 }}
                      aria-hidden
                    />
                  )
                })}

                {/* Nodes layer */}
                {nodes.map(n => {
                  if (n.kind === 'union') {
                    return (
                      <div
                        key={n.id}
                        className="absolute"
                        style={{ left: n.x, top: n.y, width: n.w, height: n.h, zIndex: 2 }}
                        aria-hidden
                      >
                        <div className="w-full h-full rotate-45 rounded-sm bg-[color:var(--color-primary-800)] opacity-20" />
                      </div>
                    )
                  }
                  const m = n.data as MemberLite
                  const inCouple = isInCouple(m)
                  const isDescendant = (n.gen ?? 0) > 0
                  const baseCls = inCouple
                    ? `
                        absolute
                        rounded-xl bg-transparent
                        border-0 shadow-none
                        flex items-center justify-center
                      `
                    : `
                        absolute
                        rounded-xl bg-white
                        border-2 border-solid border-[color:var(--color-primary-800)]
                        shadow-md
                        flex items-center justify-center
                      `
                  return (
                    <div
                      key={n.id}
                      className={baseCls}
                      style={{ left: n.x, top: n.y, width: CARD_W, height: CARD_H, zIndex: 2 }}
                    >
                      <Person member={m.raw} isDescendant={isDescendant} />
                    </div>
                  )
                })}
              </div>
            </TransformComponent>

            {/* Options Panel (neue Komponente) */}
            <GraphOptions
              open={panelOpen}
              onRequestToggle={() => setPanelOpen(v => !v)}
              onRequestClose={() => setPanelOpen(false)}
              edgeStyle={edgeStyle}
              onChangeEdgeStyle={setEdgeStyle}
              includeSpouses={includeSpouses}
              onToggleIncludeSpouses={setIncludeSpouses}
              bloodlineMemberId={bloodlineMemberId}
              onChangeBloodlineMember={setBloodlineMemberId}
              members={memberOptions}
            />

            {/* Zoom controls */}
            <div className="fixed bottom-4 right-4 flex gap-2 z-20">
              <button
                type="button"
                onClick={() => zoomOut()}
                className="rounded-full p-2 shadow-md transition bg-[color:var(--color-accent)] hover:bg-[color:var(--color-accent-700)] text-white"
                aria-label="Zoom out"
                title="Zoom out"
              >
                <ZoomOut className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => zoomIn()}
                className="rounded-full p-2 shadow-md transition bg-[color:var(--color-accent)] hover:bg-[color:var(--color-accent-700)] text-white"
                aria-label="Zoom in"
                title="Zoom in"
              >
                <ZoomIn className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => centerView(INITIAL_SCALE)}
                className="rounded-full p-2 shadow-md transition bg-[color:var(--color-secondary)] hover:bg-[color:var(--color-secondary-700)] text-white"
                aria-label="Reset view"
                title="Reset view"
              >
                <RotateCcw className="h-5 w-5" />
              </button>
            </div>
          </>
        )}
      </TransformWrapper>
    </div>
  )
}
