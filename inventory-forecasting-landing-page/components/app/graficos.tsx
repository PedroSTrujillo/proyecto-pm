'use client'

// Gráficos hechos a mano en SVG: livianos, sin librerías y con los colores de la marca.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { fechaCorta, mesCorto, numero, sumarDias } from '@/lib/formato'

export function Sparkline({ valores, className, color = 'var(--primary)' }: { valores: number[]; className?: string; color?: string }) {
  if (!valores.length) return <svg className={className} aria-hidden="true" />
  const max = Math.max(...valores)
  const min = Math.min(...valores)
  const d = valores
    .map((v, i) => `${i ? 'L' : 'M'}${((i * 100) / Math.max(valores.length - 1, 1)).toFixed(1)} ${(27 - ((v - min) / (max - min || 1)) * 24).toFixed(1)}`)
    .join(' ')
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={cn('h-7 w-24', className)} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// Un tope redondo para el eje (1, 1,5, 2, 2,5, 3, 4, 5, 6, 8 o 10 por una potencia de 10).
function techo(v: number) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p
  return 10 * p
}

type Punto = { inicio: string; valor: number; extra?: number }
type PuntoPronostico = { inicio: string; media: number; bajo: number; alto: number }

// Ancho real del contenedor: el SVG se dibuja a escala 1:1 para que el texto se lea igual en un
// computador que en un celular (si se encoge con el dibujo, queda de 5 a 7 px).
function useAncho(inicial = 640) {
  const [ancho, setAncho] = useState(inicial)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => setAncho(Math.max(260, Math.round(el.getBoundingClientRect().width)))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, ancho }
}

/**
 * Ventas por semana (línea), pronóstico (línea punteada) y su rango probable (banda), con el
 * número del pronóstico escrito arriba. marcas: semanas resaltadas (por ejemplo, las de un
 * proyecto que no cuenta en el promedio).
 */
