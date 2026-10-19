import { Html, Head, Main, NextScript, type DocumentProps } from 'next/document'
import { THEME_SCRIPT } from '@/lib/themeScript'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
import { MESSAGES } from '@/i18n/messages'

export default function Document(props: DocumentProps) {
  const pageLocale = props.__NEXT_DATA__.props?.pageProps?.locale
  const locale = isLocale(pageLocale) ? pageLocale : DEFAULT_LOCALE
  return (
    <Html lang={locale}>
      <Head>
        <meta name="theme-color" content="#1E3428" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="description" content={MESSAGES[locale].app.description} />
        <link rel="icon" href="/favicon.ico" />
        {/* Apply the chosen theme before the first paint (no flash) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
