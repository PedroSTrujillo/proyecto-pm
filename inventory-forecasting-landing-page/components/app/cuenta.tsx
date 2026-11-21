'use client'

// Mi cuenta: nombre, programa contable, contraseña, cómo usa la app (analista u operador, días,
// semanas o meses) y el boletín diario con sus alertas (qué secciones trae y cada cuánto, SP7).

import { useState, type FormEvent } from 'react'
import { api, textoErrores } from '@/lib/api'
import { SISTEMAS } from '@/lib/sistemas'
import type { Frecuencia, TipoAlerta, Usuario } from '@/lib/tipos'
import { cn } from '@/lib/utils'
import { useSesion } from './contexto'
import { Aviso, Boton, Campo, ErrorLista, Tarjeta, Titulo, claseEntrada } from './ui'
import { SelectorTiempo, TEXTO_ROL } from './vista'

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
      const r = await api<{ usuario: Usuario }>('PUT', '/cuenta/datos', { nombre: d.nombre, cargo: d.cargo, sistema: d.sistema || null })
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
      setMsgClave({ ok: 'Contraseña actualizada. En otros equipos tendrá que volver a entrar.' })
    } catch (err) {
      setMsgClave({ error: textoErrores(err) })
    }
  }

  return (
    <>
      <Titulo>Mi cuenta</Titulo>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Tarjeta className="p-5 sm:p-6">
          <h2 className="mb-4 text-xl font-bold">Sus datos</h2>
          <form className="flex flex-col gap-4" onSubmit={guardarDatos} noValidate>
            <Campo etiqueta="Nombre"><input className={claseEntrada} name="nombre" required defaultValue={usuario.nombre} autoComplete="name" /></Campo>
            <Campo etiqueta="Cargo" nota="(va en el PDF de sus pedidos)"><input className={claseEntrada} name="cargo" defaultValue={usuario.cargo} maxLength={80} placeholder="Por ejemplo, jefe de compras" autoComplete="organization-title" /></Campo>
            <Campo etiqueta="Correo"><input className={claseEntrada} type="email" value={usuario.email} disabled /></Campo>
            <Campo etiqueta="Programa contable">
              <select className={claseEntrada} name="sistema" defaultValue={usuario.sistema || ''}>
                <option value="">Elija una opción</option>
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
          <h2 className="text-xl font-bold">Cómo ve el tiempo</h2>
          <div className="flex flex-col gap-2">
            <span className="text-cuerpo font-semibold">Para cuánto alcanza, en</span>
            <SelectorTiempo conHorizonte />
            <p className="text-nota text-muted-foreground">El cálculo es el mismo; solo cambia cómo se dice. 2 semanas son 14 días o medio mes.</p>
          </div>
        </Tarjeta>
        <Tarjeta className="flex flex-col gap-4 p-5 sm:p-6 lg:col-span-2">
          <h2 className="text-xl font-bold">Boletín diario</h2>
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={usuario.boletin} onChange={(e) => cambiarBoletin(e.target.checked)} className="mt-1 size-5 accent-[var(--primary)]" />
            <span>
              <strong>Recibir cada mañana el estado del inventario</strong>
              <span className="block text-chico text-muted-foreground">Llega a {usuario.email} hacia las 6 a. m., cuando su empresa ya tiene inventario. Trae solo los avisos de la tabla que tocan ese día y tienen algo que decir; si no hay ninguno, ese día no llega. Cada aviso dice qué es nuevo desde la última vez{usuario.perfil === 'analista' ? ', con el sugerido y lo que hay que pedir por proveedor' : ''}.</span>
            </span>
          </label>
          {msgBoletin && <ErrorLista mensaje={msgBoletin.mensaje} lista={msgBoletin.lista} />}
          <TablaAlertas usuario={usuario} />
        </Tarjeta>
      </div>
    </>
  )
}

// --- Qué avisos trae el boletín y cada cuánto -----------------------------------------------------

