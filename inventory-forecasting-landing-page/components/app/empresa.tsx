'use client'

// Mi empresa: nombre, logo, quiénes están (con su cargo y si aprueban pedidos) y cómo invitar a
// alguien. El inventario es de la empresa: lo que suba o registre una persona lo ven las demás. Los
// pedidos siguen siendo de cada quien, y quien aprueba ve los que le envían (SP6, D11).

import { useEffect, useState, type FormEvent } from 'react'
import { ImageUp, Trash2, UserMinus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, textoErrores } from '@/lib/api'
import { fecha } from '@/lib/formato'
import type { Empresa as TEmpresa, RolEmpresa, Usuario } from '@/lib/tipos'
import { useConfirmar } from './confirmar'
import { useSesion } from './contexto'
import { Aviso, Boton, Campo, Cargando, ErrorLista, Tarjeta, Titulo, claseEntrada } from './ui'
import { RANGO_ROL, TEXTO_ROL } from './vista'
import { FormInvitar } from './invitar'

export function Empresa() {
  const { usuario, fijar } = useSesion()
  const [empresa, setEmpresa] = useState<TEmpresa | null>(null)
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)
  const [msgDatos, setMsgDatos] = useState<{ ok?: string; error?: ReturnType<typeof textoErrores> } | null>(null)
  const { ventana, preguntar } = useConfirmar()
  const [errorMiembro, setErrorMiembro] = useState<ReturnType<typeof textoErrores> | null>(null)
  const [msgLogo, setMsgLogo] = useState<{ ok?: string; error?: string } | null>(null)
  const [versionLogo, setVersionLogo] = useState(0)

  useEffect(() => {
    api<{ empresa: TEmpresa }>('GET', '/empresa').then((r) => setEmpresa(r.empresa)).catch((e) => setError(textoErrores(e)))
  }, [])

  if (error) return <ErrorLista mensaje={error.mensaje} lista={error.lista} />
  if (!empresa || !usuario) return <Cargando />
  // Nombre, logo e invitar: gerente y administrador. Sobre cada miembro, solo quien tiene mayor rango (T1).
  const admin = usuario.rolEmpresa !== 'operador'
  const rolesQueDoy = (['administrador', 'operador'] as const).filter((r) => RANGO_ROL[r] < RANGO_ROL[usuario.rolEmpresa])

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

  // Quién aprueba pedidos y el cargo de cada quien. Si es la persona misma, la sesión también cambia.
  async function cambiarMiembro(id: number, cambio: { aprueba?: boolean; cargo?: string; rol?: RolEmpresa }) {
    setErrorMiembro(null)
    try {
      const r = await api<{ empresa: TEmpresa }>('PUT', `/empresa/miembros/${id}`, cambio)
      setEmpresa(r.empresa)
      if (id === usuario?.id) {
        const yo = await api<{ usuario: Usuario }>('GET', '/cuenta/yo')
        if (yo.usuario) fijar(yo.usuario)
      }
    } catch (err) {
      setErrorMiembro(textoErrores(err))
    }
  }

  async function subirLogo(archivo: File | undefined) {
    setMsgLogo(null)
    if (!archivo) return
    if (!/^image\/(png|jpeg)$/.test(archivo.type)) return setMsgLogo({ error: 'El logo tiene que ser una imagen PNG o JPG.' })
    if (archivo.size > 300 * 1024) return setMsgLogo({ error: `El logo pesa ${Math.ceil(archivo.size / 1024)} KB y el máximo es 300 KB. Guárdelo más pequeño (por ejemplo, de 600 píxeles de ancho) y vuelva a subirlo.` })
    const datos = await new Promise<string>((resolver, rechazar) => {
      const lector = new FileReader()
      lector.onload = () => resolver(String(lector.result))
      lector.onerror = () => rechazar(lector.error)
      lector.readAsDataURL(archivo)
    })
    try {
      setEmpresa((await api<{ empresa: TEmpresa }>('PUT', '/empresa/logo', { datos })).empresa)
      setVersionLogo((v) => v + 1)
      setMsgLogo({ ok: 'Listo: el logo ya sale en el PDF y el Excel de los pedidos.' })
    } catch (err) {
      setMsgLogo({ error: textoErrores(err).mensaje })
    }
  }

  async function quitarLogo() {
    setMsgLogo(null)
    try {
      setEmpresa((await api<{ empresa: TEmpresa }>('DELETE', '/empresa/logo')).empresa)
    } catch (err) {
      setMsgLogo({ error: textoErrores(err).mensaje })
    }
  }

  async function sacar(id: number, nombre: string) {
    const ok = await preguntar(`¿Sacar a ${nombre} de la empresa?`, 'Conserva su cuenta y sus pedidos, pero deja de ver el inventario de la empresa.', 'Sí, sacar', true)
    if (!ok) return
    try {
      const r = await api<{ empresa: TEmpresa }>('DELETE', `/empresa/miembros/${id}`)
      setEmpresa(r.empresa)
    } catch (err) {
      setErrorMiembro(textoErrores(err))
    }
  }

  return (
    <>
      <Titulo sub="El inventario es de la empresa: lo que suba o registre una persona lo ven todas. Los pedidos son de cada quien.">
        {empresa.vacia ? 'Mi empresa' : empresa.nombre}
      </Titulo>
      {empresa.vacia && <Aviso tono="cuidado" titulo="Su empresa todavía no tiene nombre">Su cuenta es de antes de que existieran las empresas. Póngale nombre para invitar a su equipo.</Aviso>}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Tarjeta className="p-5 sm:p-6">
          <h2 className="mb-4 text-xl font-bold">Datos de la empresa</h2>
          <form className="flex flex-col gap-4" onSubmit={guardar} noValidate>
            <Campo etiqueta="Nombre"><input className={claseEntrada} name="nombre" required defaultValue={empresa.nombre} disabled={!admin} autoComplete="organization" /></Campo>
            <Campo etiqueta="NIT" nota="(opcional)"><input className={claseEntrada} name="nit" defaultValue={empresa.nit || ''} disabled={!admin} inputMode="numeric" /></Campo>
            {msgDatos?.ok && <Aviso tono="ok">{msgDatos.ok}</Aviso>}
            {msgDatos?.error && <ErrorLista mensaje={msgDatos.error.mensaje} lista={msgDatos.error.lista} />}
            {admin ? <Boton type="submit" variante="primario" className="self-start">Guardar</Boton> : <p className="text-chico text-muted-foreground">Solo quien administra la empresa cambia estos datos.</p>}
          </form>
          <div className="mt-6 flex flex-col gap-3 border-t border-border pt-5">
            <h3 className="text-lg font-bold">Logo</h3>
            <p className="text-chico text-muted-foreground">Sale arriba en el PDF y el Excel de los pedidos. PNG o JPG de hasta 300 KB.</p>
            {empresa.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- viene de la API con la sesión, sin optimizar
              <img src={`/api/empresa/logo?v=${versionLogo}`} alt={`Logo de ${empresa.nombre || 'la empresa'}`} className="max-h-16 max-w-56 self-start rounded-lg border border-border bg-white object-contain p-2" />
            ) : (
              <p className="text-chico">Todavía no tiene logo: los pedidos salen con el de SINESC.</p>
            )}
            {admin && (
              <div className="flex flex-wrap gap-2.5">
                <label className="presionable inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-input bg-card px-3.5 text-sm font-semibold hover:bg-muted focus-within:outline-3 focus-within:outline-ring">
                  <ImageUp className="size-4" /> {empresa.logo ? 'Cambiar el logo' : 'Subir el logo'}
                  <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => { subirLogo(e.target.files?.[0]); e.target.value = '' }} />
                </label>
                {empresa.logo && <Boton tamano="chico" variante="fantasma" onClick={quitarLogo}><Trash2 /> Quitar</Boton>}
              </div>
            )}
            {msgLogo?.ok && <Aviso tono="ok">{msgLogo.ok}</Aviso>}
            {msgLogo?.error && <Aviso tono="error">{msgLogo.error}</Aviso>}
          </div>
        </Tarjeta>

        <Tarjeta className="flex flex-col gap-4 p-5 sm:p-6">
          <h2 className="text-xl font-bold">Invitar a alguien</h2>
          {admin ? (
            <>
              <FormInvitar deshabilitado={empresa.vacia} alInvitar={setEmpresa} />
            </>
          ) : (
            <p className="text-muted-foreground">Para invitar a alguien, pídale a quien administra la empresa que le envíe el enlace.</p>
          )}
          {empresa.invitacionesAbiertas.length > 0 && (
            <p className="text-nota text-muted-foreground">
              {empresa.invitacionesAbiertas.length === 1 ? 'Hay 1 invitación sin usar' : `Hay ${empresa.invitacionesAbiertas.length} invitaciones sin usar`}: {empresa.invitacionesAbiertas.map((i) => `${i.email || 'para cualquiera'} (vence el ${fecha(i.expiraEn)})`).join(', ')}.
            </p>
          )}
        </Tarjeta>
      </div>

      <Tarjeta className="p-5 sm:p-6">
        <h2 className="text-xl font-bold">Quiénes están</h2>
        <p className="mt-1 mb-3 text-chico text-muted-foreground">
          {empresa.miembros.some((m) => m.aprueba)
            ? 'Los pedidos de quien no aprueba le llegan a quien aprueba: lo revisa, lo ajusta si hace falta y lo aprueba o lo devuelve.'
            : 'Hoy nadie aprueba pedidos: cada quien cierra los suyos. Si marca a alguien, los pedidos de los demás le llegan para aprobar.'}
          {' '}El cargo sale en el PDF del pedido.
        </p>
        {errorMiembro && <ErrorLista mensaje={errorMiembro.mensaje} lista={errorMiembro.lista} />}
        <ul className="divide-y divide-border">
          {empresa.miembros.map((m) => {
            const mio = RANGO_ROL[usuario.rolEmpresa] > RANGO_ROL[m.rol]
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="flex min-w-0 flex-col">
                  <strong className="truncate">{m.nombre}{m.id === usuario.id ? ' (usted)' : ''}</strong>
                  <span className="truncate text-chico text-muted-foreground">
                    {m.email} · {TEXTO_ROL[m.rol].titulo}{!mio && m.cargo ? ` · ${m.cargo}` : ''}{!mio && m.aprueba ? ' · aprueba pedidos' : ''} · desde el {fecha(m.desde)}
                  </span>
                </span>
                {mio && (
                  <span className="flex flex-wrap items-center gap-3">
                    {rolesQueDoy.length > 1 && (
                      <select
                        className={cn(claseEntrada, 'min-h-10 w-44')}
                        value={m.rol}
                        aria-label={`Rol de ${m.nombre}`}
                        onChange={(e) => cambiarMiembro(m.id, { rol: e.target.value as RolEmpresa })}
                      >
                        {rolesQueDoy.map((r) => <option key={r} value={r}>{TEXTO_ROL[r].titulo}</option>)}
                      </select>
                    )}
                    <input
                      key={`${m.id}-${m.cargo}`}
                      className={cn(claseEntrada, 'min-h-10 w-48')}
                      defaultValue={m.cargo}
                      maxLength={80}
                      placeholder="Cargo"
                      aria-label={`Cargo de ${m.nombre}`}
                      onBlur={(e) => { if (e.target.value.trim() !== m.cargo) cambiarMiembro(m.id, { cargo: e.target.value }) }}
                    />
                    <label className="flex items-center gap-2 text-chico font-semibold">
                      <input type="checkbox" checked={m.aprueba} onChange={(e) => cambiarMiembro(m.id, { aprueba: e.target.checked })} className="size-5 accent-[var(--primary)]" />
                      Puede aprobar pedidos
                    </label>
                    <Boton tamano="chico" variante="peligro" onClick={() => sacar(m.id, m.nombre)}><UserMinus /> Sacar</Boton>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </Tarjeta>
      {ventana}
    </>
  )
}
