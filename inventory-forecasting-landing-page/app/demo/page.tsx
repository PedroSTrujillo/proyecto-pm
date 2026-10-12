import type { Metadata } from 'next'
import Link from 'next/link'
import { Armchair, ArrowRight, Hammer, PencilRuler, Snowflake, Sofa } from 'lucide-react'
import { Marca } from '@/components/app/marco'

export const metadata: Metadata = {
  title: 'Demo · SINESC',
  description: 'Mira SINESC con un negocio de ejemplo: ferretería, muebles, mobiliario de oficina, refrigeración o papelería.',
}

// Los mismos de server/demo.js. Aquí solo va lo que se muestra en la tarjeta.
const NEGOCIOS = [
  { id: 'ferreteria', icono: Hammer, sector: 'Ferretería', empresa: 'Ferrecentro La Escuadra', ciudad: 'Bogotá', programa: 'World Office', texto: 'Miles de referencias, cemento que se va por bultos y herramienta importada que tarda 10 semanas.' },
  { id: 'muebles', icono: Sofa, sector: 'Muebles para el hogar', empresa: 'Casa Nogal Muebles', ciudad: 'Medellín', programa: 'Helisa', texto: 'Contenedores que tardan 14 semanas: qué volver a traer y qué no, con diciembre encima.' },
  { id: 'oficina', icono: Armchair, sector: 'Mobiliario de oficina', empresa: 'Espacio Ofis', ciudad: 'Bogotá', programa: 'Siigo Nube', texto: 'Venta de mostrador más proyectos grandes que llegan de golpe y no deben inflar el pedido.' },
  { id: 'refrigeracion', icono: Snowflake, sector: 'Refrigeración', empresa: 'Frío Andino', ciudad: 'Cali', programa: 'Siigo Nube', texto: 'Gases y compresores importados, temporada de calor y un gas en desmonte que ya no rota.' },
  { id: 'papeleria', icono: PencilRuler, sector: 'Papelería', empresa: 'Papelería Punto Escolar', ciudad: 'Bucaramanga', programa: 'Alegra', texto: 'Enero y febrero venden el doble: el pronóstico ya trae la temporada escolar.' },
]

export default function Page() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
        <Marca />
        <Link href="/crear-cuenta" className="presionable inline-flex min-h-10 items-center rounded-xl border border-primary bg-primary px-4 text-[0.95rem] font-semibold text-primary-foreground hover:bg-primary-hover">
          Probar con mis datos
        </Link>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pt-6 pb-16 sm:px-8">
        <div className="flex max-w-3xl flex-col gap-3">
          <span className="self-start rounded-full bg-secondary px-3 py-1 text-[0.85rem] font-semibold text-secondary-foreground">Demo sin cuenta</span>
          <h1 className="text-[2.2rem] leading-tight font-extrabold sm:text-[2.7rem]">Mira SINESC con un negocio parecido al tuyo</h1>
          <p className="text-lg text-muted-foreground">
            Cinco negocios inventados, armados con lo que nos contaron gerentes y contadores en las entrevistas. Cada uno pasa por el mismo cálculo que tu archivo: qué se agota, qué hay que pedir ya, qué sobra y el pedido sugerido.
          </p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {NEGOCIOS.map((n) => (
            <li key={n.id}>
              <Link href={`/demo/${n.id}`} className="group presionable flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-[0_6px_24px_-12px_rgba(15,118,110,0.35)]">
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><n.icono className="size-5" /></span>
                <span className="text-[0.8rem] font-bold tracking-[0.06em] text-muted-foreground uppercase">{n.sector}</span>
                <strong className="font-display text-xl leading-snug">{n.empresa}</strong>
                <span className="text-[0.95rem] text-foreground/80">{n.texto}</span>
                <span className="mt-auto flex items-center justify-between pt-2 text-[0.9rem] text-muted-foreground">
                  {n.ciudad} · {n.programa}
                  <ArrowRight className="size-4 text-primary transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
