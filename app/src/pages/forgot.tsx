import { useState } from 'react'
import Link from 'next/link'
import type { GetServerSideProps } from 'next'
import { canSendMail } from '@/lib/mail'
import { Button } from '@/components/ui/Button'
import { AuthLayout, Field, FormMessage, postJson } from '@/components/auth/AuthLayout'
import { useI18n } from '@/i18n/I18nProvider'
import { localeFromRequest } from '@/i18n/server'
import type { Locale } from '@/i18n/locales'

type Props = { mail: boolean; locale: Locale }

export const getServerSideProps: GetServerSideProps<Props> = async ({ req }) => ({
  props: { mail: canSendMail(), locale: localeFromRequest(req) },
})

export default function ForgotPage({ mail }: Props) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email.trim()) return setError(t.forgot.missingEmail)
    setLoading(true)
    try {
      const { ok, status } = await postJson('/api/auth/forgot', { email: email.trim() })
      if (ok) setSent(true)
      else setError(t.login.status[status] ?? t.common.retry)
    } catch {
      setError(t.common.offline)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title={t.forgot.pageTitle}
      intro={t.forgot.intro}
      footer={
        <Link
          href="/login"
          className="font-medium text-on-primary-accent underline decoration-accent/60 underline-offset-4"
        >
          {t.forgot.back}
        </Link>
      }
    >
      {!mail ? (
        <FormMessage tone="info">{t.forgot.noMail}</FormMessage>
      ) : sent ? (
        <FormMessage tone="info">{t.forgot.sent}</FormMessage>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field
            id="email"
            type="email"
            label={t.login.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          {error && <FormMessage>{error}</FormMessage>}
          <Button type="submit" variant="primary" disabled={loading} className="w-full">
            {loading ? t.auth.wait : t.forgot.submit}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
