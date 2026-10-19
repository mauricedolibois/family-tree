// The former sign-in page; kept so old bookmarks still work.

import type { GetServerSideProps } from 'next'

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/login', permanent: true },
})

export default function Auth() {
  return null
}
