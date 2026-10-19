/** @type {import('next').NextConfig} */
const { createHash } = require('crypto')
const { THEME_SCRIPT } = require('./src/lib/themeScript')

const isDev = process.env.NODE_ENV !== 'production'
const themeScriptHash = `'sha256-${createHash('sha256').update(THEME_SCRIPT).digest('base64')}'`

// Was die Seite laden darf. Skripte nur von hier (plus das eine Inline-Skript per Hash);
// Fotos und Videos liegen auf der Supabase-Domain, deren Adresse erst zur Laufzeit feststeht – daher https:.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' ${themeScriptHash}${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? ' ws:' : ''}`,
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

// Grundlegende Sicherheits-Header für alle Seiten
const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
]

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Eigenständiger Server mit nur den nötigen Dateien – hält das Docker-Image klein
  output: 'standalone',
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

module.exports = nextConfig
