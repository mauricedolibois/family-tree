// src/lib/features.ts
// Schalter über Umgebungsvariablen (prod.env), nur auf dem Server lesbar.

const OFF = new Set(['false', '0', 'no', 'off', 'nein'])

/** Neue Familien dürfen sich selbst registrieren. ALLOW_REGISTRATION=false schaltet das ab. */
export const registrationOpen = (raw = process.env.ALLOW_REGISTRATION): boolean =>
  !OFF.has((raw ?? '').trim().toLowerCase())
