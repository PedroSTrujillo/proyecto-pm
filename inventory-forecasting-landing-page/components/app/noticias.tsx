'use client'

// Noticias del gerente (T21 de docs/PLAN_CORRECCIONES_SINESC.md): la TRM de hoy y los titulares que
// afectan lo que importa y vende. El servidor trae todo (server/noticias.js); aquí solo se dibuja,
// como texto y enlaces: nada de lo que llega de las noticias se interpreta como HTML.

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api, textoErrores } from '@/lib/api'
import { dia, fechaCorta } from '@/lib/formato'
import { Aviso, Cargando, ErrorLista, Tarjeta, Titulo } from './ui'

type Titular = { titulo: string; enlace: string; fuente: string; fecha: string | null }
type Datos = {
  trm: { fecha: string | null; usd: number; eur: number | null; cny: number | null } | null
  temas: { id: string; titulo: string; titulares: Titular[] | null }[]
  sector: { id: string; etiqueta: string; enlaces: { texto: string; url: string }[] } | null
}

// La tasa de cambio lleva centavos: plata() redondea a pesos.
const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Cifra({ titulo, valor }: { titulo: string; valor: number | null }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4">
      <span className="text-sm font-semibold text-muted-foreground">{titulo}</span>
      <strong className="font-display text-3xl font-extrabold tabular-nums">{valor === null ? 'No disponible' : pesos.format(valor)}</strong>
    </div>
  )
}

export function Noticias() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)

  useEffect(() => {
    api<Datos>('GET', '/noticias').then(setDatos).catch((e) => setError(textoErrores(e)))
  }, [])

  if (error) return <ErrorLista mensaje={error.mensaje} lista={error.lista} />
  if (!datos) return <Cargando />

  return (
    <>
      <Titulo sub="La TRM de hoy y lo que dicen las noticias sobre aranceles, importaciones y la regulación de su sector.">Noticias</Titulo>
      <section aria-labelledby="t-trm" className="flex flex-col gap-3">
        <h2 id="t-trm" className="text-xl font-bold">Tasa de cambio en pesos{datos.trm?.fecha ? ` · ${dia(datos.trm.fecha)}` : ''}</h2>
        {datos.trm ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Cifra titulo="Dólar (TRM oficial)" valor={datos.trm.usd} />
              <Cifra titulo="Euro" valor={datos.trm.eur} />
              <Cifra titulo="Yuan" valor={datos.trm.cny} />
            </div>
            <p className="text-nota text-muted-foreground">Euro y yuan: calculados con la TRM y el cambio internacional del día.</p>
          </>
        ) : (
          <Aviso tono="cuidado">No se pudo cargar la TRM ahora. Vuelva a intentarlo en unos minutos.</Aviso>
        )}
      </section>

      {!datos.sector && (
        <Aviso tono="info" titulo="Elija el sector de su empresa">
          Así también verá noticias de regulación de lo que importa y vende. Se elige en <Link href="/empresa" className="font-semibold text-primary hover:text-primary-hover">Mi empresa</Link>.
        </Aviso>
      )}

      {datos.temas.map((t) => (
        <Tarjeta key={t.id} className="flex min-w-0 flex-col gap-3 p-5 sm:p-6">
          <h2 className="text-xl font-bold">{t.titulo}</h2>
          {t.titulares === null ? (
            <p className="text-muted-foreground">No se pudo cargar ahora.</p>
          ) : t.titulares.length === 0 ? (
            <p className="text-muted-foreground">Sin noticias recientes.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {t.titulares.map((n) => (
                <li key={n.enlace} className="py-2.5">
                  <a href={n.enlace} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:text-primary-hover">{n.titulo}</a>
                  <span className="block text-nota text-muted-foreground">{[n.fuente, n.fecha ? fechaCorta(n.fecha) : ''].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      ))}

      {datos.sector && (
        <Tarjeta className="flex min-w-0 flex-col gap-3 p-5 sm:p-6">
          <h2 className="text-xl font-bold">Dónde mirar la regulación de {datos.sector.etiqueta.toLowerCase()}</h2>
          <ul className="flex flex-col gap-1.5">
            {datos.sector.enlaces.map((e) => (
              <li key={e.url}><a href={e.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:text-primary-hover">{e.texto}</a></li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </>
  )
}
