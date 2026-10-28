'use client'

// Mi empresa: nombre, quiénes están y cómo invitar a alguien. El inventario es de la empresa: lo
// que suba o registre una persona lo ven las demás. Los pedidos siguen siendo de cada quien.

import { useEffect, useState, type FormEvent } from 'react'
import { Copy, UserMinus } from 'lucide-react'
import { api, textoErrores } from '@/lib/api'
import { fecha } from '@/lib/formato'
import type { Empresa as TEmpresa, Usuario } from '@/lib/tipos'
import { useConfirmar } from './confirmar'
import { useSesion } from './contexto'
import { Aviso, Boton, Campo, Cargando, ErrorLista, Tarjeta, Titulo, claseEntrada } from './ui'
import { TEXTO_PERFIL } from './vista'

export function Empresa() {
  const { usuario, fijar } = useSesion()
  const [empresa, setEmpresa] = useState<TEmpresa | null>(null)
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)
  const [msgDatos, setMsgDatos] = useState<{ ok?: string; error?: ReturnType<typeof textoErrores> } | null>(null)
  const [invitacion, setInvitacion] = useState<{ enlace: string; dias: number; enviado: boolean; email: string } | null>(null)
  const [errorInvitar, setErrorInvitar] = useState<ReturnType<typeof textoErrores> | null>(null)
  const [copiado, setCopiado] = useState(false)
  const { ventana, preguntar } = useConfirmar()

  useEffect(() => {
    api<{ empresa: TEmpresa }>('GET', '/empresa').then((r) => setEmpresa(r.empresa)).catch((e) => setError(textoErrores(e)))
  }, [])

  if (error) return <ErrorLista mensaje={error.mensaje} lista={error.lista} />
  if (!empresa || !usuario) return <Cargando />
  const admin = Boolean(usuario.empresa?.admin)

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    try {
      const r = await api<{ empresa: TEmpresa }>('PUT', '/empresa', d)
      setEmpresa(r.empresa)
      // El nombre también va en la sesión (menú y avisos).
      const yo = await api<{ usuario: Usuario }>('GET', '/cuenta/yo')
      if (yo.usuario) fijar(yo.usuario)
      setMsgDatos({ ok: 'Guardado.' })
    } catch (err) {
      setMsgDatos({ error: textoErrores(err) })
    }
  }

  async function invitar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const email = String(new FormData(e.currentTarget).get('email') || '').trim()
    setErrorInvitar(null)
    setCopiado(false)
    try {
      const r = await api<{ enlace: string; dias: number; enviado: boolean; empresa: TEmpresa }>('POST', '/empresa/invitaciones', { email })
      setInvitacion({ enlace: r.enlace, dias: r.dias, enviado: r.enviado, email })
      setEmpresa(r.empresa)
    } catch (err) {
      setErrorInvitar(textoErrores(err))
    }
  }

  async function sacar(id: number, nombre: string) {
    const ok = await preguntar(`¿Sacar a ${nombre} de la empresa?`, 'Conserva su cuenta y sus pedidos, pero deja de ver el inventario de la empresa.', 'Sí, sacar', true)
    if (!ok) return
    try {
      const r = await api<{ empresa: TEmpresa }>('DELETE', `/empresa/miembros/${id}`)
      setEmpresa(r.empresa)
    } catch (err) {
      setError(textoErrores(err))
    }
  }

  return (
    <>
      <Titulo sub="El inventario es de la empresa: lo que suba o registre una persona lo ven todas. Los pedidos son de cada quien.">
        {empresa.vacia ? 'Mi empresa' : empresa.nombre}
      </Titulo>
      {empresa.vacia && <Aviso tono="cuidado" titulo="Tu empresa todavía no tiene nombre">Tu cuenta es de antes de que existieran las empresas. Ponle nombre para invitar a tu equipo.</Aviso>}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Tarjeta className="p-5 sm:p-6">
          <h2 className="mb-4 text-xl font-bold">Datos de la empresa</h2>
          <form className="flex flex-col gap-4" onSubmit={guardar} noValidate>
            <Campo etiqueta="Nombre"><input className={claseEntrada} name="nombre" required defaultValue={empresa.nombre} disabled={!admin} autoComplete="organization" /></Campo>
            <Campo etiqueta="NIT" nota="(opcional)"><input className={claseEntrada} name="nit" defaultValue={empresa.nit || ''} disabled={!admin} inputMode="numeric" /></Campo>
            {msgDatos?.ok && <Aviso tono="ok">{msgDatos.ok}</Aviso>}
            {msgDatos?.error && <ErrorLista mensaje={msgDatos.error.mensaje} lista={msgDatos.error.lista} />}
            {admin ? <Boton type="submit" variante="primario" className="self-start">Guardar</Boton> : <p className="text-[0.9rem] text-muted-foreground">Solo quien administra la empresa cambia estos datos.</p>}
          </form>
        </Tarjeta>

        <Tarjeta className="flex flex-col gap-4 p-5 sm:p-6">
          <h2 className="text-xl font-bold">Invitar a alguien</h2>
          {admin ? (
            <>
              <form className="flex flex-col gap-3" onSubmit={invitar} noValidate>
                <Campo etiqueta="Su correo" nota="(opcional: sin correo, el enlace sirve para cualquiera)"><input className={claseEntrada} type="email" name="email" autoComplete="off" /></Campo>
                {errorInvitar && <ErrorLista mensaje={errorInvitar.mensaje} lista={errorInvitar.lista} />}
                <Boton type="submit" variante="primario" className="self-start" disabled={empresa.vacia}>Crear enlace de invitación</Boton>
              </form>
              {invitacion && (
                <div className="aparecer flex flex-col gap-2 rounded-xl border border-border bg-muted p-3">
                  <p className="text-[0.9rem]">{invitacion.enviado ? `Le enviamos el enlace a ${invitacion.email}. También lo puedes copiar:` : 'Copia el enlace y mándaselo (por correo o WhatsApp).'} Sirve una sola vez durante {invitacion.dias} días.</p>
                  <div className="flex gap-2">
                    <input className={claseEntrada} readOnly value={invitacion.enlace} onFocus={(e) => e.currentTarget.select()} aria-label="Enlace de invitación" />
                    <Boton
                      tamano="chico"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(invitacion.enlace)
                          setCopiado(true)
                        } catch {
                          setCopiado(false)
                        }
                      }}
                    >
                      <Copy /> {copiado ? 'Copiado' : 'Copiar'}
                    </Boton>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">Pídele a quien administra la empresa que te mande el enlace para invitar a alguien.</p>
          )}
          {empresa.invitacionesAbiertas.length > 0 && (
            <p className="text-[0.85rem] text-muted-foreground">
              {empresa.invitacionesAbiertas.length === 1 ? 'Hay 1 invitación sin usar' : `Hay ${empresa.invitacionesAbiertas.length} invitaciones sin usar`}: {empresa.invitacionesAbiertas.map((i) => `${i.email || 'para cualquiera'} (vence el ${fecha(i.expiraEn)})`).join(', ')}.
            </p>
          )}
        </Tarjeta>
      </div>

      <Tarjeta className="p-5 sm:p-6">
        <h2 className="mb-3 text-xl font-bold">Quiénes están</h2>
        <ul className="divide-y divide-border">
          {empresa.miembros.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="flex min-w-0 flex-col">
                <strong className="truncate">{m.nombre}{m.id === usuario.id ? ' (tú)' : ''}</strong>
                <span className="truncate text-[0.88rem] text-muted-foreground">{m.email} · {TEXTO_PERFIL[m.perfil].titulo}{m.admin ? ' · administra' : ''} · desde el {fecha(m.desde)}</span>
              </span>
              {admin && m.id !== usuario.id && (
                <Boton tamano="chico" variante="peligro" onClick={() => sacar(m.id, m.nombre)}><UserMinus /> Sacar</Boton>
              )}
            </li>
          ))}
        </ul>
      </Tarjeta>
      {ventana}
    </>
  )
}
