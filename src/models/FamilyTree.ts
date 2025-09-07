import { Member } from '@/models/Member'
import { Gender } from '@/types/Gender'
import { AllowedRelationship, Relationship, SearchableRelationship } from '@/types/Relationship'
import { addChild, addParent, addSpouse } from './family/mutations'
import { find, findByIdConnected, walkConnected } from './family/traverse'
import { getByRelationship, getRelationship as computeRelationship } from './family/queries'

export class FamilyTree {
  public root: Member

  constructor(fatherName: string, motherName: string) {
    const father: Member = new Member(fatherName, Gender.MALE)
    const mother: Member = new Member(motherName, Gender.FEMALE)
    this.root = father
    father.addSpouse(mother)
  }

  /** Preferred: ID-based (supports duplicate names) */
  public addMemberById(
    sourceId: string,
    targetName: string,
    targetGender: Gender,
    relationship: AllowedRelationship,
    options?: { marryExistingParent?: boolean; adopt?: boolean } // ⬅️ NEW
  ): Member {
    const source = this.findById(sourceId)
    if (!source) throw new Error('Source person not found')

    const member = new Member(targetName, targetGender)

    switch (relationship) {
      case 'CHILD': {
        const adopted = options?.adopt === true
        addChild(this.root, source, member, { adopted })
        break
      }
      case 'SPOUSE':
        addSpouse(source, member)
        break
      case 'PARENT':
        // Forward options so mutations can decide whether to marry existing parent, etc.
        addParent(this, source, member, { marryExistingParent: options?.marryExistingParent })
        break
      default:
        throw new Error('Relationship not supported')
    }

    return member
  }

  /* -------------------- Queries (public API) -------------------- */

  public get(name: string, relationship: Relationship): Member[] | Member | null {
    return getByRelationship(this.root, name, relationship)
  }

  public getRelationship(memberName: string, relativeName: string): SearchableRelationship | null {
    return computeRelationship(this.root, memberName, relativeName)
  }

  public mothersWithMostGirlChildren(): Member[] {
    let mothers: Member[] = []
    let maxGirls = 0

    const all: Member[] = []
    const queue: Member[] = [this.root]
    const seen = new Set<Member>()
    while (queue.length) {
      const m = queue.shift()!
      if (seen.has(m)) continue
      seen.add(m)
      all.push(m)
      for (const c of m.children) queue.push(c)
      if (m.spouse) queue.push(m.spouse)
    }

    for (const node of all) {
      const spouse = node.gender === Gender.FEMALE ? node : node.spouse
      if (spouse) {
        const girlsCount = (this.get(spouse.name, 'DAUGHTER') as Member[]).length
        if (girlsCount > maxGirls) {
          maxGirls = girlsCount
          mothers = [spouse]
        } else if (girlsCount > 0 && girlsCount === maxGirls) {
          mothers.push(spouse)
        }
      }
    }
    return mothers
  }

  public getMemberNames(): string[] {
    const names: string[] = []
    const seen = new Set<string>()
    // use walkConnected instead of BFS children-only
    walkConnected(this.root, (n) => {
      if (seen.has(n.id)) return
      seen.add(n.id)
      names.push(n.name)
      if (n.spouse) names.push(n.spouse.name)
    })
    return names
  }

  /* -------------------- Helpers -------------------- */

  private find(name: string): Member | null {
    return find(this.root, name)
  }

  public findById(id: string): Member | null {
    return findByIdConnected(this.root, id)
  }
}
