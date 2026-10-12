'use client'

// Si una pantalla falla: un mensaje en español, un botón para reintentar y un aviso al equipo
// (server/errores.js) para que sepa que alguien se tropezó.

import { useEffect } from 'react'
import { Boton } from './ui'

export function reportarError(error: unknown, extra = '') {
  const e = error instanceof Error ? error : new Error(String(error))
  try {
    fetch('/api/errores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensaje: e.message, ruta: window.location.pathname, detalle: `${extra}\n${e.stack || ''}`.slice(0, 4000) }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // sin conexión: no hay a quién avisar
  }
}

export function PantallaError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportarError(error, error.digest ? `digest ${error.digest}` : ''), [error])
  return (
    <div className="tema-app min-h-dvh px-4 py-16">
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <h1 className="text-2xl font-extrabold">Algo falló en esta pantalla</h1>
        <p className="text-muted-foreground">Ya le avisamos al equipo. Intenta de nuevo; si sigue pasando, vuelve al panel o escríbenos.</p>
        <div className="flex flex-wrap gap-2.5">
          <Boton variante="primario" onClick={reset}>Intentar de nuevo</Boton>
          <a href="/" className="presionable inline-flex min-h-11 items-center rounded-xl border border-input bg-card px-4 font-semibold hover:bg-muted">Ir a la página principal</a>
        </div>
      </div>
    </div>
  )
}
