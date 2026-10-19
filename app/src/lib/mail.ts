// src/lib/mail.ts
// Outgoing mail over SMTP. Configured through prod.env:
//
//   MAIL_ENABLED=true
//   SMTP_HOST=smtp.example.org   SMTP_PORT=587   SMTP_SECURE=false (true for port 465)
//   SMTP_USER=…                  SMTP_PASSWORD=…
//   MAIL_FROM="Family tree <tree@example.org>"
//   APP_URL=https://tree.example.org
//
// Without mail the app shows the same links to the admin to pass on by hand.

import nodemailer, { type Transporter } from 'nodemailer'
import { appUrl, flag, mailEnabled } from './features'
import { logError } from './log'
import { MESSAGES } from '@/i18n/messages'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales'

let transport: Transporter | null = null

function getTransport(): Transporter {
  if (transport) return transport
  const port = Number(process.env.SMTP_PORT ?? 587)
  const user = process.env.SMTP_USER
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? flag(process.env.SMTP_SECURE) : port === 465,
    auth: user ? { user, pass: process.env.SMTP_PASSWORD ?? '' } : undefined,
  })
  return transport
}

/** Mail can actually go out: switched on and the links in it have an address to point to */
export const canSendMail = () => mailEnabled() && !!process.env.SMTP_HOST && !!appUrl()

export type MailKind = 'invite' | 'verify' | 'reset'

type MailInput = {
  kind: MailKind
  to: string
  locale: string | null | undefined
  path: string
  name?: string
  tree?: string
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Subject, plain text and a small HTML version in the recipient's language */
export function renderMail({ kind, locale, path, name, tree }: Omit<MailInput, 'to'>, base: string) {
  const lang: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE
  const m = MESSAGES[lang].mail
  const link = base + path
  const content = m[kind]({ name: name ?? '', tree: tree ?? '' })
  const text = `${content.greeting}\n\n${content.body}\n\n${link}\n\n${m.footer}`
  const html = `<!doctype html><html lang="${lang}"><body style="font-family:Georgia,serif;color:#2B1E14;background:#F5EDD8;padding:24px">
<p>${escapeHtml(content.greeting)}</p>
<p>${escapeHtml(content.body)}</p>
<p><a href="${escapeHtml(
    link,
  )}" style="display:inline-block;background:#1E3428;color:#F5E6BE;padding:10px 18px;border-radius:8px;text-decoration:none">${escapeHtml(
    content.button,
  )}</a></p>
<p style="font-size:13px;color:#695642">${escapeHtml(link)}</p>
<p style="font-size:13px;color:#8A7760">${escapeHtml(m.footer)}</p>
</body></html>`
  return { subject: content.subject, text, html }
}

/** Sends the mail if possible; false means the caller should show the link instead */
export async function sendMail(input: MailInput): Promise<boolean> {
  const base = appUrl()
  if (!canSendMail() || !base) return false
  try {
    const { subject, text, html } = renderMail(input, base)
    await getTransport().sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: input.to,
      subject,
      text,
      html,
    })
    return true
  } catch (err) {
    logError('mail', err)
    return false
  }
}
