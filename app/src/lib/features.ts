// src/lib/features.ts
// Feature switches from environment variables (prod.env); server side only.

const OFF = new Set(['false', '0', 'no', 'off', 'nein'])

/** New families may sign up on their own. ALLOW_REGISTRATION=false turns this off. */
export const registrationOpen = (raw = process.env.ALLOW_REGISTRATION): boolean =>
  !OFF.has((raw ?? '').trim().toLowerCase())
