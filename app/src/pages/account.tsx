// The signed-in user's own account: name, language, email, password, sessions.

import { useState } from 'react'
import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { toPublicUser, type PublicUser } from '@/lib/accounts'
import { lastTree, navContext, requirePageUser } from '@/lib/pageAuth'
import { Button } from '@/components/ui/Button'
import { Field, FormMessage, postJson } from '@/components/auth/AuthLayout'
import { PageHeader } from '@/components/app/PageHeader'
import type { NavContext } from '@/components/app/NavMenu'
import { useI18n } from '@/i18n/I18nProvider'
import type { Locale } from '@/i18n/locales'
import { localeFromRequest } from '@/i18n/server'

type Props = { user: PublicUser; nav: NavContext; locale: Locale }

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const auth = await requirePageUser(ctx)
  if (auth.redirect) return { redirect: auth.redirect }
  // The tree the user came from, so the header leads back to it
  const tree = await lastTree(auth.user, ctx.req)
  return {
    props: {
      user: toPublicUser(auth.user),
      nav: await navContext(auth.user, tree),
      locale: localeFromRequest(ctx.req),
    },
  }
}

type Notice = { tone: 'error' | 'info'; text: string } | null

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-card-rule pt-4 first:border-t-0 first:pt-0">
      <h2 className="font-display text-[1.25rem] text-ink">{title}</h2>
      {children}
    </section>
  )
}

export default function AccountPage({ user, nav }: Props) {
  const { t, locale } = useI18n()
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [emailPassword, setEmailPassword] = useState('')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [notice, setNotice] = useState<Record<string, Notice>>({})
  // The section being saved; its button turns, the others wait
  const [busy, setBusy] = useState<string | null>(null)

  const save = async (key: string, body: object, success: string) => {
    setBusy(key)
    setNotice((n) => ({ ...n, [key]: null }))
    try {
      const { ok, status } = await postJson('/api/account', body, 'PATCH')
      const text = ok ? success : (t.account.status[status] ?? t.common.retry)
      setNotice((n) => ({ ...n, [key]: { tone: ok ? 'info' : 'error', text } }))
      return ok
    } catch {
      setNotice((n) => ({ ...n, [key]: { tone: 'error', text: t.common.offline } }))
      return false
    } finally {
      setBusy(null)
    }
  }

  const logoutAll = async () => {
    setBusy('sessions')
    const { ok } = await postJson('/api/account/logout-all', {}).finally(() => setBusy(null))
    setNotice((n) => ({
      ...n,
      sessions: { tone: ok ? 'info' : 'error', text: ok ? t.account.loggedOutElsewhere : t.common.retry },
    }))
  }

  const show = (key: string) => {
    const n = notice[key]
    return n ? <FormMessage tone={n.tone}>{n.text}</FormMessage> : null
  }

  return (
    <>
      <Head>
        <title>{t.account.title}</title>
      </Head>
      <div className="page-backdrop min-h-dvh">
        <PageHeader title={t.account.title} nav={nav} current="account" />
        <main className="mx-auto flex max-w-xl flex-col gap-4 p-3 sm:p-5">
          <p className="text-[15px] text-ink">{t.account.intro(user.email)}</p>
          <div className="surface flex flex-col gap-5 rounded-panel border border-frame/60 p-5 shadow-lifted sm:p-6">
            <Section title={t.account.profile}>
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  void save('profile', { name, locale }, t.account.saved)
                }}
              >
                <Field
                  id="name"
                  label={t.account.name}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
                <p className="text-sm text-ink-muted">{t.account.languageHint}</p>
                {show('profile')}
                <Button type="submit" loading={busy === 'profile'} disabled={!!busy}>
                  {t.form.save}
                </Button>
              </form>
            </Section>

            <Section title={t.account.email}>
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  void save('email', { email, currentPassword: emailPassword }, t.account.emailChanged).then(
                    (ok) => ok && setEmailPassword(''),
                  )
                }}
              >
                {!user.verified && <FormMessage tone="info">{t.account.unverified}</FormMessage>}
                <Field
                  id="email"
                  type="email"
                  label={t.login.email}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Field
                  id="email-password"
                  type="password"
                  label={t.account.currentPassword}
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  autoComplete="current-password"
                />
                {show('email')}
                <Button type="submit" loading={busy === 'email'} disabled={!!busy || email.trim() === user.email}>
                  {t.account.changeEmail}
                </Button>
              </form>
            </Section>

            <Section title={t.account.password}>
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (next.length < 8)
                    return setNotice((n) => ({ ...n, password: { tone: 'error', text: t.auth.tooShort } }))
                  void save(
                    'password',
                    { currentPassword: current, newPassword: next },
                    t.account.passwordChanged,
                  ).then((ok) => {
                    if (ok) {
                      setCurrent('')
                      setNext('')
                    }
                  })
                }}
              >
                <Field
                  id="current"
                  type="password"
                  label={t.account.currentPassword}
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  autoComplete="current-password"
                />
                <Field
                  id="new"
                  type="password"
                  label={t.reset.newPassword}
                  hint={t.auth.minLength}
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  autoComplete="new-password"
                />
                {show('password')}
                <Button type="submit" loading={busy === 'password'} disabled={!!busy}>
                  {t.account.changePassword}
                </Button>
              </form>
            </Section>

            <Section title={t.account.sessions}>
              <p className="text-sm text-ink-muted">{t.account.sessionsHint}</p>
              {show('sessions')}
              <Button onClick={logoutAll} loading={busy === 'sessions'} disabled={!!busy}>
                {t.account.logoutAll}
              </Button>
            </Section>
          </div>
        </main>
      </div>
    </>
  )
}
