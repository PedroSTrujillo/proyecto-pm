'use client'

// Lista de productos con búsqueda y filtros, y la ficha de cada uno.

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useId, useMemo, useState } from 'react'
import { Download, Search, X } from 'lucide-react'
import { descargar } from '@/lib/descargar'
import { cn } from '@/lib/utils'
import { alcance, alcancePartes, claveCodigo, duracion, fecha, fechaCorta, horizonteTexto, mesAnio, numero, plata, plural, porcentaje, sumarDias, ventasSemana, tarda } from '@/lib/formato'
import type { Clase, Estado, Inventario, Producto } from '@/lib/tipos'
import { useInventario } from './contexto'
import { BarraRiesgo, GraficoAlcance, GraficoMeses, Sparkline, proyectarExistencias, ventasPorMes } from './graficos'
import { Boton, BotonEnlace, CLASES, Cargando, ChipEstado, ChipsProducto, ESTADOS, ErrorLista, Pildoras, Tarjeta, Titulo, claseEntrada, diasDesde } from './ui'
import { CatalogoEnLote, ComoSeCalcula, EditarCatalogo } from './catalogo'
import { SelectorTiempo } from './vista'
import { SinInventario } from './sin-inventario'
import { VentaUnica } from './pedido-flujo'

type Filtro = 'todos' | Estado
// Cómo se vende (server/inventario.js, clasificar), más "venta alta" y "pedido hace poco".
type FiltroClase = 'todas' | Clase | 'ventaAlta' | 'reciente'
type Orden = 'semanas' | 'riesgo' | 'valor' | 'ventas'
const POR_PAGINA = 60

