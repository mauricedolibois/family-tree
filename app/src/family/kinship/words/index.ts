import type { Locale } from '@/i18n/locales'
import type { KinshipWords } from '../types'
import { de } from './de'
import { en } from './en'
import { es } from './es'
import { fr } from './fr'

export const WORDS: Record<Locale, KinshipWords> = { de, en, fr, es }
