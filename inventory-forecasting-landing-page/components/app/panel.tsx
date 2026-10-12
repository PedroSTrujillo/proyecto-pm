'use client'

// Panel "Tu inventario hoy": lo que se agota, lo que hay que pedir ya, el dinero quieto, las
// ventas con su pronóstico y lo que conviene atender hoy.

import Link from 'next/link'
import { useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, CalendarDays, Sparkles, Truck, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { duracion, fecha, mesAnio, numero, plata, porcentaje, semanas, sumarDias, ventasSemana } from '@/lib/formato'
import { nombrePrograma } from '@/lib/sistemas'
import type { Inventario, Producto } from '@/lib/tipos'
import { useInventario } from './contexto'
import { BarraRiesgo, GraficoVentas, LeyendaVentas, Sparkline } from './graficos'
import { Ayuda, BotonEnlace, Cargando, ChipEstado, ESTADOS, ErrorLista, Pildoras, Tarjeta, Titulo } from './ui'
import { SinInventario } from './sin-inventario'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function Panel() {
  const { inventario, cargando, error, respuesta } = useInventario()
  if (cargando) return <Cargando texto="Cargando tu inventario…" />
  if (error) return <ErrorLista mensaje={error} />
  if (!inventario) return <SinInventario puedeSubir={Boolean(respuesta?.puedeSubir)} />
  return <PanelCon inv={inventario} />
}

function PanelCon({ inv }: { inv: Inventario }) {
  const { rutas, fuente } = useInventario()
  const r = inv.resumen
  const demo = fuente.tipo === 'demo'
  // Sin proveedores en el archivo y sin un tiempo de entrega dicho por el usuario, "pide ya" no dice nada.
  const sinTiempos = inv.proveedores.every((p) => p.nombre === 'Sin proveedor') && inv.ajustes.entregaPorDefecto <= 1 && !demo
  const pideTop = inv.proveedores.filter((p) => p.pideYa > 0).sort((a, b) => b.pideYa - a.pideYa || b.entrega - a.entrega)[0]
  const sub = [
    inv.fuente.programa ? `Export de ${nombrePrograma(inv.fuente.programa)}` : 'Tu último archivo',
    `del ${fecha(inv.fuente.fecha)}`,
    `${numero(r.productos)} productos`,
    inv.proveedores.length > 1 ? `${inv.proveedores.length} proveedores` : null,
  ].filter(Boolean).join(' · ')

  return (
    <>
      <Titulo
        etiqueta={demo ? <span className="self-start rounded-full bg-secondary px-2.5 py-0.5 text-[0.82rem] font-semibold text-secondary-foreground">{inv.fuente.empresa}</span> : undefined}
        sub={sub}
        acciones={
          <>
            <BotonEnlace href={rutas.datos}>Actualizar datos</BotonEnlace>
            <BotonEnlace href={rutas.pedido} variante="primario">Preparar pedido</BotonEnlace>
          </>
        }
      >
        Tu inventario hoy
      </Titulo>

      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Cifra
          titulo="Se agotan en 2 semanas"
          tono="text-rojo"
          etiqueta="text-rojo-texto"
          valor={numero(r.seAgotan)}
          detalle={r.enCero ? `${r.enCero} ya están en cero` : r.seAgotan ? 'Los tienes primero en la lista de abajo' : 'Nada se agota en las próximas 2 semanas'}
          ayuda="Productos que, al ritmo de venta de tu archivo, no alcanzan a durar dos semanas."
          href={`${rutas.productos}?filtro=agota`}
        />
        {sinTiempos ? (
          <Cifra
            titulo="Pide esta semana"
            tono="text-ambar"
            etiqueta="text-ambar-texto"
            valor="¿?"
            detalle="Dinos cuánto tarda tu proveedor y te avisamos qué pedir antes de que sea tarde."
            ayuda="Hoy suponemos que un pedido llega en una semana. Si tu proveedor tarda más (por ejemplo, si importa), cámbialo en Datos."
            href={rutas.datos}
            textoEnlace="Decir cuánto tarda"
          />
        ) : (
          <Cifra
            titulo="Pide esta semana"
            tono="text-ambar"
            etiqueta="text-ambar-texto"
            valor={numero(r.pideYa)}
            detalle={pideTop ? `${pideTop.pideYa} de ${pideTop.nombre}: tarda ${duracion(pideTop.entrega)}` : 'Ninguno tarda más de lo que te queda'}
            ayuda="Te alcanzan para más de 2 semanas, pero menos de lo que tarda su proveedor en traerlos. Si no los pides ya, se agotan antes de que llegue el pedido."
            href={`${rutas.productos}?filtro=pide`}
          />
        )}
        <Cifra
          titulo="Dinero quieto"
          tono="text-azul"
          etiqueta="text-azul-texto"
          valor={r.tieneCostos ? plata(r.dineroQuieto) : numero(r.sobran)}
          detalle={r.tieneCostos ? `en ${numero(r.sobran)} productos que sobran` : 'productos con más de 12 semanas (sube el costo para verlo en pesos)'}
          ayuda="Lo que vale, a costo, el inventario que tienes por encima de 12 semanas de venta, más lo que no se vendió en todo el periodo."
          href={`${rutas.productos}?filtro=sobra`}
        />
        <Cifra
          titulo="Ventas últimas 4 semanas"
          tono={r.tendencia4 !== null && r.tendencia4 < 0 ? 'text-foreground' : 'text-verde'}
          etiqueta="text-verde"
          valor={porcentaje(r.tendencia4, true)}
          detalle="frente a las 4 anteriores, sin contar proyectos"
          ayuda="Unidades vendidas de todo el catálogo en las últimas 4 semanas comparadas con las 4 de antes. Las ventas de proyectos no cuentan."
        />
      </section>

      <div className="flex flex-wrap items-start gap-5">
        <PrimeroEnAcabarse inv={inv} />
        <AtenderHoy inv={inv} />
      </div>

      {inv.grafico && <Ventas inv={inv} />}
    </>
  )
}

function Cifra({ titulo, valor, detalle, ayuda, tono, etiqueta, href, textoEnlace = 'Ver cuáles' }: { titulo: string; valor: string; detalle: string; ayuda: string; tono: string; etiqueta: string; href?: string; textoEnlace?: string }) {
  const cuerpo = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className={cn('text-[0.7rem] font-bold tracking-[0.06em] uppercase sm:text-[0.75rem]', etiqueta)}>{titulo}</span>
        <Ayuda texto={ayuda} />
      </div>
      <strong className={cn('font-display text-[1.7rem] leading-none font-extrabold tabular-nums sm:text-[2.1rem]', tono)}>{valor}</strong>
      <span className="text-[0.82rem] leading-snug text-muted-foreground sm:text-[0.9rem]">{detalle}</span>
    </>
  )
  return (
    <div className="relative flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 sm:gap-2.5 sm:p-5">
      {cuerpo}
      {href && (
        <Link href={href} className="text-[0.9rem] font-semibold text-primary hover:text-primary-hover">
          {textoEnlace} <ArrowRight className="inline size-3.5" />
        </Link>
      )}
    </div>
  )
}

