import type { MetadataRoute } from 'next'

/**
 * The web app manifest.
 *
 * Installed to the home screen, this file is the app's identity outside the
 * browser chrome, so the colours here are brand colours rather than theme
 * choices. `theme_color` matches the top of the brand wash: the status bar in
 * standalone mode should look like the app opened, not like a browser did.
 *
 * `#0a8256` is `--brand-600`. It used to read `#0a8a5b` here and in
 * `layout.tsx`, on the strength of a comment claiming it was `--brand-600` — but
 * that token was darkened to fix a 4.38:1 contrast on the primary button's white
 * label, and neither of these two copies was updated with it. The result was an
 * Android status bar in a marginally different green from the app's own primary
 * button sitting directly beneath it. `design-system.md` opens by warning about
 * three copies of the truth, and this was one of them drifting.
 *
 * **Icons.** Every platform asks for a different one by name, so the set is
 * generated from `public/icon.svg` by `npm run icons` rather than exported by
 * hand. The reason there is no `monochrome` entry is recorded in that script: the
 * mark is two overlapping bars and a wallet, and flattened to a single colour
 * they merge into an unreadable blob. There is no notification badge in this app
 * to need one.
 *
 * **Screenshots are deliberately absent.** Chrome shows a richer install dialog
 * when a manifest carries them, and this manifest does not. The alternative was
 * fabricating images of screens the app does not have — a chart that is not a
 * chart, a transaction list with invented rows — in the one dialog where the user
 * decides whether to trust the app with their home screen. The plain dialog
 * shows the real name and the real icon, which is honest.
 *
 * **Shortcuts** exist because this app has exactly one thing a user opens it to
 * do. Long-pressing the home screen icon should go there rather than to the
 * dashboard, because posting a transaction is the reason the app is opened
 * (ADR-028) — and `?sheet=add` is the same URL the floating action button uses,
 * so the sheet, the back button and the shortcut all behave identically.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'TakaKori — Income & expense tracker',
    short_name: 'TakaKori',
    description: 'Track your income and expenses. Built for Bangladesh.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    // Lets the user pick a tab-styled window if standalone is not what they
    // want, rather than making "browser" and "app" the only two options.
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait',
    background_color: '#f2f5f4', // --canvas
    theme_color: '#0a8256', // --brand-600
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      // Kept as the last entry rather than the first. Chromium picks the icon
      // nearest the size it wants, and for the Android splash screen that means
      // a raster one it can measure; an SVG at `sizes: "any"` gives it nothing to
      // match against. Browsers that understand SVG still use it.
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [
      {
        name: 'Add a transaction',
        short_name: 'Add',
        description: 'Record money in or money out',
        url: '/transactions?sheet=add',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Reports',
        short_name: 'Reports',
        description: 'Trends and breakdowns',
        url: '/reports',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Recurring',
        short_name: 'Recurring',
        description: 'Rent, salary, subscriptions',
        url: '/recurring',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  }
}
