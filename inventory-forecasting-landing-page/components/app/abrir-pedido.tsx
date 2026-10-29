'use client'

// /pedidos/sugerido (los enlaces del panel y del boletín): abre el pedido desde lo sugerido que la
// persona tiene a medias o, si no hay, prepara uno nuevo.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api, textoErrores } from '@/lib/api'
import { Cargando, ErrorLista } from './ui'

// Una sola petición aunque el efecto corra dos veces (React en desarrollo lo hace, y antes se creaban
// dos borradores). Se suelta al terminar, para que la próxima visita vuelva a preguntar.
let enCurso: Promise<number> | null = null
function abrirOCrear() {
  enCurso ??= (async () => {
    const { pedido } = await api<{ pedido: { id: number } | null }>('GET', '/pedidos/borrador')
    return pedido ? pedido.id : (await api<{ pedido: { id: number } }>('POST', '/pedidos', { modo: 'sugerido' })).pedido.id
  })().finally(() => { enCurso = null })
  return enCurso
}

export function AbrirPedido() {
  const router = useRouter()
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const id = await abrirOCrear()
        if (vivo) router.replace(`/pedidos/${id}`)
      } catch (e) {
        if (vivo) setError(textoErrores(e))
      }
    })()
    return () => {
      vivo = false
    }
  }, [router])
  if (!error) return <Cargando texto="Preparando el pedido…" />
  return (
    <>
      <ErrorLista mensaje={error.mensaje} lista={error.lista} />
      <Link href="/datos" className="self-start font-semibold text-primary hover:text-primary-hover">Ir a Datos</Link>
    </>
  )
}
