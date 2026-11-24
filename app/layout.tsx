import type { Metadata, Viewport } from 'next'
import { Fraunces, Source_Sans_3 } from 'next/font/google'
import type { ReactNode } from 'react'

import './globals.css'

const sans = Source_Sans_3({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '600', '700'],
  display: 'swap',
})

const display = Fraunces({
  subsets: ['latin', 'latin-ext'],
  weight: ['600', '700'],
  display: 'swap',
  variable: '--font-display',
})

export const metadata: Metadata = {
  title: 'Oggi · Newtwen',
  description: 'I profili LinkedIn di oggi per il team Newtwen.',
  applicationName: 'Oggi',
  robots: { index: false, follow: false },
  formatDetection: { telephone: false, email: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4efe6' },
    { media: '(prefers-color-scheme: dark)', color: '#16130f' },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it" className={display.variable}>
      <body className={sans.className}>{children}</body>
    </html>
  )
}
