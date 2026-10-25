// Accept an invitation: join with the signed-in account, or create a new one.

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

type Info = {
  tree: string | null
  role: 'viewer' | 'editor' | 'moderator' | null
  admin: boolean
  email: string | null
  inviter: string | null
  /** Who the invited person is in the tree; their account is linked on accepting */
  person: { name: string; years: string } | null
  signedInAs: { name: string; email: string } | null
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, params }) => ({
  props: { token: String(params?.token ?? ''), locale: localeFromRequest(req) },
})

export default function InvitePage({ token }: Props) {
  const { t } = useI18n()
  const [info, setInfo] = useState<Info | null>(null)
  const [gone, setGone] = useState<'invalid' | 'expired' | null>(null)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [checkMail, setCheckMail] = useState(false)
  const [loading, setLoading] = useState(false)
  const api = `/api/invite/${encodeURIComponent(token)}`
  const here = `/invite/${encodeURIComponent(token)}`

  useEffect(() => {
    fetch(api, { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 410) return setGone('expired')
        if (!r.ok) return setGone('invalid')
        const data = (await r.json()) as Info
        setInfo(data)
        if (data.email) setForm((f) => ({ ...f, email: data.email! }))
        if (data.person) setForm((f) => ({ ...f, name: f.name || data.person!.name }))
      })
      .catch(() => setGone('invalid'))
  }, [api])

  const done = (treeId: unknown) => {
    window.location.href = typeof treeId === 'string' ? `/tree/${treeId}` : '/'
  }

  const accept = async (body: object) => {
    setError(null)
    setLoading(true)
    try {
      const { ok, status, data } = await postJson(api, body)
      if (ok && data.verify) return setCheckMail(true)
      if (ok) return done(data.treeId)
      if (status === 410) return setGone('expired')
      setError((status === 403 && t.invite.wrongAccount) || t.invite.status[status] || t.common.retry)
    } catch {
      setError(t.common.offline)
    } finally {
      setLoading(false)
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim()) return setError(t.register.missingFields)
    const problem = passwordError(form.password, [form.name, form.email], t)
    if (problem) return setError(problem)
    void accept(form)
  }

  const what = info
    ? info.tree
      ? t.invite.joinTree(info.tree, t.roles[info.role ?? 'editor']) + (info.admin ? ` ${t.invite.andAdmin}` : '')
      : t.invite.becomeAdmin
    : ''

  return (
    <AuthLayout
      title={t.invite.pageTitle}
      intro={info ? (info.inviter ? t.invite.invitedBy(info.inviter, what) : what) : undefined}
    >
      {gone ? (
        <div className="flex flex-col gap-3">
          <FormMessage>{gone === 'expired' ? t.invite.expired : t.invite.invalid}</FormMessage>
          <Link href="/login" className="text-[15px] text-link underline underline-offset-4">
            {t.forgot.back}
          </Link>
        </div>
      ) : !info ? (
        <p className="text-center text-ink-muted">{t.auth.wait}</p>
      ) : checkMail ? (
        <FormMessage tone="info">{t.register.checkMail}</FormMessage>
      ) : (
        <div className="flex flex-col gap-4">
          {info.person && (
            <p className="rounded-control border border-accent/60 bg-accent-soft/40 px-3 py-2 text-[15px] text-ink">
              {t.invite.asPerson(info.person.years ? `${info.person.name} (${info.person.years})` : info.person.name)}
            </p>
          )}
          {info.signedInAs ? (
            <div className="flex flex-col gap-4">
              <p className="text-[15px] text-ink">{t.invite.signedInAs(info.signedInAs.name, info.signedInAs.email)}</p>
              {error && <FormMessage>{error}</FormMessage>}
              <Button variant="primary" disabled={loading} onClick={() => accept({})} className="w-full">
                {loading ? t.auth.wait : t.invite.accept}
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
              <Field
                id="name"
                label={t.account.name}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                autoComplete="name"
              />
              <Field
                id="email"
                type="email"
                label={t.login.email}
                value={form.email}
                readOnly={!!info.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                autoComplete="email"
              />
              <Field
                id="password"
                type="password"
                label={t.auth.password}
                hint={t.auth.minLength(MIN_PASSWORD_LENGTH)}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                autoComplete="new-password"
              />
              {error && <FormMessage>{error}</FormMessage>}
              <Button type="submit" variant="primary" disabled={loading} className="w-full">
                {loading ? t.auth.wait : t.invite.createAccount}
              </Button>
              <p className="text-center text-[15px] text-ink-muted">
                {t.invite.haveAccount}{' '}
                <Link
                  href={`/login?next=${encodeURIComponent(here)}`}
                  className="font-medium text-link underline underline-offset-4"
                >
                  {t.login.submit}
                </Link>
              </p>
            </form>
          )}
        </div>
      )}
    </AuthLayout>
  )
}
