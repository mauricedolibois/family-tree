// Next.js calls register() once when the server starts.

export async function register() {
  // Written as a positive check so the build leaves the Node-only code out of any
  // edge bundle
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { onServerStart } = await import('./lib/firstStart')
    // Not awaited: a slow database must not delay the start
    void onServerStart()
  }
}