const ALERTAS: { tipo: TipoAlerta; texto: string; descripcion: string }[] = [
  { tipo: 'pideYa', texto: 'Pedir ya', descripcion: 'Lo que hay que pedir hoy para que llegue a tiempo.' },
  { tipo: 'seAgota', texto: 'Se van a agotar', descripcion: 'Lo que alcanza para menos de lo elegido para el aviso.' },
  { tipo: 'enCero', texto: 'En cero', descripcion: 'Productos sin existencias.' },
  { tipo: 'porRecibir', texto: 'Entregas atrasadas', descripcion: 'Pedidos que ya debían llegar según lo que tarda el proveedor.' },
  { tipo: 'porAprobar', texto: 'Pedidos por aprobar', descripcion: 'Los que le enviaron para aprobar.' },
  { tipo: 'sobran', texto: 'Sobrestock', descripcion: 'Lo que alcanza para más de 12 semanas, o lo que diga la ficha de cada producto.' },
  { tipo: 'dineroQuieto', texto: 'Dinero quieto', descripcion: 'Cuánta plata hay en lo que sobra. Solo si el archivo trae costos.' },
  { tipo: 'sinDatos', texto: 'Datos sin actualizar', descripcion: 'Cuando pasan más de 3 días hábiles sin movimientos ni archivos.' },
]

const FRECUENCIAS: { id: Frecuencia; texto: string }[] = [
  { id: 'diario', texto: 'A diario' },
  { id: 'semanal', texto: 'Los lunes' },
  { id: 'mensual', texto: 'Primer día hábil del mes' },
  { id: 'nunca', texto: 'Nunca' },
]

function TablaAlertas({ usuario }: { usuario: Usuario }) {
  const { fijar } = useSesion()
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)
  const [guardando, setGuardando] = useState<TipoAlerta | 'todas' | null>(null)
  // Pedidos por aprobar solo le llega a quien aprueba, y nunca a un operador. El operador tampoco recibe
  // dinero quieto ni sobrestock (el servidor lo fuerza en "nunca"); lo demás le llega a todos los roles.
  const operador = usuario.rolEmpresa === 'operador'
  const visibles = ALERTAS.filter((a) => (a.tipo !== 'porAprobar' || (usuario.aprueba && !operador)) && !(operador && (a.tipo === 'dineroQuieto' || a.tipo === 'sobran')))

  async function guardar(alertas: Partial<Record<TipoAlerta, Frecuencia>> | null, cual: TipoAlerta | 'todas') {
    setError(null)
    setGuardando(cual)
    try {
      const r = await api<{ usuario: Usuario }>('PUT', '/cuenta/preferencias', { alertas })
      fijar(r.usuario)
    } catch (err) {
      setError(textoErrores(err))
    } finally {
      setGuardando(null)
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div>
        <h3 className="text-lg font-bold">Qué avisos trae y cada cuánto</h3>
        <p className="text-chico text-muted-foreground">
          {usuario.boletin ? 'Se guarda al elegir.' : 'El boletín está apagado: puede dejar esto listo y activarlo después.'} Los valores de partida son los de su rol ({TEXTO_ROL[usuario.rolEmpresa].titulo.toLowerCase()}). Los festivos cuentan como días hábiles.
        </p>
      </div>
      <ul className="flex flex-col">
        {visibles.map((a) => (
          <li key={a.tipo} className="flex flex-col gap-2 border-b border-[#f0f1ee] py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <label htmlFor={`alerta-${a.tipo}`} className="text-cuerpo font-semibold">{a.texto}</label>
              <p className="text-chico text-muted-foreground">{a.descripcion}</p>
            </div>
            <select
              id={`alerta-${a.tipo}`}
              className={cn(claseEntrada, 'sm:w-60 sm:shrink-0')}
              value={usuario.preferencias.alertas[a.tipo]}
              disabled={guardando !== null}
              onChange={(e) => guardar({ [a.tipo]: e.target.value as Frecuencia }, a.tipo)}
            >
              {FRECUENCIAS.map((f) => <option key={f.id} value={f.id}>{f.texto}</option>)}
            </select>
          </li>
        ))}
      </ul>
      {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
      {usuario.preferencias.alertasPropias && (
        <Boton tamano="chico" variante="fantasma" className="self-start" disabled={guardando !== null} onClick={() => guardar(null, 'todas')}>
          {guardando === 'todas' ? 'Restableciendo…' : 'Volver a los valores de su perfil'}
        </Boton>
      )}
    </div>
  )
}
