'use client'

// Invitar a alguien a la empresa: el formulario de Mi empresa y la tarjeta del panel, que lo pone a
// la vista de quien administra mientras esté sola en su empresa (el growth loop de la Entrega 4: en
// las pruebas, nadie encontraba cómo agregar a otra persona).

import { useEffect, useState, type FormEvent } from 'react'
import { Check, Copy, UserPlus, X } from 'lucide-react'
import { api, textoErrores } from '@/lib/api'
import type { Empresa } from '@/lib/tipos'
import { useSesion } from './contexto'
import { Boton, Campo, ErrorLista, Tarjeta, claseEntrada } from './ui'

type Invitacion = { enlace: string; dias: number; enviado: boolean; email: string }

export function FormInvitar({ deshabilitado = false, alInvitar }: { deshabilitado?: boolean; alInvitar?: (empresa: Empresa) => void }) {
  const [invitacion, setInvitacion] = useState<Invitacion | null>(null)
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function invitar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const email = String(new FormData(e.currentTarget).get('email') || '').trim()
    setError(null)
    setCopiado(false)
    setEnviando(true)
    try {
      const r = await api<{ enlace: string; dias: number; enviado: boolean; empresa: Empresa }>('POST', '/empresa/invitaciones', { email })
      setInvitacion({ enlace: r.enlace, dias: r.dias, enviado: r.enviado, email })
      alInvitar?.(r.empresa)
    } catch (err) {
      setError(textoErrores(err))
    } finally {
      setEnviando(false)
    }
  }

  async function copiar(enlace: string) {
    try {
      await navigator.clipboard.writeText(enlace)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form className="flex flex-col gap-3" onSubmit={invitar} noValidate>
        <Campo etiqueta="Correo de la persona invitada" nota="(opcional: sin correo, el enlace sirve para cualquiera)">
          <input className={claseEntrada} type="email" name="email" autoComplete="off" placeholder="nombre@empresa.co" />
        </Campo>
        {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
        <Boton type="submit" variante="primario" className="self-start" disabled={deshabilitado || enviando}>
          <UserPlus /> {enviando ? 'Creando…' : 'Crear enlace de invitación'}
        </Boton>
      </form>
      {invitacion && (
        <div className="aparecer flex flex-col gap-2 rounded-xl border border-border bg-muted p-3" role="status">
          <p className="text-chico">
            {invitacion.enviado ? `Le enviamos el enlace a ${invitacion.email}. También lo puede copiar:` : 'Copie el enlace y envíelo por correo o WhatsApp.'} Sirve una sola vez durante {invitacion.dias} días.
          </p>
          <div className="flex gap-2">
            <input className={claseEntrada} readOnly value={invitacion.enlace} onFocus={(e) => e.currentTarget.select()} aria-label="Enlace de invitación" />
            <Boton tamano="chico" onClick={() => copiar(invitacion.enlace)}>
              {copiado ? <Check /> : <Copy />} {copiado ? 'Copiado' : 'Copiar'}
            </Boton>
          </div>
        </div>
      )}
    </div>
  )
}

const CLAVE_OCULTA = 'sinesc:invitar-oculto'

// En el panel: solo a quien administra, con la empresa ya con nombre y nadie más en ella. "Ahora
// no" la esconde en este navegador.
export function TarjetaInvitar() {
  const { usuario } = useSesion()
  const [mostrar, setMostrar] = useState(false)
  const [invito, setInvito] = useState(false)
  const puede = Boolean(usuario?.empresa?.admin && !usuario.empresa.vacia)

  useEffect(() => {
    if (!puede) return
    let oculto = false
    try {
      oculto = localStorage.getItem(`${CLAVE_OCULTA}:${usuario?.id}`) === '1'
    } catch {
      // sin almacenamiento: se muestra
    }
    if (oculto) return
    api<{ empresa: Empresa }>('GET', '/empresa')
      .then((r) => setMostrar(r.empresa.miembros.length === 1 && r.empresa.invitacionesAbiertas.length === 0))
      .catch(() => {})
  }, [puede, usuario?.id])

  if (!mostrar) return null

  function ocultar() {
    try {
      localStorage.setItem(`${CLAVE_OCULTA}:${usuario?.id}`, '1')
    } catch {
      // sin almacenamiento: se oculta solo por ahora
    }
    setMostrar(false)
  }

  return (
    <Tarjeta aria-labelledby="t-invitar" className="aparecer relative flex flex-col gap-4 border-primary/30 bg-secondary/40 p-5 sm:flex-row sm:gap-6 sm:p-6">
      <button type="button" onClick={ocultar} aria-label="Ahora no" className="absolute top-2 right-2 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
        <X className="size-5" />
      </button>
      <div className="flex flex-col gap-1.5 pr-8 sm:w-80 sm:shrink-0">
        <h2 id="t-invitar" className="text-xl font-bold">Invite a su equipo</h2>
        <p className="text-muted-foreground">
          Quien registra lo que entra y sale, quien prepara los pedidos y quien los aprueba trabajan sobre el mismo inventario. Cada persona entra con su propia cuenta.
        </p>
      </div>
      <div className="flex-1">
        <FormInvitar alInvitar={() => setInvito(true)} />
        {invito && <p className="mt-2 text-nota text-muted-foreground">Cuando entre, la verá en Mi empresa. Ahí también decide quién aprueba los pedidos.</p>}
      </div>
    </Tarjeta>
  )
}
