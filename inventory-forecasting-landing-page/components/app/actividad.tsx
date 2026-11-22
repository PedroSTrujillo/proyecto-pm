'use client'

// Actividad del equipo (T20 de docs/PLAN_CORRECCIONES_SINESC.md), solo para el gerente: qué archivos
// subió cada persona de su empresa, qué movimientos registró y qué pedidos hizo. Salen de los
// eventos que la app ya guarda (server/empresas.js, GET /actividad).

import { useEffect, useState } from 'react'
import { api, textoErrores } from '@/lib/api'
import { fechaHora, numero } from '@/lib/formato'
import { Cargando, ErrorLista, Pildoras, Tarjeta, Titulo } from './ui'

type Evento = { quien: string; cargo: string; tipo: string; archivo: string | null; pedido: number | null; cantidad: number | null; fecha: string }
type Filtro = 'todo' | 'archivos' | 'pedidos' | 'movimientos'

const GRUPO: Record<string, Exclude<Filtro, 'todo'>> = {
  archivo_subido: 'archivos',
  export_reusado: 'archivos',
  movimientos_registrados: 'movimientos',
  pedido_enviado: 'pedidos',
  pedido_aprobado: 'pedidos',
  pedido_devuelto: 'pedidos',
  pedido_terminado: 'pedidos',
}

function queHizo(e: Evento) {
  const p = e.pedido ? ` ${e.pedido}` : ''
  switch (e.tipo) {
    case 'archivo_subido': return 'Subió un archivo'
    case 'export_reusado': return 'Volvió a usar el último archivo'
    case 'movimientos_registrados': return e.cantidad === 1 ? 'Registró 1 movimiento' : `Registró ${numero(e.cantidad ?? 0)} movimientos`
    case 'pedido_enviado': return `Envió el pedido${p} a aprobación`
    case 'pedido_aprobado': return `Aprobó el pedido${p}`
    case 'pedido_devuelto': return `Devolvió el pedido${p}`
    case 'pedido_terminado': return `Cerró el pedido${p}`
    default: return e.tipo
  }
}

export function Actividad() {
  const [dias, setDias] = useState<'7' | '30' | '90'>('30')
  const [filtro, setFiltro] = useState<Filtro>('todo')
  const [eventos, setEventos] = useState<Evento[] | null>(null)
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)

  useEffect(() => {
    let vivo = true
    setEventos(null)
    setError(null)
    api<{ eventos: Evento[] }>('GET', `/empresa/actividad?dias=${dias}`)
      .then((r) => vivo && setEventos(r.eventos))
      .catch((e) => vivo && setError(textoErrores(e)))
    return () => {
      vivo = false
    }
  }, [dias])

  const filas = (eventos ?? []).filter((e) => filtro === 'todo' || GRUPO[e.tipo] === filtro)

  return (
    <>
      <Titulo sub="Lo que hizo cada persona de su empresa: los archivos que subió, los movimientos que registró y los pedidos que preparó.">Actividad del equipo</Titulo>
      <Tarjeta className="flex min-w-0 flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Pildoras
            etiqueta="Qué mostrar"
            valor={filtro}
            onCambio={setFiltro}
            opciones={[{ id: 'todo', texto: 'Todo' }, { id: 'archivos', texto: 'Archivos' }, { id: 'pedidos', texto: 'Pedidos' }, { id: 'movimientos', texto: 'Movimientos' }]}
          />
          <Pildoras
            etiqueta="Periodo"
            valor={dias}
            onCambio={setDias}
            opciones={[{ id: '7', texto: 'Últimos 7 días' }, { id: '30', texto: '30 días' }, { id: '90', texto: '3 meses' }]}
          />
        </div>
        {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
        {!error && !eventos && <Cargando />}
        {eventos && (filas.length === 0 ? <p className="text-muted-foreground">No hay actividad en esas fechas.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-separate border-spacing-0 text-cuerpo" data-privado>
              <thead>
                <tr className="text-left text-sm text-muted-foreground">
                  <th scope="col" className="border-b border-border px-2 py-2 font-semibold">Fecha</th>
                  <th scope="col" className="border-b border-border px-2 py-2 font-semibold">Persona</th>
                  <th scope="col" className="border-b border-border px-2 py-2 font-semibold">Qué hizo</th>
                  <th scope="col" className="border-b border-border px-2 py-2 font-semibold">Archivo</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((e, i) => (
                  <tr key={i}>
                    <td className="border-b border-[#f0f1ee] px-2 py-2.5 whitespace-nowrap text-muted-foreground">{fechaHora(e.fecha)}</td>
                    <td className="border-b border-[#f0f1ee] px-2 py-2.5">
                      <strong>{e.quien}</strong>
                      {e.cargo && <span className="block text-nota text-muted-foreground">{e.cargo}</span>}
                    </td>
                    <td className="border-b border-[#f0f1ee] px-2 py-2.5">{queHizo(e)}</td>
                    <td className="border-b border-[#f0f1ee] px-2 py-2.5 break-all text-muted-foreground">{e.archivo || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {eventos && eventos.length >= 300 && <p className="text-nota text-muted-foreground">Se muestran los 300 más recientes. Elija un periodo más corto para ver otros.</p>}
      </Tarjeta>
    </>
  )
}
