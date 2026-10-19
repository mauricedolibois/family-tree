import { useState } from 'react'
import type { GetServerSideProps } from 'next'
import Head from 'next/head'
import { Eye, EyeOff } from 'lucide-react'
import { getFamilyIdFromReq } from '@/lib/session'
import { registrationOpen } from '@/lib/features'
import { Button } from '@/components/ui/Button'
import { Flourish } from '@/components/ui/Flourish'
import { LanguagePicker } from '@/components/ui/LanguagePicker'
import { useI18n } from '@/i18n/I18nProvider'
import { localeFromRequest } from '@/i18n/server'
import type { Locale } from '@/i18n/locales'

type Props = { canRegister: boolean; locale: Locale }

// Signed-in users go straight to their tree
export const getServerSideProps: GetServerSideProps<Props> = async ({ req }) =>
  getFamilyIdFromReq(req)
    ? { redirect: { destination: '/', permanent: false } }
    : { props: { canRegister: registrationOpen(), locale: localeFromRequest(req) } }

type Mode = 'login' | 'register'

export default function AuthPage({ canRegister }: Props) {
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>('login')
  const [familyName, setFamilyName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!familyName.trim() || !password) return setError(t.auth.missingFields)
    if (mode === 'register' && password.length < 8) return setError(t.auth.tooShort)

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
      setError(t.auth.status[res.status] ?? t.common.retry)
    } catch {
      setError(t.common.offline)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>{t.auth.pageTitle}</title>
      </Head>
      <main className="book-cover grid min-h-dvh place-items-center p-4 sm:p-8">
        <div className="w-full max-w-[26rem]">
          <div className="gilt-frame px-6 pb-7 pt-9 text-center sm:px-10">
            <p className="font-display text-[1.05rem] italic text-gilt/80">{t.auth.kicker}</p>
            <h1 className="gilt-text mt-1 font-display text-[3.4rem] leading-none">{t.app.title}</h1>
            <Flourish className="mx-auto mt-3 max-w-[14rem]" />
            <p className="mx-auto mt-3 max-w-[18rem] font-serif text-[17px] text-card/70">
              {mode === 'login' ? t.auth.introLogin : t.auth.introRegister}
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
                  {t.auth.familyName}
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
                  {t.auth.password}
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
                    aria-label={showPassword ? t.auth.hidePassword : t.auth.showPassword}
                    className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-ink-muted hover:text-ink"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {mode === 'register' && <p className="mt-1.5 text-sm text-ink-faint">{t.auth.minLength}</p>}
              </div>

              {error && (
                <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              )}

              <Button type="submit" variant="primary" disabled={loading} className="mt-1 w-full">
                {loading ? t.auth.wait : mode === 'login' ? t.auth.submitLogin : t.auth.submitRegister}
              </Button>
            </div>

            {canRegister && (
              <p className="mt-5 text-center text-[15px] text-ink-muted">
                {mode === 'login' ? t.auth.noTree : t.auth.haveTree}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'login' ? 'register' : 'login')
                    setError(null)
                  }}
                  className="font-medium text-linen underline decoration-gilt/70 underline-offset-4 hover:decoration-linen"
                >
                  {mode === 'login' ? t.auth.create : t.auth.signIn}
                </button>
              </p>
            )}
          </form>

          <div className="mt-5 flex justify-center">
            <LanguagePicker tone="cover" />
          </div>
        </div>
      </main>
    </>
  )
}