function PrimeroEnAcabarse({ inv }: { inv: Inventario }) {
  const { rutas } = useInventario()
  const filas = useMemo(
    () =>
      inv.productos
        .filter((p) => p.semanas !== null && p.estado !== 'sobra')
        .sort((a, b) => (a.semanas ?? 0) - (b.semanas ?? 0))
        .slice(0, 8),
    [inv],
  )
  return (
    <Tarjeta aria-labelledby="t-primero" className="min-w-0 flex-[999_1_600px] px-5 pt-5 pb-2">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="t-primero" className="text-xl font-bold">¿Qué se te acaba primero?</h2>
        <Link href={rutas.productos} className="text-[0.95rem] font-semibold text-primary hover:text-primary-hover">
          Ver los {numero(inv.resumen.productos)} productos
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="text-left text-[0.82rem] text-muted-foreground">
              <th scope="col" className="border-b border-border px-2 py-2.5 font-semibold">Producto</th>
              <th scope="col" className="border-b border-border px-2 py-2.5 font-semibold">Ventas/semana</th>
              <th scope="col" className="border-b border-border px-2 py-2.5 text-right font-semibold">Tienes</th>
              <th scope="col" className="border-b border-border px-2 py-2.5 text-right font-semibold">Te alcanza</th>
              <th scope="col" className="border-b border-border px-2 py-2.5 font-semibold">Riesgo de agotarse</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((p) => (
              <FilaPrimero key={p.codigo} p={p} href={`${rutas.productos}?p=${encodeURIComponent(p.codigo)}`} />
            ))}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  )
}

