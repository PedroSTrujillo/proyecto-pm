'use client'

// Lo que ve un usuario que todavía no ha subido su inventario. Desde el 2026-10-29 (D9 y D10 de
// docs/PLAN_ALPHA_02.md) se sube desde el comienzo, sin pasar antes por un pedido de 5 pasos.

import Link from 'next/link'
import { useSesion } from './contexto'
import { BotonEnlace, Tarjeta } from './ui'

export function SinInventario() {
  const { usuario } = useSesion()
  return (
    <Tarjeta className="flex max-w-2xl flex-col gap-4 p-7">
      <h1 className="text-2xl font-extrabold">Hola{usuario ? `, ${usuario.nombre.split(' ')[0]}` : ''}: suba su inventario</h1>
      <p className="text-muted-foreground">
        Aún no hay ventas ni existencias. Súbalas una vez, tal como salen de su programa contable: el panel, los productos y el pedido sugerido salen de ahí. Después puede registrar lo que entra y sale cada día en Movimientos.
      </p>
      <p className="text-chico text-muted-foreground">
        Lo que sugiere SINESC es tan bueno como sus datos: con las ventas y las entradas al día, las existencias y lo sugerido también lo están.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <BotonEnlace href="/datos" variante="primario">Subir mis archivos</BotonEnlace>
        <BotonEnlace href="/movimientos">Registrar movimientos</BotonEnlace>
        {usuario?.rol === 'equipo' && <Link href="/ejemplos" className="font-semibold text-primary hover:text-primary-hover">O cargue un ejemplo</Link>}
      </div>
    </Tarjeta>
  )
}
