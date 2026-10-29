'use client'

// Panel "Su inventario hoy": lo que se agota, lo que hay que pedir ya, el dinero quieto, las
// ventas con su pronóstico y lo que conviene atender hoy.

import Link from 'next/link'
import { useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, BellRing, CalendarDays, Sparkles, TriangleAlert, Truck, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { alcance, alcancePartes, dia, duracion, fecha, mesAnio, numero, plata, plural, porcentaje, sumarDias, ventasSemana } from '@/lib/formato'
import { nombrePrograma } from '@/lib/sistemas'
import type { Inventario, Producto } from '@/lib/tipos'
import { useInventario } from './contexto'
import { BarraRiesgo, GraficoVentas, LeyendaVentas, Sparkline } from './graficos'
import { Ayuda, BotonEnlace, Cargando, ChipEstado, ChipsProducto, ESTADOS, ErrorLista, Pildoras, Tarjeta, Titulo } from './ui'
import { Encuesta } from './encuesta'
import { SinInventario } from './sin-inventario'
import { SelectorTiempo } from './vista'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function Panel() {
  const { inventario, cargando, error, respuesta } = useInventario()
  if (cargando) return <Cargando texto="Cargando su inventario…" />
  if (error) return <ErrorLista mensaje={error} />
  if (!inventario) return <SinInventario />
  return <PanelCon inv={inventario} />
}

function PanelCon({ inv }: { inv: Inventario }) {
  const { rutas, fuente } = useInventario()
  const r = inv.resumen
  const demo = fuente.tipo === 'demo'
  // El operador ve las métricas gruesas (server/inventario.js, resumirParaOperador).
  const operador = inv.vista === 'operador'
  // Sin proveedores en el archivo y sin un tiempo de entrega dicho por el usuario, "pide ya" no dice nada.
  const prueba = inv.alcance === 'prueba'
  const sinTiempos = inv.proveedores.every((p) => p.nombre === 'Sin proveedor') && inv.ajustes.entregaPorDefecto <= 1 && !demo
  const pideTop = inv.proveedores.filter((p) => p.pideYa > 0).sort((a, b) => b.pideYa - a.pideYa || b.entrega - a.entrega)[0]
  const sub = [
    inv.fuente.origen === 'movimientos'
      ? `${inv.fuente.archivos?.length ? 'Su archivo' : 'Sus movimientos'}${inv.fuente.archivos?.length && inv.fuente.movimientos ? ` + ${plural(inv.fuente.movimientos, 'movimiento', 'movimientos')}` : ''}`
      : inv.fuente.programa ? `Archivo de ${nombrePrograma(inv.fuente.programa)}` : 'Su último archivo',
    // La fecha que importa es hasta dónde llegan las ventas, no el día en que se subió el archivo.
    inv.fuente.hasta ? `${inv.fuente.origen === 'movimientos' ? 'al día' : 'ventas hasta'} el ${fecha(inv.fuente.hasta)}` : `del ${fecha(inv.fuente.fecha)}`,
    `${numero(r.productos)} productos`,
    inv.proveedores.length > 1 ? `${inv.proveedores.length} proveedores` : null,
  ].filter(Boolean).join(' · ')

  return (
    <>
      <Titulo
        etiqueta={demo ? <span className="self-start rounded-full bg-secondary px-2.5 py-0.5 text-nota font-semibold text-secondary-foreground">{inv.fuente.empresa}</span> : inv.fuente.hasta ? <ChipDatosAlDia hasta={inv.fuente.hasta} /> : undefined}
        sub={sub}
        acciones={
          operador && !demo ? (
            <>
              <BotonEnlace href="/movimientos" variante="primario">Registrar movimientos</BotonEnlace>
              <BotonEnlace href={rutas.datos}>Subir archivo</BotonEnlace>
            </>
          ) : (
            <>
              <BotonEnlace href={demo ? rutas.pedido : '/pedidos/sugerido'} variante="primario">Preparar pedido</BotonEnlace>
              <BotonEnlace href={rutas.datos}>Actualizar datos</BotonEnlace>
            </>
          )
        }
      >
        Su inventario hoy
      </Titulo>
      {!demo && <Encuesta />}
      <SelectorTiempo className="-mt-3" />

      {prueba && <AvisoPrueba />}
      {!demo && diasDesde(inv.fuente.hasta) > 30 && (
        <p className="rounded-2xl border border-ambar-borde bg-ambar-fondo px-5 py-4 text-cuerpo text-ambar-texto">
          <strong>Sus ventas llegan hasta el {fecha(inv.fuente.hasta)}.</strong> Las existencias son de esa fecha. Para verlo al día, suba el informe actualizado en <a href={rutas.datos} className="font-semibold underline underline-offset-2">Datos</a>.
        </p>
      )}

      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Cifra
          titulo={`Se agotan en ${duracion(inv.umbrales.seAgota)}`}
          tono="text-rojo"
          etiqueta="text-rojo-texto"
          valor={numero(r.seAgotan)}
          detalle={r.enCero && !prueba ? `${r.enCero} ya están en cero` : r.seAgotan ? 'Aparecen primero en la lista de abajo' : `Nada se agota en ${duracion(inv.umbrales.seAgota)}`}
          ayuda={`Productos que no alcanzan para ${duracion(inv.umbrales.seAgota)} al ritmo de venta actual. El umbral se cambia en Datos.`}
          href={`${rutas.productos}?filtro=agota`}
        />
        {prueba ? (
          <Cifra
            titulo="Ya en cero"
            tono="text-rojo"
            etiqueta="text-rojo-texto"
            valor={numero(r.enCero)}
            detalle={r.enCero ? 'productos que se venden y no hay en existencia' : 'Ningún producto que se venda está en cero'}
            ayuda="Productos con ventas en su archivo y cero existencias hoy."
            href={`${rutas.productos}?filtro=agota`}
          />
        ) : sinTiempos ? (
          <Cifra
            titulo="Pedir ya"
            tono="text-ambar"
            etiqueta="text-ambar-texto"
            valor="¿?"
            detalle="Díganos cuánto tarda su proveedor y le avisamos qué pedir antes de que sea tarde."
            ayuda="Se asume una semana de entrega. Si su proveedor tarda más, cámbielo en Datos."
            href={rutas.datos}
            textoEnlace="Decir cuánto tarda"
          />
        ) : (
          <Cifra
            titulo="Pedir ya"
            tono="text-ambar"
            etiqueta="text-ambar-texto"
            valor={numero(r.pideYa)}
            detalle={pideTop ? `${pideTop.pideYa} de ${pideTop.nombre}: tarda ${duracion(pideTop.entrega)}` : 'Ninguno tarda más de lo que queda'}
            ayuda="Alcanzan para más de 2 semanas, pero no para la entrega del proveedor más una semana de margen."
            href={`${rutas.productos}?filtro=pide`}
          />
        )}
        {operador ? (
          <>
            <Cifra
              titulo="Sobran"
              tono="text-azul"
              etiqueta="text-azul-texto"
              valor={numero(r.sobran)}
              detalle={`productos con más de ${duracion(inv.umbrales.sobra)} o sin ventas`}
              ayuda="No hace falta pedirlos por ahora."
              href={`${rutas.productos}?filtro=sobra`}
            />
            <Cifra
              titulo="Ya en cero"
              tono="text-rojo"
              etiqueta="text-rojo-texto"
              valor={numero(r.enCero)}
              detalle={r.enCero ? 'productos que se venden y no hay en existencia' : 'Ningún producto que se venda está en cero'}
              ayuda="Productos con ventas y cero existencias hoy."
              href={demo ? `${rutas.productos}?filtro=agota` : '/existencias'}
            />
          </>
        ) : (
          <>
            <Cifra
              titulo="Dinero quieto"
              tono="text-azul"
              etiqueta="text-azul-texto"
              valor={r.tieneCostos ? plata(r.dineroQuieto) : numero(r.sobran)}
              detalle={r.tieneCostos ? `en ${numero(r.sobran)} productos que sobran` : `productos con más de ${duracion(inv.umbrales.sobra)}. Si su archivo trae el costo, aquí verá cuánta plata es.`}
              ayuda={`Valor a costo del inventario por encima de ${duracion(inv.umbrales.sobra)} de venta, más lo que no se vendió en el periodo.`}
              href={`${rutas.productos}?filtro=sobra`}
            />
            <Cifra
              titulo="Ventas: últimas 4 semanas del archivo"
              tono={r.tendencia4 !== null && r.tendencia4 < 0 ? 'text-foreground' : 'text-verde'}
              etiqueta="text-verde"
              valor={porcentaje(r.tendencia4, true)}
              detalle="frente a las 4 anteriores, sin contar proyectos"
              ayuda="Unidades vendidas en las últimas 4 semanas del archivo frente a las 4 anteriores, sin proyectos."
            />
          </>
        )}
      </section>

      <p className="-mt-2 flex flex-wrap gap-x-6 gap-y-1 text-chico text-muted-foreground">
        {r.cobertura !== null && <span>El producto típico alcanza para <strong className="text-foreground tabular-nums">{alcance(r.cobertura)}</strong></span>}
        {r.tieneCostos && <span>Inventario a costo: <strong className="text-foreground tabular-nums">{plata(r.valorInventario)}</strong></span>}
        {r.sinVentas > 0 && <span>{plural(r.sinVentas, 'producto sin ventas', 'productos sin ventas')} en el periodo</span>}
        {!demo && !prueba && r.sinProveedor > 0 && r.sinProveedor < r.productos && (
          <Link href={rutas.datos} className="font-semibold text-primary hover:text-primary-hover">{plural(r.sinProveedor, 'producto', 'productos')} sin proveedor: díganos quién se los vende</Link>
        )}
      </p>

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
        <span className={cn('text-etiqueta font-bold tracking-[0.06em] uppercase', etiqueta)}>{titulo}</span>
        <Ayuda texto={ayuda} />
      </div>
      <strong className={cn('font-display text-[1.7rem] leading-none font-extrabold tabular-nums sm:text-[2.1rem]', tono)}>{valor}</strong>
      <span className="text-nota leading-snug text-muted-foreground sm:text-chico">{detalle}</span>
    </>
  )
  return (
    <div className="relative flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 sm:gap-2.5 sm:p-5">
      {cuerpo}
      {href && (
        <Link href={href} className="text-chico font-semibold text-primary hover:text-primary-hover">
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
        <h2 id="t-primero" className="text-xl font-bold">¿Qué se acaba primero?</h2>
        <Link href={rutas.productos} className="text-cuerpo font-semibold text-primary hover:text-primary-hover">
          Ver los {numero(inv.resumen.productos)} productos
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="text-left text-nota text-muted-foreground">
              <th scope="col" className="border-b border-border px-2 py-2.5 font-semibold">Producto</th>
              <th scope="col" className="border-b border-border px-2 py-2.5 font-semibold">Ventas/semana</th>
              <th scope="col" className="border-b border-border px-2 py-2.5 text-right font-semibold">Existencias</th>
              <th scope="col" className="border-b border-border px-2 py-2.5 text-right font-semibold">Alcanza para</th>
              <th scope="col" className="border-b border-border px-2 py-2.5 font-semibold">{inv.alcance === 'prueba' ? 'Estado' : 'Riesgo de agotarse'}</th>
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
        <span className="block text-nota tracking-wide text-muted-foreground">{p.codigo}</span>
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
        <strong className={cn('font-display text-xl tabular-nums', e.numero)}>{alcancePartes(p.semanas).valor}</strong>
        <span className="block text-nota text-muted-foreground">{alcancePartes(p.semanas).unidad}</span>
      </td>
      <td className="min-w-44 border-b border-[#f0f1ee] px-2 py-3">
        {/* En cero ya se agotó: un porcentaje ahí confunde (sería la probabilidad de que lo pidan). */}
        {p.existencias <= 0 && p.ventasSemana > 0 ? (
          <span className="block text-sm font-bold text-rojo-texto">Ya está en cero</span>
        ) : (
          p.riesgo !== null && <BarraRiesgo valor={p.riesgo} />
        )}
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <ChipEstado estado={p.estado} existencias={p.existencias} texto={p.estado === 'pide' ? `Pedir ya: tarda ${duracion(p.entrega)}` : undefined} />
          {/* Solo "pedido hace poco": en el panel importa no pedir dos veces lo que ya va en camino. */}
          {(p.pedidoReciente || p.enCamino) && <ChipsProducto p={{ pedidoReciente: p.pedidoReciente, enCamino: p.enCamino }} />}
        </span>
      </td>
    </tr>
  )
}

function Tarjetita({ icono, titulo, tono, children, accion }: { icono: ReactNode; titulo: string; tono: 'rojo' | 'ambar' | 'azul' | 'neutro' | 'verde'; children: ReactNode; accion?: ReactNode }) {
  const t = {
    rojo: 'border-rojo-borde bg-rojo-fondo text-[#450a0a] [&_.etq]:text-rojo-texto',
    ambar: 'border-ambar-borde bg-ambar-fondo text-[#431407] [&_.etq]:text-ambar-texto',
    azul: 'border-azul-borde bg-azul-fondo text-[#172b4d] [&_.etq]:text-azul-texto',
    verde: 'border-verde-borde bg-verde-fondo text-[#14532d] [&_.etq]:text-verde',
    neutro: 'border-border bg-card text-foreground [&_.etq]:text-muted-foreground',
  }[tono]
  return (
    <div className={cn('flex flex-col gap-2 rounded-2xl border p-4', t)}>
      <span className="etq flex items-center gap-2 text-etiqueta font-bold tracking-[0.06em] uppercase [&_svg]:size-4">{icono}{titulo}</span>
      <div className="text-cuerpo leading-relaxed">{children}</div>
      {accion}
    </div>
  )
}

function AtenderHoy({ inv }: { inv: Inventario }) {
  const { rutas, respuesta, fuente } = useInventario()
  const hoy = inv.fuente.fecha.slice(0, 10)
  const pide = inv.productos.filter((p) => p.estado === 'pide').sort((a, b) => b.entrega - (b.semanas ?? 0) - (a.entrega - (a.semanas ?? 0)))[0]
  const quieto = [...inv.productos].filter((p) => p.estado === 'sobra' || p.estado === 'sin_ventas').sort((a, b) => (b.quieto ?? b.unidadesQuietas) - (a.quieto ?? a.unidadesQuietas))[0]
  const proyecto = inv.productos.filter((p) => p.pico).sort((a, b) => (b.pico!.vendido - b.pico!.contado) - (a.pico!.vendido - a.pico!.contado))[0]
  const nuevo = inv.productos.find((p) => p.senales.includes('producto_nuevo'))
  const a = inv.resumen.acierto
  const avisos = inv.resumen.avisos
  const rec = respuesta?.recordatorio
  const tarjetas: ReactNode[] = []

  // Lo que ya está en cero y se vende: cada semana sin él es venta que se va a otro lado.
  const enCero = inv.productos.filter((p) => p.existencias <= 0 && p.ventasSemana > 0 && !p.ventaUnica).sort((a, b) => b.ventasSemana * (b.costo ?? 1) - a.ventasSemana * (a.costo ?? 1))
  if (enCero.length) {
    const unidades = enCero.reduce((t, p) => t + p.ventasSemana, 0)
    const conCosto = enCero.filter((p) => p.costo)
    const valor = conCosto.reduce((t, p) => t + p.ventasSemana * (p.costo ?? 0), 0)
    const hrefPedido = fuente.tipo === 'cuenta' ? '/pedidos/sugerido' : rutas.pedido
    tarjetas.push(
      <Tarjetita key="cero" icono={<TriangleAlert />} titulo="Ventas que se están perdiendo" tono="rojo" accion={<BotonEnlace href={hrefPedido} variante="primario" tamano="chico" className="self-start">Armar el pedido para reponerlos</BotonEnlace>}>
        {plural(enCero.length, 'producto que se vende está', 'productos que se venden están')} en cero: unas <strong>{numero(Math.round(unidades))} unidades por semana</strong> sin vender
        {valor > 0 ? <> ({plata(valor)} a costo)</> : ''}. El principal: <strong>{enCero[0].nombre}</strong> ({ventasSemana(enCero[0].ventasSemana)} por semana).
      </Tarjetita>,
    )
  }

  if (pide) {
    tarjetas.push(
      <Tarjetita key="pide" icono={<Truck />} titulo="Pedir ya: tarda en llegar" tono="ambar" accion={<BotonEnlace href={fuente.tipo === 'cuenta' ? '/pedidos/sugerido' : rutas.pedido} variante="primario" tamano="chico" className="self-start">Preparar pedido</BotonEnlace>}>
        <strong>{pide.nombre}</strong> alcanza para {alcance(pide.semanas)} y {pide.proveedor} tarda {duracion(pide.entrega)}. Se acaba hacia el {fecha(sumarDias(hoy, Math.round((pide.semanas ?? 0) * 7)))}: pídalo ya para que llegue a tiempo.
      </Tarjetita>,
    )
  }
  if (quieto) {
    tarjetas.push(
      <Tarjetita key="quieto" icono={<Wallet />} titulo="Dinero quieto" tono="azul" accion={<Link href={`${rutas.productos}?filtro=sobra`} className="text-chico font-semibold text-azul-texto underline-offset-2 hover:underline">Ver lo que sobra</Link>}>
        {quieto.estado === 'sin_ventas' ? (
          <><strong>{quieto.nombre}</strong> no se vendió en todo el periodo y hay {numero(quieto.existencias)}{quieto.valor ? `: ${plata(quieto.valor)} parados` : ''}.</>
        ) : (
          <><strong>{quieto.nombre}</strong>: se venden {ventasSemana(quieto.ventasSemana)} por semana y hay {numero(quieto.existencias)}, para {alcance(quieto.semanas)}.{quieto.quieto ? ` Son ${plata(quieto.quieto)} de más.` : ''}</>
        )}
      </Tarjetita>,
    )
  }
  // Recordatorio de calendario: si ya lo pidió, cuándo llega; si no, qué se le avisaría.
  const hoyBogota = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  if (rec?.activo && rec.primerAviso && rec.primerAviso <= hoyBogota) {
    tarjetas.push(
      <Tarjetita key="rec" icono={<BellRing />} titulo="Llegó su recordatorio" tono="ambar" accion={<BotonEnlace href={rutas.datos} variante="primario" tamano="chico" className="self-start">Subir mi archivo de hoy</BotonEnlace>}>
        Desde el {dia(rec.primerAviso)} algunos productos podrían estar llegando a 2 semanas. Suba su archivo más reciente para confirmarlo con sus ventas de verdad.
      </Tarjetita>,
    )
  } else if (rec?.activo && rec.primerAviso && rec.pedidoId) {
    tarjetas.push(
      <Tarjetita key="rec" icono={<BellRing />} titulo="Su recordatorio" tono="neutro" accion={<a href={`/api/pedidos/${rec.pedidoId}/recordatorio.ics`} download className="text-chico font-semibold text-primary hover:text-primary-hover">Descargar otra vez para el calendario</a>}>
        Su calendario le avisa el <strong>{dia(rec.primerAviso)}</strong>, antes de que lo primero llegue a 2 semanas. Cuando le avise, suba su archivo de nuevo para confirmar.
      </Tarjetita>,
    )
  } else if (avisos && avisos.productos > 0 && avisos.primero) {
    tarjetas.push(
      <Tarjetita
        key="rec"
        icono={<BellRing />}
        titulo="Lo que viene"
        tono="neutro"
        accion={fuente.tipo === 'cuenta' ? <Link href={rutas.pedido} className="text-chico font-semibold text-primary hover:text-primary-hover">Pida el recordatorio al ver el reporte de su pedido</Link> : undefined}
      >
        {plural(avisos.productos, 'producto que hoy está bien llega', 'productos que hoy están bien llegan')} a {inv.umbrales.seAgota} semanas en los próximos 3 meses. El primero, <strong>{avisos.primero.nombre}</strong>, hacia el {dia(avisos.primero.fechaUmbral)}.
        {fuente.tipo === 'demo' ? ' Con su cuenta se lo dejamos en el calendario, 3 días antes.' : ''}
      </Tarjetita>,
    )
  }
  if (proyecto && proyecto.pico) {
    tarjetas.push(
      <Tarjetita key="proyecto" icono={<CalendarDays />} titulo="Venta para un proyecto" tono="neutro">
        En {mesAnio(proyecto.pico.mes)} se vendieron {numero(proyecto.pico.vendido)} de <strong>{proyecto.nombre}</strong>, mucho más de lo normal. Contamos {numero(proyecto.pico.contado)} para no pedir de más.
      </Tarjetita>,
    )
  }
  if (a) {
    tarjetas.push(
      <Tarjetita key="acierto" icono={<Sparkles />} titulo="Qué tan bien acierta" tono="verde">
        Escondimos las últimas {a.semanas} semanas de su archivo y las pronosticamos con lo anterior: lo vendido cayó dentro del rango en {a.aciertos} de {a.productos} productos.
      </Tarjetita>,
    )
  } else if (nuevo) {
    tarjetas.push(
      <Tarjetita key="nuevo" icono={<Sparkles />} titulo="Producto nuevo" tono="neutro">
        <strong>{nuevo.nombre}</strong> empezó a venderse después que el resto del catálogo (hace {numero(nuevo.explicacion.semanasProducto)} semanas): su promedio se mide desde su primera venta, no desde el comienzo del archivo.
      </Tarjetita>,
    )
  }

  return (
    <section aria-labelledby="t-hoy" className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5">
      <h2 id="t-hoy" className="text-xl font-bold">Atender hoy</h2>
      {tarjetas.length ? tarjetas.slice(0, 5) : <p className="text-muted-foreground">Nada urgente. Su inventario está en orden.</p>}
    </section>
  )
}

type Serie = 'todo' | 'comercial' | 'proyectos'

function Ventas({ inv }: { inv: Inventario }) {
  const g = inv.grafico!
  const esProyecto = (s: { total: number; proyectos: number }) => s.proyectos > 0.15 * s.total
  const hayProyectos = g.semanas.some(esProyecto)
  // Por defecto sin proyectos: es la base del pronóstico, y un pico de proyecto no aplasta la escala.
  const [serie, setSerie] = useState<Serie>(hayProyectos ? 'comercial' : 'todo')
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
  const texto = !g.pronostico.length
    ? `Así se han vendido sus productos, semana a semana.${hayProyectos ? ' Las semanas con ventas de proyectos van marcadas.' : ''}`
    : serie === 'proyectos'
      ? 'Los proyectos llegan a saltos: no se pronostican con el promedio. Cuando le aprueben uno, súmelo al pedido.'
      : `En las próximas 4 semanas esperamos vender unas ${numero(Math.round(media / 10) * 10)} unidades${t ? `, ya con la temporada (${MESES[mesAlto]} suele ser el mes más fuerte)` : ''}.`

  return (
    <Tarjeta aria-labelledby="t-ventas" className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="t-ventas" className="text-xl font-bold">{g.pronostico.length ? 'Ventas por semana y lo que viene' : 'Ventas por semana'}</h2>
          <p className="mt-1 text-cuerpo text-muted-foreground">{texto}</p>
        </div>
        {hayProyectos && (
          <Pildoras<Serie>
            etiqueta="Qué ventas mostrar"
            valor={serie}
            onCambio={setSerie}
            opciones={[
              { id: 'comercial', texto: 'Sin proyectos' },
              { id: 'todo', texto: 'Con proyectos' },
              { id: 'proyectos', texto: 'Solo proyectos' },
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
        <LeyendaVentas conProyecto={marcas.length > 0} conPronostico={pronostico.length > 0} />
      </div>
    </Tarjeta>
  )
}

// Días entre una fecha "YYYY-MM-DD" y hoy.
// Qué tan al día están los datos (Claudia: las recomendaciones dependen de tener los movimientos
// al día). Se cuenta en días hábiles: un lunes con datos del viernes está al día.
function diasHabilesDesde(v: string) {
  const hoy = Date.parse(`${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })}T12:00:00Z`)
  let n = 0
  for (let d = Date.parse(`${v.slice(0, 10)}T12:00:00Z`) + 86_400_000; d <= hoy; d += 86_400_000) {
    const dia = new Date(d).getUTCDay()
    if (dia !== 0 && dia !== 6) n++
  }
  return n
}

function ChipDatosAlDia({ hasta }: { hasta: string }) {
  const dias = diasDesde(hasta)
  const habiles = diasHabilesDesde(hasta)
  const texto = dias <= 0 ? 'Datos de hoy' : dias === 1 ? 'Datos de ayer' : `Datos de hace ${dias} días`
  const tono = habiles <= 1 ? 'bg-verde-fondo text-[#14532d]' : habiles <= 3 ? 'bg-ambar-fondo text-ambar-texto' : 'bg-rojo-fondo text-rojo-texto'
  return (
    <Link
      href="/movimientos"
      title="Lo que sugiere SINESC depende de tener las entradas y salidas al día. Regístrelas en Movimientos o suba el archivo de su programa en Datos."
      className={cn('presionable self-start rounded-full px-2.5 py-0.5 text-nota font-semibold', tono)}
    >
      {texto}
    </Link>
  )
}

function diasDesde(v: string | null | undefined) {
  if (!v) return 0
  return Math.floor((Date.now() - Date.parse(`${v}T12:00:00Z`)) / 86_400_000)
}

function AvisoPrueba() {
  const { respuesta } = useInventario()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#cfe5e1] bg-secondary px-5 py-4 text-cuerpo text-[#0b3f3b]">
      <p>
        <strong>Por ahora ve para cuántas semanas alcanza cada producto.</strong>
        El pronóstico, el tiempo de entrega de sus proveedores y la cantidad sugerida se activan{respuesta?.finPrueba ? ` el ${fecha(respuesta.finPrueba)}` : ' más adelante'}.
      </p>
    </div>
  )
}
