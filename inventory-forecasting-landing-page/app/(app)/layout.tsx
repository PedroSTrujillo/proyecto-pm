import type { Metadata } from 'next'
import { MarcoCuenta } from '@/components/app/marco-cuenta'

export const metadata: Metadata = { title: 'SINESC', robots: { index: false } }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <MarcoCuenta>{children}</MarcoCuenta>
}
