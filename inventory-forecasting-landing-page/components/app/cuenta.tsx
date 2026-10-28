'use client'

// Mi cuenta: nombre, programa contable, contraseña, cómo usa la app (analista u operador, días,
// semanas o meses) y el boletín diario.

import { useState, type FormEvent } from 'react'
import { api, textoErrores } from '@/lib/api'
import { SISTEMAS } from '@/lib/sistemas'
import type { Usuario } from '@/lib/tipos'
import { useSesion } from './contexto'
import { Aviso, Boton, Campo, ErrorLista, Tarjeta, Titulo, claseEntrada } from './ui'
import { SelectorPerfil, SelectorTiempo } from './vista'

export function Cuenta() {
  const { usuario, fijar } = useSesion()
  const [msgDatos, setMsgDatos] = useState<{ ok?: string; error?: ReturnType<typeof textoErrores> } | null>(null)
  const [msgClave, setMsgClave] = useState<{ ok?: string; error?: ReturnType<typeof textoErrores> } | null>(null)
  const [msgBoletin, setMsgBoletin] = useState<ReturnType<typeof textoErrores> | null>(null)
  if (!usuario) return null

  async function cambiarBoletin(activo: boolean) {
    setMsgBoletin(null)
    try {
      const r = await api<{ usuario: Usuario }>('PUT', '/cuenta/boletin', { activo })
      fijar(r.usuario)
    } catch (err) {
      setMsgBoletin(textoErrores(err))
    }
  }

  async function guardarDatos(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    try {
      const r = await api<{ usuario: Usuario }>('PUT', '/cuenta/datos', { nombre: d.nombre, sistema: d.sistema || null })
      fijar(r.usuario)
      setMsgDatos({ ok: 'Guardado.' })
    } catch (err) {
      setMsgDatos({ error: textoErrores(err) })
    }
  }

  async function cambiarClave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    try {
      await api('PUT', '/cuenta/clave', Object.fromEntries(new FormData(form)))
      form.reset()
      setMsgClave({ ok: 'Contraseña actualizada. En otros equipos tendrás que volver a entrar.' })
    } catch (err) {
      setMsgClave({ error: textoErrores(err) })
    }
  }

  return (
    <>
      <Titulo>Mi cuenta</Titulo>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Tarjeta className="p-5 sm:p-6">
          <h2 className="mb-4 text-xl font-bold">Tus datos</h2>
          <form className="flex flex-col gap-4" onSubmit={guardarDatos} noValidate>
            <Campo etiqueta="Nombre"><input className={claseEntrada} name="nombre" required defaultValue={usuario.nombre} autoComplete="name" /></Campo>
            <Campo etiqueta="Correo"><input className={claseEntrada} type="email" value={usuario.email} disabled /></Campo>
            <Campo etiqueta="Programa contable">
              <select className={claseEntrada} name="sistema" defaultValue={usuario.sistema || ''}>
                <option value="">Elige una opción</option>
                {SISTEMAS.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </Campo>
            {msgDatos?.ok && <Aviso tono="ok">{msgDatos.ok}</Aviso>}
            {msgDatos?.error && <ErrorLista mensaje={msgDatos.error.mensaje} lista={msgDatos.error.lista} />}
            <Boton type="submit" variante="primario" className="self-start">Guardar</Boton>
          </form>
        </Tarjeta>
        <Tarjeta className="p-5 sm:p-6">
          <h2 className="mb-4 text-xl font-bold">Cambiar contraseña</h2>
          <form className="flex flex-col gap-4" onSubmit={cambiarClave} noValidate>
            <Campo etiqueta="Contraseña actual"><input className={claseEntrada} type="password" name="actual" required autoComplete="current-password" /></Campo>
            <Campo etiqueta="Contraseña nueva" nota="(mínimo 8 caracteres)"><input className={claseEntrada} type="password" name="nueva" required autoComplete="new-password" /></Campo>
            {msgClave?.ok && <Aviso tono="ok">{msgClave.ok}</Aviso>}
            {msgClave?.error && <ErrorLista mensaje={msgClave.error.mensaje} lista={msgClave.error.lista} />}
            <Boton type="submit" variante="primario" className="self-start">Cambiar contraseña</Boton>
          </form>
        </Tarjeta>
        <Tarjeta className="flex flex-col gap-4 p-5 sm:p-6">
          <h2 className="text-xl font-bold">Cómo usas SINESC</h2>
          <SelectorPerfil />
          <div className="flex flex-col gap-2">
            <span className="text-[0.95rem] font-semibold">Para cuánto te alcanza, en</span>
            <SelectorTiempo conHorizonte />
            <p className="text-[0.85rem] text-muted-foreground">El cálculo es el mismo; solo cambia cómo se dice. 2 semanas son 14 días o medio mes.</p>
          </div>
        </Tarjeta>
        <Tarjeta className="flex flex-col gap-4 p-5 sm:p-6">
          <h2 className="text-xl font-bold">Boletín diario</h2>
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={usuario.boletin} onChange={(e) => cambiarBoletin(e.target.checked)} className="mt-1 size-5 accent-[var(--primary)]" />
            <span>
              <strong>Recibir cada mañana el estado del inventario</strong>
              <span className="block text-[0.9rem] text-muted-foreground">Llega a {usuario.email} hacia las 6 a. m. Dice qué está en cero, qué se va a agotar y qué cambió desde ayer{usuario.perfil === 'analista' ? ', con el sugerido y lo que hay que pedir por proveedor' : ''}. Llega cuando tu empresa ya tiene inventario.</span>
            </span>
          </label>
          {msgBoletin && <ErrorLista mensaje={msgBoletin.mensaje} lista={msgBoletin.lista} />}
        </Tarjeta>
      </div>
    </>
  )
}
