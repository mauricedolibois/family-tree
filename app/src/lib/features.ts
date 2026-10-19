// src/lib/features.ts
// Feature switches from environment variables (prod.env); server side only.

const ON = new Set(['true', '1', 'yes', 'on', 'ja'])

/** "true", "1", "yes", "on" (any case) switch a flag on; anything else, or nothing, means off */
export const flag = (raw: string | undefined): boolean => ON.has((raw ?? '').trim().toLowerCase())

/** Anyone may sign up and start a tree of their own. Off unless ALLOW_REGISTRATION=true. */
export const registrationOpen = (raw = process.env.ALLOW_REGISTRATION): boolean => flag(raw)

/** The app sends email itself (invitations, password resets, verification). */
export const mailEnabled = (): boolean => flag(process.env.MAIL_ENABLED)

/** New accounts must confirm their address before signing in; only with mail enabled. */
export const emailVerificationRequired = (): boolean => mailEnabled() && flag(process.env.REQUIRE_EMAIL_VERIFICATION)

/**
 * Public address of the app for links in emails, e.g. https://tree.example.org.
 * Deliberately not taken from the request's Host header: a forged header must
 * not be able to point password-reset links at someone else's site.
 */
export function appUrl(): string | null {
  const url = process.env.APP_URL?.trim().replace(/\/+$/, '')
  return url && /^https?:\/\/[^/\s]+$/.test(url) ? url : null
}
