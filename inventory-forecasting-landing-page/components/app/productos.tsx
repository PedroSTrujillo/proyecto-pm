'use client'

// Lista de productos con búsqueda y filtros, y la ficha de cada uno.

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useId, useMemo, useState } from 'react'
import { Download, Search, X } from 'lucide-react'
import { descargar } from '@/lib/descargar'
import { cn } from '@/lib/utils'
import { claveCodigo, duracion, mesAnio, numero, plata, porcentaje, semanas, ventasSemana } from '@/lib/formato'
import type { Estado, Inventario, Producto } from '@/lib/tipos'
import { useInventario } from './contexto'
import { BarraRiesgo, GraficoVentas, LeyendaVentas, Sparkline } from './graficos'
import { Boton, Cargando, ChipEstado, ESTADOS, ErrorLista, Pildoras, Tarjeta, Titulo, claseEntrada } from './ui'
import { SinInventario } from './sin-inventario'

type Filtro = 'todos' | Estado
type Orden = 'semanas' | 'riesgo' | 'valor' | 'ventas'
const POR_PAGINA = 60

export function Productos() {
  const { inventario, cargando, error, respuesta } = useInventario()
  if (cargando) return <Cargando texto="Cargando tus productos…" />
  if (error) return <ErrorLista mensaje={error} />
  if (!inventario) return <SinInventario puedeSubir={Boolean(respuesta?.puedeSubir)} />
  return <ProductosCon inv={inventario} />
}

function ordenar(lista: Producto[], orden: Orden) {
  const s = (p: Producto) => (p.semanas === null ? Infinity : p.semanas)
  const copia = [...lista]
  if (orden === 'semanas') copia.sort((a, b) => s(a) - s(b) || b.ventasSemana - a.ventasSemana)
  if (orden === 'riesgo') copia.sort((a, b) => (b.riesgo ?? -1) - (a.riesgo ?? -1) || s(a) - s(b))
  if (orden === 'valor') copia.sort((a, b) => (b.valor ?? b.existencias) - (a.valor ?? a.existencias))
  if (orden === 'ventas') copia.sort((a, b) => b.ventasSemana - a.ventasSemana)
  return copia
}

