import type { AppProps } from 'next/app'
import Head from 'next/head'
import '@fontsource/im-fell-english/400.css'
import '@fontsource/im-fell-english/400-italic.css'
import '@fontsource-variable/eb-garamond/wght.css'
import '@fontsource-variable/eb-garamond/wght-italic.css'
import '@fontsource/atkinson-hyperlegible-next/400.css'
import '@fontsource/atkinson-hyperlegible-next/500.css'
import '@fontsource/atkinson-hyperlegible-next/600.css'
import '@fontsource-variable/inter/wght.css'
import '../styles/globals.css'
import { I18nProvider, useI18n } from '@/i18n/I18nProvider'
import { isLocale } from '@/i18n/locales'
import { ThemeProvider } from '@/themes/ThemeProvider'

function DefaultTitle() {
  const { t } = useI18n()
  return (
    <Head>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <title>{t.app.title}</title>
    </Head>
  )
}

export default function App({ Component, pageProps }: AppProps) {
  // Pages with getServerSideProps pass the request's language; static pages detect it on the client
  const locale = isLocale(pageProps.locale) ? pageProps.locale : undefined
  return (
    <I18nProvider initial={locale}>
      <ThemeProvider>
        <DefaultTitle />
        <Component {...pageProps} />
      </ThemeProvider>
    </I18nProvider>
  )
}
