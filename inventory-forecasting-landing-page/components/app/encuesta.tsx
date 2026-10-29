'use client'

// Una pregunta de satisfacción, una sola vez (server/encuesta.js): cuándo aparece lo decide el
// servidor. No menciona ninguna prueba (D15 de docs/PLAN_ALPHA_02.md).

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { api, textoErrores } from '@/lib/api'
import { Aviso, Boton, ErrorLista, Tarjeta, claseEntrada } from './ui'

const PUNTAJES: [number, string][] = [
  [1, 'Nada útil'],
  [2, 'Poco útil'],
  [3, 'Más o menos'],
  [4, 'Útil'],
  [5, 'Muy útil'],
]

export function Encuesta() {
  const [mostrar, setMostrar] = useState(false)
  const [puntaje, setPuntaje] = useState<number | null>(null)
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [gracias, setGracias] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    api<{ mostrar: boolean }>('GET', '/encuesta').then((r) => vivo && setMostrar(r.mostrar)).catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  async function responder(valor: number | null) {
    setEnviando(true)
    setError(null)
    try {
      await api('POST', '/encuesta', { puntaje: valor, comentario })
      if (valor === null) setMostrar(false)
      else setGracias(true)
    } catch (e) {
      setError(textoErrores(e).mensaje)
    } finally {
      setEnviando(false)
    }
  }

  if (gracias) return <Aviso tono="ok" titulo="Gracias por responder">Lo vamos a tener en cuenta para mejorar SINESC.</Aviso>
  if (!mostrar) return null
  return (
    <Tarjeta aria-labelledby="t-encuesta" className="aparecer flex flex-col gap-4 border-[#cfe5e1] bg-secondary p-5 sm:p-6">
      <h2 id="t-encuesta" className="text-lg font-bold text-secondary-foreground">¿Qué tan útil le ha resultado SINESC para preparar sus pedidos?</h2>
      <div role="radiogroup" aria-label="De 1 a 5" className="flex flex-wrap gap-2">
        {PUNTAJES.map(([n, texto]) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={puntaje === n}
            onClick={() => setPuntaje(n)}
            className={cn('presionable flex min-h-14 min-w-24 flex-col items-center justify-center rounded-xl border px-3 py-1.5', puntaje === n ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-muted')}
          >
            <strong className="font-display text-xl tabular-nums">{n}</strong>
            <span className="text-nota">{texto}</span>
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1.5 font-semibold">
        <span>¿Qué mejoraría? <span className="font-normal text-muted-foreground">(opcional)</span></span>
        <textarea className={cn(claseEntrada, 'min-h-20 py-3 font-normal')} maxLength={2000} value={comentario} onChange={(e) => setComentario(e.target.value)} />
      </label>
      {error && <ErrorLista mensaje={error} />}
      <div className="flex flex-wrap items-center gap-2.5">
        <Boton variante="primario" onClick={() => responder(puntaje)} disabled={enviando || puntaje === null}>{enviando ? 'Enviando…' : 'Enviar'}</Boton>
        <Boton variante="fantasma" onClick={() => responder(null)} disabled={enviando}>Ahora no</Boton>
      </div>
    </Tarjeta>
  )
}
