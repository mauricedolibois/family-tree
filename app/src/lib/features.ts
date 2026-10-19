// src/lib/features.ts
// Schalter über Umgebungsvariablen (prod.env), nur auf dem Server lesbar.

/** Neue Familien dürfen sich selbst registrieren. ALLOW_REGISTRATION=false schaltet das ab. */
export const registrationOpen = (): boolean => process.env.ALLOW_REGISTRATION !== 'false'