export function GraficoVentas({
  historia,
  pronostico,
  marcas = [],
  unidad = 'unidades',
  className,
  alto = 260,
  descripcion,
}: {
  historia: Punto[]
  pronostico: PuntoPronostico[]
  marcas?: number[]
  unidad?: string
  className?: string
  alto?: number
  descripcion: string
}) {
  const id = useId()
  const { ref, ancho } = useAncho()
  const [foco, setFoco] = useState<number | null>(null)
  const n = historia.length + pronostico.length
  const geo = useMemo(() => {
    // Marcas en pasos redondos (0, 50, 100, 150): con cuartos de un tope salían 38 y 113.
    const crudo = Math.max(1, ...historia.map((p) => p.valor), ...pronostico.map((p) => p.alto)) * 1.05
    const paso = techo(crudo / 4)
    const max = paso * Math.ceil(crudo / paso)
    const marcasY = Array.from({ length: Math.round(max / paso) + 1 }, (_, k) => k * paso)
    const izq = 14 + 7.5 * Math.max(...marcasY.map((v) => numero(v).length))
    const der = 16
    const arriba = pronostico.length ? 46 : 16
    const abajo = 30
    const x = (i: number) => izq + (i * (ancho - izq - der)) / Math.max(n - 1, 1)
    const y = (v: number) => alto - abajo - (Math.max(v, 0) / max) * (alto - arriba - abajo)
    const linea = (pts: [number, number][]) => pts.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
    const h0 = historia.length - 1
    const ultimo = historia[h0]?.valor ?? 0
    const pronosticoPts: [number, number][] = [[h0, ultimo], ...pronostico.map((p, k) => [h0 + 1 + k, p.media] as [number, number])]
    const arribaPts = [[h0, ultimo], ...pronostico.map((p, k) => [h0 + 1 + k, p.alto])] as [number, number][]
    const abajoPts = ([[h0, ultimo], ...pronostico.map((p, k) => [h0 + 1 + k, p.bajo])] as [number, number][]).reverse()
    const banda = [...arribaPts, ...abajoPts].map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
    // Etiquetas de mes: la primera semana de cada mes, con al menos 56 px entre una y otra.
    const todas = [...historia.map((p) => p.inicio), ...pronostico.map((p) => p.inicio)]
    const meses: { i: number; texto: string }[] = []
    let ultimoMes = ''
    todas.forEach((t, i) => {
      if (!t) return
      const m = t.slice(0, 7)
      if (m !== ultimoMes) {
        ultimoMes = m
        if (!meses.length || x(i) - x(meses[meses.length - 1].i) >= 56) meses.push({ i, texto: mesCorto(sumarDias(t, 3)) })
      }
    })
    const mediaPronostico = pronostico.length ? pronostico.reduce((s, p) => s + p.media, 0) / pronostico.length : null
    return { marcasY, izq, der, arriba, abajo, x, y, historia: linea(historia.map((p, i) => [i, p.valor])), pronostico: linea(pronosticoPts), banda, meses, h0, mediaPronostico }
  }, [historia, pronostico, n, alto, ancho])

  const puntoFoco = foco === null ? null : foco < historia.length ? { tipo: 'h' as const, p: historia[foco] } : { tipo: 'p' as const, p: pronostico[foco - historia.length] }

  function mover(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left - geo.izq) / (ancho - geo.izq - geo.der)) * (n - 1))
    setFoco(Math.max(0, Math.min(n - 1, i)))
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <svg
        width={ancho}
        height={alto}
        viewBox={`0 0 ${ancho} ${alto}`}
        className="block max-w-full touch-pan-y"
        role="img"
        aria-label={descripcion}
        onPointerMove={mover}
        onPointerLeave={() => setFoco(null)}
      >
        <defs>
          <clipPath id={`${id}-area`}>
            <rect x={geo.izq} y={0} width={ancho - geo.izq - geo.der} height={alto - geo.abajo} />
          </clipPath>
        </defs>
        {geo.marcasY.map((v, k) => (
          <g key={k}>
            <line x1={geo.izq} x2={ancho - geo.der} y1={geo.y(v)} y2={geo.y(v)} stroke={k === 0 ? '#d1d5db' : '#eceee9'} />
            <text x={geo.izq - 8} y={geo.y(v) + 4} textAnchor="end" fontSize={12} fill="#4b5563">{numero(v)}</text>
          </g>
        ))}
        {marcas.map((i) => (
          <rect key={i} x={geo.x(i) - 4} y={geo.arriba} width={8} height={alto - geo.arriba - geo.abajo} fill="var(--ambar-fondo)" />
        ))}
        <g clipPath={`url(#${id}-area)`}>
          {pronostico.length > 0 && <polygon points={geo.banda} fill="var(--primary)" fillOpacity={0.14} />}
          <path d={geo.historia} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {pronostico.length > 0 && <path d={geo.pronostico} fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeDasharray="6 5" strokeLinecap="round" />}
        </g>
        {pronostico.length > 0 && (
          <g>
            <line x1={geo.x(geo.h0)} x2={geo.x(geo.h0)} y1={geo.arriba - 4} y2={alto - geo.abajo} stroke="#9ca3af" strokeDasharray="3 4" />
            <text x={geo.x(geo.h0) - 6} y={geo.arriba - 10} textAnchor="end" fontSize={12} fill="#4b5563">hoy</text>
            {geo.mediaPronostico !== null && (
              <text x={ancho - geo.der} y={geo.arriba - 28} textAnchor="end" fontSize={12} fontWeight={700} fill="var(--secondary-foreground)">
                ~{numero(geo.mediaPronostico > 100 ? Math.round(geo.mediaPronostico / 10) * 10 : Math.round(geo.mediaPronostico))} por semana
              </text>
            )}
          </g>
        )}
        {geo.meses.map((m) => (
          <text key={m.i} x={geo.x(m.i)} y={alto - 9} textAnchor="middle" fontSize={12} fill="#4b5563">{m.texto}</text>
        ))}
        {foco !== null && puntoFoco && (
          <g pointerEvents="none">
            <line x1={geo.x(foco)} x2={geo.x(foco)} y1={geo.arriba} y2={alto - geo.abajo} stroke="#111827" strokeOpacity={0.2} />
            <circle cx={geo.x(foco)} cy={geo.y(puntoFoco.tipo === 'h' ? puntoFoco.p.valor : puntoFoco.p.media)} r={5} fill="#fff" stroke="var(--primary)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {foco !== null && puntoFoco && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-max max-w-56 -translate-x-1/2 rounded-lg bg-foreground px-2.5 py-1.5 text-nota leading-snug text-background shadow-lg"
          style={{ left: `${Math.min(85, Math.max(15, (geo.x(foco) / ancho) * 100))}%` }}
        >
          <span className="block text-background/70">Semana del {fechaCorta(puntoFoco.p.inicio)}</span>
          {puntoFoco.tipo === 'h' ? (
            <span className="font-semibold tabular-nums">
              {numero(puntoFoco.p.valor)} {unidad}
              {puntoFoco.p.extra ? <span className="block font-normal text-[#fcd9a8]">{numero(puntoFoco.p.extra)} de un proyecto</span> : null}
            </span>
          ) : (
            <span className="font-semibold tabular-nums">
              Entre {numero(puntoFoco.p.bajo)} y {numero(puntoFoco.p.alto)}
              <span className="block font-normal text-background/70">lo más probable: {numero(puntoFoco.p.media)}</span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// --- Ficha del producto -------------------------------------------------------------------------
// Antes la ficha mostraba 52 semanas de ventas en una línea: se veía como ruido, la última semana (incompleta)
// parecía una caída, y no respondía lo que el cliente pregunta: ¿hasta cuándo me alcanza y cuánto vendo al mes?

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const ultimoDiaDelMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).getUTCDate()
}

type Mes = { mes: string; valor: number; semanas: number; proyecto: boolean; parcial: boolean }

/** Las semanas sumadas por mes (cada semana cae en el mes de su jueves). Los últimos 12 meses. */
export function ventasPorMes(historia: Punto[], marcas: number[], hasta: string | null): Mes[] {
  const meses = new Map<string, Mes>()
  historia.forEach((p, i) => {
    if (!p.inicio) return
    const mes = sumarDias(p.inicio, 3).slice(0, 7)
    const m = meses.get(mes) ?? { mes, valor: 0, semanas: 0, proyecto: false, parcial: false }
    m.valor += p.valor
    m.semanas += 1
    if (marcas.includes(i)) m.proyecto = true
    meses.set(mes, m)
  })
  const lista = [...meses.values()]
  // El primer mes casi siempre llega cortado por el comienzo del archivo: con menos de 3 semanas engaña.
  if (lista.length > 3 && lista[0].semanas < 3) lista.shift()
  const ultimo = lista[lista.length - 1]
  if (ultimo && hasta && hasta.slice(0, 7) === ultimo.mes && Number(hasta.slice(8, 10)) < ultimoDiaDelMes(ultimo.mes)) ultimo.parcial = true
  return lista.slice(-12)
}

/** Barras de lo vendido cada mes, con el número encima, el promedio y el mes en curso marcado como incompleto. */
export function GraficoMeses({ meses, unidad = 'unidades', hasta, descripcion, alto = 230 }: { meses: Mes[]; unidad?: string; hasta: string | null; descripcion: string; alto?: number }) {
  const { ref, ancho } = useAncho(460)
  const [foco, setFoco] = useState<number | null>(null)
  const completos = meses.filter((m) => !m.parcial)
  const promedio = completos.length ? completos.reduce((s, m) => s + m.valor, 0) / completos.length : null
  const max = techo(Math.max(1, ...meses.map((m) => m.valor), promedio ?? 0) * 1.12)
  const izq = 14 + 7.5 * numero(max).length
  const der = 8
  const arriba = 34
  const abajo = 26
  const paso = (ancho - izq - der) / Math.max(meses.length, 1)
  const barra = Math.min(44, paso * 0.68)
  const y = (v: number) => alto - abajo - (Math.max(v, 0) / max) * (alto - arriba - abajo)
  const conNumeros = paso >= 22
  const letra = paso < 30 ? 11 : 12
  const mostrarAnio = (i: number) => i === 0 || meses[i].mes.slice(5) === '01'

  return (
    <div ref={ref} className="relative">
      <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} className="block max-w-full" role="img" aria-label={descripcion} onPointerLeave={() => setFoco(null)}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={izq} x2={ancho - der} y1={y(max * f)} y2={y(max * f)} stroke={f === 0 ? '#d1d5db' : '#eceee9'} />
            <text x={izq - 8} y={y(max * f) + 4} textAnchor="end" fontSize={12} fill="#4b5563">{numero(max * f)}</text>
          </g>
        ))}
        {meses.map((m, i) => {
          const cx = izq + paso * i + paso / 2
          const color = m.proyecto ? 'var(--ambar)' : 'var(--primary)'
          return (
            <g key={m.mes} onPointerEnter={() => setFoco(i)} onFocus={() => setFoco(i)} onBlur={() => setFoco(null)} tabIndex={0} aria-label={`${MESES_LARGOS[Number(m.mes.slice(5)) - 1]}: ${numero(m.valor)} ${unidad}${m.parcial ? ', mes en curso' : ''}`}>
              <rect x={izq + paso * i} y={arriba} width={paso} height={alto - arriba - abajo} fill="transparent" />
              <rect x={cx - barra / 2} y={y(m.valor)} width={barra} height={Math.max(alto - abajo - y(m.valor), m.valor > 0 ? 2 : 0)} rx={3} fill={color} fillOpacity={m.parcial ? 0.3 : foco === i ? 1 : 0.85} stroke={m.parcial ? color : 'none'} strokeDasharray={m.parcial ? '4 3' : undefined} />
              {conNumeros && <text x={cx} y={y(m.valor) - 6} textAnchor="middle" fontSize={letra} fontWeight={600} fill="#1f2937">{numero(m.valor)}</text>}
              <text x={cx} y={alto - 9} textAnchor="middle" fontSize={12} fill={m.parcial ? '#6b7280' : '#4b5563'}>
                {mesCorto(`${m.mes}-15`)}{mostrarAnio(i) && paso >= 44 ? ` ${m.mes.slice(2, 4)}` : ''}
              </text>
            </g>
          )
        })}
        {promedio !== null && (
          <g pointerEvents="none">
            <line x1={izq} x2={ancho - der} y1={y(promedio)} y2={y(promedio)} stroke="#111827" strokeOpacity={0.55} strokeDasharray="5 4" />
            {/* Arriba del área, no sobre la línea: ahí tapaba el número de las barras altas. */}
            <line x1={ancho - der - 150} x2={ancho - der - 132} y1={9} y2={9} stroke="#111827" strokeOpacity={0.55} strokeDasharray="5 4" />
            <text x={ancho - der} y={13} textAnchor="end" fontSize={12} fontWeight={700} fill="#111827">Promedio: {numero(promedio)} al mes</text>
          </g>
        )}
      </svg>
      {foco !== null && meses[foco] && (
        <div className="pointer-events-none absolute top-0 z-10 w-max max-w-60 -translate-x-1/2 rounded-lg bg-foreground px-2.5 py-1.5 text-nota leading-snug text-background shadow-lg" style={{ left: `${Math.min(82, Math.max(18, ((izq + paso * foco + paso / 2) / ancho) * 100))}%` }}>
          <span className="block text-background/70">{MESES_LARGOS[Number(meses[foco].mes.slice(5)) - 1]} de {meses[foco].mes.slice(0, 4)}</span>
          <span className="font-semibold tabular-nums">{numero(meses[foco].valor)} {unidad}</span>
          {meses[foco].parcial && hasta && <span className="block text-background/70">Mes en curso: hasta el {fechaCorta(hasta)}</span>}
          {meses[foco].proyecto && <span className="block text-[#fcd9a8]">Incluye una venta de proyecto</span>}
        </div>
      )}
    </div>
  )
}

