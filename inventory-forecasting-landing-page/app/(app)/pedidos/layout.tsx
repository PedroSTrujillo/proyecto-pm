import type { ReactNode } from 'react'
import { SoloRol } from '@/components/app/solo-rol'

// Una sola guardia para /pedidos y sus subpáginas.
export default function Layout({ children }: { children: ReactNode }) {
  return <SoloRol permite={['gerente', 'administrador']}>{children}</SoloRol>
}
