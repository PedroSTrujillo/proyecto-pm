'use client'

// Entrar, crear cuenta, olvidé mi contraseña y poner una nueva.

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api, textoErrores } from '@/lib/api'
import type { Usuario } from '@/lib/tipos'
import { cn } from '@/lib/utils'
import { Marca } from './marco'
import { Aviso, Boton, Campo, ErrorLista, claseEntrada } from './ui'

const LEMA = 'Suba lo que exporta de su programa contable y vea, en semanas de inventario, qué productos se agotan primero y cuáles sobran.'

function Caja({ titulo, sub = LEMA, children, pie }: { titulo: string; sub?: string; children: ReactNode; pie?: ReactNode }) {
  return (
    <div className="tema-app flex min-h-dvh flex-col bg-background">
      <header className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-8"><Marca /></header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-4 pb-16">
        <div className="flex flex-col gap-2">
          <h1 className="text-[1.9rem] leading-tight font-extrabold">{titulo}</h1>
          <p className="text-muted-foreground">{sub}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">{children}</div>
        {pie}
      </main>
    </div>
  )
}

function destino(params: URLSearchParams) {
  const v = params.get('volver')
  return v && v.startsWith('/') && !v.startsWith('//') ? v : '/panel'
}

function useEnvio() {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)
  async function enviar(fn: () => Promise<void>) {
    setEnviando(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(textoErrores(e))
      setEnviando(false)
    }
  }
  return { enviando, error, enviar, setError }
}