type Proyeccion = { k: number; media: number; pesimista: number; optimista: number; conCamino: number | null }

/** Semanas (con decimales) hasta que la serie llega a 0, o null si no llega dentro del pronóstico. */
function cruceConCero(puntos: { k: number; v: number }[]) {
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1]
    const b = puntos[i]
    if (a.v > 0 && b.v <= 0) return a.k + (a.v / (a.v - b.v)) * (b.k - a.k)
  }
  return puntos.length && puntos[0].v <= 0 ? 0 : null
}

/**
 * Las existencias de las próximas semanas si se vende lo pronosticado: la línea es lo más probable y la franja va
 * de una venta alta (se acaba antes) a una baja. Marca el día en que se acaba, cuándo llegaría un pedido hecho hoy
 * y el mínimo. Si hay mercancía en camino, la línea punteada la suma.
 * Devuelve también las fechas, para escribirlas debajo en palabras.
 */
export function proyectarExistencias(existencias: number, pronostico: PuntoPronostico[], enCamino: number | null) {
  const puntos: Proyeccion[] = [{ k: 0, media: existencias, pesimista: existencias, optimista: existencias, conCamino: enCamino ? existencias + enCamino : null }]
  let m = existencias
  let pe = existencias
  let op = existencias
  pronostico.forEach((p, i) => {
    m -= p.media
    pe -= p.alto
    op -= p.bajo
    puntos.push({ k: i + 1, media: m, pesimista: pe, optimista: op, conCamino: enCamino ? m + enCamino : null })
  })
  return {
    puntos,
    seAcaba: cruceConCero(puntos.map((p) => ({ k: p.k, v: p.media }))),
    seAcabaPronto: cruceConCero(puntos.map((p) => ({ k: p.k, v: p.pesimista }))),
    seAcabaTarde: cruceConCero(puntos.map((p) => ({ k: p.k, v: p.optimista }))),
    seAcabaConCamino: enCamino ? cruceConCero(puntos.map((p) => ({ k: p.k, v: p.conCamino ?? 0 }))) : null,
  }
}

