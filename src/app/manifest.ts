import type { MetadataRoute } from 'next'

/**
 * The web app manifest.
 *
 * Installed to the home screen, this file is the app's identity outside the
 * browser chrome, so the colours here are brand colours rather than theme
 * choices. `theme_color` matches the top of the brand wash: the status bar in
 * standalone mode should look like the app opened, not like a browser did.
 *
 * `#0a8a5b` is `--brand-600`. If the primary action colour is ever re-homed,
 * this is a second place to change it, which is why it is written as a token
 * reference in the comment rather than left undocumented.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TakaKori — Income & expense tracker',
    short_name: 'TakaKori',
    description: 'Track your income and expenses. Built for Bangladesh.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f2f5f4', // --canvas
    theme_color: '#0a8a5b', // --brand-600
    categories: ['finance', 'productivity'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  }
}
