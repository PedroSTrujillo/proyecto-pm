'use client'

// El marco de la aplicación: menú lateral (en celular, una barra arriba con menú desplegable),
// el aviso de datos de ejemplo en la demo y el contenido.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { BarChart3, ClipboardList, Database, LayoutDashboard, LogOut, Menu, Package, UserRound, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInventario, useSesion } from './contexto'
import { reportarError } from './pantalla-error'
import { clasesBoton } from './ui'

function Monograma({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-9', className)} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <path d="M22 9.5h-8.5a3.25 3.25 0 0 0 0 6.5h5a3.25 3.25 0 0 1 0 6.5H10" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Marca({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-lg px-1 text-foreground" aria-label="SINESC, página principal">
      <Monograma />
      <span className="font-display text-xl font-extrabold tracking-tight">SINESC</span>
    </Link>
  )
}

type Item = { href: string; texto: string; icono: ReactNode; exacto?: boolean }

function Navegacion({ items, alElegir }: { items: Item[]; alElegir?: () => void }) {
  const ruta = usePathname()
  return (
    <nav aria-label="Secciones" className="flex flex-col gap-1">
      {items.map((it) => {
        const activo = it.exacto ? ruta === it.href : ruta === it.href || ruta.startsWith(`${it.href}/`)
        return (
          <Link
            key={it.href}
            href={it.href}
            onClick={alElegir}
            aria-current={activo ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.95rem] font-semibold transition-colors duration-150',
              activo ? 'bg-primary text-primary-foreground' : 'text-foreground/80 hover:bg-muted hover:text-foreground',
            )}
          >
            <span className="[&_svg]:size-5">{it.icono}</span>
            {it.texto}
          </Link>
        )
      })}
    </nav>
  )
}

function itemsDe(demo: boolean, rutas: ReturnType<typeof useInventario>['rutas'], equipo: boolean): Item[] {
  const base: Item[] = [
    { href: rutas.panel, texto: 'Panel', icono: <LayoutDashboard />, exacto: true },
    { href: rutas.productos, texto: 'Productos', icono: <Package /> },
    { href: rutas.pedido, texto: demo ? 'Preparar pedido' : 'Pedidos', icono: <ClipboardList /> },
    { href: rutas.datos, texto: 'Datos', icono: <Database /> },
  ]
  if (!demo && equipo) base.push({ href: '/equipo', texto: 'Resultados de la prueba', icono: <BarChart3 /> })
  if (!demo) base.push({ href: '/cuenta', texto: 'Mi cuenta', icono: <UserRound /> })
  return base
}

function Iniciales({ nombre }: { nombre: string }) {
  const ini = nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
  return <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-secondary-foreground">{ini || '·'}</span>
}

export function Marco({ children }: { children: ReactNode }) {
  const { fuente, rutas, inventario } = useInventario()
  const { usuario, salir } = useSesion()
  const demo = fuente.tipo === 'demo'
  const items = itemsDe(demo, rutas, usuario?.rol === 'equipo')
  const [abierto, setAbierto] = useState(false)
  const ruta = usePathname()

  useEffect(() => setAbierto(false), [ruta])

  // Errores que no rompen la pantalla (por ejemplo, en un botón) también se le avisan al equipo.
  useEffect(() => {
    const alError = (e: ErrorEvent) => reportarError(e.error || e.message)
    const alRechazo = (e: PromiseRejectionEvent) => reportarError(e.reason)
    window.addEventListener('error', alError)
    window.addEventListener('unhandledrejection', alRechazo)
    return () => {
      window.removeEventListener('error', alError)
      window.removeEventListener('unhandledrejection', alRechazo)
    }
  }, [])

  const persona = demo ? inventario?.fuente.persona || 'Datos de ejemplo' : usuario?.nombre || ''
  const empresa = demo ? inventario?.fuente.empresa || '' : usuario?.email || ''

  const pie = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 rounded-2xl border border-border p-3">
        <Iniciales nombre={persona} />
        <span className="flex min-w-0 flex-col">
          <strong className="truncate text-sm">{persona}</strong>
          <span className="truncate text-[0.82rem] text-muted-foreground">{empresa}</span>
        </span>
      </div>
      {demo ? (
        <Link href="/demo" className="rounded-lg px-2 py-1.5 text-sm font-semibold text-primary hover:bg-muted">Ver otro negocio de ejemplo</Link>
      ) : (
        <button type="button" onClick={salir} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
          <LogOut className="size-4" /> Salir
        </button>
      )}
    </div>
  )

  return (
    <div className="tema-app min-h-dvh bg-background lg:flex">
      {/* Menú lateral (escritorio) */}
      <aside className="no-imprimir hidden w-64 shrink-0 flex-col gap-7 border-r border-border bg-card px-4 py-6 lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <Marca href={demo ? '/' : rutas.panel} />
        <Navegacion items={items} />
        <div className="mt-auto">{pie}</div>
      </aside>

      {/* Barra superior (celular y tableta) */}
      <div className="no-imprimir sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <Marca href={demo ? '/' : rutas.panel} />
        <button type="button" className={clasesBoton('fantasma', 'chico')} aria-expanded={abierto} aria-controls="menu-movil" onClick={() => setAbierto((v) => !v)}>
          {abierto ? <X className="size-5" /> : <Menu className="size-5" />}
          <span className="sr-only">{abierto ? 'Cerrar el menú' : 'Abrir el menú'}</span>
        </button>
      </div>
      {abierto && (
        <div className="fixed inset-0 z-20 lg:hidden">
          <button type="button" aria-label="Cerrar el menú" className="velo absolute inset-0 bg-foreground/30" onClick={() => setAbierto(false)} />
          <div id="menu-movil" className="aparecer absolute inset-x-0 top-[61px] flex flex-col gap-5 border-b border-border bg-card px-4 pt-3 pb-5 shadow-lg">
            <Navegacion items={items} alElegir={() => setAbierto(false)} />
            {pie}
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        {demo && <AvisoDemo />}
        <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-7 px-4 py-7 sm:px-8 lg:py-9">{children}</main>
      </div>
    </div>
  )
}

function AvisoDemo() {
  const { inventario } = useInventario()
  return (
    <div className="no-imprimir border-b border-[#cfe5e1] bg-secondary">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2.5 text-[0.92rem] sm:px-8">
        <p className="text-[#0b3f3b]">
          <strong>Datos de ejemplo.</strong> <span className="hidden sm:inline">{inventario ? `${inventario.fuente.empresa} es un negocio inventado (${(inventario.fuente.sector || "").toLowerCase()}), armado con lo que nos contaron en las entrevistas.` : 'Un negocio inventado, armado con lo que nos contaron en las entrevistas.'}</span><span className="sm:hidden">Un negocio inventado.</span>
        </p>
        <div className="flex gap-2">
          <Link href="/demo" className={clasesBoton('secundario', 'chico')}>Otro negocio</Link>
          <Link href="/crear-cuenta" className={clasesBoton('primario', 'chico')}>Probar con mis datos</Link>
        </div>
      </div>
    </div>
  )
}