export function Entrar() {
  const router = useRouter()
  const params = useSearchParams()!
  const { enviando, error, enviar } = useEnvio()
  function alEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const d = Object.fromEntries(new FormData(e.currentTarget))
    enviar(async () => {
      await api<{ usuario: Usuario }>('POST', '/cuenta/entrar', d)
      router.replace(destino(params))
    })
  }
  return (
    <Caja
      titulo="Entre a su cuenta"
      pie={
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <p><strong>¿Es su primera vez?</strong> Necesita una cuenta. Es gratis y toma un minuto.</p>
          <div className="flex flex-wrap gap-2.5">
            <Link href={`/crear-cuenta${params.get('volver') ? `?volver=${encodeURIComponent(params.get('volver')!)}` : ''}`} className="presionable inline-flex min-h-10 items-center rounded-xl border border-input bg-card px-4 font-semibold hover:bg-muted">Crear una cuenta</Link>
            <Link href="/demo" className="inline-flex min-h-10 items-center px-2 font-semibold text-primary hover:text-primary-hover">Ver un ejemplo</Link>
          </div>
        </div>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={alEnviar} noValidate>
        <Campo etiqueta="Correo"><input className={claseEntrada} type="email" name="email" required autoComplete="email" autoFocus /></Campo>
        <Campo etiqueta="Contraseña"><input className={claseEntrada} type="password" name="clave" required autoComplete="current-password" /></Campo>
        {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
        <Boton type="submit" variante="primario" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</Boton>
        <Link href="/olvide" className="text-center text-cuerpo font-semibold text-primary hover:text-primary-hover">¿Olvidó su contraseña?</Link>
      </form>
    </Caja>
  )
}

// Toda cuenta entra a una empresa: la crea aquí mismo o llega con el enlace que le mandaron
// (?invitacion=…). Quien la funda es el gerente; quien llega por invitación toma el rol de esa invitación.
export function CrearCuenta() {
  const router = useRouter()
  const params = useSearchParams()!
  const invitacion = params.get('invitacion')
  const { enviando, error, enviar } = useEnvio()
  const [invitada, setInvitada] = useState<{ empresa: string; email: string | null } | null>(null)
  const [errorInvitacion, setErrorInvitacion] = useState<string | null>(null)

  useEffect(() => {
    if (!invitacion) return
    api<{ empresa: string; email: string | null }>('GET', `/empresa/invitaciones/${encodeURIComponent(invitacion)}`)
      .then(setInvitada)
      .catch((e) => setErrorInvitacion(textoErrores(e).mensaje))
  }, [invitacion])

  function alEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    enviar(async () => {
      const r = await api<{ usuario: Usuario }>('POST', '/cuenta/crear', { ...d, boletin: d.boletin === 'on', ...(invitacion ? { invitacion } : {}) })
      // El rol viene de la invitación: quien entra como operador empieza por lo que registra.
      router.replace(r.usuario.perfil === 'operador' ? '/movimientos' : destino(params))
    })
  }
  const sub = invitacion
    ? invitada ? `Lo invitaron a ${invitada.empresa}. Cree su cuenta para ver y llevar el inventario de la empresa.` : 'Revisando su invitación…'
    : 'Cree la cuenta de su empresa. Después invita a su equipo desde "Mi empresa".'
  return (
    <Caja titulo={invitacion ? 'Únase a su empresa' : 'Cree su cuenta'} sub={sub} pie={<p className="text-center">¿Ya tiene cuenta? <Link href="/entrar" className="font-semibold text-primary hover:text-primary-hover">Entrar</Link>.</p>}>
      {errorInvitacion ? (
        <div className="flex flex-col gap-4">
          <Aviso tono="error">{errorInvitacion}</Aviso>
          <Link href="/crear-cuenta" className="font-semibold text-primary hover:text-primary-hover">Crear una empresa nueva</Link>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={alEnviar} noValidate>
          {!invitacion && (
            <>
              <Campo etiqueta="Nombre de su empresa"><input className={claseEntrada} type="text" name="empresa" required autoComplete="organization" autoFocus /></Campo>
              <Campo etiqueta="NIT" nota="(opcional)"><input className={claseEntrada} type="text" name="nit" inputMode="numeric" /></Campo>
            </>
          )}
          <Campo etiqueta="Su nombre"><input className={claseEntrada} type="text" name="nombre" required autoComplete="name" autoFocus={Boolean(invitacion)} /></Campo>
          <Campo etiqueta="Su cargo" nota="(opcional, va en el PDF de sus pedidos)"><input className={claseEntrada} type="text" name="cargo" maxLength={80} placeholder="Por ejemplo, jefe de compras" autoComplete="organization-title" /></Campo>
          <Campo etiqueta="Correo"><input className={claseEntrada} type="email" name="email" required autoComplete="email" defaultValue={invitada?.email || ''} key={invitada?.email || ''} /></Campo>
          <Campo etiqueta="Contraseña" nota="(mínimo 8 caracteres)"><input className={claseEntrada} type="password" name="clave" required minLength={8} autoComplete="new-password" /></Campo>
          <label className="flex items-start gap-2.5 text-cuerpo">
            <input type="checkbox" name="boletin" defaultChecked className="mt-1 size-4 accent-[var(--primary)]" />
            <span>Recibir cada mañana un correo con el estado del inventario. <span className="text-muted-foreground">Se da de baja con un clic.</span></span>
          </label>
          {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
          <Boton type="submit" variante="primario" disabled={enviando || Boolean(invitacion && !invitada)}>{enviando ? 'Creando…' : 'Crear cuenta'}</Boton>
        </form>
      )}
    </Caja>
  )
}

export function Olvide() {
  const { enviando, error, enviar } = useEnvio()
  const [respuesta, setRespuesta] = useState<boolean | null>(null)
  function alEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const d = Object.fromEntries(new FormData(e.currentTarget))
    enviar(async () => {
      const r = await api<{ correo: boolean }>('POST', '/cuenta/olvide', d)
      setRespuesta(r.correo)
    })
  }
  return (
    <Caja titulo="¿Olvidó su contraseña?" sub="Escriba el correo con el que creó su cuenta." pie={<p className="text-center"><Link href="/entrar" className="font-semibold text-primary hover:text-primary-hover">Volver a entrar</Link></p>}>
      {respuesta === null ? (
        <form className="flex flex-col gap-4" onSubmit={alEnviar} noValidate>
          <Campo etiqueta="Su correo"><input className={claseEntrada} type="email" name="email" required autoComplete="email" autoFocus /></Campo>
          {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
          <Boton type="submit" variante="primario" disabled={enviando}>{enviando ? 'Enviando…' : 'Pedir un enlace para cambiarla'}</Boton>
        </form>
      ) : respuesta ? (
        <Aviso tono="ok">Si hay una cuenta con ese correo, le enviamos un enlace para cambiar la contraseña. Revise también la carpeta de correo no deseado.</Aviso>
      ) : (
        <Aviso tono="info">Por ahora no podemos enviarle el enlace por correo. Escríbanos y le enviamos uno para poner una contraseña nueva.</Aviso>
      )}
    </Caja>
  )
}

export function Restablecer({ token }: { token: string }) {
  const router = useRouter()
  const { enviando, error, enviar, setError } = useEnvio()
  function alEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const { clave, repetida } = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    if (clave !== repetida) return setError({ mensaje: 'Las dos contraseñas no son iguales.', lista: [] })
    enviar(async () => {
      await api('POST', '/cuenta/restablecer', { token, clave })
      router.replace('/panel')
    })
  }
  return (
    <Caja titulo="Ponga una contraseña nueva" sub="Con ella vuelve a entrar desde cualquier computador.">
      <form className="flex flex-col gap-4" onSubmit={alEnviar} noValidate>
        <Campo etiqueta="Contraseña nueva" nota="(mínimo 8 caracteres)"><input className={claseEntrada} type="password" name="clave" required autoComplete="new-password" autoFocus /></Campo>
        <Campo etiqueta="Escríbala otra vez"><input className={claseEntrada} type="password" name="repetida" required autoComplete="new-password" /></Campo>
        {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
        <Boton type="submit" variante="primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar y entrar'}</Boton>
      </form>
    </Caja>
  )
}
