// Next.js calls register() once when the server starts.

export async function register() {
  // Written as a positive check so the build leaves the Node-only code out of any
  // edge bundle
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { onServerStart } = await import('./lib/firstStart')
    // Not awaited: a slow database must not delay the start
    void onServerStart()
    // Only in production: a development server must not clean up its database at night.
    // Not on Vercel: serverless functions sleep between requests, so the timer would
    // not fire reliably; there GitHub Actions runs scripts/daily-backup.mjs instead.
    if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
      const { scheduleDailyJob } = await import('./lib/dailyJob')
      scheduleDailyJob()
    }
  }
}
