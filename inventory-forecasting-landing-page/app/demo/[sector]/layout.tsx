import type { Metadata } from 'next'
import { MarcoDemo } from '@/components/app/marco-demo'

export const metadata: Metadata = {
  title: 'Demo · SINESC',
  description: 'SINESC con datos de ejemplo: qué se agota, qué sobra, el pronóstico y el pedido sugerido.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <MarcoDemo>{children}</MarcoDemo>
}
