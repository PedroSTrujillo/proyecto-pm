import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Figtree, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

// Letras de la aplicación (.tema-app en globals.css). La página principal sigue con las del sistema.
const texto = Figtree({ subsets: ['latin'], variable: '--fuente-texto', display: 'swap' })
const titulos = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--fuente-titulos', display: 'swap' })

export const metadata: Metadata = {
  title: 'SINESC · Qué se agota y qué sobra, producto por producto',
  description:
    'Sube el export de tu software contable y mira, en semanas de inventario, qué productos se agotan primero y cuáles sobran.',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#ffffff',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={`${texto.variable} ${titulos.variable}`}>
      <body className="font-sans antialiased">
        {children}
        {/* Solo si se activa Web Analytics en Vercel (y se pone ANALITICA_VERCEL=1): si no, su script da 404 en cada página. */}
        {process.env.NODE_ENV === 'production' && process.env.ANALITICA_VERCEL === '1' && <Analytics />}
      </body>
    </html>
  )
}
