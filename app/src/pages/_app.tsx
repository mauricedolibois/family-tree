import type { AppProps } from 'next/app'
import '../styles/globals.css'
import '../styles/colors.css'
import { Poppins } from 'next/font/google'
import { FamilyTreeProvider } from '../components/FamilyTreeProvider'
import { SelectedMemberProvider } from '../components/SelectedMemberProvider'

const poppins = Poppins({ subsets: ['latin'], weight: '300' })

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <div className={poppins.className}>
      <FamilyTreeProvider>
        <SelectedMemberProvider>
          <Component {...pageProps} />
        </SelectedMemberProvider>
      </FamilyTreeProvider>
    </div>
  )
}
