import { useState } from 'react'
import Link from 'next/link'
import type { GetServerSideProps } from 'next'
import { Eye, EyeOff } from 'lucide-react'
import { currentUser } from '@/lib/auth'
import { registrationOpen } from '@/lib/features'
import { safeNext } from '@/lib/pageAuth'
import { Button } from '@/components/ui/Button'
import { AuthLayout, FormMessage, postJson } from '@/components/auth/AuthLayout'
import { useI18n } from '@/i18n/I18nProvider'
import { localeFromRequest } from '@/i18n/server'
import type { Locale } from '@/i18n/locales'

type Props = { canRegister: boolean; next: string; locale: Locale }

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, query }) => {
  const next = safeNext(query.next) ?? '/'
  if (await currentUser(req)) return { redirect: { destination: next, permanent: false } }
  return { props: { canRegister: registrationOpen(), next, locale: localeFromRequest(req) } }
}

export default function LoginPage({ canRegister, next }: Props) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unverified, setUnverified] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setUnverified(false)
    if (!email.trim() || !password) return setError(t.login.missingFields)
    setLoading(true)
    try {
      const { ok, status, data } = await postJson('/api/auth/login', { email: email.trim(), password })
      if (ok) {
        window.location.href = next
        return
      }
      if (status === 403 && data.error === 'unverified') {
        setUnverified(true)
        return setError(t.login.unverified)
      }
      if (status === 403) return setError(t.login.disabled)
      setError(t.login.status[status] ?? t.common.retry)
    } catch {
      setError(t.common.offline)
    } finally {
      setLoading(false)
    }
  }

  const resend = async () => {
    const { data } = await postJson('/api/auth/verify', { email: email.trim() })
    setError(null)
    setInfo(data.mail === false ? t.login.askAdmin : t.login.verificationSent)
  }

  return (
    <AuthLayout
      title={t.login.pageTitle}
      intro={t.login.intro}
      footer={
        canRegister && (
          <>
            {t.login.noAccount}{' '}
            <Link
              href="/register"
              className="font-medium text-gilt-soft underline decoration-gilt/60 underline-offset-4"
            >
              {t.login.register}
            </Link>
          </>
        )
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div>
          <label htmlFor="email" className="field-label">
            {t.login.email}
          </label>
          <input
            id="email"
            type="email"
            className="field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            inputMode="email"
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
              autoComplete="current-password"
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
        </div>

        {error && <FormMessage>{error}</FormMessage>}
        {unverified && (
          <button type="button" onClick={resend} className="text-left text-sm text-linen underline underline-offset-4">
            {t.login.resendVerification}
          </button>
        )}
        {info && <FormMessage tone="info">{info}</FormMessage>}

        <Button type="submit" variant="primary" disabled={loading} className="mt-1 w-full">
          {loading ? t.auth.wait : t.login.submit}
        </Button>
        <Link
          href="/forgot"
          className="text-center text-[15px] text-ink-muted underline decoration-gilt/60 underline-offset-4"
        >
          {t.login.forgot}
        </Link>
      </form>
    </AuthLayout>
  )
}
