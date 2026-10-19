import type { Locale } from '../locales'
import { de, type Messages } from './de'
import { en } from './en'
import { es } from './es'
import { fr } from './fr'

export type { Messages }

export const MESSAGES: Record<Locale, Messages> = { de, en, fr, es }
