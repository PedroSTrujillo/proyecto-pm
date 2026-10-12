'use client'

// Entrar, crear cuenta, olvidé mi contraseña y poner una nueva.

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, type FormEvent, type ReactNode } from 'react'
import { api, textoErrores } from '@/lib/api'
import type { Usuario } from '@/lib/tipos'
import { Marca } from './marco'
import { Aviso, Boton, Campo, ErrorLista, claseEntrada } from './ui'

const LEMA = 'Sube lo que exportas de tu programa contable y mira, en semanas de inventario, qué productos se agotan primero y cuáles sobran.'

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
      titulo="Entra a tu cuenta"
      pie={
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <p><strong>¿Es tu primera vez?</strong> Necesitas una cuenta. Es gratis y toma un minuto.</p>
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
        <Link href="/olvide" className="text-center text-[0.95rem] font-semibold text-primary hover:text-primary-hover">¿Olvidaste tu contraseña?</Link>
      </form>
    </Caja>
  )
}

export function CrearCuenta() {
  const router = useRouter()
  const params = useSearchParams()!
  const { enviando, error, enviar } = useEnvio()
  function alEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const d = Object.fromEntries(new FormData(e.currentTarget))
    enviar(async () => {
      await api<{ usuario: Usuario }>('POST', '/cuenta/crear', d)
      router.replace(destino(params))
    })
  }
  return (
    <Caja titulo="Crea tu cuenta" sub="Es gratis mientras dure la prueba. Al entrar, preparas tu primer pedido con tus propios archivos." pie={<p className="text-center">¿Ya tienes cuenta? <Link href="/entrar" className="font-semibold text-primary hover:text-primary-hover">Entra</Link>.</p>}>
      <form className="flex flex-col gap-4" onSubmit={alEnviar} noValidate>
        <Campo etiqueta="Tu nombre"><input className={claseEntrada} type="text" name="nombre" required autoComplete="name" autoFocus /></Campo>
        <Campo etiqueta="Correo"><input className={claseEntrada} type="email" name="email" required autoComplete="email" /></Campo>
        <Campo etiqueta="Contraseña" nota="(mínimo 8 caracteres)"><input className={claseEntrada} type="password" name="clave" required minLength={8} autoComplete="new-password" /></Campo>
        {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
        <Boton type="submit" variante="primario" disabled={enviando}>{enviando ? 'Creando…' : 'Crear cuenta'}</Boton>
      </form>
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
    <Caja titulo="¿Olvidaste tu contraseña?" sub="Escribe el correo con el que creaste tu cuenta." pie={<p className="text-center"><Link href="/entrar" className="font-semibold text-primary hover:text-primary-hover">Volver a entrar</Link></p>}>
      {respuesta === null ? (
        <form className="flex flex-col gap-4" onSubmit={alEnviar} noValidate>
          <Campo etiqueta="Tu correo"><input className={claseEntrada} type="email" name="email" required autoComplete="email" autoFocus /></Campo>
          {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
          <Boton type="submit" variante="primario" disabled={enviando}>{enviando ? 'Enviando…' : 'Pedir un enlace para cambiarla'}</Boton>
        </form>
      ) : respuesta ? (
        <Aviso tono="ok">Si hay una cuenta con ese correo, te enviamos un enlace para cambiar la contraseña. Revisa también la carpeta de correo no deseado.</Aviso>
      ) : (
        <Aviso tono="info">Escríbele al equipo que te invitó a la prueba: ellos te mandan un enlace para poner una contraseña nueva.</Aviso>
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
    <Caja titulo="Pon una contraseña nueva" sub="Con ella vuelves a entrar desde cualquier computador.">
      <form className="flex flex-col gap-4" onSubmit={alEnviar} noValidate>
        <Campo etiqueta="Contraseña nueva" nota="(mínimo 8 caracteres)"><input className={claseEntrada} type="password" name="clave" required autoComplete="new-password" autoFocus /></Campo>
        <Campo etiqueta="Escríbela otra vez"><input className={claseEntrada} type="password" name="repetida" required autoComplete="new-password" /></Campo>
        {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
        <Boton type="submit" variante="primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar y entrar'}</Boton>
      </form>
    </Caja>
  )
}
