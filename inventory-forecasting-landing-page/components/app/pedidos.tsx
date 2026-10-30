'use client'

// "Pedidos": preparar un pedido desde lo sugerido (lo de siempre) o comparar con la propia lista
// en 5 pasos (D9 de docs/PLAN_ALPHA_02.md), y la lista de pedidos.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowRight, Ban, ListChecks, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import { api, textoErrores } from '@/lib/api'
import { fecha, numero } from '@/lib/formato'
import type { EstadoAprobacion } from '@/lib/tipos'
import { useInventario, useSesion } from './contexto'
import { useConfirmar } from './confirmar'
import { Aviso, Boton, Cargando, ChipAprobacion, ErrorLista, Tarjeta, Titulo } from './ui'
import { PorRecibir } from './recepcion'

type Resumen = { id: number; modo: 'lista' | 'sugerido'; proveedor: string; creadoEn: string; paso: number; lineas: number | null; terminadoEn: string | null; aprobacion: EstadoAprobacion | null; aprobado: boolean; anulado: { en: string; motivo: string } | null }
type PorAprobarFila = { id: number; numero: number; preparadoPor: string; enviadoEn: string; lineas: number; observaciones: string }

const FORMAS: { icono: React.ReactNode; titulo: string; texto: string }[] = [
  { icono: <Sparkles />, titulo: 'Preparar pedido', texto: 'Arranca con lo que sugiere SINESC, por proveedor. Usted decide qué quitar, qué ajustar y qué agregar, y lo cierra. Sale en PDF, Excel o WhatsApp.' },
  { icono: <ListChecks />, titulo: 'Comparar con mi propia lista', texto: 'Primero escribe lo que iba a pedir y después lo compara con el reporte, línea por línea, en 5 pasos.' },
]

const NOMBRES_PASOS = ['lo que iba a pedir', 'ventas y existencias', 'el reporte', 'su lista final', 'su pedido']

