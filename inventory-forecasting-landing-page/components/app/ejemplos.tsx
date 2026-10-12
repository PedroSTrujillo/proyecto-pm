'use client'

// Ejemplos para el equipo (server/ejemplos.js): los seis negocios de la demo y los archivos de
// ejemplos/. Cada uno se puede ver, descargar para subirlo por el flujo normal o cargar directo
// como el inventario de esta cuenta.

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Download, Eye, Upload } from 'lucide-react'
import { api, textoErrores } from '@/lib/api'
import { numero } from '@/lib/formato'
import { useInventario } from './contexto'
import { Aviso, Boton, Cargando, ErrorLista, Tarjeta, Titulo, clasesBoton } from './ui'

type Negocio = { id: string; empresa: string; sector: string; ciudad: string; programa: string; resumen: string; productos: number; listado: boolean }
type Archivo = { id: string; titulo: string; texto: string; archivos: string[]; tipo: 'export' | 'lista'; disponible: boolean }
type Resultado = { ok: boolean; errores?: string[]; resumen?: { productos: number } }

export function Ejemplos() {
  const { recargar } = useInventario()
  const [datos, setDatos] = useState<{ negocios: Negocio[]; archivos: Archivo[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string; lista?: string[] } | null>(null)

  useEffect(() => {
    api<{ negocios: Negocio[]; archivos: Archivo[] }>('GET', '/equipo/ejemplos').then(setDatos).catch((e) => setError(textoErrores(e).mensaje))
  }, [])

  async function cargar(clave: string, ruta: string, nombre: string) {
    setCargando(clave)
    setAviso(null)
    try {
      const r = await api<Resultado>('POST', ruta)
      if (r.ok) {
        recargar()
        setAviso({ ok: true, texto: `Listo: tu panel ya tiene ${nombre}${r.resumen ? ` (${numero(r.resumen.productos)} productos)` : ''}.` })
      } else {
        setAviso({ ok: false, texto: `No se pudo leer ${nombre}.`, lista: r.errores })
      }
    } catch (e) {
      const t = textoErrores(e)
      setAviso({ ok: false, texto: t.mensaje, lista: t.lista })
    } finally {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      setCargando(null)
    }
  }

  if (error) return <ErrorLista mensaje={error} />
  if (!datos) return <Cargando texto="Cargando los ejemplos…" />

  return (
    <div className="flex flex-col gap-6">
      <Titulo sub="Solo lo ve el equipo. Cargar un ejemplo cambia el inventario de esta cuenta; no toca a los probadores ni los resultados de la prueba.">
        Ejemplos para probar
      </Titulo>

      {aviso && (
        <Aviso tono={aviso.ok ? 'ok' : 'error'} titulo={aviso.texto}>
          {aviso.ok && <Link href="/panel" className="font-semibold underline underline-offset-2">Ir al panel</Link>}
          {aviso.lista && aviso.lista.length > 0 && <ul className="mt-1 list-disc pl-5">{aviso.lista.slice(0, 8).map((x, i) => <li key={i}>{x}</li>)}</ul>}
        </Aviso>
      )}

      <section aria-labelledby="t-negocios" className="flex flex-col gap-3">
        <div>
          <h2 id="t-negocios" className="text-xl font-bold">Negocios de ejemplo</h2>
          <p className="text-muted-foreground">Los mismos de la demo, con costos, proveedores, tiempos de entrega y cada cuánto piden. El archivo trae una hoja de ventas con fecha y otra de existencias.</p>
        </div>
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {datos.negocios.map((n) => (
            <li key={n.id}>
              <Tarjeta className="flex h-full flex-col gap-3 p-5">
                <div>
                  <span className="text-[0.8rem] font-bold tracking-[0.06em] text-muted-foreground uppercase">{n.sector}</span>
                  <h3 className="text-lg font-bold">{n.empresa}</h3>
                  <p className="text-sm text-muted-foreground">{n.ciudad} · {n.programa} · {numero(n.productos)} productos</p>
                </div>
                <p className="text-[0.95rem] text-foreground/80">{n.resumen}</p>
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Boton variante="primario" tamano="chico" disabled={cargando !== null} onClick={() => cargar(`n-${n.id}`, `/equipo/ejemplos/negocios/${n.id}/cargar`, n.empresa)}>
                    <Upload /> {cargando === `n-${n.id}` ? 'Cargando…' : 'Cargar en mi cuenta'}
                  </Boton>
                  <a href={`/api/equipo/ejemplos/negocios/${n.id}/archivo`} className={clasesBoton('secundario', 'chico')}><Download /> Archivo</a>
                  <Link href={`/demo/${n.id}`} className={clasesBoton('secundario', 'chico')}><Eye /> Demo</Link>
                </div>
                {n.listado && (
                  <div className="flex flex-col gap-2 border-t border-border pt-3">
                    <p className="text-sm text-muted-foreground">También como lo saca {n.programa}: listado de inventario con las salidas de los últimos 3 meses, sin la fecha de cada venta.</p>
                    <div className="flex flex-wrap gap-2">
                      <Boton tamano="chico" disabled={cargando !== null} onClick={() => cargar(`l-${n.id}`, `/equipo/ejemplos/negocios/${n.id}/cargar?formato=listado`, `el listado de ${n.empresa}`)}>
                        <Upload /> {cargando === `l-${n.id}` ? 'Cargando…' : 'Cargar el listado'}
                      </Boton>
                      <a href={`/api/equipo/ejemplos/negocios/${n.id}/archivo?formato=listado`} className={clasesBoton('secundario', 'chico')}><Download /> Listado</a>
                    </div>
                  </div>
                )}
              </Tarjeta>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="t-archivos" className="flex flex-col gap-3">
        <div>
          <h2 id="t-archivos" className="text-xl font-bold">Archivos de otros programas</h2>
          <p className="text-muted-foreground">Formatos difíciles para probar el lector. Para probar los 5 pasos como un probador, crea un pedido en Pedidos y sube estos archivos en el paso 2.</p>
        </div>
        <ul className="grid gap-4 md:grid-cols-2">
          {datos.archivos.map((a) => (
            <li key={a.id}>
              <Tarjeta className="flex h-full flex-col gap-3 p-5">
                <h3 className="text-lg font-bold">{a.titulo}</h3>
                <p className="text-[0.95rem] text-foreground/80">{a.texto}</p>
                {!a.disponible && <p className="text-sm text-rojo-texto">Faltan archivos en ejemplos/. Se generan con npm run ejemplos.</p>}
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  {a.tipo === 'export' && (
                    <Boton variante="primario" tamano="chico" disabled={cargando !== null || !a.disponible} onClick={() => cargar(`a-${a.id}`, `/equipo/ejemplos/archivos/${a.id}/cargar`, a.titulo)}>
                      <Upload /> {cargando === `a-${a.id}` ? 'Cargando…' : 'Cargar en mi cuenta'}
                    </Boton>
                  )}
                  {a.archivos.map((nombre) => (
                    <a key={nombre} href={`/api/equipo/ejemplos/archivos/${a.id}/${nombre}`} className={clasesBoton('secundario', 'chico', 'max-w-full break-all whitespace-normal')}><Download /> {nombre}</a>
                  ))}
                </div>
              </Tarjeta>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
