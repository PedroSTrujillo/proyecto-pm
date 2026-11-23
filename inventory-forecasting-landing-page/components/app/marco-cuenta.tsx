'use client'

import type { ReactNode } from 'react'
import { InventarioProvider, SesionProvider, useSesion } from './contexto'
import { Activar } from './activar'
import { Marco } from './marco'
import { Cargando } from './ui'

function ConSesion({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useSesion()
  if (cargando || !usuario) {
    return (
      <div className="tema-app min-h-dvh px-4 py-10 sm:px-8">
        <Cargando texto="Revisando su sesión…" />
      </div>
    )
  }
  if (usuario.pendienteCodigo) return <Activar />
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
