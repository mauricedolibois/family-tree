import { Gender } from '@/types/Gender'
import { nanoid } from 'nanoid'

export class Member {
  public id: string
  public name: string
  public gender: Gender
  public spouse: Member | null
  public parents: Member[]
  public children: Member[]

  // ⬇️ optionales id-Argument für Deserialisierung
  constructor(name: string, gender: Gender, id?: string) {
    this.id = id ?? nanoid(10)
    this.name = name
    this.gender = gender
    this.spouse = null
    this.parents = []
    this.children = []
  }

  public addSpouse(person: Member): void {
    this.spouse = person
    person.spouse = this
  }

   public addChild(child: Member): void {
    this.children.push(child)
    child.parents.push(this)   
    if (this.spouse) {
      this.spouse.children.push(child)
      child.parents.push(this.spouse)
    }
  }

  public isMarried(): boolean {
    return this.spouse !== null
  }

  public addParent(parent: Member): void {
    if (this.parents.length < 2) {
      this.parents.push(parent)
      parent.children.push(this)
    } else {
      throw new Error('A member cannot have more than two parents.')
    }
  }

}