function ProductosCon({ inv }: { inv: Inventario }) {
  const params = useSearchParams()!
  const router = useRouter()
  const ruta = usePathname()!
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<Filtro>((params.get('filtro') as Filtro) || 'todos')
  const [proveedor, setProveedor] = useState('todos')
  const [orden, setOrden] = useState<Orden>('semanas')
  const [mostrar, setMostrar] = useState(POR_PAGINA)
  const seleccionado = params.get('p')

  useEffect(() => setMostrar(POR_PAGINA), [q, filtro, proveedor, orden])

  // Escape cierra la ficha.
  useEffect(() => {
    if (!seleccionado) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && abrir(null)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  })

  // Enter abre la ficha; las flechas recorren la lista y, si la ficha está abierta, la ficha las sigue.
  function alTeclear(e: React.KeyboardEvent<HTMLTableRowElement>, codigo: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      abrir(codigo)
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const otra = (e.key === 'ArrowDown' ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling) as HTMLTableRowElement | null
    if (!otra) return
    otra.focus()
    if (seleccionado && otra.dataset.codigo) abrir(otra.dataset.codigo)
  }

  const buscado = q.trim().toLowerCase()
  const coincide = (p: Producto) =>
    (!buscado || p.codigo.toLowerCase().includes(buscado) || p.nombre.toLowerCase().includes(buscado)) && (proveedor === 'todos' || p.proveedor === proveedor)
  const base = inv.productos.filter(coincide)
  const lista = useMemo(() => ordenar(base.filter((p) => filtro === 'todos' || p.estado === filtro), orden), [base, filtro, orden])
  const cuenta = (e: Estado) => base.filter((p) => p.estado === e).length
  const producto = seleccionado ? inv.productos.find((p) => p.codigo === seleccionado) || null : null

  function abrir(codigo: string | null) {
    const sp = new URLSearchParams(params.toString())
    if (codigo) sp.set('p', codigo)
    else sp.delete('p')
    router.replace(`${ruta}${sp.size ? `?${sp}` : ''}`, { scroll: false })
  }

  const opciones: { id: Filtro; texto: string; cuenta: number }[] = [
    { id: 'todos', texto: 'Todos', cuenta: base.length },
    { id: 'agota', texto: 'Se agotan', cuenta: cuenta('agota') },
    { id: 'pide', texto: 'Pide ya', cuenta: cuenta('pide') },
    { id: 'normal', texto: 'Normales', cuenta: cuenta('normal') },
    { id: 'sobra', texto: 'Sobran', cuenta: cuenta('sobra') },
  ]
  // Durante la prueba no hay tiempo de entrega, así que no existe "pide ya".
  if (inv.alcance === 'prueba') opciones.splice(2, 1)
  if (cuenta('sin_ventas')) opciones.push({ id: 'sin_ventas', texto: 'Sin ventas', cuenta: cuenta('sin_ventas') })

  return (
    <>
      <Titulo sub="Ordenados por lo que se acaba primero. Toca un producto para ver su ficha." acciones={inv.sugerencias ? <DescargarMinimos inv={inv} /> : undefined}>Productos</Titulo>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative w-full sm:w-auto sm:min-w-60 sm:flex-1 sm:max-w-md">
            <span className="sr-only">Buscar por código o nombre</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" />
            <input className={cn(claseEntrada, 'pl-10')} type="search" placeholder="Buscar por código o nombre" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {inv.proveedores.length > 1 && (
            <label className="flex w-full min-w-0 flex-col gap-1 text-sm font-semibold text-muted-foreground sm:w-auto sm:flex-row sm:items-center sm:gap-2">
              Proveedor
              <select className={cn(claseEntrada, 'text-[0.95rem] sm:w-auto sm:max-w-64')} value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
                <option value="todos">Todos</option>
                {inv.proveedores.map((p) => <option key={p.nombre} value={p.nombre}>{p.nombre}</option>)}
              </select>
            </label>
          )}
          <label className="flex w-full min-w-0 flex-col gap-1 text-sm font-semibold text-muted-foreground sm:w-auto sm:flex-row sm:items-center sm:gap-2">
            Ordenar
            <select className={cn(claseEntrada, 'text-[0.95rem] sm:w-auto')} value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
              <option value="semanas">Lo que se acaba primero</option>
              {inv.alcance !== 'prueba' && <option value="riesgo">Mayor riesgo</option>}
              <option value="valor">{inv.resumen.tieneCostos ? 'Más plata en inventario' : 'Más unidades'}</option>
              <option value="ventas">Más vendidos</option>
            </select>
          </label>
        </div>
        <Pildoras<Filtro> etiqueta="Filtrar productos" valor={filtro} onCambio={setFiltro} opciones={opciones} />
      </div>

      <div className="flex items-start gap-5">
        <Tarjeta aria-label="Lista de productos" className="min-w-0 flex-1 px-3 py-1 sm:px-4">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse sm:min-w-[620px]">
              <thead>
                <tr className="text-left text-[0.82rem] text-muted-foreground">
                  <th scope="col" className="border-b border-border px-2 py-3 font-semibold">Producto</th>
                  <th scope="col" className="hidden border-b border-border px-2 py-3 font-semibold md:table-cell">Últimas 16 semanas</th>
                  <th scope="col" className="hidden border-b border-border px-2 py-3 text-right font-semibold sm:table-cell">Ventas/semana</th>
                  <th scope="col" className="hidden border-b border-border px-2 py-3 text-right font-semibold sm:table-cell">Tienes</th>
                  <th scope="col" className="border-b border-border px-2 py-3 text-right font-semibold">Te alcanza</th>
                </tr>
              </thead>
              <tbody>
                {lista.slice(0, mostrar).map((p) => (
                  <tr
                    key={p.codigo}
                    tabIndex={0}
                    aria-selected={p.codigo === seleccionado}
                    onClick={() => abrir(p.codigo)}
                    data-codigo={p.codigo}
                    onKeyDown={(e) => alTeclear(e, p.codigo)}
                    className={cn('cursor-pointer transition-colors duration-100 hover:bg-[#f8faf7] focus-visible:bg-[#f8faf7]', p.codigo === seleccionado && 'bg-secondary hover:bg-secondary')}
                  >
                    <td className="border-b border-[#f0f1ee] px-2 py-3">
                      <span className="block text-xs tracking-wide text-muted-foreground">{p.codigo}{p.proveedor !== 'Sin proveedor' ? ` · ${p.proveedor}` : ''}</span>
                      <span className="font-semibold">{p.nombre}</span>
                      <span className="block text-[0.82rem] text-muted-foreground sm:hidden">Vende {ventasSemana(p.ventasSemana)} por semana · tienes {numero(p.existencias)}</span>
                    </td>
                    <td className="hidden border-b border-[#f0f1ee] px-2 py-3 md:table-cell">
                      {p.serie ? <Sparkline valores={p.serie.slice(-16)} color={p.estado === 'sobra' || p.estado === 'sin_ventas' ? '#6b8bb8' : undefined} /> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="hidden border-b border-[#f0f1ee] px-2 py-3 text-right font-semibold tabular-nums sm:table-cell">{ventasSemana(p.ventasSemana)}</td>
                    <td className="hidden border-b border-[#f0f1ee] px-2 py-3 text-right tabular-nums sm:table-cell">{numero(p.existencias)}</td>
                    <td className="border-b border-[#f0f1ee] px-2 py-3 text-right whitespace-nowrap">
                      {p.semanas === null ? (
                        <span className="text-muted-foreground">sin ventas</span>
                      ) : (
                        <>
                          <strong className={cn('font-display text-lg tabular-nums', ESTADOS[p.estado].numero)}>{semanas(p.semanas)}</strong>
                          <span className="text-sm text-muted-foreground"> sem</span>
                        </>
                      )}
                      <span className="mt-0.5 block"><ChipEstado estado={p.estado} /></span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lista.length === 0 && <p className="px-2 py-10 text-center text-muted-foreground">No hay productos con ese filtro. Prueba buscando por código.</p>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-2 py-3 text-sm text-muted-foreground">
            <span>Mostrando {numero(Math.min(mostrar, lista.length))} de {numero(lista.length)}{lista.length !== inv.productos.length ? ` (de ${numero(inv.productos.length)} en total)` : ''}.</span>
            {lista.length > mostrar && <Boton tamano="chico" onClick={() => setMostrar((m) => m + POR_PAGINA)}>Mostrar {Math.min(POR_PAGINA, lista.length - mostrar)} más</Boton>}
          </div>
        </Tarjeta>

        {producto && (
          <>
            {/* Escritorio: al lado de la lista */}
            <aside className="entrar-lado sticky top-6 hidden max-h-[calc(100dvh-3rem)] w-[400px] shrink-0 overflow-y-auto rounded-2xl border border-border bg-card xl:block" aria-label={`Ficha de ${producto.nombre}`}>
              <Ficha p={producto} inv={inv} alCerrar={() => abrir(null)} />
            </aside>
            {/* Celular y tableta: hoja desde abajo */}
            <div className="fixed inset-0 z-40 xl:hidden" role="dialog" aria-modal="true" aria-label={`Ficha de ${producto.nombre}`}>
              <button type="button" aria-label="Cerrar la ficha" className="velo absolute inset-0 bg-foreground/35" onClick={() => abrir(null)} />
              <div className="entrar-abajo absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-card shadow-2xl">
                <Ficha p={producto} inv={inv} alCerrar={() => abrir(null)} />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function consejo(p: Producto, inv: Inventario) {
  const u = inv.umbrales.seAgota
  if (p.estado === 'agota' && inv.alcance === 'prueba') return `Se acaba en menos de ${u} semanas si sigues vendiendo al mismo ritmo. Revísalo en tu pedido.`
  if (p.estado === 'agota' && inv.sugerencias && !p.sugerido) return `Se acaba en menos de ${u} semanas, pero alcanza para lo que tarda ${p.proveedor === 'Sin proveedor' ? 'tu proveedor' : p.proveedor} y hasta tu próximo pedido. Revísalo en ese pedido.`
  if (p.estado === 'agota') return `Se acaba en menos de ${u} semanas${p.entrega > 0 ? ` y ${p.proveedor === 'Sin proveedor' ? 'tu proveedor' : p.proveedor} tarda ${duracion(p.entrega)}` : ''}. Va en el pedido de esta semana.`
  if (p.estado === 'pide' && p.semanas !== null && p.semanas < p.entrega) return `Te queda para ${semanas(p.semanas)} semanas y el pedido tarda ${duracion(p.entrega)} en llegar: si no lo pides ya, te quedas sin él antes de que llegue.`
  if (p.estado === 'pide') return `Te queda para ${semanas(p.semanas)} semanas y el pedido tarda ${duracion(p.entrega)} en llegar. Queda justo: si esperas al próximo pedido, llega cuando ya se acabó.`
  if (p.estado === 'sobra') return `Tienes para ${semanas(p.semanas)} semanas. No lo pidas por ahora${p.ventasSemana < 1 ? '; se vende tan poco que vale la pena pensar si se sigue trayendo' : ''}.`
  if (p.estado === 'sin_ventas') return 'No se vendió en todo el periodo del archivo. Si sigue así, es candidato a salir del catálogo o a una promoción.'
  return `Está bien surtido. ${inv.sugerencias && p.sugerido ? 'Si haces pedido esta semana, ajústalo a lo sugerido.' : 'Revísalo en el próximo pedido.'}`
}

function Ficha({ p, inv, alCerrar }: { p: Producto; inv: Inventario; alCerrar: () => void }) {
  const { pedido, ponerEnPedido } = useInventario()
  const e = ESTADOS[p.estado]
  const horizonte = Math.max(p.entrega, inv.umbrales.seAgota)
  const prox4 = p.pronostico?.slice(0, 4) ?? []
  const media4 = prox4.reduce((s, x) => s + x.media, 0)
  const enPedido = pedido[p.codigo]
  const historia = (p.serie ?? []).map((v, i) => ({ inicio: inv.grafico?.semanas[inv.grafico.semanas.length - (p.serie?.length ?? 0) + i]?.inicio ?? '', valor: v }))
  const pronostico = (p.pronostico ?? []).map((x, i) => ({ ...x, inicio: inv.grafico?.pronostico[i]?.inicio ?? '' }))

  return (
    <div className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[0.82rem] tracking-wide text-muted-foreground">{p.codigo}{p.proveedor !== 'Sin proveedor' ? ` · ${p.proveedor}` : ''}</span>
          <h2 className="text-[1.35rem] leading-snug font-bold">{p.nombre}</h2>
        </div>
        <button type="button" onClick={alCerrar} className="presionable -mr-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-muted" aria-label="Cerrar la ficha">
          <X className="size-5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={cn('rounded-2xl p-4', e.chip)}>
          <span className="block text-[0.82rem] font-semibold">Te alcanza para</span>
          {p.semanas === null ? (
            <strong className="font-display text-2xl">Sin ventas</strong>
          ) : (
            <>
              <strong className={cn('font-display text-[2.3rem] leading-none font-extrabold tabular-nums', e.numero)}>{semanas(p.semanas)}</strong>
              <span className="text-[0.95rem]"> semanas</span>
            </>
          )}
        </div>
        {p.riesgo !== null ? (
          <div className="rounded-2xl border border-border p-4">
            <span className="block text-[0.82rem] font-semibold text-muted-foreground">Riesgo de agotarse en {semanas(horizonte)} semanas</span>
            <strong className="font-display text-[1.8rem] leading-tight tabular-nums">{`${Math.round(p.riesgo * 100)} %`}</strong>
            <BarraRiesgo valor={p.riesgo} className="mt-1 [&>span:last-child]:hidden" />
          </div>
        ) : (
          <div className="rounded-2xl border border-border p-4">
            <span className="block text-[0.82rem] font-semibold text-muted-foreground">Vendes por semana</span>
            <strong className="font-display text-[1.8rem] leading-tight tabular-nums">{ventasSemana(p.ventasSemana)}</strong>
            <span className="block text-[0.85rem] text-muted-foreground">tienes {numero(p.existencias)}</span>
          </div>
        )}
      </div>

      <p className="rounded-xl bg-muted px-4 py-3 text-[0.95rem]">{consejo(p, inv)}</p>

      {p.serie && p.serie.length > 4 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-base font-bold">Ventas por semana y pronóstico</h3>
          <GraficoVentas historia={historia} pronostico={pronostico} marcas={p.semanasPico} alto={200} descripcion={`Ventas semanales de ${p.nombre} y pronóstico de las próximas 8 semanas`} />
          {p.pico && (
            <p className="text-[0.88rem] text-ambar-texto">
              En {mesAnio(p.pico.mes)} vendió {numero(p.pico.vendido)}, mucho más de lo normal (un proyecto o un cliente puntual). Para el promedio se contaron {numero(p.pico.contado)}.
            </p>
          )}
          {prox4.length > 0 && (
            <p className="text-[0.92rem] text-muted-foreground">
              Próximas 4 semanas: lo más probable es vender {numero(Math.round(media4))}.
            </p>
          )}
        </div>
      )}

      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[0.95rem]">
        <dt className="text-muted-foreground">Ventas por semana</dt>
        <dd className="text-right font-semibold tabular-nums">{ventasSemana(p.ventasSemana)}</dd>
        <dt className="text-muted-foreground">Tienes hoy</dt>
        <dd className="text-right font-semibold tabular-nums">{numero(p.existencias)}</dd>
        {inv.alcance !== 'prueba' && (
          <>
            <dt className="text-muted-foreground">El proveedor tarda</dt>
            <dd className="text-right font-semibold tabular-nums">{duracion(p.entrega)}</dd>
          </>
        )}
        {p.minimo !== null && p.maximo !== null && (
          <>
            <dt className="text-muted-foreground">Mínimo · máximo <span className="text-[0.82rem]">(para tu programa contable)</span></dt>
            <dd className="text-right font-semibold tabular-nums">{numero(p.minimo)} · {numero(p.maximo)}</dd>
          </>
        )}
        {p.tendencia !== null && (
          <>
            <dt className="text-muted-foreground">Últimos 3 meses frente a los anteriores</dt>
            <dd className={cn('text-right font-semibold tabular-nums', p.tendencia > 0.1 ? 'text-verde' : p.tendencia < -0.1 ? 'text-rojo-texto' : '')}>{porcentaje(p.tendencia, true)}</dd>
          </>
        )}
        {p.costo !== null && (
          <>
            <dt className="text-muted-foreground">Costo por unidad</dt>
            <dd className="text-right font-semibold tabular-nums">{plata(p.costo)}</dd>
            <dt className="text-muted-foreground">Plata en este producto</dt>
            <dd className="text-right font-semibold tabular-nums">{plata(p.valor)}</dd>
          </>
        )}
      </dl>

      {inv.alcance !== 'prueba' && <CambiarProveedor p={p} inv={inv} />}

      <details className="group border-t border-border pt-3">
        <summary className="cursor-pointer font-semibold text-primary">¿De dónde sale el número?</summary>
        <div className="mt-2 flex flex-col gap-2 text-[0.93rem] text-foreground/85">
          {p.semanas !== null ? (
            <p>Tienes {numero(p.existencias)} y vendes {ventasSemana(p.ventasSemana)} por semana: {numero(p.existencias)} ÷ {ventasSemana(p.ventasSemana)} = <strong>{semanas(p.semanas)} semanas</strong>.</p>
          ) : (
            <p>No tiene ventas en el periodo del archivo, así que no se puede saber para cuántas semanas alcanza.</p>
          )}
          {!inv.fuente.totales && p.semanas !== null && (
            <p className="text-muted-foreground">
              Las ventas por semana salen de tu archivo: lo de los últimos 3 meses cuenta doble
              {p.pico ? ', el mes del proyecto se contó como 3 veces lo normal' : ''}
              {p.senales.includes('producto_nuevo') ? `, y como empezó a venderse hace poco se promedia desde su primera venta (${numero(p.explicacion.semanasProducto)} semanas)` : ''}.
            </p>
          )}
          {p.minimo !== null && p.maximo !== null && (
            <p className="text-muted-foreground">Mínimo: lo que se vende mientras llega un pedido, en 9 de cada 10 casos ({numero(p.minimo)}). Cuando tengas eso o menos, pide hasta llegar al máximo ({numero(p.maximo)}), que cubre la entrega y {duracion(inv.ajustes.cadaCuanto)} más.</p>
          )}
          {p.riesgo !== null && (
            <p className="text-muted-foreground">El riesgo y el rango salen de un modelo que mezcla lo que vende este producto con cómo varían sus ventas semana a semana{inv.temporada ? ' y la temporada de tu negocio' : ''}.</p>
          )}
        </div>
      </details>

      {inv.sugerencias && p.sugerido !== null && (
        <div className="flex flex-col gap-3 rounded-2xl border border-[#cfe5e1] bg-secondary p-4">
          <p className="text-[0.95rem] text-[#0b3f3b]">
            {p.sugerido > 0
              ? <>Para cubrir {p.entrega === 1 ? "la semana" : p.entrega === 0.5 ? "la media semana" : `las ${semanas(p.entrega)} semanas`} que tarda en llegar y {duracion(inv.ajustes.cadaCuanto)} más hasta tu próximo pedido, te sugerimos pedir <strong>{numero(p.sugerido)}</strong>.{p.lote > 1 ? ` En tu archivo siempre se vende de a ${numero(p.lote)}, así que va en paquetes completos.` : ''}</>
              : <>Con lo que tienes cubres la entrega y {semanas(inv.ajustes.cadaCuanto)} semanas más: no hace falta pedir.</>}
          </p>
          {enPedido ? (
            <Boton onClick={() => ponerEnPedido(p.codigo, 0)}>En tu pedido: {numero(enPedido)} · quitar</Boton>
          ) : (
            <Boton variante="primario" onClick={() => ponerEnPedido(p.codigo, Math.max(p.sugerido ?? 0, 1))}>Agregar al pedido{p.sugerido ? ` (${numero(p.sugerido)})` : ''}</Boton>
          )}
        </div>
      )}
    </div>
  )
}

// El proveedor de un producto, cuando el archivo no lo trae o el usuario quiere cambiarlo.
function CambiarProveedor({ p, inv }: { p: Producto; inv: Inventario }) {
  const { guardarAjustes } = useInventario()
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState(p.proveedor === 'Sin proveedor' ? '' : p.proveedor)
  const [guardando, setGuardando] = useState(false)
  const conocidos = [...new Set([...inv.proveedores.map((x) => x.nombre), ...Object.keys(inv.ajustes.entregas)])].filter((x) => x !== 'Sin proveedor')
  const listaId = useId()

  useEffect(() => {
    setAbierto(false)
    setNombre(p.proveedor === 'Sin proveedor' ? '' : p.proveedor)
  }, [p.codigo, p.proveedor])

  async function guardar(valor: string | null) {
    setGuardando(true)
    const asignaciones = { ...inv.ajustes.asignaciones }
    const clave = claveCodigo(p.codigo)
    if (valor) asignaciones[clave] = valor
    else delete asignaciones[clave]
    try {
      await guardarAjustes({ asignaciones })
      setAbierto(false)
    } finally {
      setGuardando(false)
    }
  }

  if (!abierto) {
    return (
      <p className="-mt-2 text-[0.9rem] text-muted-foreground">
        {p.proveedor === 'Sin proveedor' ? 'Tu archivo no dice quién te lo vende.' : `Proveedor: ${p.proveedor}${p.origenProveedor === 'prefijo' ? ' (por el comienzo del código)' : ''}.`}{' '}
        <button type="button" className="font-semibold text-primary hover:text-primary-hover" onClick={() => setAbierto(true)}>
          {p.proveedor === 'Sin proveedor' ? 'Decir el proveedor' : 'Cambiar'}
        </button>
      </p>
    )
  }
  return (
    <form
      className="aparecer flex flex-col gap-2 rounded-xl border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (nombre.trim()) guardar(nombre.trim())
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-semibold">
        ¿Quién te vende {p.nombre}?
        <input className={claseEntrada} list={listaId} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del proveedor" autoFocus />
        <datalist id={listaId}>{conocidos.map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <p className="text-[0.82rem] text-muted-foreground">Su tiempo de entrega se cambia en Datos. Para asignar muchos productos a la vez, usa el comienzo del código en Datos.</p>
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" tamano="chico" variante="primario" disabled={guardando || !nombre.trim()}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
        {p.origenProveedor === 'producto' && <Boton tamano="chico" onClick={() => guardar(null)} disabled={guardando}>Quitar</Boton>}
        <Boton tamano="chico" variante="fantasma" onClick={() => setAbierto(false)}>Cancelar</Boton>
      </div>
    </form>
  )
}

// Mínimos y máximos de todos los productos, para cargarlos en el programa contable.
function DescargarMinimos({ inv }: { inv: Inventario }) {
  const [estado, setEstado] = useState<string | null>(null)
  async function bajar() {
    setEstado('Armando el archivo…')
    try {
      const productos = inv.productos.filter((p) => p.minimo !== null).map((p) => ({ codigo: p.codigo, nombre: p.nombre, proveedor: p.proveedor === 'Sin proveedor' ? '' : p.proveedor, existencias: p.existencias, minimo: p.minimo, maximo: p.maximo, ventasSemana: Math.round(p.ventasSemana * 100) / 100 }))
      await descargar('/exportar/minimos.xlsx', { productos }, `minimos-y-maximos-${new Date().toLocaleDateString('en-CA')}.xlsx`)
      setEstado(null)
    } catch (e) {
      setEstado(e instanceof Error ? e.message : 'No pudimos armar el archivo.')
    }
  }
  return (
    <span className="flex flex-col items-end gap-1">
      <Boton onClick={bajar} title="Para cargarlos en tu programa contable"><Download /> Mínimos y máximos en Excel</Boton>
      {estado && <span className="text-sm text-muted-foreground">{estado}</span>}
    </span>
  )
}
