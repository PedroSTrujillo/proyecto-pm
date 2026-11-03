'use client'

// Piezas pequeñas de la aplicación: botones, tarjetas, etiquetas de estado y mensajes.

import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { ChevronDown, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DIAS_POR_MES, fechaCorta, numero, semanas, unidadDeTiempo } from '@/lib/formato'
import type { Clase, Estado, EstadoAprobacion, Producto } from '@/lib/tipos'

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro'
type Tamano = 'normal' | 'chico'

const variantes: Record<Variante, string> = {
  primario: 'bg-primary text-primary-foreground border-primary hover:bg-primary-hover hover:border-primary-hover',
  secundario: 'bg-card text-foreground border-input hover:bg-muted',
  fantasma: 'bg-transparent text-foreground border-transparent hover:bg-muted',
  peligro: 'bg-card text-rojo-texto border-rojo-borde hover:bg-rojo-fondo',
}
const tamanos: Record<Tamano, string> = {
  normal: 'min-h-11 px-4 text-cuerpo gap-2 rounded-xl',
  chico: 'min-h-9 px-3 text-sm gap-1.5 rounded-lg',
}

export function clasesBoton(variante: Variante = 'secundario', tamano: Tamano = 'normal', extra?: string) {
  return cn(
    'presionable inline-flex select-none items-center justify-center border font-semibold whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-[1.1em] [&_svg]:shrink-0',
    variantes[variante],
    tamanos[tamano],
    extra,
  )
}

export function Boton({ variante = 'secundario', tamano = 'normal', className, ...props }: ComponentProps<'button'> & { variante?: Variante; tamano?: Tamano }) {
  return <button type="button" className={clasesBoton(variante, tamano, className)} {...props} />
}

export function BotonEnlace({ variante = 'secundario', tamano = 'normal', className, ...props }: ComponentProps<typeof Link> & { variante?: Variante; tamano?: Tamano }) {
  return <Link className={clasesBoton(variante, tamano, className)} {...props} />
}

export function Tarjeta({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('rounded-2xl border border-border bg-card', className)} {...props} />
}

