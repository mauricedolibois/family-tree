import { Gender } from '@/types/Gender'
import { nanoid } from 'nanoid'

export class Member {
  public id: string
  public name: string
  public gender: Gender
  public spouse: Member | null
  public parents: Member[]
  public children: Member[]
  /** NEW: welche Kinder sind (von DIESEM Parent) adoptiert? */
  public adoptedChildrenIds: string[]

  constructor(name: string, gender: Gender, id?: string) {
    this.id = id ?? nanoid(10)
    this.name = name
    this.gender = gender
    this.spouse = null
    this.parents = []
    this.children = []
    this.adoptedChildrenIds = []
  }

  /** Small helper to avoid duplicates by id */
  private static pushUnique(list: Member[], m: Member) {
    if (!list.some(x => x.id === m.id)) list.push(m)
  }

  /** Marry two members (idempotent) */
  public addSpouse(person: Member): void {
    if (this.spouse?.id === person.id && person.spouse?.id === this.id) return
    this.spouse = person
    person.spouse = this
  }

  /**
   * Add child to THIS parent only (no spouse side-effects).
   * Optionally flag this parent→child link as adopted.
   */
  public addChild(child: Member, opts?: { adopted?: boolean }): void {
    // link (one-sided to this parent)
    if (!this.children.some(c => c.id === child.id)) this.children.push(child)
    if (!child.parents.some(p => p.id === this.id)) child.parents.push(this)

    // adoption flag on this edge
    if (opts?.adopted === true) {
      if (!this.adoptedChildrenIds.includes(child.id)) {
        this.adoptedChildrenIds.push(child.id)
      }
    }
  }

  /** Toggle/set adoption flag for THIS parent→child link */
  public markAdopted(child: Member, adopted = true): void {
    const has = this.adoptedChildrenIds.includes(child.id)
    if (adopted && !has) this.adoptedChildrenIds.push(child.id)
    if (!adopted && has) {
      this.adoptedChildrenIds = this.adoptedChildrenIds.filter(id => id !== child.id)
    }
  }

  /** Is married? */
  public isMarried(): boolean {
    return this.spouse !== null
  }

  /**
   * Add a parent to this member, updating both sides.
   * Max 2 parents; deduplicated and idempotent.
   */
  public addParent(parent: Member): void {
    if (this.parents.some(p => p.id === parent.id)) return
    if (this.parents.length >= 2) {
      throw new Error('A member cannot have more than two parents.')
    }
    Member.pushUnique(this.parents, parent)
    Member.pushUnique(parent.children, this)
  }
}