export function Productos() {
  const { inventario, cargando, error, respuesta } = useInventario()
  if (cargando) return <Cargando texto="Cargando sus productos…" />
  if (error) return <ErrorLista mensaje={error} />
  if (!inventario) return <SinInventario />
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
  const { fuente } = useInventario()
  const params = useSearchParams()!
  const router = useRouter()
  const ruta = usePathname()!
  const [q, setQ] = useState('')
  // ?estado= viene de los enlaces del boletín (/productos?estado=pide); ?filtro=, de las pantallas.
  const [filtro, setFiltro] = useState<Filtro>(() => {
    const pedido = params.get('estado') || params.get('filtro')
    return pedido && (pedido === 'todos' || pedido in ESTADOS) ? (pedido as Filtro) : 'todos'
  })
  const [proveedor, setProveedor] = useState('todos')
  const [familia, setFamilia] = useState('todas')
  const [clase, setClase] = useState<FiltroClase>('todas')
  const [orden, setOrden] = useState<Orden>('semanas')
  const [mostrar, setMostrar] = useState(POR_PAGINA)
  const seleccionado = params.get('p')
  const familias = useMemo(() => [...new Set(inv.productos.map((p) => p.familia).filter((f): f is string => Boolean(f)))].sort((a, b) => a.localeCompare(b, 'es')), [inv])
  const hayClases = inv.productos.some((p) => p.clase)

  useEffect(() => setMostrar(POR_PAGINA), [q, filtro, proveedor, familia, clase, orden])

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
    (!buscado || p.codigo.toLowerCase().includes(buscado) || p.nombre.toLowerCase().includes(buscado)) && (proveedor === 'todos' || p.proveedor === proveedor) &&
    (familia === 'todas' || p.familia === familia) &&
    (clase === 'todas' || (clase === 'ventaAlta' ? p.ventaAlta : clase === 'reciente' ? Boolean(p.pedidoReciente) : p.clase === clase))
  const base = inv.productos.filter(coincide)
  const lista = useMemo(() => ordenar(base.filter((p) => filtro === 'todos' || p.estado === filtro), orden), [base, filtro, orden])
  const cuenta = (e: Estado) => base.filter((p) => p.estado === e).length
  const producto = seleccionado ? inv.productos.find((p) => p.codigo === seleccionado) || null : null
  // Pronóstico y cuánto pedir en la lista; con la ficha abierta, solo en pantallas grandes.
  const pronostica = inv.alcance !== 'prueba' && inv.productos.some((p) => p.pronostico)
  const claseExtra = producto ? 'hidden 2xl:table-cell' : 'hidden lg:table-cell'
  // Con la ficha abierta en una pantalla de 1280 a 1535 px (un portátil), ventas y existencias se ven en la ficha y la
  // lista queda con el producto y para cuánto alcanza: si no, no cabe.
  const claseVentas = producto ? 'hidden sm:table-cell xl:hidden 2xl:table-cell' : 'hidden sm:table-cell'
  const claseSerie = producto ? 'hidden md:table-cell xl:hidden 2xl:table-cell' : 'hidden md:table-cell'

  function abrir(codigo: string | null) {
    const sp = new URLSearchParams(params.toString())
    if (codigo) sp.set('p', codigo)
    else sp.delete('p')
    router.replace(`${ruta}${sp.size ? `?${sp}` : ''}`, { scroll: false })
  }

  const opciones: { id: Filtro; texto: string; cuenta: number }[] = [
    { id: 'todos', texto: 'Todos', cuenta: base.length },
    { id: 'agota', texto: 'Agotados o por agotarse', cuenta: cuenta('agota') },
    { id: 'pide', texto: 'Pedir ya', cuenta: cuenta('pide') },
    { id: 'normal', texto: 'Bien', cuenta: cuenta('normal') },
    { id: 'sobra', texto: 'Sobrestock', cuenta: cuenta('sobra') },
  ]
  // Durante la prueba no hay tiempo de entrega, así que no existe "pide ya".
  if (inv.alcance === 'prueba') opciones.splice(2, 1)
  if (cuenta('sin_ventas')) opciones.push({ id: 'sin_ventas', texto: 'Sin ventas', cuenta: cuenta('sin_ventas') })

  return (
    <>
      <Titulo sub="Ordenados por lo que se acaba primero. Toque un producto para ver su ficha." acciones={inv.sugerencias && inv.vista !== 'operador' ? <DescargarMinimos inv={inv} /> : undefined}>Productos</Titulo>
      <SelectorTiempo conHorizonte={pronostica} className="-mt-3" />

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
              <select className={cn(claseEntrada, 'text-cuerpo sm:w-auto sm:max-w-64')} value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
                <option value="todos">Todos</option>
                {inv.proveedores.map((p) => <option key={p.nombre} value={p.nombre}>{p.nombre}</option>)}
              </select>
            </label>
          )}
          {familias.length > 0 && (
            <label className="flex w-full min-w-0 flex-col gap-1 text-sm font-semibold text-muted-foreground sm:w-auto sm:flex-row sm:items-center sm:gap-2">
              Familia
              <select className={cn(claseEntrada, 'text-cuerpo sm:w-auto sm:max-w-56')} value={familia} onChange={(e) => setFamilia(e.target.value)}>
                <option value="todas">Todas</option>
                {familias.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
          )}
          {hayClases && (
            <label className="flex w-full min-w-0 flex-col gap-1 text-sm font-semibold text-muted-foreground sm:w-auto sm:flex-row sm:items-center sm:gap-2">
              Cómo se vende
              <select className={cn(claseEntrada, 'text-cuerpo sm:w-auto')} value={clase} onChange={(e) => setClase(e.target.value as FiltroClase)}>
                <option value="todas">Todos</option>
                {(Object.keys(CLASES) as Clase[]).map((c) => <option key={c} value={c}>{CLASES[c].texto}</option>)}
                <option value="ventaAlta">Venta alta</option>
                <option value="reciente">Pedidos en las últimas 2 semanas</option>
              </select>
            </label>
          )}
          <label className="flex w-full min-w-0 flex-col gap-1 text-sm font-semibold text-muted-foreground sm:w-auto sm:flex-row sm:items-center sm:gap-2">
            Ordenar
            <select className={cn(claseEntrada, 'text-cuerpo sm:w-auto')} value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
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
            <table className={cn('w-full border-collapse', producto ? 'sm:min-w-[500px] xl:min-w-0 2xl:min-w-[500px]' : 'sm:min-w-[620px]')}>
              <thead>
                <tr className="text-left text-nota text-muted-foreground">
                  <th scope="col" className="border-b border-border px-2 py-3 font-semibold">Producto</th>
                  <th scope="col" className={cn('border-b border-border px-2 py-3 font-semibold', claseSerie)}>Últimas 16 semanas</th>
                  <th scope="col" className={cn('border-b border-border px-2 py-3 text-right font-semibold', claseVentas)}>Ventas/semana</th>
                  <th scope="col" className={cn('border-b border-border px-2 py-3 text-right font-semibold', claseVentas)}>Existencias</th>
                  <th scope="col" className="border-b border-border px-2 py-3 text-right font-semibold">Alcanza para</th>
                  {pronostica && <th scope="col" className={cn('border-b border-border px-2 py-3 text-right leading-tight font-semibold', claseExtra)}>Venta en<br />{horizonteTexto(inv.horizonte ?? 4)}</th>}
                  {inv.sugerencias && <th scope="col" className={cn('border-b border-border px-2 py-3 text-right font-semibold', claseExtra)}>Pedir</th>}
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
                      <span className="block text-nota tracking-wide text-muted-foreground">{p.codigo}{p.proveedor !== 'Sin proveedor' ? ` · ${p.proveedor}` : ''}</span>
                      <span className="font-semibold">{p.nombre}</span>
                      <span className="block text-nota text-muted-foreground sm:hidden">Vende {ventasSemana(p.ventasSemana)} por semana · hay {numero(p.existencias)}</span>
                      <ChipsProducto p={p} className="mt-1" />
                    </td>
                    <td className={cn('border-b border-[#f0f1ee] px-2 py-3', claseSerie)}>
                      {p.serie ? <Sparkline valores={p.serie.slice(-16)} color={p.estado === 'sobra' || p.estado === 'sin_ventas' ? '#6b8bb8' : undefined} /> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className={cn('border-b border-[#f0f1ee] px-2 py-3 text-right font-semibold tabular-nums', claseVentas)}>{ventasSemana(p.ventasSemana)}</td>
                    <td className={cn('border-b border-[#f0f1ee] px-2 py-3 text-right tabular-nums', claseVentas)}>{numero(p.existencias)}</td>
                    <td className="border-b border-[#f0f1ee] px-2 py-3 text-right whitespace-nowrap">
                      {p.semanas === null ? (
                        <span className="text-muted-foreground">sin ventas</span>
                      ) : (
                        <>
                          <strong className={cn('font-display text-lg tabular-nums', ESTADOS[p.estado].numero)}>{alcancePartes(p.semanas).valor}</strong>
                          <span className="text-sm text-muted-foreground"> {alcance(p.semanas, true).split(' ')[1]}</span>
                        </>
                      )}
                      <span className="mt-0.5 block"><ChipEstado estado={p.estado} existencias={p.existencias} /></span>
                    </td>
                    {pronostica && (
                      <td className={cn('border-b border-[#f0f1ee] px-2 py-3 text-right tabular-nums', claseExtra)}>
                        {p.pronostico ? (
                          <>
                            {/* El rango sale de la venta del horizonte completo, no de sumar los rangos de cada semana. */}
                            <span className="font-semibold">{numero(Math.round(p.ventaHorizonte?.media ?? p.pronostico.slice(0, 4).reduce((s, x) => s + x.media, 0)))}</span>
                            {p.ventaHorizonte && <span className="block text-nota text-muted-foreground">entre {numero(Math.round(p.ventaHorizonte.bajo))} y {numero(Math.round(p.ventaHorizonte.alto))}</span>}
                          </>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                    )}
                    {inv.sugerencias && (
                      <td className={cn('border-b border-[#f0f1ee] px-2 py-3 text-right', claseExtra)}>
                        {p.sugerido ? (
                          <span className="inline-flex min-w-11 justify-center rounded-lg bg-secondary px-2 py-1 font-display text-lg font-bold tabular-nums text-secondary-foreground">{numero(p.sugerido)}</span>
                        ) : <span className="text-muted-foreground">0</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {lista.length === 0 && <p className="px-2 py-10 text-center text-muted-foreground">No hay productos con ese filtro. Busque por código.</p>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-2 py-3 text-sm text-muted-foreground">
            <span>Mostrando {numero(Math.min(mostrar, lista.length))} de {numero(lista.length)}{lista.length !== inv.productos.length ? ` (de ${numero(inv.productos.length)} en total)` : ''}.</span>
            {lista.length > mostrar && <Boton tamano="chico" onClick={() => setMostrar((m) => m + POR_PAGINA)}>Mostrar {Math.min(POR_PAGINA, lista.length - mostrar)} más</Boton>}
          </div>
        </Tarjeta>

        {producto && (
          <>
            {/* Escritorio: al lado de la lista */}
            <aside className="entrar-lado sticky top-6 hidden max-h-[calc(100dvh-3rem)] w-[420px] shrink-0 2xl:w-[520px] overflow-y-auto rounded-2xl border border-border bg-card xl:block" aria-label={`Ficha de ${producto.nombre}`}>
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

      {fuente.tipo === 'cuenta' && inv.vista !== 'operador' && <CatalogoEnLote />}
    </>
  )
}

function consejo(p: Producto, inv: Inventario) {
  const u = inv.umbrales.seAgota
  if (p.ventaUnica) return `Venta única: ${numero(p.ventaUnica.vendido)} en la semana del ${fecha(p.ventaUnica.desde)} y nada más. Parece un proyecto; no se sugiere pedirlo.`
  if (p.existencias <= 0 && p.ventasSemana > 0) return `Agotado. Vende unas ${ventasSemana(p.ventasSemana)} por semana. ${inv.sugerencias && p.sugerido ? `Sugerido para este pedido: ${numero(p.sugerido)}.` : 'Inclúyalo en este pedido.'}`
  if (p.estado === 'agota' && (inv.alcance === 'prueba' || inv.vista === 'operador')) return `Se agota en menos de ${duracion(u)} al ritmo actual. Revíselo en su pedido.`
  // Sin sugerido y con algo en camino, lo que cubre es el pedido que ya se hizo: decirlo, o parece que se contradice con "se agota".
  if (p.estado === 'agota' && inv.sugerencias && !p.sugerido && p.enCamino) return `Se agota en menos de ${duracion(u)} con lo que hay, pero ya vienen ${numero(p.enCamino.cantidad, 2)} del pedido del ${fecha(p.enCamino.fecha)}: con eso alcanza hasta el próximo pedido. Registre la entrada en Movimientos cuando lleguen.`
  if (p.estado === 'agota' && inv.sugerencias && !p.sugerido) return `Se agota en menos de ${duracion(u)}, pero cubre la entrega de ${p.proveedor === 'Sin proveedor' ? 'su proveedor' : p.proveedor} hasta el próximo pedido.`
  if (p.estado === 'agota') return `Se agota en menos de ${duracion(u)}${p.entrega > 0 ? ` y ${p.proveedor === 'Sin proveedor' ? 'su proveedor' : p.proveedor} tarda ${tarda(p.entrega)}` : ''}. Inclúyalo en este pedido.`
  if (p.estado === 'pide' && p.semanas !== null && p.semanas < p.entrega) return `Alcanza para ${alcance(p.semanas)} y el proveedor tarda ${tarda(p.entrega)}. Pídalo ya.`
  if (p.estado === 'pide') return `Alcanza para ${alcance(p.semanas)} y el proveedor tarda ${tarda(p.entrega)}. Si espera al próximo pedido, llega tarde.`
  if (p.estado === 'sobra') return `Alcanza para ${alcance(p.semanas)}. No lo pida por ahora${p.ventasSemana < 1 ? '; se vende muy poco: evalúe si se sigue trayendo' : ''}.`
  if (p.estado === 'sin_ventas') return 'Sin ventas en el periodo del archivo. Candidato a promoción o a salir del catálogo.'
  return `Bien surtido. ${inv.sugerencias && p.sugerido ? 'Si pide esta semana, use lo sugerido.' : 'Revíselo en el próximo pedido.'}`
}

// La gráfica de alcance dicha en palabras, con fechas (no depende de si la cuenta ve días, semanas o meses).
function resumenAlcance(p: Producto, pr: ReturnType<typeof proyectarExistencias>, hoy: string, semanasPronostico: number) {
  const dia = (k: number) => fechaCorta(sumarDias(hoy, Math.round(k * 7)))
  if (p.existencias <= 0) return p.enCamino ? `Ya está en cero. Vienen en camino ${numero(p.enCamino.cantidad, 2)} del pedido del ${fecha(p.enCamino.fecha)}.` : 'Ya está en cero: cada semana sin él son ventas perdidas.'
  const partes: string[] = []
  if (pr.seAcaba === null) partes.push(`Con lo de siempre, alcanza más allá del ${dia(semanasPronostico)}.`)
  else {
    const rango = pr.seAcabaPronto !== null && pr.seAcabaTarde !== null && Math.round(pr.seAcabaPronto * 7) !== Math.round(pr.seAcabaTarde * 7)
      ? ` (entre el ${dia(pr.seAcabaPronto)} y el ${dia(pr.seAcabaTarde)})`
      : pr.seAcabaPronto !== null && pr.seAcabaTarde === null ? ` (si vende más de lo normal, desde el ${dia(pr.seAcabaPronto)})` : ''
    partes.push(`Al ritmo de venta de siempre se acaba hacia el ${dia(pr.seAcaba)}${rango}.`)
  }
  if (p.entrega > 0) {
    const llega = dia(p.entrega)
    partes.push(pr.seAcaba !== null && pr.seAcaba < p.entrega ? `Un pedido hecho hoy llega el ${llega}: tarde.` : `Un pedido hecho hoy llega el ${llega}.`)
  }
  if (p.enCamino) partes.push(pr.seAcabaConCamino === null ? `Con los ${numero(p.enCamino.cantidad, 2)} que vienen en camino alcanza más allá del ${dia(semanasPronostico)}.` : `Con los ${numero(p.enCamino.cantidad, 2)} que vienen en camino, hasta el ${dia(pr.seAcabaConCamino)}.`)
  return partes.join(' ')
}

function Ficha({ p, inv, alCerrar }: { p: Producto; inv: Inventario; alCerrar: () => void }) {
  const { pedido, ponerEnPedido, rutas, fuente } = useInventario()
  const e = ESTADOS[p.estado]
  const horizonte = Math.max(p.entrega, inv.umbrales.seAgota)
  const prox4 = p.pronostico?.slice(0, 4) ?? []
  const media4 = prox4.reduce((s, x) => s + x.media, 0)
  const enPedido = pedido[p.codigo]
  const historia = (p.serie ?? []).map((v, i) => ({ inicio: inv.grafico?.semanas[inv.grafico.semanas.length - (p.serie?.length ?? 0) + i]?.inicio ?? '', valor: v }))
  const pronostico = (p.pronostico ?? []).map((x, i) => ({ ...x, inicio: inv.grafico?.pronostico[i]?.inicio ?? '' }))
  const idFicha = useId()
  const meses = useMemo(() => ventasPorMes(historia, p.semanasPico, inv.fuente.hasta), [historia, p.semanasPico, inv.fuente.hasta])
  // Sin pronóstico (operador, venta única o sin ventas) no hay proyección que mostrar.
  const proyeccion = pronostico.length && p.ventasSemana > 0 && !p.ventaUnica ? proyectarExistencias(p.existencias, pronostico, p.enCamino?.cantidad ?? null) : null

  return (
    <div className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-nota tracking-wide text-muted-foreground">{p.codigo}{p.proveedor !== 'Sin proveedor' ? ` · ${p.proveedor}` : ''}</span>
          <h2 className="text-[1.35rem] leading-snug font-bold">{p.nombre}</h2>
        </div>
        <button type="button" onClick={alCerrar} className="presionable -mr-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-muted" aria-label="Cerrar la ficha">
          <X className="size-5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={cn('rounded-2xl p-4', e.chip)}>
          <span className="block text-nota font-semibold">Alcanza para</span>
          {p.semanas === null ? (
            <strong className="font-display text-2xl">Sin ventas</strong>
          ) : (
            <>
              <strong className={cn('font-display text-[2.3rem] leading-none font-extrabold tabular-nums', e.numero)}>{alcancePartes(p.semanas).valor}</strong>
              <span className="text-cuerpo"> {alcancePartes(p.semanas).unidad}</span>
            </>
          )}
        </div>
        {p.existencias <= 0 && p.ventasSemana > 0 && !p.ventaUnica ? (
          <div className="rounded-2xl border border-rojo-borde bg-rojo-fondo p-4">
            <span className="block text-nota font-semibold text-rojo-texto">Ya está en cero</span>
            <strong className="font-display text-[1.8rem] leading-tight tabular-nums">{ventasSemana(p.ventasSemana)}</strong>
            <span className="block text-nota text-rojo-texto">por semana que no se pueden vender</span>
          </div>
        ) : p.riesgo !== null ? (
          <div className="rounded-2xl border border-border p-4">
            <span className="block text-nota font-semibold text-muted-foreground">Riesgo de agotarse en {duracion(horizonte)}</span>
            <strong className="font-display text-[1.8rem] leading-tight tabular-nums">{`${Math.round(p.riesgo * 100)} %`}</strong>
            <BarraRiesgo valor={p.riesgo} className="mt-1 [&>span:last-child]:hidden" />
          </div>
        ) : (
          <div className="rounded-2xl border border-border p-4">
            <span className="block text-nota font-semibold text-muted-foreground">Venta por semana</span>
            <strong className="font-display text-[1.8rem] leading-tight tabular-nums">{ventasSemana(p.ventasSemana)}</strong>
            <span className="block text-nota text-muted-foreground">existencias: {numero(p.existencias)}</span>
          </div>
        )}
      </div>

      <p className="rounded-xl bg-muted px-4 py-3 text-cuerpo">{consejo(p, inv)}</p>
      <ChipsProducto p={p} className="-mt-2" />
      {/* Lo que viene en camino ya lo dicen el consejo, la etiqueta y la gráfica de alcance: un párrafo más lo repetía. */}
      {p.pedidoReciente && !p.enCamino && (
        <p className="-mt-2 text-chico text-muted-foreground">
          Ya se pidió {diasDesde(p.pedidoReciente.fecha) === 0 ? 'hoy' : `hace ${plural(diasDesde(p.pedidoReciente.fecha), 'día', 'días')}`}: {numero(p.pedidoReciente.cantidad, 2)} en el pedido {p.pedidoReciente.numero}{p.pedidoReciente.por ? ` de ${p.pedidoReciente.por}` : ''}. Si todavía no ha llegado, téngalo en cuenta antes de pedir otra vez.
        </p>
      )}

      {proyeccion && (
        <section className="flex flex-col gap-2" aria-labelledby={`${idFicha}-alcance`}>
          <h3 id={`${idFicha}-alcance`} className="text-base font-bold">¿Hasta cuándo alcanza?</h3>
          <p className="text-chico text-muted-foreground">Las existencias de las próximas semanas si se vende lo de siempre.</p>
          <GraficoAlcance
            existencias={p.existencias}
            pronostico={pronostico}
            enCamino={p.enCamino?.cantidad ?? null}
            entrega={p.entrega}
            minimo={p.minimo}
            hoy={inv.fuente.hasta}
            descripcion={`Existencias proyectadas de ${p.nombre} para las próximas ${pronostico.length} semanas`}
          />
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-nota text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><svg width="20" height="8" aria-hidden="true"><line x1="0" y1="4" x2="20" y2="4" stroke="var(--primary)" strokeWidth="2.75" /></svg>Lo más probable</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-sm bg-primary/15" />Si vende más o menos de lo normal</span>
            {p.enCamino && <span className="inline-flex items-center gap-1.5"><svg width="20" height="8" aria-hidden="true"><line x1="0" y1="4" x2="20" y2="4" stroke="var(--primary)" strokeWidth="2" strokeDasharray="5 4" /></svg>Con lo que viene en camino</span>}
          </div>
          <p className="text-chico">{resumenAlcance(p, proyeccion, inv.fuente.hasta, pronostico.length)}</p>
        </section>
      )}

      {meses.length >= 3 && (
        <section className="flex flex-col gap-2" aria-labelledby={`${idFicha}-meses`}>
          <h3 id={`${idFicha}-meses`} className="text-base font-bold">Ventas por mes</h3>
          <GraficoMeses meses={meses} hasta={inv.fuente.hasta} descripcion={`Unidades vendidas de ${p.nombre} en cada uno de los últimos ${meses.length} meses`} />
          {meses[meses.length - 1].parcial && <p className="text-nota text-muted-foreground">La barra clara es el mes en curso: llega hasta el {fecha(inv.fuente.hasta)}.</p>}
          {p.pico && (
            <p className="text-chico text-ambar-texto">
              En {mesAnio(p.pico.mes)} vendió {numero(p.pico.vendido)}, mucho más de lo normal (un proyecto o un cliente puntual). Para el promedio se contaron {numero(p.pico.contado)}.
            </p>
          )}
          {p.ventaHorizonte ? (
            <p className="text-chico text-muted-foreground">
              De aquí a {horizonteTexto(inv.horizonte ?? 4)}, lo más probable es vender {numero(Math.round(p.ventaHorizonte.media))} (entre {numero(Math.round(p.ventaHorizonte.bajo))} y {numero(Math.round(p.ventaHorizonte.alto))}).
            </p>
          ) : prox4.length > 0 && (
            <p className="text-chico text-muted-foreground">
              De aquí a 4 semanas, lo más probable es vender {numero(Math.round(media4))}.
            </p>
          )}
        </section>
      )}

      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-cuerpo">
        <dt className="text-muted-foreground">Ventas por semana</dt>
        <dd className="text-right font-semibold tabular-nums">{ventasSemana(p.ventasSemana)}</dd>
        <dt className="text-muted-foreground">Existencias hoy</dt>
        <dd className="text-right font-semibold tabular-nums">{numero(p.existencias)}</dd>
        {inv.alcance !== 'prueba' && (
          <>
            <dt className="text-muted-foreground">El proveedor tarda</dt>
            <dd className="text-right font-semibold tabular-nums">{tarda(p.entrega)}</dd>
          </>
        )}
        {p.minimo !== null && p.maximo !== null && (
          <>
            <dt className="text-muted-foreground">Mínimo · máximo <span className="text-nota">(para su programa contable)</span></dt>
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

      {inv.alcance !== 'prueba' && inv.vista !== 'operador' && <CambiarProveedor p={p} inv={inv} />}
      {fuente.tipo === 'cuenta' && inv.vista !== 'operador' && <EditarCatalogo p={p} />}

      <ComoSeCalcula p={p} inv={inv}>
        <div className="mt-3 flex flex-col gap-2 text-chico text-muted-foreground">
          {p.minimo !== null && p.maximo !== null && (
            <p>Mínimo y máximo para su programa contable: el mínimo es lo que se vende mientras llega un pedido, en 9 de cada 10 casos ({numero(p.minimo)}). Cuando tenga eso o menos, pida hasta llegar al máximo ({numero(p.maximo)}), que cubre la entrega y {duracion(inv.ajustes.cadaCuanto)} más.</p>
          )}
          {p.riesgo !== null && (
            <p>El riesgo y el rango salen de lo que vende este producto y de cuánto varían sus ventas cada semana{inv.temporada ? ' y la temporada de su negocio' : ''}.</p>
          )}
        </div>
      </ComoSeCalcula>

      {inv.sugerencias && p.ventaUnica && <VentaUnica v={p.ventaUnica} existencias={p.existencias} />}
      {inv.sugerencias && p.sugerido !== null && !p.ventaUnica && (
        <div className="flex flex-col gap-3 rounded-2xl border border-[#cfe5e1] bg-secondary p-4">
          <p className="text-cuerpo text-[#0b3f3b]">
            {p.sugerido > 0
              ? <>Sugerido: <strong>{numero(p.sugerido, 2)}</strong>. Cubre la entrega ({tarda(p.entrega)}) y {duracion(p.cadaCuanto ?? inv.ajustes.cadaCuanto)} más hasta el próximo pedido.{p.multiplo ? ` Va en cajas de ${numero(p.multiplo, 2)}.` : p.lote > 1 ? ` Va en paquetes de ${numero(p.lote)}, como se vende.` : ''}{p.detalleSugerido?.minimoPedido ? ` Subió al mínimo de pedido (${numero(p.detalleSugerido.minimoPedido, 2)}).` : ''}</>
              : <>Con lo que hay{p.enCamino ? ` y los ${numero(p.enCamino.cantidad, 2)} que vienen en camino` : ''} se cubre la entrega y {duracion(p.cadaCuanto ?? inv.ajustes.cadaCuanto)} más: no hace falta pedir.</>}
          </p>
          {enPedido ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <BotonEnlace href={fuente.tipo === 'cuenta' ? '/pedidos/sugerido' : rutas.pedido} variante="primario">Ver el pedido</BotonEnlace>
              <Boton onClick={() => ponerEnPedido(p.codigo, 0)}>En su pedido: {numero(enPedido)} · quitar</Boton>
            </div>
          ) : (
            <Boton variante="primario" className="self-start" onClick={() => ponerEnPedido(p.codigo, Math.max(p.sugerido ?? 0, 1))}>Agregar al pedido{p.sugerido ? ` (${numero(p.sugerido)})` : ''}</Boton>
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
      <p className="-mt-2 text-chico text-muted-foreground">
        {p.proveedor === 'Sin proveedor' ? 'Su archivo no dice quién se lo vende.' : `Proveedor: ${p.proveedor}${p.origenProveedor === 'prefijo' ? ' (por el comienzo del código)' : ''}.`}{' '}
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
        ¿Quién le vende {p.nombre}?
        <input className={claseEntrada} list={listaId} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del proveedor" autoFocus />
        <datalist id={listaId}>{conocidos.map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <p className="text-nota text-muted-foreground">El tiempo de entrega y la asignación por comienzo de código se cambian en Datos.</p>
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
      <Boton onClick={bajar} title="Para cargarlos en su programa contable"><Download /> Mínimos y máximos en Excel</Boton>
      {estado && <span className="text-sm text-muted-foreground">{estado}</span>}
    </span>
  )
}
