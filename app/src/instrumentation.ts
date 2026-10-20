// Next.js calls register() once when the server starts.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { onServerStart } = await import('./lib/firstStart')
  // Not awaited: a slow database must not delay the start
  void onServerStart()
}