export function GraficoAlcance({
  existencias, pronostico, enCamino, entrega, minimo, hoy, descripcion, alto = 240,
}: { existencias: number; pronostico: PuntoPronostico[]; enCamino: number | null; entrega: number; minimo: number | null; hoy: string; descripcion: string; alto?: number }) {
  const id = useId()
  const { ref, ancho } = useAncho(460)
  const pr = useMemo(() => proyectarExistencias(existencias, pronostico, enCamino), [existencias, pronostico, enCamino])
  const n = pronostico.length
  const max = techo(Math.max(1, existencias + (enCamino ?? 0), minimo ?? 0) * 1.08)
  const izq = 14 + 7.5 * numero(max).length
  const der = 12
  const arriba = 26
  const abajo = 28
  const x = (k: number) => izq + (k * (ancho - izq - der)) / Math.max(n, 1)
  const y = (v: number) => alto - abajo - (Math.max(v, 0) / max) * (alto - arriba - abajo)
  const linea = (f: (p: Proyeccion) => number) => pr.puntos.map((p, i) => `${i ? 'L' : 'M'}${x(p.k).toFixed(1)} ${y(f(p)).toFixed(1)}`).join(' ')
  const banda = [...pr.puntos.map((p) => `${x(p.k).toFixed(1)},${y(p.optimista).toFixed(1)}`), ...[...pr.puntos].reverse().map((p) => `${x(p.k).toFixed(1)},${y(p.pesimista).toFixed(1)}`)].join(' ')
  const etiquetas = pr.puntos.filter((p) => p.k % (ancho < 420 ? 4 : 2) === 0)
  const entregaVisible = entrega > 0 && entrega <= n

  return (
    <div ref={ref} className="relative">
      <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} className="block max-w-full" role="img" aria-label={descripcion}>
        <defs>
          <clipPath id={`${id}-area`}><rect x={izq} y={0} width={ancho - izq - der} height={alto - abajo + 1} /></clipPath>
        </defs>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={izq} x2={ancho - der} y1={y(max * f)} y2={y(max * f)} stroke={f === 0 ? '#9ca3af' : '#eceee9'} />
            <text x={izq - 8} y={y(max * f) + 4} textAnchor="end" fontSize={12} fill="#4b5563">{numero(max * f)}</text>
          </g>
        ))}
        {minimo !== null && minimo > 0 && minimo < max && (
          <g>
            <line x1={izq} x2={ancho - der} y1={y(minimo)} y2={y(minimo)} stroke="var(--ambar)" strokeDasharray="2 4" strokeWidth={1.5} />
            <text x={izq + 6} y={y(minimo) - 6} fontSize={12} fontWeight={600} fill="var(--ambar-texto)" paintOrder="stroke" stroke="#fff" strokeWidth={4}>Mínimo: {numero(minimo)}</text>
          </g>
        )}
        {entregaVisible && (
          <g>
            <line x1={x(entrega)} x2={x(entrega)} y1={arriba - 6} y2={alto - abajo} stroke="#6b7280" strokeDasharray="3 4" />
            <text x={x(entrega) + (x(entrega) + 150 > ancho - der ? -6 : 6)} y={arriba - 10} textAnchor={x(entrega) + 150 > ancho - der ? 'end' : 'start'} fontSize={12} fill="#374151">Si pide hoy, llega aquí</text>
          </g>
        )}
        <g clipPath={`url(#${id}-area)`}>
          <polygon points={banda} fill="var(--primary)" fillOpacity={0.13} />
          {enCamino ? <path d={linea((p) => p.conCamino ?? 0)} fill="none" stroke="var(--primary)" strokeWidth={2} strokeDasharray="6 5" strokeOpacity={0.8} /> : null}
          <path d={linea((p) => p.media)} fill="none" stroke="var(--primary)" strokeWidth={2.75} strokeLinejoin="round" strokeLinecap="round" />
        </g>
        <circle cx={x(0)} cy={y(existencias)} r={4.5} fill="var(--primary)" />
        {pr.seAcaba !== null && pr.seAcaba <= n && (
          <g>
            <circle cx={x(pr.seAcaba)} cy={y(0)} r={5.5} fill="var(--rojo)" stroke="#fff" strokeWidth={2} />
            <text x={x(pr.seAcaba) + (x(pr.seAcaba) + 140 > ancho - der ? -8 : 8)} y={y(0) - 10} textAnchor={x(pr.seAcaba) + 140 > ancho - der ? 'end' : 'start'} fontSize={12.5} fontWeight={700} fill="var(--rojo-texto)" paintOrder="stroke" stroke="#fff" strokeWidth={4}>
              Se acaba ~{fechaCorta(sumarDias(hoy, Math.round(pr.seAcaba * 7)))}
            </text>
          </g>
        )}
        {etiquetas.map((p) => (
          <text key={p.k} x={x(p.k)} y={alto - 9} textAnchor={p.k === 0 ? 'start' : p.k === n ? 'end' : 'middle'} fontSize={12} fill="#4b5563">
            {p.k === 0 ? 'Hoy' : fechaCorta(sumarDias(hoy, p.k * 7))}
          </text>
        ))}
      </svg>
    </div>
  )
}

