'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// La versión anterior de la aplicación usaba direcciones con # ("/#/restablecer/…", "/#/entrar").
// Los enlaces que ya se enviaron siguen funcionando: se llevan a la dirección nueva.
export function RedireccionHash() {
  const router = useRouter()
  useEffect(() => {
    const h = window.location.hash
    if (!h.startsWith('#/')) return
    const partes = h.slice(2).split('/').filter(Boolean)
    if (partes[0] === 'restablecer' && partes[1]) router.replace(`/restablecer/${partes[1]}`)
    else if (partes[0] === 'crear-cuenta') router.replace('/crear-cuenta')
    else if (partes[0] === 'entrar' || partes[0] === 'olvide') router.replace(`/${partes[0]}`)
    else if (partes[0] === 'pedido' && partes[1]) router.replace(`/pedidos/${partes[1]}`)
    else if (partes[0] === 'equipo' || partes[0] === 'cuenta') router.replace(`/${partes[0]}`)
    else router.replace('/panel')
  }, [router])
  return null
}
