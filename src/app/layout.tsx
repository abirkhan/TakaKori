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
