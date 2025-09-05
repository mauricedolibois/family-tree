import { Gender } from './Gender'

export type MediaKind = 'image' | 'video' | 'pdf' | 'other'

export interface IMedia {
  id: string
  url: string
  kind: MediaKind
  title?: string | null
  createdAt?: string | null // ISO
}

export interface IProfile {
  birthDate?: string | null
  deathDate?: string | null
  country?: string | null
  city?: string | null
  comments?: string | null
  titleImageUrl?: string | null
  media?: IMedia[]
}

export interface IMember {
  /** Eindeutige ID – ersetzt den Namen als Primärschlüssel */
  id: string
  name: string
  gender: Gender
  spouse: IMember | null
  children: IMember[]
  /** optionale Profildaten */
  profile?: IProfile
}
