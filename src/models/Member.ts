import { Gender } from '@/types/Gender'
import { nanoid } from 'nanoid'

export class Member {
  public id: string
  public name: string
  public gender: Gender
  public spouse: Member | null
  public parents: Member[]
  public children: Member[]

  constructor(name: string, gender: Gender, id?: string) {
    this.id = id ?? nanoid(10)
    this.name = name
    this.gender = gender
    this.spouse = null
    this.parents = []
    this.children = []
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
   * Add child to this member (and to spouse if present), updating both sides.
   * Keeps lists deduplicated.
   */
  public addChild(child: Member): void {
    Member.pushUnique(this.children, child)
    Member.pushUnique(child.parents, this)

    if (this.spouse) {
      Member.pushUnique(this.spouse.children, child)
      Member.pushUnique(child.parents, this.spouse)
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
