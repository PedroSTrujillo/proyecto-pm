'use client'

// Lo que ve un usuario que todavía no ha subido su inventario.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api, textoErrores } from '@/lib/api'
import { useSesion } from './contexto'
import { Boton, BotonEnlace, ErrorLista, Tarjeta } from './ui'

const PASOS = [
  ['Anota lo que ibas a pedir', 'antes de ver el reporte: escríbelo, pégalo desde Excel o sube tu archivo de pedido.'],
  ['Sube tus ventas y existencias', 'tal como salen de tu programa contable. Te decimos dónde sacarlas.'],
  ['Mira qué se agota y qué sobra', 'producto por producto, en semanas de inventario.'],
  ['Ajusta tu pedido', 'con lo que de verdad vas a pedir.'],
  ['Cuéntanos por qué', 'cambiaste lo que cambiaste.'],
]

export function SinInventario({ puedeSubir }: { puedeSubir: boolean }) {
  const { usuario } = useSesion()
  const router = useRouter()
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)

  async function empezar() {
    setCreando(true)
    setError(null)
    try {
      const { pedido } = await api<{ pedido: { id: number } }>('POST', '/pedidos', {})
      router.push(`/pedidos/${pedido.id}`)
    } catch (e) {
      setError(textoErrores(e))
      setCreando(false)
    }
  }

  if (puedeSubir) {
    return (
      <Tarjeta className="flex max-w-2xl flex-col gap-4 p-7">
        <h1 className="text-2xl font-extrabold">Sube tu inventario</h1>
        <p className="text-muted-foreground">Todavía no tenemos tus ventas y existencias. Súbelas una vez y quedan guardadas: el panel, los productos y el pedido salen de ahí.</p>
        <BotonEnlace href="/datos" variante="primario" className="self-start">Subir mis archivos</BotonEnlace>
      </Tarjeta>
    )
  }

  return (
    <Tarjeta className="flex max-w-3xl flex-col gap-5 p-7">
      <div className="flex flex-col gap-2">
        <h1 className="text-[1.9rem] font-extrabold">Hola{usuario ? `, ${usuario.nombre.split(' ')[0]}` : ''}</h1>
        <p className="text-[1.05rem] text-muted-foreground">
          Empecemos con tu próximo pedido. Son 5 pasos y toman unos 5 minutos si tienes tus archivos a mano. Al final verás tu panel con todo tu inventario.
        </p>
      </div>
      <ol className="flex flex-col gap-3">
        {PASOS.map(([t, d], i) => (
          <li key={t} className="flex gap-3.5">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-secondary-foreground tabular-nums">{i + 1}</span>
            <span className="pt-1"><strong>{t}</strong> {d}</span>
          </li>
        ))}
      </ol>
      {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
      <div className="flex flex-wrap items-center gap-3">
        <Boton variante="primario" onClick={empezar} disabled={creando}>{creando ? 'Creando…' : 'Preparar mi primer pedido'}</Boton>
        <Link href="/demo" className="font-semibold text-primary hover:text-primary-hover">Antes, mira un ejemplo</Link>
      </div>
      <p className="text-sm text-muted-foreground">¿Por qué primero lo que ibas a pedir? Porque así sabemos si el reporte te hizo cambiar algo. Es lo que estamos midiendo con tu ayuda.</p>
    </Tarjeta>
  )
}
