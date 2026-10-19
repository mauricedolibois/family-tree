import { useState } from 'react'
import type { GetServerSideProps } from 'next'
import Head from 'next/head'
import { Eye, EyeOff } from 'lucide-react'
import { getFamilyIdFromReq } from '@/lib/session'
import { Button } from '@/components/ui/Button'
import { Flourish } from '@/components/ui/Flourish'
import { LanguageSwitch } from '@/components/ui/LanguageSwitch'
import { langFromRequest, useLang } from '@/i18n/lang'

// Wer schon angemeldet ist, landet direkt im Stammbaum
export const getServerSideProps: GetServerSideProps = async ({ req }) =>
  getFamilyIdFromReq(req)
    ? { redirect: { destination: '/', permanent: false } }
    : { props: { lang: langFromRequest(req) } }

type Mode = 'login' | 'register'

/** Meldungen in beiden Sprachen: [deutsch, englisch] */
type Message = [string, string]

const MESSAGES: Record<string, Message> = {
  401: ['Familienname oder Passwort stimmt nicht.', 'Family name or password is incorrect.'],
  409: [
    'Diesen Familiennamen gibt es schon. Wähle einen anderen oder melde dich an.',
    'This family name is already taken. Choose another one or log in.',
  ],
  429: [
    'Zu viele Versuche. Bitte warte ein paar Minuten und versuche es dann erneut.',
    'Too many attempts. Please wait a few minutes and try again.',
  ],
}

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [familyName, setFamilyName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<Message | null>(null)
  const [loading, setLoading] = useState(false)
  const { t } = useLang()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!familyName.trim() || !password)
      return setError(['Bitte Familienname und Passwort eingeben.', 'Please enter the family name and password.'])
    if (mode === 'register' && password.length < 8)
      return setError(['Das Passwort braucht mindestens 8 Zeichen.', 'The password needs at least 8 characters.'])

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
      setError(
        MESSAGES[res.status] ?? [
          'Das hat nicht geklappt. Bitte versuche es noch einmal.',
          'That didn’t work. Please try again.',
        ],
      )
    } catch {
      setError([
        'Keine Verbindung. Prüfe das Internet und versuche es erneut.',
        'No connection. Check your internet and try again.',
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>{t('Stammbaum – Anmelden', 'Family tree – Log in')}</title>
      </Head>
      <main className="book-cover grid min-h-dvh place-items-center p-4 sm:p-8">
        <div className="w-full max-w-[26rem]">
          <div className="gilt-frame px-6 pb-7 pt-9 text-center sm:px-10">
            <p className="font-display text-[1.05rem] italic text-gilt/80">{t('Unsere Familie', 'Our family')}</p>
            <h1 className="gilt-text mt-1 font-display text-[3.4rem] leading-none">{t('Stammbaum', 'Family Tree')}</h1>
            <Flourish className="mx-auto mt-3 max-w-[14rem]" />
            <p className="mx-auto mt-3 max-w-[18rem] font-serif text-[17px] text-card/70">
              {mode === 'login'
                ? t('Melde dich mit eurem Familiennamen an.', 'Log in with your family name.')
                : t('Lege einen neuen Stammbaum für deine Familie an.', 'Create a new family tree for your family.')}
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
                  {t('Familienname', 'Family name')}
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
                  {t('Passwort', 'Password')}
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
                    aria-label={
                      showPassword ? t('Passwort verbergen', 'Hide password') : t('Passwort anzeigen', 'Show password')
                    }
                    className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-ink-muted hover:text-ink"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {mode === 'register' && (
                  <p className="mt-1.5 text-sm text-ink-faint">
                    {t('Mindestens 8 Zeichen.', 'At least 8 characters.')}
                  </p>
                )}
              </div>

              {error && (
                <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
                  {t(...error)}
                </p>
              )}

              <Button type="submit" variant="primary" disabled={loading} className="mt-1 w-full">
                {loading
                  ? t('Einen Moment …', 'One moment …')
                  : mode === 'login'
                  ? t('Stammbaum öffnen', 'Open family tree')
                  : t('Stammbaum anlegen', 'Create family tree')}
              </Button>
            </div>

            <p className="mt-5 text-center text-[15px] text-ink-muted">
              {mode === 'login'
                ? t('Noch keinen Stammbaum?', 'No family tree yet?')
                : t('Schon einen Stammbaum?', 'Already have a family tree?')}{' '}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login')
                  setError(null)
                }}
                className="font-medium text-linen underline decoration-gilt/70 underline-offset-4 hover:decoration-linen"
              >
                {mode === 'login' ? t('Neuen anlegen', 'Create one') : t('Anmelden', 'Log in')}
              </button>
            </p>
          </form>
          <div className="mt-5">
            <LanguageSwitch tone="cover" />
          </div>
        </div>
      </main>
    </>
  )
}
