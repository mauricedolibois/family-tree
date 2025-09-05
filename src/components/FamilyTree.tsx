'use client'

import { useRef } from 'react'
import { Person } from '@/components/Person'
import { IMember } from '@/types/IMember'
import { useFamilyTree } from './FamilyTreeProvider'
import {
  TransformWrapper,
  TransformComponent,
  ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch'
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'

const INITIAL_SCALE = 0.9

interface SubFamilyTreeProps {
  rootMember: IMember
  level?: number
}

const SubFamilyTree = ({ rootMember, level = 0 }: SubFamilyTreeProps) => {
  const renderCouple = () => (
      <div
      className="
        inline-block
        relative z-10
        rounded-xl
        bg-white
        border-solid border-2 border-[color:var(--color-primary-800)]
        shadow-md p-3
      "
    >
      <div className="flex items-start justify-center gap-4">
        <Person member={rootMember} />
        {rootMember?.spouse && (
          <Person member={rootMember.spouse} isDescendant={level === 0 && true} />
        )}
      </div>
    </div>
  )

  const renderChildren = () => (
    <ul
      key={rootMember.name}
      className="pt-14 relative flex flex-row items-baseline justify-center border-4 border-[color:var(--color-primary-800)]"
    >
      {rootMember.children.map((member) => (
        <SubFamilyTree
          rootMember={member}
          level={level + 1}
          key={member.name}
        />
      ))}
    </ul>
  )

  return (
    <li className="float-left list-none relative pt-14 px-4 text-center">
      {renderCouple()}
      {rootMember.children.length > 0 && renderChildren()}
    </li>
  )
}

export default function FamilyTree() {
  const { root } = useFamilyTree()
  const apiRef = useRef<ReactZoomPanPinchRef | null>(null)

  return (
    <div className="w-full h-full overflow-hidden bg-[color:var(--color-surface-100)] border-4 border-[color:var(--color-primary-800)]" data-testid="family-tree-root" role="tree">
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
              <div className="w-full h-full flex items-start justify-center p-6">
                <div className="inline-block">
                  <div className="tree whitespace-nowrap relative">
                    <ul className="relative flex flex-row items-baseline justify-center">
                      <SubFamilyTree rootMember={root} />
                    </ul>
                  </div>
                </div>
              </div>
            </TransformComponent>

            <div className="fixed bottom-4 right-4 flex gap-2">
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
