'use client'

// Páginas del equipo (resultados de la prueba y ejemplos). Un probador que llegue por la
// dirección vuelve a su panel: no debe ver cómo va la prueba ni los datos de otros.

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
