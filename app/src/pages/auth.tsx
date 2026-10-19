import { useState } from 'react'
import type { GetServerSideProps } from 'next'
import Head from 'next/head'
import { Eye, EyeOff } from 'lucide-react'
import { getFamilyIdFromReq } from '@/lib/session'
import { registrationOpen } from '@/lib/features'
import { Button } from '@/components/ui/Button'
import { Flourish } from '@/components/ui/Flourish'

type Props = { canRegister: boolean }

// Signed-in users go straight to their tree
export const getServerSideProps: GetServerSideProps<Props> = async ({ req }) =>
  getFamilyIdFromReq(req)
    ? { redirect: { destination: '/', permanent: false } }
    : { props: { canRegister: registrationOpen() } }

type Mode = 'login' | 'register'

const MESSAGES: Record<string, string> = {
  401: 'Familienname oder Passwort stimmt nicht.',
  409: 'Diesen Familiennamen gibt es schon. Wähle einen anderen oder melde dich an.',
  403: 'Neue Stammbäume können hier gerade nicht angelegt werden.',
  429: 'Zu viele Versuche. Bitte warte ein paar Minuten und versuche es dann erneut.',
}

export default function AuthPage({ canRegister }: Props) {
  const [mode, setMode] = useState<Mode>('login')
  const [familyName, setFamilyName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!familyName.trim() || !password) return setError('Bitte Familienname und Passwort eingeben.')
    if (mode === 'register' && password.length < 8) return setError('Das Passwort braucht mindestens 8 Zeichen.')

    setLoading(true)
    try {
      const res = await fetch(mode === 'register' ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ familyName: familyName.trim(), password }),
      })
      if (res.ok) {
        window.location.href = '/'
        return
      }
      setError(MESSAGES[res.status] ?? 'Das hat nicht geklappt. Bitte versuche es noch einmal.')
    } catch {
      setError('Keine Verbindung. Prüfe das Internet und versuche es erneut.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>Stammbaum – Anmelden</title>
      </Head>
      <main className="book-cover grid min-h-dvh place-items-center p-4 sm:p-8">
        <div className="w-full max-w-[26rem]">
          <div className="gilt-frame px-6 pb-7 pt-9 text-center sm:px-10">
            <p className="font-display text-[1.05rem] italic text-gilt/80">Unsere Familie</p>
            <h1 className="gilt-text mt-1 font-display text-[3.4rem] leading-none">Stammbaum</h1>
            <Flourish className="mx-auto mt-3 max-w-[14rem]" />
            <p className="mx-auto mt-3 max-w-[18rem] font-serif text-[17px] text-card/70">
              {mode === 'login'
                ? 'Melde dich mit eurem Familiennamen an.'
                : 'Lege einen neuen Stammbaum für deine Familie an.'}
            </p>
          </div>

          <form
            onSubmit={submit}
            className="parchment mt-5 rounded-panel border border-gilt/60 p-5 shadow-lifted sm:p-6"
            noValidate
          >
            <div className="flex flex-col gap-4">
              <div>
                <label htmlFor="family" className="field-label">
                  Familienname
                </label>
                <input
                  id="family"
                  className="field"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="words"
                />
              </div>
              <div>
                <label htmlFor="password" className="field-label">
                  Passwort
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className="field pr-12"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                    className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-ink-muted hover:text-ink"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {mode === 'register' && <p className="mt-1.5 text-sm text-ink-faint">Mindestens 8 Zeichen.</p>}
              </div>

              {error && (
                <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              )}

              <Button type="submit" variant="primary" disabled={loading} className="mt-1 w-full">
                {loading ? 'Einen Moment …' : mode === 'login' ? 'Stammbaum öffnen' : 'Stammbaum anlegen'}
              </Button>
            </div>

            {canRegister && (
              <p className="mt-5 text-center text-[15px] text-ink-muted">
                {mode === 'login' ? 'Noch keinen Stammbaum?' : 'Schon einen Stammbaum?'}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'login' ? 'register' : 'login')
                    setError(null)
                  }}
                  className="font-medium text-linen underline decoration-gilt/70 underline-offset-4 hover:decoration-linen"
                >
                  {mode === 'login' ? 'Neuen anlegen' : 'Anmelden'}
                </button>
              </p>
            )}
          </form>
        </div>
      </main>
    </>
  )
}
