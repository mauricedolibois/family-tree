// src/utils.ts
import { FamilyTree } from '@/models/FamilyTree'
import { Member } from '@/models/Member'
import { Gender } from '@/types/Gender'

export const isMale = (member: Member): boolean => member.gender === Gender.MALE
export const isFemale = (member: Member): boolean => member.gender === Gender.FEMALE

export const getName = (member: Member): string => member.name
export const getSpouse = (member: Member): Member | null => member.spouse

export const isMemberOrSpouse =
  (name: string) =>
  (member: Member): boolean =>
    member.name === name || member.spouse?.name === name

export const setupShanFamilyTree = (): FamilyTree => {
  // 1st generation
  const family = new FamilyTree('Vater', 'Mutter')

  // Mutter-ID sicher bestimmen
  const motherId = family.root.spouse?.id ?? family.root.id // falls sich der Konstruktor mal ändert

  // 2nd generation – KINDER per ID an die Mutter hängen
  family.addMemberById(motherId, 'Kind1', Gender.MALE, 'CHILD')
  family.addMemberById(motherId, 'Kind2', Gender.FEMALE, 'CHILD')
  family.addMemberById(motherId, 'Kind3', Gender.MALE, 'CHILD')

  return family
}
