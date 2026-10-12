import type { Metadata } from 'next'
import Link from 'next/link'
import { Armchair, Hammer, PencilRuler, Snowflake, Sofa } from 'lucide-react'
import { Marca } from '@/components/app/marco'

export const metadata: Metadata = {
  title: 'SINESC en Expoandes',
  description: 'Escanea y mira con un negocio de ejemplo qué se agota, qué sobra y cuánto pedir.',
}

// Para la pantalla del stand: se deja abierta en un computador o un televisor.
// El código QR (public/qr-demo.svg) lleva a https://rotacion-inventario.onrender.com/demo.
// Si cambia la dirección, se vuelve a generar: README, "Expoandes".
const NEGOCIOS = [
  { id: 'ferreteria', icono: Hammer, texto: 'Ferretería' },
  { id: 'muebles', icono: Sofa, texto: 'Muebles' },
  { id: 'oficina', icono: Armchair, texto: 'Mobiliario de oficina' },
  { id: 'refrigeracion', icono: Snowflake, texto: 'Refrigeración' },
  { id: 'papeleria', icono: PencilRuler, texto: 'Papelería' },
]

export default function Page() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="mx-auto w-full max-w-6xl px-6 py-6"><Marca /></header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 pb-16 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-6">
          <h1 className="text-balance text-[2.6rem] leading-[1.05] font-extrabold sm:text-[3.6rem]">
            ¿Qué se te agota primero? <span className="text-primary">¿Qué te sobra?</span>
          </h1>
          <p className="max-w-xl text-xl text-muted-foreground">
            Subes lo que exportas de tu programa contable y ves, producto por producto, para cuántas semanas te alcanza, qué pedir ya y cuánto.
          </p>
          <div className="flex flex-col gap-3">
            <span className="text-sm font-bold tracking-[0.08em] text-muted-foreground uppercase">Míralo con un negocio parecido al tuyo</span>
            <div className="flex flex-wrap gap-2.5">
              {NEGOCIOS.map((n) => (
                <Link key={n.id} href={`/demo/${n.id}`} className="presionable inline-flex min-h-12 items-center gap-2 rounded-xl border border-input bg-card px-4 text-[1.05rem] font-semibold hover:bg-muted">
                  <n.icono className="size-5 text-primary" /> {n.texto}
                </Link>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card p-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/qr-demo.svg" alt="Código QR para abrir la demo de SINESC en el celular" className="w-full max-w-72" />
          <strong className="font-display text-2xl">Escanéalo con tu celular</strong>
          <span className="text-muted-foreground">Sin cuenta y sin subir nada: datos de ejemplo.</span>
        </div>
      </main>
    </div>
  )
}