// Lo que hay que hacer va arriba a la izquierda, debajo del título (regla del profesor en las
// pruebas): la acción principal primero y las secundarias a su derecha.
export function Titulo({ children, sub, acciones, etiqueta }: { children: ReactNode; sub?: ReactNode; acciones?: ReactNode; etiqueta?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        {etiqueta}
        <h1 className="text-[2.1rem] leading-tight font-extrabold sm:text-[2.35rem]">{children}</h1>
        {sub && <p className="text-muted-foreground">{sub}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2.5">{acciones}</div>}
    </header>
  )
}

export const ESTADOS: Record<Estado, { texto: string; chip: string; numero: string; barra: string; descripcion: string }> = {
  agota: { texto: 'Se va a agotar', chip: 'bg-rojo-fondo text-rojo-texto', numero: 'text-rojo', barra: 'bg-rojo', descripcion: 'Alcanza para menos de las semanas elegidas para el aviso (2 si no se cambió).' },
  pide: { texto: 'Pedir ya', chip: 'bg-ambar-fondo text-ambar-texto', numero: 'text-ambar', barra: 'bg-ambar', descripcion: 'No alcanza para lo que tarda en llegar un pedido, más una semana de margen.' },
  normal: { texto: 'Bien', chip: 'bg-muted text-foreground/80', numero: 'text-foreground', barra: 'bg-primary', descripcion: 'Bien surtido.' },
  sobra: { texto: 'Sobrestock', chip: 'bg-azul-fondo text-azul-texto', numero: 'text-azul', barra: 'bg-azul', descripcion: 'Alcanza para más de 12 semanas.' },
  sin_ventas: { texto: 'Sin ventas', chip: 'bg-azul-fondo text-azul-texto', numero: 'text-muted-foreground', barra: 'bg-muted-foreground', descripcion: 'No se vendió en el periodo del archivo.' },
}

// existencias: si ya no hay nada y se vende, dice "Agotado" (no "se va a agotar").
export function textoEstado(estado: Estado, existencias?: number | null) {
  if (estado === 'agota' && existencias !== undefined && existencias !== null && existencias <= 0) return 'Agotado'
  return ESTADOS[estado].texto
}

export function ChipEstado({ estado, className, texto, existencias }: { estado: Estado; className?: string; texto?: string; existencias?: number | null }) {
  const e = ESTADOS[estado]
  const agotado = textoEstado(estado, existencias) === 'Agotado'
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-nota font-bold whitespace-nowrap', agotado ? 'bg-rojo text-white' : e.chip, className)}>{texto || textoEstado(estado, existencias)}</span>
}

// Cómo se vende cada producto (server/inventario.js, clasificar). La descripción va en el title.
export const CLASES: Record<Clase, { texto: string; descripcion: string }> = {
  frecuente: { texto: 'Frecuente', descripcion: 'Se vende en la mitad de las semanas o más.' },
  esporadico: { texto: 'Esporádico', descripcion: 'Se vende en menos de la mitad de las semanas: el sugerido lleva más margen.' },
  proyecto: { texto: 'De proyecto', descripcion: 'Más de la mitad de lo vendido fue para proyectos: no cuenta en el promedio.' },
  unica: { texto: 'Venta única', descripcion: 'Todo lo vendido cayó en una o dos semanas: no se sugiere.' },
}

// Días desde una fecha (hoy = 0), en hora de Bogotá.
export function diasDesde(fecha: string) {
  const dia = (d: Date) => Date.parse(d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }))
  return Math.max(0, Math.round((dia(new Date()) - dia(new Date(fecha))) / 86400000))
}

