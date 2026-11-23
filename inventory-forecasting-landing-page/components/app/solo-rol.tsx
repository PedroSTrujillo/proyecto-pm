'use client'

// Páginas que no son para todos los roles de la empresa. Quien llega por la dirección sin el rol
// vuelve a la página donde empieza el suyo (el operador, a Movimientos).

import { useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import type { RolEmpresa } from '@/lib/tipos'
import { useSesion } from './contexto'
import { Cargando } from './ui'
import { inicioDe } from './vista'

export function SoloRol({ permite, children }: { permite: RolEmpresa[]; children: ReactNode }) {
  const { usuario } = useSesion()
  const router = useRouter()
  const rol = usuario?.rolEmpresa
  const permitido = Boolean(rol && permite.includes(rol))
  useEffect(() => {
    if (rol && !permitido) router.replace(inicioDe(usuario))
  }, [rol, permitido, router, usuario])
  if (!permitido) return <Cargando />
  return <>{children}</>
}
