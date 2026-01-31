import { Gender } from '@/types/Gender'
import { AllowedRelationship, Relationship, SearchableRelationship } from '@/types/Relationship'
import { Member } from '@/models/Member'

export type { Gender, AllowedRelationship, Relationship, SearchableRelationship, Member }

// Platzhalter für zukünftige Erweiterungen (Adoption etc.)
// (derzeit noch ungenutzt; später in mutations nutzen)
export type AddOptions = {
  adopted?: boolean
  marryWithExistingParent?: boolean
  setAsRootIfFirstParent?: boolean
}
