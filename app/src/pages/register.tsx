// Public sign-up, only when ALLOW_REGISTRATION=true; otherwise this page does not exist.

import { useState } from 'react'
import Link from 'next/link'
import type { GetServerSideProps } from 'next'
import { currentUser } from '@/lib/auth'
import { registrationOpen } from '@/lib/features'
import { Button } from '@/components/ui/Button'
import { AuthLayout, Field, FormMessage, postJson } from '@/components/auth/AuthLayout'
import { useI18n } from '@/i18n/I18nProvider'
import { localeFromRequest } from '@/i18n/server'
import type { Locale } from '@/i18n/locales'

export const getServerSideProps: GetServerSideProps<{ locale: Locale }> = async ({ req }) => {
  if (!registrationOpen()) return { notFound: true }
  if (await currentUser(req)) return { redirect: { destination: '/', permanent: false } }
  return { props: { locale: localeFromRequest(req) } }
}

export default function RegisterPage() {
  const { t } = useI18n()
  const [form, setForm] = useState({ name: '', email: '', password: '', treeName: '' })
  const [error, setError] = useState<string | null>(null)
  const [checkMail, setCheckMail] = useState(false)
  const [loading, setLoading] = useState(false)
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.name.trim() || !form.email.trim() || !form.treeName.trim()) return setError(t.register.missingFields)
    if (form.password.length < 8) return setError(t.auth.tooShort)
    setLoading(true)
    try {
      const { ok, status, data } = await postJson('/api/auth/register', form)
      if (ok && data.verify) return setCheckMail(true)
      if (ok) {
        window.location.href = data.treeId ? `/tree/${data.treeId}` : '/'
        return
      }
      setError(t.register.status[status] ?? t.common.retry)
    } catch {
      setError(t.common.offline)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title={t.register.pageTitle}
      intro={t.register.intro}
      footer={
        <>
          {t.register.haveAccount}{' '}
          <Link href="/login" className="font-medium text-gilt-soft underline decoration-gilt/60 underline-offset-4">
            {t.login.submit}
          </Link>
        </>
      }
    >
      {checkMail ? (
        <FormMessage tone="info">{t.register.checkMail}</FormMessage>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field id="name" label={t.account.name} value={form.name} onChange={set('name')} autoComplete="name" />
          <Field
            id="email"
            type="email"
            label={t.login.email}
            value={form.email}
            onChange={set('email')}
            autoComplete="email"
          />
          <Field
            id="password"
            type="password"
            label={t.auth.password}
            hint={t.auth.minLength}
            value={form.password}
            onChange={set('password')}
            autoComplete="new-password"
          />
          <Field
            id="tree"
            label={t.register.treeName}
            hint={t.register.treeNameHint}
            value={form.treeName}
            onChange={set('treeName')}
          />
          {error && <FormMessage>{error}</FormMessage>}
          <Button type="submit" variant="primary" disabled={loading} className="mt-1 w-full">
            {loading ? t.auth.wait : t.register.submit}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
