'use client'

// Páginas del equipo (los ejemplos). Quien no es del equipo y llega por la dirección vuelve a su
// panel.

import { useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { useSesion } from './contexto'
import { Cargando } from './ui'

export function SoloEquipo({ children }: { children: ReactNode }) {
  const { usuario } = useSesion()
  const router = useRouter()
  const esEquipo = usuario?.rol === 'equipo'
  useEffect(() => {
    if (usuario && !esEquipo) router.replace('/panel')
  }, [usuario, esEquipo, router])
  if (!esEquipo) return <Cargando />
  return <>{children}</>
}