export function Pedidos() {
  const [pedidos, setPedidos] = useState<Resumen[] | null>(null)
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)
  const [creando, setCreando] = useState(false)
  const router = useRouter()
  const { inventario, recargar } = useInventario()
  const { ventana, preguntar, preguntarTexto } = useConfirmar()

  useEffect(() => {
    api<{ pedidos: Resumen[] }>('GET', '/pedidos').then((r) => setPedidos(r.pedidos)).catch((e) => setError(textoErrores(e)))
  }, [])

  // Desde lo sugerido: si ya hay uno abierto se sigue con ese, para no tener dos a medias.
  async function nuevo(modo: 'sugerido' | 'lista') {
    if (modo === 'sugerido' && abierto) return router.push(`/pedidos/${abierto.id}`)
    setCreando(true)
    try {
      const { pedido } = await api<{ pedido: { id: number } }>('POST', '/pedidos', modo === 'sugerido' ? { modo } : {})
      router.push(`/pedidos/${pedido.id}`)
    } catch (e) {
      setError(textoErrores(e))
      setCreando(false)
    }
  }

  if (!pedidos && !error) return <Cargando texto="Cargando sus pedidos…" />
  // El que se sigue preparando (uno enviado a aprobación ya no se toca).
  const abierto = (pedidos || []).find((p) => p.modo === 'sugerido' && p.paso !== 6 && !p.anulado && p.aprobacion !== 'por_aprobar')

  async function borrar(id: number, n: number | undefined) {
    const si = await preguntar(`¿Borrar el Pedido ${n}?`, 'Se borra lo que lleva de este pedido y no se puede deshacer. Los pedidos terminados no se borran.', 'Sí, borrar', true)
    if (!si) return
    try {
      await api('DELETE', `/pedidos/${id}`)
      setPedidos((x) => (x ? x.filter((p) => p.id !== id) : x))
      recargar() // si el archivo era de ese pedido, el panel y Datos ya no lo usan
    } catch (e) {
      setError(textoErrores(e))
    }
  }
  async function anular(id: number, n: number | undefined) {
    const motivo = await preguntarTexto(`¿Anular el Pedido ${n}?`, 'Queda guardado, pero no se puede editar ni cuenta en sus resultados. Lo puede reactivar después.', 'Motivo (opcional)', 'Sí, anular')
    if (motivo === null) return
    try {
      const { pedido } = await api<{ pedido: { anulado: Resumen['anulado'] } }>('POST', `/pedidos/${id}/anular`, { motivo })
      setPedidos((x) => (x ? x.map((p) => (p.id === id ? { ...p, anulado: pedido.anulado } : p)) : x))
    } catch (e) {
      setError(textoErrores(e))
    }
  }
  async function reactivar(id: number) {
    try {
      await api('POST', `/pedidos/${id}/reactivar`)
      setPedidos((x) => (x ? x.map((p) => (p.id === id ? { ...p, anulado: null } : p)) : x))
    } catch (e) {
      setError(textoErrores(e))
    }
  }
  // Número para el usuario: el orden en que los empezó (el id es de toda la base).
  const numeros = new Map([...(pedidos || [])].sort((a, b) => a.id - b.id).map((p, i) => [p.id, i + 1]))

  return (
    <>
      {ventana}
      <Titulo
        sub="Arranca con lo que sugiere SINESC, por proveedor. Usted lo ajusta y lo cierra."
        acciones={
          <>
            <Boton variante="primario" onClick={() => nuevo('sugerido')} disabled={creando || !inventario}>
              {creando ? 'Creando…' : abierto ? `Seguir con el Pedido ${numeros.get(abierto.id)}` : 'Preparar pedido'} <ArrowRight />
            </Boton>
            <Boton onClick={() => nuevo('lista')} disabled={creando}>Comparar con mi propia lista</Boton>
          </>
        }
      >
        Pedidos
      </Titulo>

      {!inventario && (
        <Aviso tono="cuidado" titulo="Primero su inventario">
          Para que SINESC sugiera qué pedir, suba el archivo de su programa contable en <a href="/datos" className="font-semibold underline underline-offset-2">Datos</a> o registre sus entradas y salidas en <a href="/movimientos" className="font-semibold underline underline-offset-2">Movimientos</a>.
        </Aviso>
      )}
      {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
      <PorAprobar />
      <PorRecibir />

      {!pedidos || pedidos.length === 0 ? (
        <Tarjeta className="flex flex-col gap-4 p-5 sm:p-6">
          <h2 className="text-lg font-bold">Dos formas de armar un pedido</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {FORMAS.map((f) => (
              <li key={f.titulo} className="flex gap-3 rounded-xl border border-border p-4">
                <span className="mt-0.5 text-primary [&_svg]:size-5">{f.icono}</span>
                <span className="flex flex-col gap-1">
                  <strong className="text-cuerpo">{f.titulo}</strong>
                  <span className="text-chico text-muted-foreground">{f.texto}</span>
                </span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      ) : (
        <Tarjeta className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead className="bg-muted text-left text-nota text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Pedido</th>
                  <th className="px-4 py-2.5 font-semibold">Empezado</th>
                  <th className="px-4 py-2.5 font-semibold">Cómo</th>
                  <th className="px-4 py-2.5 font-semibold">Estado</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Productos</th>
                  <th className="px-4 py-2.5"><span className="sr-only">Abrir</span></th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-3 font-semibold">Pedido {numeros.get(p.id)}{p.proveedor ? ` · ${p.proveedor}` : ''}</td>
                    <td className="px-4 py-3">{fecha(p.creadoEn)}</td>
                    <td className="px-4 py-3 text-chico">{p.modo === 'sugerido' ? 'Desde lo sugerido' : 'Con mi lista'}</td>
                    <td className="px-4 py-3">
                      {p.anulado ? (
                        <span title={p.anulado.motivo || undefined} className="rounded-full bg-rojo-fondo px-2.5 py-0.5 text-nota font-bold text-rojo-texto">Anulado</span>
                      ) : p.paso === 6 ? <span className="rounded-full bg-verde-fondo px-2.5 py-0.5 text-nota font-bold text-verde">{p.modo === 'sugerido' ? (p.aprobado ? 'Aprobado' : 'Cerrado') : 'Terminado'}</span>
                        : p.modo === 'sugerido' ? <ChipAprobacion estado={p.aprobacion ?? 'preparando'} />
                        : <span className="text-chico">Paso {p.paso} de 5: {NOMBRES_PASOS[p.paso - 1]}</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.lineas === null ? '—' : numero(p.lineas)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link href={`/pedidos/${p.id}`} className="font-semibold text-primary hover:text-primary-hover">{p.paso === 6 || p.anulado ? 'Ver' : 'Continuar'}</Link>
                      {p.anulado ? (
                        <button type="button" onClick={() => reactivar(p.id)} aria-label={`Reactivar el Pedido ${numeros.get(p.id)}`} title="Reactivar" className="presionable ml-2 inline-flex size-8 items-center justify-center rounded-lg align-middle text-muted-foreground hover:bg-muted hover:text-foreground">
                          <RotateCcw className="size-4" />
                        </button>
                      ) : (
                        <button type="button" onClick={() => anular(p.id, numeros.get(p.id))} aria-label={`Anular el Pedido ${numeros.get(p.id)}`} title="Anular: queda guardado, pero no cuenta" className="presionable ml-2 inline-flex size-8 items-center justify-center rounded-lg align-middle text-muted-foreground hover:bg-rojo-fondo hover:text-rojo-texto">
                          <Ban className="size-4" />
                        </button>
                      )}
                      {p.paso < 5 && !p.anulado && (p.aprobacion === null || p.aprobacion === 'preparando') && (
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

// Los pedidos de la empresa que esperan aprobación, para quien aprueba (D11). A los demás no se les muestra.
function PorAprobar() {
  const { usuario } = useSesion()
  const [filas, setFilas] = useState<PorAprobarFila[] | null>(null)
  const aprueba = Boolean(usuario?.aprueba)

  useEffect(() => {
    if (!aprueba) return
    api<{ pedidos: PorAprobarFila[] }>('GET', '/pedidos/por-aprobar').then((r) => setFilas(r.pedidos)).catch(() => setFilas([]))
  }, [aprueba])

  if (!aprueba || !filas || !filas.length) return null
  return (
    <Tarjeta className="flex flex-col gap-3 p-5 sm:p-6">
      <div>
        <h2 className="text-xl font-bold">Por aprobar</h2>
        <p className="text-chico text-muted-foreground">Ábralo, ajuste lo que haga falta y apruébelo o devuélvalo con un comentario.</p>
      </div>
      <ul className="divide-y divide-border">
        {filas.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="flex min-w-0 flex-col">
              <strong>Pedido {p.numero} de {p.preparadoPor}</strong>
              <span className="text-chico text-muted-foreground">Enviado el {fecha(p.enviadoEn)} · {numero(p.lineas)} {p.lineas === 1 ? 'producto' : 'productos'}{p.observaciones ? ` · ${p.observaciones}` : ''}</span>
            </span>
            <Link href={`/pedidos/${p.id}`} className="inline-flex items-center gap-1.5 font-semibold text-primary hover:text-primary-hover">Revisar <ArrowRight className="size-4" /></Link>
          </li>
        ))}
      </ul>
    </Tarjeta>
  )
}