function FilaPrimero({ p, href }: { p: Producto; href: string }) {
  const e = ESTADOS[p.estado]
  return (
    <tr className="transition-colors duration-100 hover:bg-[#f8faf7]">
      <td className="border-b border-[#f0f1ee] px-2 py-3">
        <span className="block text-xs tracking-wide text-muted-foreground">{p.codigo}</span>
        <Link href={href} className="font-semibold text-foreground hover:text-primary">{p.nombre}</Link>
      </td>
      <td className="border-b border-[#f0f1ee] px-2 py-3">
        <span className="flex items-center gap-2.5">
          {p.serie && <Sparkline valores={p.serie.slice(-16)} className="w-20" />}
          <span className="font-semibold tabular-nums">{ventasSemana(p.ventasSemana)}</span>
        </span>
      </td>
      <td className="border-b border-[#f0f1ee] px-2 py-3 text-right tabular-nums">{numero(p.existencias)}</td>
      <td className="border-b border-[#f0f1ee] px-2 py-3 text-right">
        <strong className={cn('font-display text-xl tabular-nums', e.numero)}>{semanas(p.semanas)}</strong>
        <span className="block text-xs text-muted-foreground">semanas</span>
      </td>
      <td className="min-w-44 border-b border-[#f0f1ee] px-2 py-3">
        <BarraRiesgo valor={p.riesgo} />
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <ChipEstado estado={p.estado} texto={p.estado === 'pide' ? `Pide ya: tarda ${duracion(p.entrega)}` : undefined} />
        </span>
      </td>
    </tr>
  )
}

function Tarjetita({ icono, titulo, tono, children, accion }: { icono: ReactNode; titulo: string; tono: 'ambar' | 'azul' | 'neutro' | 'verde'; children: ReactNode; accion?: ReactNode }) {
  const t = {
    ambar: 'border-ambar-borde bg-ambar-fondo text-[#431407] [&_.etq]:text-ambar-texto',
    azul: 'border-azul-borde bg-azul-fondo text-[#172b4d] [&_.etq]:text-azul-texto',
    verde: 'border-verde-borde bg-verde-fondo text-[#14532d] [&_.etq]:text-verde',
    neutro: 'border-border bg-card text-foreground [&_.etq]:text-muted-foreground',
  }[tono]
  return (
    <div className={cn('flex flex-col gap-2 rounded-2xl border p-4', t)}>
      <span className="etq flex items-center gap-2 text-[0.75rem] font-bold tracking-[0.06em] uppercase [&_svg]:size-4">{icono}{titulo}</span>
      <div className="text-[0.95rem] leading-relaxed">{children}</div>
      {accion}
    </div>
  )
}

