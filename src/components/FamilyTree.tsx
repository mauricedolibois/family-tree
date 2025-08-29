// src/components/FamilyTree.tsx
'use client'

import { Person } from '@/components/Person'
import { IMember } from '@/types/IMember'
import { useFamilyTree } from './FamilyTreeProvider'

interface SubFamilyTreeProps {
  rootMember: IMember
  level?: number
}

const SubFamilyTree = ({ rootMember, level = 0 }: SubFamilyTreeProps) => {
  const renderCouple = () => (
    <div className="border border-gray-300 p-2 rounded-md inline-block">
      <Person member={rootMember} />
      {/* spouse darf null sein – Person kann das ab */}
      <Person
        member={rootMember?.spouse ?? null}
        isDescendant={level === 0 && true}
      />
    </div>
  )

  const renderChildren = () => (
    <ul
      key={rootMember.name}
      className="pt-14 relative flex flex-row items-baseline justify-center"
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
    <li className="float-left list-none relative pt-14 px-2">
      {renderCouple()}
      {rootMember.children.length > 0 && renderChildren()}
    </li>
  )
}

const FamilyTree = () => {
  const { root } = useFamilyTree()

  return (
    <div
      className="tree whitespace-nowrap"
      data-testid="family-tree-root"
      role="tree"
    >
      <ul className="relative flex flex-row items-baseline justify-center">
        <SubFamilyTree rootMember={root} />
      </ul>
    </div>
  )
}

export default FamilyTree
