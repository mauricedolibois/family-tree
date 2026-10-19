import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="de">
      <Head>
        <meta name="theme-color" content="#1E3428" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="description" content="Unser Stammbaum" />
        <link rel="icon" href="/favicon.ico" />
        {/* Gewähltes Licht vor dem ersten Zeichnen setzen (kein Aufblitzen) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('stammbaum:licht')==='night')document.documentElement.dataset.theme='night'}catch(e){}`,
          }}
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
