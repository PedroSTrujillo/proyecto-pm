'use client'

// Preparar el pedido con la cantidad sugerida: por proveedor, editable, y para mandar
// (Excel, WhatsApp o PDF para que gerencia lo apruebe).

import { useMemo, useState } from 'react'
import { Copy, Download, Minus, Plus, Printer, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { duracion, fecha, numero, plata, semanas } from '@/lib/formato'
import type { Inventario, Producto } from '@/lib/tipos'
import { useInventario } from './contexto'
import { Aviso, Boton, Cargando, ChipEstado, ESTADOS, ErrorLista, Pildoras, Tarjeta, Titulo, claseEntrada } from './ui'
import { SinInventario } from './sin-inventario'

export function PedidoSugerido({ encabezado = true }: { encabezado?: boolean }) {
  const { inventario, cargando, error, respuesta } = useInventario()
  if (cargando) return <Cargando texto="Cargando el pedido…" />
  if (error) return <ErrorLista mensaje={error} />
  if (!inventario) return <SinInventario puedeSubir={Boolean(respuesta?.puedeSubir)} />
  if (!inventario.sugerencias) {
    return (
      <Aviso titulo="La cantidad sugerida todavía no está activa">
        Se activa cuando terminen tus 14 días de prueba{respuesta?.finPrueba ? `, el ${fecha(respuesta.finPrueba)}` : ''}. Mientras tanto, prepara tus pedidos desde &quot;Pedidos&quot;: el reporte te muestra las semanas de inventario de cada producto.
      </Aviso>
    )
  }
  return <PedidoCon inv={inventario} encabezado={encabezado} />
}

function mensajeWhatsapp(proveedor: string, lineas: { p: Producto; cantidad: number }[], empresa?: string) {
  const items = lineas.map(({ p, cantidad }) => `• ${numero(cantidad)} × ${p.nombre} (${p.codigo})`).join('\n')
  return `Buenos días. ${empresa ? `Para ${empresa}, ` : ''}por favor:\n${items}\nQuedo atento a la fecha de entrega. Gracias.`
}

function PedidoCon({ inv, encabezado }: { inv: Inventario; encabezado: boolean }) {
  const { pedido, ponerEnPedido, vaciarPedido } = useInventario()
  const [proveedor, setProveedor] = useState('todos')
  const [aviso, setAviso] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const porCodigo = useMemo(() => new Map(inv.productos.map((p) => [p.codigo, p])), [inv])

  // Filas: lo que está en el pedido y lo que se sugiere pedir aunque no lo hayas agregado.
  const filas = useMemo(() => {
    const set = new Set<string>(Object.keys(pedido))
    for (const p of inv.productos) if (p.sugerido && p.sugerido > 0 && (p.estado === 'agota' || p.estado === 'pide' || p.estado === 'normal')) set.add(p.codigo)
    return [...set]
      .map((c) => porCodigo.get(c))
      .filter((p): p is Producto => Boolean(p))
      .sort((a, b) => a.proveedor.localeCompare(b.proveedor, 'es') || (a.semanas ?? Infinity) - (b.semanas ?? Infinity))
  }, [inv, pedido, porCodigo])

  const proveedores = [...new Set(filas.map((p) => p.proveedor))]
  const visibles = filas.filter((p) => proveedor === 'todos' || p.proveedor === proveedor)
  const enPedido = filas.filter((p) => pedido[p.codigo] > 0).map((p) => ({ p, cantidad: pedido[p.codigo] }))
  const total = enPedido.reduce((s, x) => s + x.cantidad * (x.p.costo ?? 0), 0)
  const unidades = enPedido.reduce((s, x) => s + x.cantidad, 0)
  const delMensaje = proveedor === 'todos' ? proveedores.find((pr) => enPedido.some((x) => x.p.proveedor === pr)) || proveedores[0] : proveedor
  const lineasMensaje = enPedido.filter((x) => x.p.proveedor === delMensaje)
  const conCostos = inv.resumen.tieneCostos

  function cambiar(p: Producto, valor: number) {
    ponerEnPedido(p.codigo, Math.max(0, valor))
    setAviso(null)
  }

  async function exportar() {
    setAviso(null)
    try {
      const r = await fetch('/api/exportar/pedido.xlsx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa: inv.fuente.empresa, lineas: enPedido.map(({ p, cantidad }) => ({ proveedor: p.proveedor, codigo: p.codigo, nombre: p.nombre, cantidad, costo: p.costo })) }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No pudimos armar el archivo.')
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pedido-${new Date().toLocaleDateString('en-CA')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      setAviso('Listo: el Excel trae una hoja por proveedor y un resumen para aprobar.')
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No pudimos armar el archivo.')
    }
  }

  async function copiar() {
    const texto = mensajeWhatsapp(delMensaje, lineasMensaje, inv.fuente.empresa)
    try {
      await navigator.clipboard.writeText(texto)
      setAviso(`Copiado el mensaje para ${delMensaje}. Pégalo en WhatsApp.`)
    } catch {
      setAviso('Tu navegador no dejó copiar. Selecciona el mensaje de abajo y cópialo a mano.')
    }
  }

  function volverASugerido() {
    vaciarPedido()
    for (const p of inv.productos) if ((p.estado === 'agota' || p.estado === 'pide') && p.sugerido) ponerEnPedido(p.codigo, p.sugerido)
    setAviso(null)
  }

  const opcionesAgregar = busca.trim().length >= 2
    ? inv.productos.filter((p) => !pedido[p.codigo] && (p.codigo.toLowerCase().includes(busca.toLowerCase()) || p.nombre.toLowerCase().includes(busca.toLowerCase()))).slice(0, 6)
    : []

  return (
    <>
      {encabezado && (
        <Titulo sub={`Lo sugerido cubre lo que tarda cada proveedor y ${duracion(inv.ajustes.cadaCuanto)} más, en 9 de cada 10 casos. Cámbialo como quieras.`}>
          Pedido de la semana
        </Titulo>
      )}

      <div className="flex flex-wrap items-start gap-5">
        <Tarjeta aria-labelledby="t-lista" className="no-imprimir min-w-0 flex-[999_1_600px] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="t-lista" className="text-xl font-bold">Lo que vas a pedir</h2>
            {proveedores.length > 1 && (
              <Pildoras
                etiqueta="Filtrar por proveedor"
                valor={proveedor}
                onCambio={setProveedor}
                opciones={[{ id: 'todos', texto: 'Todos' }, ...proveedores.map((p) => ({ id: p, texto: p, cuenta: filas.filter((f) => f.proveedor === p && pedido[f.codigo] > 0).length }))]}
              />
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="text-left text-[0.82rem] text-muted-foreground">
                  <th scope="col" className="border-b border-border px-2 py-2.5 font-semibold">Producto</th>
                  <th scope="col" className="border-b border-border px-2 py-2.5 text-right font-semibold">Te alcanza</th>
                  <th scope="col" className="border-b border-border px-2 py-2.5 text-right font-semibold">Sugerido</th>
                  <th scope="col" className="border-b border-border px-2 py-2.5 text-center font-semibold">Tu cantidad</th>
                  {conCostos && <th scope="col" className="border-b border-border px-2 py-2.5 text-right font-semibold">Valor</th>}
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const c = pedido[p.codigo] || 0
                  const distinto = c !== (p.sugerido ?? 0)
                  return (
                    <tr key={p.codigo} className={cn(c === 0 && 'text-muted-foreground')}>
                      <td className="border-b border-[#f0f1ee] px-2 py-2.5">
                        <span className="block text-xs text-muted-foreground">{p.codigo} · {p.proveedor}</span>
                        <span className={cn('font-semibold', c > 0 && 'text-foreground')}>{p.nombre}</span>
                        <span className="ml-2 align-middle"><ChipEstado estado={p.estado} /></span>
                      </td>
                      <td className="border-b border-[#f0f1ee] px-2 py-2.5 text-right whitespace-nowrap">
                        <strong className={cn('tabular-nums', ESTADOS[p.estado].numero)}>{semanas(p.semanas)}</strong>
                        <span className="text-sm text-muted-foreground"> sem</span>
                      </td>
                      <td className="border-b border-[#f0f1ee] px-2 py-2.5 text-right">
                        <button
                          type="button"
                          title="Usar lo sugerido"
                          onClick={() => cambiar(p, p.sugerido ?? 0)}
                          className={cn('presionable min-h-9 rounded-lg border border-dashed px-2.5 text-[0.95rem] font-bold tabular-nums', distinto ? 'border-highlight bg-[#f2faf8] text-secondary-foreground hover:bg-secondary' : 'border-transparent text-muted-foreground')}
                        >
                          {numero(p.sugerido)}
                        </button>
                      </td>
                      <td className="border-b border-[#f0f1ee] px-2 py-2.5">
                        <span className="flex items-center justify-center gap-1.5">
                          <button type="button" aria-label={`Quitar una unidad de ${p.nombre}`} onClick={() => cambiar(p, c - 1)} className="presionable inline-flex size-9 items-center justify-center rounded-lg border border-input bg-card hover:bg-muted">
                            <Minus className="size-4" />
                          </button>
                          <input
                            aria-label={`Cantidad de ${p.nombre}`}
                            inputMode="numeric"
                            value={c || ''}
                            placeholder="0"
                            onChange={(e) => cambiar(p, Number(e.target.value.replace(/\D/g, '')) || 0)}
                            className="h-9 w-16 rounded-lg border border-input bg-card text-center font-bold tabular-nums text-foreground focus:border-primary focus:outline-3 focus:outline-ring"
                          />
                          <button type="button" aria-label={`Agregar una unidad de ${p.nombre}`} onClick={() => cambiar(p, c + 1)} className="presionable inline-flex size-9 items-center justify-center rounded-lg border border-input bg-card hover:bg-muted">
                            <Plus className="size-4" />
                          </button>
                        </span>
                      </td>
                      {conCostos && <td className="border-b border-[#f0f1ee] px-2 py-2.5 text-right whitespace-nowrap tabular-nums">{c && p.costo ? plata(c * p.costo) : '—'}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div className="relative w-full max-w-sm">
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                Agregar otro producto
                <input className={claseEntrada} placeholder="Código o nombre" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </label>
              {opcionesAgregar.length > 0 && (
                <ul className="aparecer absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                  {opcionesAgregar.map((p) => (
                    <li key={p.codigo}>
                      <button type="button" className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-muted" onClick={() => { cambiar(p, Math.max(p.sugerido ?? 0, 1)); setBusca('') }}>
                        <span><span className="block text-xs text-muted-foreground">{p.codigo}</span>{p.nombre}</span>
                        <span className="text-sm whitespace-nowrap text-muted-foreground">{semanas(p.semanas)} sem</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Boton tamano="chico" variante="fantasma" onClick={volverASugerido}><RotateCcw /> Volver a lo sugerido</Boton>
          </div>
        </Tarjeta>

        <aside className="no-imprimir flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <Tarjeta aria-labelledby="t-resumen" className="flex flex-col gap-4 p-5">
            <h2 id="t-resumen" className="text-lg font-bold">Resumen</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-secondary p-3">
                <span className="block text-[0.82rem] font-semibold text-secondary-foreground">Líneas</span>
                <strong className="font-display text-[1.8rem] tabular-nums text-secondary-foreground">{numero(enPedido.length)}</strong>
              </div>
              <div className="rounded-xl bg-muted p-3">
                <span className="block text-[0.82rem] font-semibold text-muted-foreground">{conCostos ? 'Valor a costo' : 'Unidades'}</span>
                <strong className="font-display text-[1.5rem] tabular-nums">{conCostos ? plata(total) : numero(unidades)}</strong>
              </div>
            </div>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-[0.93rem]">
              {proveedores.map((pr) => {
                const ls = enPedido.filter((x) => x.p.proveedor === pr)
                if (!ls.length) return null
                return (
                  <div key={pr} className="contents">
                    <dt className="text-muted-foreground">{pr} <span className="text-[0.82rem]">({ls.length})</span></dt>
                    <dd className="text-right font-semibold tabular-nums">{conCostos ? plata(ls.reduce((s, x) => s + x.cantidad * (x.p.costo ?? 0), 0)) : numero(ls.reduce((s, x) => s + x.cantidad, 0))}</dd>
                  </div>
                )
              })}
            </dl>
            <div className="flex flex-col gap-2">
              <Boton variante="primario" onClick={exportar} disabled={!enPedido.length}><Download /> Exportar a Excel</Boton>
              <Boton onClick={copiar} disabled={!lineasMensaje.length}><Copy /> Copiar para WhatsApp</Boton>
              <Boton onClick={() => window.print()} disabled={!enPedido.length}><Printer /> PDF para que gerencia lo apruebe</Boton>
            </div>
            {aviso && <Aviso tono="ok">{aviso}</Aviso>}
          </Tarjeta>
          {lineasMensaje.length > 0 && (
            <Tarjeta aria-labelledby="t-mensaje" className="flex flex-col gap-2.5 p-5">
              <h2 id="t-mensaje" className="text-base font-bold">Mensaje para {delMensaje}</h2>
              <p className="rounded-xl border border-[#d5ede9] bg-[#f2faf8] px-3.5 py-3 text-[0.9rem] whitespace-pre-line">{mensajeWhatsapp(delMensaje, lineasMensaje, inv.fuente.empresa)}</p>
            </Tarjeta>
          )}
        </aside>
      </div>

      <ImprimirPedido inv={inv} lineas={enPedido} />
    </>
  )
}

// La versión para imprimir o guardar como PDF: por proveedor, con totales y espacio para la firma.
function ImprimirPedido({ inv, lineas }: { inv: Inventario; lineas: { p: Producto; cantidad: number }[] }) {
  const proveedores = [...new Set(lineas.map((x) => x.p.proveedor))]
  const conCostos = inv.resumen.tieneCostos
  return (
    <div className="hidden print:block">
      <h1 className="text-2xl font-bold">Pedido para aprobar{inv.fuente.empresa ? ` · ${inv.fuente.empresa}` : ''}</h1>
      <p className="mb-4 text-sm">Preparado el {fecha(new Date().toISOString())} con SINESC. Cantidades sugeridas para cubrir el tiempo de entrega y {duracion(inv.ajustes.cadaCuanto)} más.</p>
      {proveedores.map((pr) => {
        const ls = lineas.filter((x) => x.p.proveedor === pr)
        return (
          <section key={pr} className="mb-5 break-inside-avoid">
            <h2 className="mb-1 text-lg font-bold">{pr}</h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-1">Código</th><th>Producto</th><th className="text-right">Te alcanza</th><th className="text-right">Cantidad</th>{conCostos && <th className="text-right">Valor</th>}
                </tr>
              </thead>
              <tbody>
                {ls.map(({ p, cantidad }) => (
                  <tr key={p.codigo} className="border-b border-gray-200">
                    <td className="py-1">{p.codigo}</td><td>{p.nombre}</td><td className="text-right">{semanas(p.semanas)} sem</td><td className="text-right">{numero(cantidad)}</td>{conCostos && <td className="text-right">{plata(cantidad * (p.costo ?? 0))}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}
      <p className="mt-10 text-sm">Aprobado por: ______________________________ &nbsp; Fecha: ______________</p>
    </div>
  )
}
