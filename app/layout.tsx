import type { Metadata, Viewport } from 'next'
import { Fraunces, Lato, Source_Sans_3 } from 'next/font/google'
import type { ReactNode } from 'react'

import './globals.css'

const sans = Source_Sans_3({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '600', '700'],
  display: 'swap',
})

const lato = Lato({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  display: 'swap',
  variable: '--font-lato',
})

const display = Fraunces({
  subsets: ['latin', 'latin-ext'],
  weight: ['600', '700'],
  display: 'swap',
  variable: '--font-display',
})

export const metadata: Metadata = {
  title: 'Today · Newtwen',
  description: "Today's LinkedIn profiles for the Newtwen team.",
  applicationName: 'Today',
  robots: { index: false, follow: false },
  formatDetection: { telephone: false, email: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${lato.variable}`}>
      <body className={sans.className}>{children}</body>
    </html>
  )
}
