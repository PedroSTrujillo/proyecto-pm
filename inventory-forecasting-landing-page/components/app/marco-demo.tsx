'use client'

import { useParams } from 'next/navigation'
import type { ReactNode } from 'react'
import { InventarioProvider } from './contexto'
import { Marco } from './marco'

export function MarcoDemo({ children }: { children: ReactNode }) {
  const { sector } = useParams<{ sector: string }>()!
  return (
    <InventarioProvider fuente={{ tipo: 'demo', sector }}>
      <Marco>{children}</Marco>
    </InventarioProvider>
  )
}
