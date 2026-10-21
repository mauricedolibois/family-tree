// src/i18n/errors.ts
// Turns errors from editing and uploading into text in the current language.

import { EditError, describeEditError } from '@/family/edit'
import { OutsideScopeError } from '@/family/scope'
import type { Locale } from './locales'
import type { Messages } from './messages'

type UploadErrorCode = keyof Messages['errors']['upload']

export class UploadError extends Error {
  constructor(readonly code: UploadErrorCode) {
    super(`upload ${code}`)
  }
}

/** Text for errors the user can act on; anything unexpected gets `fallback` */
export function errorText(err: unknown, t: Messages, locale: Locale, fallback: string): string {
  if (err instanceof EditError) return describeEditError(err.code, err.names, locale)
  if (err instanceof UploadError) return t.errors.upload[err.code]
  if (err instanceof OutsideScopeError) return t.errors.outsideScope
  return fallback
}
