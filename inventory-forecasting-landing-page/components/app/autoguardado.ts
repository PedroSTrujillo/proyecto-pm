'use client'

// El borrador se guarda solo, un momento después del último cambio, y también al salir de la
// pantalla. Lo usan los 5 pasos (lista inicial y final) y el pedido desde lo sugerido.

import { useCallback, useEffect, useRef, useState } from 'react'

export function useAutoguardado(guardar: () => Promise<unknown>) {
  const [estado, setEstado] = useState('')
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendiente = useRef(false)
  const guardarRef = useRef(guardar)
  guardarRef.current = guardar

  const ahora = useCallback(async () => {
    if (reloj.current) clearTimeout(reloj.current)
    reloj.current = null
    if (!pendiente.current) return
    pendiente.current = false
    setEstado('Guardando borrador…')
    try {
      await guardarRef.current()
      setEstado('Borrador guardado. Puede seguir después.')
    } catch {
      setEstado('No se pudo guardar el borrador. Revise su conexión.')
    }
  }, [])

  const cambio = useCallback(() => {
    pendiente.current = true
    setEstado('Cambios sin guardar…')
    if (reloj.current) clearTimeout(reloj.current)
    reloj.current = setTimeout(ahora, 900)
  }, [ahora])

  // Al salir de la pantalla, se guarda lo pendiente.
  useEffect(() => () => { if (pendiente.current) guardarRef.current().catch(() => {}) }, [])

  return { estado, cambio, ahora, cancelar: () => { pendiente.current = false; if (reloj.current) clearTimeout(reloj.current) } }
}