export function LeyendaVentas({ conProyecto = false, conPronostico = true }: { conProyecto?: boolean; conPronostico?: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
      <span className="inline-flex items-center gap-2"><svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--primary)" strokeWidth="2.5" /></svg>Vendido</span>
      {conPronostico && <span className="inline-flex items-center gap-2"><svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--primary)" strokeWidth="2.5" strokeDasharray="5 4" /></svg>Pronóstico</span>}
      {conPronostico && <span className="inline-flex items-center gap-2"><span className="h-2.5 w-5 rounded-sm bg-primary/20" />Rango probable: 8 de cada 10 semanas caen aquí</span>}
      {conProyecto && <span className="inline-flex items-center gap-2"><span className="h-2.5 w-5 rounded-sm bg-ambar-fondo ring-1 ring-ambar-borde" />Venta de un proyecto</span>}
    </div>
  )
}

// Barra de probabilidad (0 a 1).
export function BarraRiesgo({ valor, className }: { valor: number | null; className?: string }) {
  if (valor === null) return <span className="text-muted-foreground">—</span>
  const pct = Math.round(valor * 100)
  const color = pct >= 70 ? 'bg-rojo' : pct >= 30 ? 'bg-ambar' : 'bg-primary'
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <span className={cn('block h-2 rounded-full', color)} style={{ width: `${Math.max(pct, 2)}%` }} />
      </span>
      <span className="w-11 text-right text-sm font-bold tabular-nums">{pct} %</span>
    </span>
  )
}
