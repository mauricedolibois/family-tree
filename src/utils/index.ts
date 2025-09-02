import { FamilyTree } from '@/models/FamilyTree'
import { Member } from '@/models/Member'
import { Gender } from '@/types/Gender'

export const isMale = (member: Member): boolean => member.gender === Gender.MALE
export const isFemale = (member: Member): boolean =>
  member.gender === Gender.FEMALE

export const getName = (member: Member): string => member.name
export const getSpouse = (member: Member): Member | null => member.spouse

export const isMemberOrSpouse =
  (name: string) =>
  (member: Member): boolean =>
    member.name === name || member.spouse?.name === name

export const setupShanFamilyTree = (): FamilyTree => {
  //1st generation
  const family = new FamilyTree('Vater', 'Mutter')

  // 2nd generation
  family.addMember('Mutter', 'Kind1', Gender.MALE, 'CHILD')
  family.addMember('Mutter', 'Kind2', Gender.FEMALE, 'CHILD')
  family.addMember('Mutter', 'Kind3', Gender.MALE, 'CHILD')

  return family
}
