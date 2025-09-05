import { Gender } from '@/types/Gender'
import { nanoid } from 'nanoid'

export class Member {
  public id: string
  public name: string
  public gender: Gender
  public spouse: Member | null
  public children: Member[]

  // ⬇️ optionales id-Argument für Deserialisierung
  constructor(name: string, gender: Gender, id?: string) {
    this.id = id ?? nanoid(10)
    this.name = name
    this.gender = gender
    this.spouse = null
    this.children = []
  }

  public addSpouse(person: Member): void {
    this.spouse = person
    person.spouse = this
  }

  public addChild(child: Member): void {
    this.children.push(child)
    if (this.spouse) {
      this.spouse.children.push(child)
    }
  }

  public isMarried(): boolean {
    return this.spouse !== null
  }
}
