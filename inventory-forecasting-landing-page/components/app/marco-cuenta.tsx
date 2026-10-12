'use client'

import type { ReactNode } from 'react'
import { InventarioProvider, SesionProvider, useSesion } from './contexto'
import { Marco } from './marco'
import { Cargando } from './ui'

function ConSesion({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useSesion()
  if (cargando || !usuario) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-10 sm:px-8">
        <Cargando texto="Revisando tu sesión…" />
      </div>
    )
  }
  return (
    <InventarioProvider fuente={{ tipo: 'cuenta' }}>
      <Marco>{children}</Marco>
    </InventarioProvider>
  )
}

export function MarcoCuenta({ children }: { children: ReactNode }) {
  return (
    <SesionProvider exigir>
      <ConSesion>{children}</ConSesion>
    </SesionProvider>
  )
}
