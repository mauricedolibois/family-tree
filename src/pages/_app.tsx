import type { AppProps } from 'next/app'
import Head from 'next/head'
import '@fontsource/im-fell-english/400.css'
import '@fontsource/im-fell-english/400-italic.css'
import '@fontsource-variable/eb-garamond/wght.css'
import '@fontsource-variable/eb-garamond/wght-italic.css'
import '@fontsource/atkinson-hyperlegible-next/400.css'
import '@fontsource/atkinson-hyperlegible-next/500.css'
import '@fontsource/atkinson-hyperlegible-next/600.css'
import '../styles/globals.css'
import { LanguageProvider } from '@/i18n/lang'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <LanguageProvider initial={pageProps.lang === 'en' ? 'en' : 'de'}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>Stammbaum</title>
      </Head>
      <Component {...pageProps} />
    </LanguageProvider>
  )
}
