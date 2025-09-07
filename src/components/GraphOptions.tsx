// src/components/GraphOptions.tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Settings2, ChevronDown, ChevronUp, Check } from 'lucide-react'
import type { EdgeStyle } from '@/utils/paths'
import Avatar from '@/components/Avatar'
import { Gender } from '@/types/Gender'
import clsx from 'clsx'

export type MemberOption = {
  id: string
  name: string
  gender: Gender | string
  titleImageUrl?: string | null
}

type GraphOptionsProps = {
  open: boolean
  onRequestToggle: () => void
  onRequestClose: () => void

  edgeStyle: EdgeStyle
  onChangeEdgeStyle: (v: EdgeStyle) => void

  includeSpouses: boolean
  onToggleIncludeSpouses: (v: boolean) => void

  bloodlineMemberId: string
  onChangeBloodlineMember: (id: string) => void

  members: MemberOption[]

  // Verwandtschaftstiefe (0..3)
  kinDepth: 0 | 1 | 2 | 3
  onChangeKinDepth: (d: 0 | 1 | 2 | 3) => void
}

export default function GraphOptions({
  open,
  onRequestToggle,
  onRequestClose,
  edgeStyle,
  onChangeEdgeStyle,
  includeSpouses,
  onToggleIncludeSpouses,
  bloodlineMemberId,
  onChangeBloodlineMember,
  members,
  kinDepth,
  onChangeKinDepth,
}: GraphOptionsProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)

  // Outside click schließt Panel
  useEffect(() => {
    function onDocDown(ev: MouseEvent | TouchEvent) {
      if (!open) return
      const el = panelRef.current
      const target = ev.target as Node | null
      if (el && target && !el.contains(target)) {
        onRequestClose()
      }
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('touchstart', onDocDown, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('touchstart', onDocDown)
    }
  }, [open, onRequestClose])

  // Member-Dropdown (custom) state
  const [memberMenuOpen, setMemberMenuOpen] = useState(false)
  const [memberMenuDir, setMemberMenuDir] = useState<'up' | 'down'>('down')
  const memberButtonRef = useRef<HTMLButtonElement | null>(null)
  const memberMenuRef = useRef<HTMLDivElement | null>(null)

  // Outside click für Member-Dropdown
  useEffect(() => {
    function onDocDown(ev: MouseEvent | TouchEvent) {
      if (!memberMenuOpen) return
      const menu = memberMenuRef.current
      const btn = memberButtonRef.current
      const target = ev.target as Node | null
      const clickedInside =
        (menu && target && menu.contains(target)) ||
        (btn && target && btn.contains(target))
      if (!clickedInside) setMemberMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('touchstart', onDocDown, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('touchstart', onDocDown)
    }
  }, [memberMenuOpen])

  const toggleMemberMenu = () => {
    const next = !memberMenuOpen
    if (next && memberButtonRef.current) {
      const rect = memberButtonRef.current.getBoundingClientRect()
      const viewportH = window.innerHeight || document.documentElement.clientHeight
      const estimatedMenuH = Math.min(64 * 4, 320)
      const spaceBelow = viewportH - rect.bottom
      const spaceAbove = rect.top
      setMemberMenuDir(spaceBelow >= estimatedMenuH || spaceBelow >= spaceAbove ? 'down' : 'up')
    }
    setMemberMenuOpen(next)
  }

  const selectedMember = useMemo(
    () => members.find(m => m.id === bloodlineMemberId) || null,
    [members, bloodlineMemberId]
  )

  // Labels für die Tiefenstufen
  const kinLabels = ['nur direkte Linie', ' + Geschwister', ' + Cousins', ' + Großcousins'] as const

  const showDepthAndSpouses = !!selectedMember // nur wenn nicht „Alle anzeigen“

  return (
    <>
      {/* Toggle Button bleibt an gleicher Stelle */}
      <div className="fixed bottom-16 right-4 z-30">
        <button
          type="button"
          onClick={onRequestToggle}
          className="flex items-center gap-2 rounded-lg px-3 py-2 shadow-md border-2 border-[color:var(--color-primary-800)] bg-white text-[color:var(--color-primary-800)]"
          aria-expanded={open}
          aria-controls="graph-options-panel"
          title="Optionen"
        >
          <Settings2 className="h-4 w-4" />
          Optionen
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div
          id="graph-options-panel"
          ref={panelRef}
          className="fixed bottom-44 right-4 z-40 w-[22rem] rounded-2xl bg-[color:var(--color-surface-100)] border-2 border-[color:var(--color-primary-800)] shadow-xl"
        >
          <div className="p-4">
            <h3 className="m-0 mb-3 text-sm font-semibold text-[color:var(--color-primary-800)]">
              Optionen
            </h3>

            {/* Edge Style */}
            <div className="mb-4">
              <label className="block mb-1 text-sm font-medium text-[color:var(--color-primary-800)]">
                Kantenstil
              </label>
              <select
                className="w-full rounded-md border border-[color:var(--color-primary-800)] bg-[color:var(--color-surface-100)] px-2 py-2 text-sm text-[color:var(--color-primary-800)] outline-none"
                value={edgeStyle}
                onChange={(e) => onChangeEdgeStyle(e.target.value as EdgeStyle)}
              >
                <option value="rounded">Abgerundet</option>
                <option value="orthogonal">Eckig</option>
              </select>
            </div>

            {/* Bloodline + Auswahl */}
            <div className="mb-4">
              <label className="block mb-1 text-sm font-medium text-[color:var(--color-primary-800)]">
                Nur Blutlinie von …
              </label>

              {/* Wrapper ist relativ → Overlay-Chips können absolut darüber */}
              <div className="relative mb-3">
                <button
                  ref={memberButtonRef}
                  type="button"
                  onClick={toggleMemberMenu}
                  className={clsx(
                    'w-full rounded-md border-2 px-2 py-2 text-left flex items-center justify-between gap-2',
                    'border-[color:var(--color-primary-800)] bg-[color:var(--color-surface-100)] text-[color:var(--color-primary-800)]'
                  )}
                  aria-haspopup="listbox"
                  aria-expanded={memberMenuOpen}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {selectedMember ? (
                      <>
                        <div className="pointer-events-none">
                          <Avatar
                            color={
                              selectedMember.gender === Gender.MALE
                                ? 'bg-male'
                                : 'bg-female'
                            }
                            imageUrl={selectedMember.titleImageUrl || undefined}
                            isDescendant={true}
                            title={selectedMember.name}
                          />
                        </div>
                        <span className="truncate">{selectedMember.name}</span>
                      </>
                    ) : (
                      <span className="text-[color:var(--color-primary-800)] opacity-80">
                        — Alle anzeigen —
                      </span>
                    )}
                  </div>
                  <ChevronDown className="h-4 w-4 shrink-0" />
                </button>


                {memberMenuOpen && (
                  <div
                    ref={memberMenuRef}
                    role="listbox"
                    className={clsx(
                      // z-40, damit die Overlay-Texte (z-50) darüber liegen
                      'absolute z-40 max-h-64 w-full overflow-auto rounded-lg border-2 border-[color:var(--color-primary-800)] bg-[color:var(--color-surface-100)] shadow-lg',
                      memberMenuDir === 'down' ? 'top-full mt-2' : 'bottom-full mb-2'
                    )}
                  >
                    {/* "Alle anzeigen" */}
                    <button
                      type="button"
                      onClick={() => {
                        onChangeBloodlineMember('')
                        setMemberMenuOpen(false)
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--color-secondary-50)] text-[color:var(--color-primary-800)] flex items-center justify-between"
                    >
                      <span>— Alle anzeigen —</span>
                      {!selectedMember && <Check className="h-4 w-4" />}
                    </button>

                    <div className="h-px bg-[color:var(--color-primary-800)]/20 my-1" />

                    {members.map((m) => {
                      const isActive = m.id === bloodlineMemberId
                      return (
                        <button
                          key={m.id}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          onClick={() => {
                            onChangeBloodlineMember(m.id)
                            setMemberMenuOpen(false)
                          }}
                          className={clsx(
                            'w-full px-3 py-2 text-left text-sm flex items-center justify-between',
                            isActive
                              ? 'bg-[color:var(--color-secondary-50)]'
                              : 'hover:bg-[color:var(--color-secondary-50)]',
                            'text-[color:var(--color-primary-800)]'
                          )}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <div className="pointer-events-none">
                              <Avatar
                                color={m.gender === Gender.MALE ? 'bg-male' : 'bg-female'}
                                imageUrl={m.titleImageUrl || undefined}
                                isDescendant={true}
                                title={m.name}
                              />
                            </div>
                            <span className="truncate">{m.name}</span>
                          </span>
                          {isActive && <Check className="h-4 w-4 shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Slider + Legende nur, wenn eine Person gewählt ist */}
              {showDepthAndSpouses && (
                <>
                  {/* Schritte-Dragger (0..3) */}
                  <div>
                    <label className="block mb-1 text-xs text-[color:var(--color-primary-800)]/80">
                      Verwandtschaftstiefe
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={3}
                      step={1}
                      value={kinDepth}
                      onChange={(e) => onChangeKinDepth(Number(e.target.value) as 0|1|2|3)}
                      className="w-full accent-[color:var(--color-primary-800)]"
                      aria-label="Verwandtschaftstiefe"
                    />
                    <div className="mt-1 text-xs text-[color:var(--color-primary-800)]">
                      {kinLabels[kinDepth]}
                    </div>

                    {/* Kleine Legende der aktivierten Stufen */}
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                      <span className={clsx(
                        'px-2 py-0.5 rounded border',
                        kinDepth >= 0 ? 'bg-[color:var(--color-secondary-50)] border-[color:var(--color-secondary-200)]' : 'opacity-60'
                      )}>
                        direkte Linie
                      </span>
                      <span className={clsx(
                        'px-2 py-0.5 rounded border',
                        kinDepth >= 1 ? 'bg-[color:var(--color-secondary-50)] border-[color:var(--color-secondary-200)]' : 'opacity-60'
                      )}>
                        Geschwister
                      </span>
                      <span className={clsx(
                        'px-2 py-0.5 rounded border',
                        kinDepth >= 2 ? 'bg-[color:var(--color-secondary-50)] border-[color:var(--color-secondary-200)]' : 'opacity-60'
                      )}>
                        Cousins
                      </span>
                      <span className={clsx(
                        'px-2 py-0.5 rounded border',
                        kinDepth >= 3 ? 'bg-[color:var(--color-secondary-50)] border-[color:var(--color-secondary-200)]' : 'opacity-60'
                      )}>
                        Großcousins
                      </span>
                    </div>
                  </div>

                  {/* Ehepartner-Option */}
                  <label className="mt-3 inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[color:var(--color-primary-800)]"
                      checked={includeSpouses}
                      onChange={(e) => onToggleIncludeSpouses(e.target.checked)}
                    />
                    <span className="text-[color:var(--color-primary-800)] text-sm">
                      Ehepartner mit anzeigen
                    </span>
                  </label>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
