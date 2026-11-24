'use client'

// La cuenta ya existe pero falta el código de acceso (server/cuentas.js, /activar): esta es la única
// ventana que ve hasta escribirlo. El código se lo da un asesor cuando confirma el pago.

import { useState, type FormEvent } from 'react'
import { api, textoErrores } from '@/lib/api'
import type { Usuario } from '@/lib/tipos'
import { cn } from '@/lib/utils'
import { Marca } from './marco'
import { useSesion } from './contexto'
import { Aviso, Boton, Campo, claseEntrada } from './ui'
import { EliminarCuenta } from './cuenta'

const WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP_VENTAS

export function Activar() {
  const { usuario, fijar, salir } = useSesion()
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Quien fundó la empresa (gerente o administrador, Correcciones finales) paga con un asesor; quien llegó
  // por invitación pide su código a quien lo invitó. Mientras espera el código nadie más puede entrar a
  // su empresa, así que estar solo en ella es haberla fundado.
  const esFundador = Boolean(usuario && !usuario.conEquipo)
  const mensaje = `Hola, creé mi cuenta en SINESC con el correo ${usuario?.email}. Quiero pagar para recibir mi código de acceso.`

  async function activar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const codigo = String(new FormData(e.currentTarget).get('codigo') || '')
    setEnviando(true)
    setError(null)
    try {
      const r = await api<{ usuario: Usuario }>('POST', '/cuenta/activar', { codigo })
      fijar(r.usuario)
    } catch (err) {
      setError(textoErrores(err).mensaje)
      setEnviando(false)
    }
  }

  return (
    <div className="tema-app flex min-h-dvh flex-col bg-background">
      <header className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-8"><Marca /></header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-4 pb-16">
        <div className="flex flex-col gap-2">
          <h1 className="text-[1.9rem] leading-tight font-extrabold">Active su cuenta</h1>
          <p className="text-muted-foreground">Su cuenta está creada. Falta su código de acceso para empezar.</p>
        </div>
        <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6">
          {esFundador ? (
            <>
              <ol className="list-decimal space-y-1.5 pl-5 text-cuerpo">
                <li>Escriba a un asesor.</li>
                <li>Haga la transferencia del primer mes.</li>
                <li>Envíele el comprobante.</li>
                <li>Recibirá su código de acceso. Escríbalo abajo.</li>
              </ol>
              {WHATSAPP ? (
                <a
                  href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensaje)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 font-semibold text-primary-foreground"
                >
                  Escribir a un asesor por WhatsApp
                </a>
              ) : (
                <p className="text-cuerpo font-semibold">Escríbanos para recibir su código.</p>
              )}
            </>
          ) : (
            <p className="text-cuerpo">Solicite su código de acceso a quien lo invitó a la empresa. Cada persona tiene el suyo.</p>
          )}
          <form className="flex flex-col gap-4" onSubmit={activar} noValidate>
            <Campo etiqueta="Código de acceso">
              <input className={cn(claseEntrada, 'font-mono uppercase')} type="text" name="codigo" required autoComplete="off" placeholder="XXXX-XXXX" />
            </Campo>
            {error && <Aviso tono="error">{error}</Aviso>}
            <Boton type="submit" variante="primario" disabled={enviando}>{enviando ? 'Activando…' : 'Activar mi cuenta'}</Boton>
          </form>
          <Boton variante="secundario" onClick={salir}>Salir</Boton>
        </div>
        {/* La API ya dejaba borrar una cuenta que espera su código (/api/cuenta/borrar está bajo /cuenta), pero esta
            ventana no lo ofrecía: quien se equivocó de correo o ya no la quería se quedaba sin salida. */}
        {usuario && (
          <details className="group text-chico">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">¿Se equivocó de correo o ya no la necesita? Eliminar esta cuenta</summary>
            <div className="mt-3"><EliminarCuenta usuario={usuario} /></div>
          </details>
        )}
      </main>
    </div>
  )
}