function AtenderHoy({ inv }: { inv: Inventario }) {
  const { rutas } = useInventario()
  const hoy = inv.fuente.fecha.slice(0, 10)
  const pide = inv.productos.filter((p) => p.estado === 'pide').sort((a, b) => b.entrega - (b.semanas ?? 0) - (a.entrega - (a.semanas ?? 0)))[0]
  const quieto = [...inv.productos].filter((p) => p.estado === 'sobra' || p.estado === 'sin_ventas').sort((a, b) => (b.quieto ?? b.unidadesQuietas) - (a.quieto ?? a.unidadesQuietas))[0]
  const proyecto = inv.productos.filter((p) => p.pico).sort((a, b) => (b.pico!.vendido - b.pico!.contado) - (a.pico!.vendido - a.pico!.contado))[0]
  const nuevo = inv.productos.find((p) => p.senales.includes('producto_nuevo'))
  const a = inv.resumen.acierto

  return (
    <section aria-labelledby="t-hoy" className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5">
      <h2 id="t-hoy" className="text-xl font-bold">Atender hoy</h2>
      {pide && (
        <Tarjetita icono={<Truck />} titulo="Pide ya: tarda en llegar" tono="ambar" accion={<BotonEnlace href={rutas.pedido} variante="primario" tamano="chico" className="self-start">Preparar pedido</BotonEnlace>}>
          <strong>{pide.nombre}</strong> te alcanza para {semanas(pide.semanas)} semanas y {pide.proveedor} tarda {duracion(pide.entrega)}. Si esperas, te quedas sin él hacia el {fecha(sumarDias(hoy, Math.round((pide.semanas ?? 0) * 7)))}.
        </Tarjetita>
      )}
      {quieto && (
        <Tarjetita icono={<Wallet />} titulo="Dinero quieto" tono="azul" accion={<Link href={`${rutas.productos}?filtro=sobra`} className="text-[0.92rem] font-semibold text-azul-texto underline-offset-2 hover:underline">Ver lo que sobra</Link>}>
          {quieto.estado === 'sin_ventas' ? (
            <><strong>{quieto.nombre}</strong> no se vendió en todo el periodo y tienes {numero(quieto.existencias)}{quieto.valor ? `: ${plata(quieto.valor)} parados` : ''}.</>
          ) : (
            <><strong>{quieto.nombre}</strong>: vendes {ventasSemana(quieto.ventasSemana)} por semana y tienes {numero(quieto.existencias)}, para {semanas(quieto.semanas)} semanas.{quieto.quieto ? ` Son ${plata(quieto.quieto)} de más.` : ''}</>
          )}
        </Tarjetita>
      )}
      {proyecto && proyecto.pico && (
        <Tarjetita icono={<CalendarDays />} titulo="Venta para un proyecto" tono="neutro">
          En {mesAnio(proyecto.pico.mes)} se vendieron {numero(proyecto.pico.vendido)} de <strong>{proyecto.nombre}</strong>, mucho más que lo normal. Contamos {numero(proyecto.pico.contado)} para no pedir de más.
        </Tarjetita>
      )}
      {a ? (
        <Tarjetita icono={<Sparkles />} titulo="Qué tan bien acierta" tono="verde">
          Escondimos las últimas {a.semanas} semanas de tu archivo y las pronosticamos con lo anterior: lo vendido cayó dentro del rango en {a.aciertos} de {a.productos} productos.
        </Tarjetita>
      ) : nuevo ? (
        <Tarjetita icono={<Sparkles />} titulo="Producto nuevo" tono="neutro">
          <strong>{nuevo.nombre}</strong> empezó a venderse hace {numero(nuevo.explicacion.semanasProducto)} semanas: lo medimos desde su primera venta.
        </Tarjetita>
      ) : null}
    </section>
  )
}

type Serie = 'todo' | 'comercial' | 'proyectos'

function Ventas({ inv }: { inv: Inventario }) {
  const g = inv.grafico!
  const esProyecto = (s: { total: number; proyectos: number }) => s.proyectos > 0.15 * s.total
  const hayProyectos = g.semanas.some(esProyecto)
  const [serie, setSerie] = useState<Serie>('todo')
  const historia = g.semanas.map((s) => ({
    inicio: s.inicio,
    valor: serie === 'todo' ? s.total : serie === 'comercial' ? s.total - s.proyectos : s.proyectos,
    extra: serie === 'todo' ? s.proyectos : 0,
  }))
  const marcas = serie === 'todo' ? g.semanas.map((s, i) => (esProyecto(s) ? i : -1)).filter((i) => i >= 0) : []
  const pronostico = serie === 'proyectos' ? [] : g.pronostico
  const prox = g.pronostico.slice(0, 4)
  const media = prox.reduce((s, p) => s + p.media, 0)
  const t = inv.temporada
  const mesAlto = t ? t.indexOf(Math.max(...t)) : -1
  const texto =
    serie === 'proyectos'
      ? 'Los proyectos llegan a saltos: no se pronostican con el promedio. Cuando te aprueben uno, súmalo al pedido.'
      : `En las próximas 4 semanas esperamos vender unas ${numero(Math.round(media / 10) * 10)} unidades${t ? `, ya con la temporada (${MESES[mesAlto]} suele ser el mes más fuerte)` : ''}.`

  return (
    <Tarjeta aria-labelledby="t-ventas" className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="t-ventas" className="text-xl font-bold">Ventas por semana y lo que viene</h2>
          <p className="mt-1 text-[0.95rem] text-muted-foreground">{texto}</p>
        </div>
        {hayProyectos && (
          <Pildoras<Serie>
            etiqueta="Qué ventas mostrar"
            valor={serie}
            onCambio={setSerie}
            opciones={[
              { id: 'todo', texto: 'Todo' },
              { id: 'comercial', texto: 'Comercialización' },
              { id: 'proyectos', texto: 'Proyectos' },
            ]}
          />
        )}
      </div>
      <GraficoVentas
        className="mt-4"
        historia={historia}
        pronostico={pronostico}
        marcas={marcas}
        descripcion="Unidades vendidas por semana en el último año y pronóstico de las próximas 8 semanas"
      />
      <div className="mt-3">
        <LeyendaVentas conProyecto={marcas.length > 0} />
      </div>
    </Tarjeta>
  )
}
