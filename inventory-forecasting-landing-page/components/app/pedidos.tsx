'use client'

// "Pedidos": los pedidos de la prueba y, cuando termina la prueba, el pedido sugerido.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowRight, Sparkles, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, textoErrores } from '@/lib/api'
import { fecha, numero } from '@/lib/formato'
import { useInventario } from './contexto'
import { useConfirmar } from './confirmar'
import { Boton, BotonEnlace, Cargando, ErrorLista, Tarjeta, Titulo } from './ui'

type Resumen = { id: number; proveedor: string; tipo: 'real' | 'simulado' | null; creadoEn: string; paso: number; lineasInicial: number; conteo: { total: number } | null; terminadoEn: string | null }

const NOMBRES_PASOS = ['lo que ibas a pedir', 'ventas y existencias', 'el reporte', 'tu lista final', '¿por qué cambió?']

export function Pedidos() {
  const [pedidos, setPedidos] = useState<Resumen[] | null>(null)
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)
  const [creando, setCreando] = useState(false)
  const router = useRouter()
  const { respuesta, inventario } = useInventario()
  const { ventana, preguntar } = useConfirmar()

  useEffect(() => {
    api<{ pedidos: Resumen[] }>('GET', '/pedidos').then((r) => setPedidos(r.pedidos)).catch((e) => setError(textoErrores(e)))
  }, [])

  async function nuevo() {
    setCreando(true)
    try {
      const { pedido } = await api<{ pedido: { id: number } }>('POST', '/pedidos', {})
      router.push(`/pedidos/${pedido.id}`)
    } catch (e) {
      setError(textoErrores(e))
      setCreando(false)
    }
  }

  if (error) return <ErrorLista mensaje={error.mensaje} lista={error.lista} />
  if (!pedidos) return <Cargando texto="Cargando tus pedidos…" />

  async function borrar(id: number, n: number | undefined) {
    const si = await preguntar(`¿Borrar el Pedido ${n}?`, 'Se borra lo que llevas de este pedido y no se puede deshacer. Los pedidos terminados no se borran.', 'Sí, borrar', true)
    if (!si) return
    try {
      await api('DELETE', `/pedidos/${id}`)
      setPedidos((x) => (x ? x.filter((p) => p.id !== id) : x))
    } catch (e) {
      setError(textoErrores(e))
    }
  }
  // Número para el usuario: el orden en que los empezó (el id es de toda la base).
  const numeros = new Map([...pedidos].sort((a, b) => a.id - b.id).map((p, i) => [p.id, i + 1]))

  return (
    <>
      {ventana}
      <Titulo
        sub="Cada vez que le vayas a pedir a un proveedor: anotas lo que ibas a pedir, miras el reporte y decides tu lista final."
        acciones={<Boton variante="primario" onClick={nuevo} disabled={creando}>{creando ? 'Creando…' : 'Preparar un pedido nuevo'}</Boton>}
      >
        Pedidos
      </Titulo>

      {inventario && (
        respuesta?.sugerencias ? (
          <Tarjeta className="flex flex-wrap items-center justify-between gap-4 border-[#cfe5e1] bg-secondary p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-1 size-5 shrink-0 text-secondary-foreground" />
              <div>
                <h2 className="text-lg font-bold text-secondary-foreground">Pedido sugerido</h2>
                <p className="text-[0.95rem] text-[#0b3f3b]">Si prefieres partir de una propuesta: cuánto pedir de cada producto, por proveedor, para cubrir lo que tarda en llegar. Lo bajas en Excel, lo copias para WhatsApp o lo descargas en PDF para que gerencia lo apruebe.</p>
              </div>
            </div>
            <BotonEnlace href="/pedidos/sugerido" variante="primario">Abrir el pedido sugerido <ArrowRight /></BotonEnlace>
          </Tarjeta>
        ) : respuesta?.finPrueba ? (
          <p className="text-[0.95rem] text-muted-foreground">La cantidad sugerida por producto se activa cuando terminen tus 14 días de prueba, el {fecha(respuesta.finPrueba)}. Mientras tanto, el reporte te muestra las semanas de inventario de cada producto.</p>
        ) : null
      )}

      {pedidos.length === 0 ? (
        <Tarjeta className="p-6 text-muted-foreground">Todavía no tienes pedidos. Empieza el primero con el botón de arriba.</Tarjeta>
      ) : (
        <Tarjeta className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead className="bg-muted text-left text-[0.82rem] text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Pedido</th>
                  <th className="px-4 py-2.5 font-semibold">Empezado</th>
                  <th className="px-4 py-2.5 font-semibold">Tipo</th>
                  <th className="px-4 py-2.5 font-semibold">Estado</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Líneas cambiadas</th>
                  <th className="px-4 py-2.5"><span className="sr-only">Abrir</span></th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-3 font-semibold">Pedido {numeros.get(p.id)}{p.proveedor ? ` · ${p.proveedor}` : ''}</td>
                    <td className="px-4 py-3">{fecha(p.creadoEn)}</td>
                    <td className="px-4 py-3">{p.tipo === 'real' ? 'Real' : p.tipo === 'simulado' ? 'Simulado' : '—'}</td>
                    <td className="px-4 py-3">
                      {p.paso === 6 ? <span className="rounded-full bg-verde-fondo px-2.5 py-0.5 text-xs font-bold text-verde">Terminado</span> : <span className="text-[0.93rem]">Paso {p.paso} de 5: {NOMBRES_PASOS[p.paso - 1]}</span>}
                    </td>
                    <td className={cn('px-4 py-3 text-right tabular-nums', p.conteo && 'font-semibold')}>{p.conteo ? numero(p.conteo.total) : '—'}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link href={`/pedidos/${p.id}`} className="font-semibold text-primary hover:text-primary-hover">{p.paso === 6 ? 'Ver' : 'Continuar'}</Link>
                      {p.paso < 6 && (
                        <button type="button" onClick={() => borrar(p.id, numeros.get(p.id))} aria-label={`Borrar el Pedido ${numeros.get(p.id)}`} title="Borrar este pedido" className="presionable ml-2 inline-flex size-8 items-center justify-center rounded-lg align-middle text-muted-foreground hover:bg-rojo-fondo hover:text-rojo-texto">
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}
    </>
  )
}
