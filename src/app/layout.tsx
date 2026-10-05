import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: {
    default: 'TakaKori',
    template: '%s · TakaKori',
  },
  description: 'Track your income and expenses. Built for Bangladesh.',
  applicationName: 'TakaKori',
  appleWebApp: {
    capable: true,
    title: 'TakaKori',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom is pinned at 1. iOS Safari has ignored `user-scalable=no` since iOS 10,
  // so this does not stop a pinch-zoom there — what it does control is
  // double-tap-to-zoom and the Android/Chrome behaviour, both of which produce
  // the same broken half-scrolled state on a form-heavy screen.
  //
  // The real defence against the iOS zoom is that no field renders under 16px
  // (`.tk-field` in globals.css). iOS zooms the page on focus of a sub-16px
  // input and never zooms back out, which is what leaves the tab bar sitting
  // over the content. Setting this alone would look like a fix and change
  // nothing on the phone.
  //
  // Accessibility note: disabling pinch-zoom is a WCAG 1.4.4 failure. It is set
  // here because this app's layout has no content that benefits from zooming and
  // a zoomed state is genuinely unusable — but it is a real trade-off, not a
  // free win, and it should be revisited if the app ever gains dense tables or
  // long-form reading.
  maximumScale: 1,
  userScalable: false,
  // `viewport-fit=cover` is what lets the tab bar and the home indicator share
  // the bottom of the screen; the layout then pads itself with
  // `env(safe-area-inset-bottom)` so nothing hides behind the indicator.
  viewportFit: 'cover',
  themeColor: '#0a8a5b',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
