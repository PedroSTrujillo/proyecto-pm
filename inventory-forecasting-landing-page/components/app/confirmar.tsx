'use client'

// Ventana para confirmar algo que no se puede deshacer (por ejemplo, fijar la lista inicial).

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Boton } from './ui'

type Pregunta = { titulo: string; cuerpo: ReactNode; si: string; peligro: boolean; resolver: (v: boolean) => void }

export function useConfirmar() {
  const [p, setP] = useState<Pregunta | null>(null)
  const boton = useRef<HTMLButtonElement>(null)

  const preguntar = useCallback(
    // peligro: el botón de confirmar va en rojo (por ejemplo, para borrar).
    (titulo: string, cuerpo: ReactNode, si = 'Sí, guardar', peligro = false) => new Promise<boolean>((resolver) => setP({ titulo, cuerpo, si, peligro, resolver })),
    [],
  )

  useEffect(() => {
    if (!p) return
    boton.current?.focus()
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { p.resolver(false); setP(null) }
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [p])

  const cerrar = (v: boolean) => {
    p?.resolver(v)
    setP(null)
  }

  const ventana = p ? (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="confirmar-titulo">
      <button type="button" aria-label="Cancelar" className="velo absolute inset-0 bg-foreground/40" onClick={() => cerrar(false)} />
      <div className="aparecer relative flex w-full max-w-lg flex-col gap-4 rounded-2xl bg-card p-6 shadow-2xl">
        <h2 id="confirmar-titulo" className="text-xl font-bold">{p.titulo}</h2>
        <div className="text-[0.97rem] text-foreground/85">{p.cuerpo}</div>
        <div className="flex flex-wrap justify-end gap-2.5">
          <Boton onClick={() => cerrar(false)}>{p.peligro ? 'No, dejarlo' : 'Revisar otra vez'}</Boton>
          <Boton ref={boton} variante={p.peligro ? 'peligro' : 'primario'} onClick={() => cerrar(true)}>{p.si}</Boton>
        </div>
      </div>
    </div>
  ) : null

  return { ventana, preguntar }
}
