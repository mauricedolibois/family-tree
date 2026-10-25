import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { GetServerSideProps } from 'next'
import { Button } from '@/components/ui/Button'
import { AuthLayout, Field, FormMessage, postJson } from '@/components/auth/AuthLayout'
import { useI18n } from '@/i18n/I18nProvider'
import { MIN_PASSWORD_LENGTH, passwordError } from '@/lib/passwordRules'
import { localeFromRequest } from '@/i18n/server'
import type { Locale } from '@/i18n/locales'

type Props = { token: string; locale: Locale }

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, params }) => ({
  props: { token: String(params?.token ?? ''), locale: localeFromRequest(req) },
})

export default function ResetPage({ token }: Props) {
  const { t } = useI18n()
  const [email, setEmail] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`/api/auth/reset?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { email: string }) => setEmail(d.email))
      .catch(() => setInvalid(true))
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const problem = passwordError(password, [email], t)
    if (problem) return setError(problem)
    if (password !== repeat) return setError(t.reset.mismatch)
    setLoading(true)
    try {
      const { ok, status } = await postJson('/api/auth/reset', { token, password })
      if (ok) {
        window.location.href = '/'
        return
      }
      if (status === 404) setInvalid(true)
      else setError(t.common.retry)
    } catch {
      setError(t.common.offline)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title={t.reset.pageTitle} intro={email ? t.reset.intro(email) : undefined}>
      {invalid ? (
        <div className="flex flex-col gap-3">
          <FormMessage>{t.reset.invalid}</FormMessage>
          <Link href="/forgot" className="text-[15px] text-link underline underline-offset-4">
            {t.reset.requestNew}
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field
            id="password"
            type="password"
            label={t.reset.newPassword}
            hint={t.auth.minLength(MIN_PASSWORD_LENGTH)}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <Field
            id="repeat"
            type="password"
            label={t.reset.repeat}
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            autoComplete="new-password"
          />
          {error && <FormMessage>{error}</FormMessage>}
          <Button type="submit" variant="primary" loading={loading} disabled={!email} className="w-full">
            {loading ? t.auth.wait : t.reset.submit}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