// Las etiquetas de un producto: cómo se vende, si es de lo que más vende, si se pidió hace poco y
// si hay un pedido que todavía no llega (en ese caso esa etiqueta reemplaza a la de "pedido hace…").
export function ChipsProducto({ p, className }: { p: Pick<Producto, 'clase' | 'ventaAlta' | 'pedidoReciente' | 'enCamino'>; className?: string }) {
  const chip = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-nota font-semibold whitespace-nowrap'
  const dias = p.pedidoReciente ? diasDesde(p.pedidoReciente.fecha) : null
  if (!p.clase && !p.ventaAlta && !p.pedidoReciente && !p.enCamino) return null
  return (
    <span className={cn('flex flex-wrap gap-1', className)}>
      {p.enCamino && (
        <span className={cn(chip, 'bg-ambar-fondo text-ambar-texto')} title="Ya se pidió y todavía no se ha registrado su llegada. Lo sugerido lo descuenta.">
          En camino: {numero(p.enCamino.cantidad, 2)} · pedido el {fechaCorta(p.enCamino.fecha)}
        </span>
      )}
      {p.pedidoReciente && !p.enCamino && dias !== null && (
        <span className={cn(chip, 'bg-verde-fondo text-[#14532d]')} title={`Pedido ${p.pedidoReciente.numero}${p.pedidoReciente.por ? ` de ${p.pedidoReciente.por}` : ''}: ${numero(p.pedidoReciente.cantidad, 2)} unidades`}>
          Pedido {dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`}
        </span>
      )}
      {p.clase && p.clase !== 'frecuente' && <span className={cn(chip, 'bg-muted text-foreground/80')} title={CLASES[p.clase].descripcion}>{CLASES[p.clase].texto}</span>}
      {p.ventaAlta && <span className={cn(chip, 'bg-secondary text-secondary-foreground')} title="Está en el 20 % de productos que más se venden.">Venta alta</span>}
    </span>
  )
}

type TonoAviso = 'info' | 'ok' | 'error' | 'cuidado'
const tonos: Record<TonoAviso, string> = {
  info: 'border-[#cfe5e1] bg-secondary text-[#0b3f3b]',
  ok: 'border-verde-borde bg-verde-fondo text-[#14532d]',
  error: 'border-rojo-borde bg-rojo-fondo text-rojo-texto',
  cuidado: 'border-ambar-borde bg-ambar-fondo text-ambar-texto',
}

export function Aviso({ tono = 'info', children, className, titulo }: { tono?: TonoAviso; children?: ReactNode; className?: string; titulo?: ReactNode }) {
  return (
    <div role={tono === 'error' ? 'alert' : 'status'} className={cn('aparecer rounded-xl border px-4 py-3 text-cuerpo', tonos[tono], className)}>
      {titulo && <p className="font-bold">{titulo}</p>}
      {children}
    </div>
  )
}

export function ErrorLista({ mensaje, lista }: { mensaje: string; lista?: string[] }) {
  return (
    <Aviso tono="error" titulo={mensaje}>
      {lista && lista.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {lista.slice(0, 12).map((x, i) => <li key={i}>{x}</li>)}
          {lista.length > 12 && <li>…y {lista.length - 12} más.</li>}
        </ul>
      )}
    </Aviso>
  )
}

// Botones de opción tipo píldora (filtros, series del gráfico).
export function Pildoras<T extends string>({ opciones, valor, onCambio, etiqueta, className }: { opciones: { id: T; texto: ReactNode; cuenta?: number }[]; valor: T; onCambio: (v: T) => void; etiqueta: string; className?: string }) {
  return (
    <div role="group" aria-label={etiqueta} className={cn('flex flex-wrap gap-2', className)}>
      {opciones.map((o) => {
        const activo = o.id === valor
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={activo}
            onClick={() => onCambio(o.id)}
            className={cn(
              'presionable inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold',
              activo ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card text-foreground/80 hover:bg-muted',
            )}
          >
            {o.texto}
            {o.cuenta !== undefined && <span className={cn('tabular-nums', activo ? 'text-primary-foreground' : 'text-muted-foreground')}>{o.cuenta}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Esqueleto({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-muted', className)} />
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">{texto}</span>
      <Esqueleto className="h-10 w-72" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {[0, 1, 2, 3].map((i) => <Esqueleto key={i} className="h-32" />)}
      </div>
      <Esqueleto className="h-80" />
    </div>
  )
}

// El texto aparece debajo, a lo ancho del contenedor más cercano con posición relativa (la tarjeta):
// así no se sale de la pantalla en celular.
export function Ayuda({ texto }: { texto: string }) {
  return (
    <span className="group inline-flex">
      <button type="button" aria-label={texto} className="inline-flex size-7 items-center justify-center rounded-full border border-border bg-card text-nota font-bold text-muted-foreground hover:text-foreground">
        ?
      </button>
      <span role="tooltip" className="pointer-events-none absolute inset-x-3 top-12 z-20 rounded-xl bg-foreground px-3 py-2 text-left text-nota leading-snug font-normal text-background opacity-0 shadow-lg transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
        {texto}
      </span>
    </span>
  )
}

// Algo que se abre y se cierra. En las pruebas nadie notaba los <details> sin flecha: este lleva
// borde, el título en el color principal y una flecha que gira al abrir. Solo gira la flecha
// (transform), y nada se mueve si la persona pidió menos movimiento.
// alCambiar avisa cuando se abre o se cierra (para dibujar el contenido solo si está abierto).
export function Desplegable({ titulo, children, abierto, tono = 'normal', className, alCambiar }: { titulo: ReactNode; children: ReactNode; abierto?: boolean; tono?: 'normal' | 'ambar'; className?: string; alCambiar?: (abierto: boolean) => void }) {
  const ambar = tono === 'ambar'
  return (
    <details open={abierto} onToggle={alCambiar ? (e) => alCambiar(e.currentTarget.open) : undefined} className={cn('group/desplegable rounded-xl border', ambar ? 'border-ambar-borde bg-ambar-fondo/50' : 'border-border bg-card', className)}>
      <summary className={cn('flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2.5 font-semibold [&::-webkit-details-marker]:hidden', ambar ? 'text-ambar-texto' : 'text-primary hover:text-primary-hover')}>
        <span className="min-w-0">{titulo}</span>
        <ChevronDown aria-hidden="true" className="size-5 shrink-0 transition-transform duration-200 ease-[var(--ease-out)] group-open/desplegable:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  )
}

// Campo de formulario con su etiqueta encima.
export function Campo({ etiqueta, nota, children, className }: { etiqueta: ReactNode; nota?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5 text-cuerpo font-semibold', className)}>
      <span>
        {etiqueta}
        {nota && <span className="ml-1 font-normal text-muted-foreground">{nota}</span>}
      </span>
      {children}
    </label>
  )
}

export const claseEntrada =
  'min-h-11 w-full rounded-xl border border-input bg-card px-3.5 text-base font-normal text-foreground placeholder:text-muted-foreground/80 focus:border-primary focus:outline-3 focus:outline-ring disabled:bg-muted'

// Número de semanas con botones − y +.
// Un número de semanas con botones de más y menos. `unidad`: cómo se muestra ('semanas' por
// defecto; 'tiempo' = la unidad que eligió el usuario, guardando igual en semanas; 'dias-habiles'
// = el valor ya viene en días hábiles).
export function Contador({ valor, etiqueta, onMover, paso, unidad = 'semanas' }: { valor: number; etiqueta: string; onMover: (d: number) => void; paso: number; unidad?: 'semanas' | 'tiempo' | 'dias-habiles' }) {
  const u = unidad === 'tiempo' ? unidadDeTiempo() : unidad
  const mostrar = u === 'dias-habiles' ? { n: numero(valor), t: valor === 1 ? 'día hábil' : 'días hábiles' }
    : u === 'dias' ? { n: numero(Math.round(valor * 7)), t: Math.round(valor * 7) === 1 ? 'día' : 'días' }
      : u === 'meses' ? { n: numero((valor * 7) / DIAS_POR_MES, 1), t: Math.round(((valor * 7) / DIAS_POR_MES) * 10) === 10 ? 'mes' : 'meses' }
        : { n: semanas(valor), t: valor === 1 ? 'semana' : 'semanas' }
  return (
    <span className="flex items-center gap-2">
      <button type="button" aria-label={`Bajar ${etiqueta}`} onClick={() => onMover(-paso)} className="presionable inline-flex size-9 items-center justify-center rounded-lg border border-input bg-card hover:bg-muted"><Minus className="size-4" /></button>
      <span className="w-24 text-center">
        <strong className="text-[1.05rem] tabular-nums">{mostrar.n}</strong>
        <span className="block text-nota text-muted-foreground">{mostrar.t}</span>
      </span>
      <button type="button" aria-label={`Subir ${etiqueta}`} onClick={() => onMover(paso)} className="presionable inline-flex size-9 items-center justify-center rounded-lg border border-input bg-card hover:bg-muted"><Plus className="size-4" /></button>
    </span>
  )
}

// En qué va un pedido desde lo sugerido que no se ha cerrado.
export function ChipAprobacion({ estado }: { estado: EstadoAprobacion }) {
  if (estado === 'por_aprobar') return <span className="rounded-full bg-secondary px-2.5 py-0.5 text-nota font-bold text-secondary-foreground">Por aprobar</span>
  if (estado === 'devuelto') return <span className="rounded-full bg-rojo-fondo px-2.5 py-0.5 text-nota font-bold text-rojo-texto">Devuelto</span>
  return <span className="rounded-full bg-ambar-fondo px-2.5 py-0.5 text-nota font-bold text-ambar-texto">Preparando</span>
}
