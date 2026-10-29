'use client'

// La llegada de un pedido (SP5): por proveedor, "Registrar llegada" con las cantidades pedidas ya
// escritas. Lo que llega entra como entrada en Movimientos y deja de contar "en camino"; lo que se
// marca en 0 no llegó. Lo usa la página del pedido cerrado y "Por recibir" en Pedidos (cualquiera de
// la empresa puede recibir: quien recibe la mercancía no siempre es quien pidió).

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PackageCheck, Truck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, ErrorApi, textoErrores } from '@/lib/api'
import { dia, fecha, numero, plural } from '@/lib/formato'
import type { Recepcion } from '@/lib/tipos'
import { useInventario } from './contexto'
import { Aviso, Boton, ErrorLista, Tarjeta, claseEntrada } from './ui'

type Grupo = Recepcion['proveedores'][number]

function hoyBogota() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

// Lo que llegó de un pedido, con un formulario por proveedor que todavía espera algo.
export function RecibirPedido({ recepcion: inicial, titulo = true, alCambiar }: { recepcion: Recepcion; titulo?: boolean; alCambiar?: (r: Recepcion) => void }) {
  const [recepcion, setRecepcion] = useState(inicial)
  useEffect(() => setRecepcion(inicial), [inicial])
  const lineas = recepcion.proveedores.reduce((n, g) => n + g.lineas.length, 0)
  return (
    <div className="flex flex-col gap-4">
      {titulo && (
        <div>
          <h2 className="text-xl font-bold">Llegada del pedido</h2>
          <p className="mt-1 text-muted-foreground">
            {recepcion.pendientes
              ? `Faltan ${plural(recepcion.pendientes, 'producto', 'productos')} de ${numero(lineas)} por llegar. Mientras tanto cuentan "en camino": el sugerido no los vuelve a pedir.`
              : 'Ya llegó todo. Las entradas están en Movimientos.'}
          </p>
        </div>
      )}
      {recepcion.proveedores.map((g) => (
        <GrupoProveedor
          key={g.proveedor}
          pedidoId={recepcion.pedidoId}
          grupo={g}
          desde={recepcion.terminadoEn}
          alGuardar={(r) => {
            setRecepcion(r)
            alCambiar?.(r)
          }}
        />
      ))}
    </div>
  )
}

function GrupoProveedor({ pedidoId, grupo, desde, alGuardar }: { pedidoId: number; grupo: Grupo; desde: string; alGuardar: (r: Recepcion) => void }) {
  const { recargar } = useInventario()
  const pendientes = grupo.lineas.filter((l) => !l.recibido)
  const [abierto, setAbierto] = useState(false)
  const [cantidades, setCantidades] = useState<Record<string, string>>({})
  const [fechaLlegada, setFechaLlegada] = useState(hoyBogota)
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [listo, setListo] = useState<string | null>(null)
  const hoy = hoyBogota()

  function abrir() {
    setCantidades(Object.fromEntries(pendientes.map((l) => [l.codigo, String(l.cantidad).replace('.', ',')])))
    setFechaLlegada(hoy)
    setError(null)
    setAbierto(true)
  }

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      const r = await api<{ recepcion: Recepcion; entradas: number }>('POST', `/pedidos/${pedidoId}/recibir`, {
        fecha: fechaLlegada,
        lineas: pendientes.map((l) => ({ codigo: l.codigo, cantidad: cantidades[l.codigo] ?? '' })),
      })
      setAbierto(false)
      setListo(r.entradas ? `${r.entradas === 1 ? 'Registrada 1 entrada' : `Registradas ${r.entradas} entradas`} del ${dia(fechaLlegada)}. Ya ${r.entradas === 1 ? 'está' : 'están'} en las existencias.` : 'Listo: quedó registrado que no llegó.')
      alGuardar(r.recepcion)
      recargar()
    } catch (e) {
      setError(textoErrores(e))
      if (e instanceof ErrorApi && e.estado === 409) recargar()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-lg font-bold">
          {pendientes.length ? <Truck className="size-5 text-ambar" aria-hidden="true" /> : <PackageCheck className="size-5 text-verde" aria-hidden="true" />}
          {grupo.proveedor}
          <span className="text-chico font-normal text-muted-foreground">{pendientes.length ? `${pendientes.length} de ${grupo.lineas.length} por llegar` : 'llegó todo'}</span>
        </h3>
        {pendientes.length > 0 && !abierto && <Boton variante="primario" tamano="chico" onClick={abrir}>Registrar llegada</Boton>}
      </div>
      {listo && <Aviso tono="ok">{listo}</Aviso>}

      {abierto ? (
        <div className="flex flex-col gap-3">
          <p className="text-chico text-muted-foreground">Las cantidades son las pedidas. Cambie las que llegaron distinto y escriba 0 en lo que no llegó.</p>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[460px] border-collapse text-cuerpo" data-privado>
              <thead>
                <tr className="text-left text-nota text-muted-foreground">
                  <th scope="col" className="border-b border-border px-2 py-2 font-semibold">Producto</th>
                  <th scope="col" className="border-b border-border px-2 py-2 text-right font-semibold">Pedido</th>
                  <th scope="col" className="border-b border-border px-2 py-2 font-semibold">Llegó</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((l) => (
                  <tr key={l.codigo}>
                    <td className="border-b border-[#f0f1ee] px-2 py-2"><span className="block text-nota text-muted-foreground">{l.codigo}</span><span className="font-semibold">{l.nombre || l.codigo}</span></td>
                    <td className="border-b border-[#f0f1ee] px-2 py-2 text-right tabular-nums">{numero(l.cantidad, 2)}</td>
                    <td className="border-b border-[#f0f1ee] px-2 py-2">
                      <input
                        aria-label={`Cantidad que llegó de ${l.nombre || l.codigo}`}
                        inputMode="decimal"
                        value={cantidades[l.codigo] ?? ''}
                        onChange={(e) => setCantidades((c) => ({ ...c, [l.codigo]: e.target.value.replace(/[^\d.,]/g, '') }))}
                        className={cn('h-10 w-24 rounded-lg border bg-card px-2 text-center font-bold tabular-nums focus:border-primary focus:outline-3 focus:outline-ring', cantidades[l.codigo] === '0' ? 'border-ambar' : 'border-input')}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="flex flex-col gap-1.5 text-cuerpo font-semibold">
            Fecha de llegada
            <input type="date" className={cn(claseEntrada, 'max-w-48')} value={fechaLlegada} min={desde.slice(0, 10)} max={hoy} onChange={(e) => e.target.value && setFechaLlegada(e.target.value)} />
          </label>
          {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
          <div className="flex flex-wrap items-center gap-2.5">
            <Boton variante="primario" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar llegada'}</Boton>
            <Boton variante="fantasma" onClick={() => setAbierto(false)} disabled={guardando}>Cancelar</Boton>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-[#f0f1ee] text-chico" data-privado>
          {grupo.lineas.map((l) => (
            <li key={l.codigo} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5">
              <span><strong>{l.codigo}</strong> <span className="text-muted-foreground">{l.nombre}</span></span>
              <span className="tabular-nums">
                {l.recibido
                  ? l.recibido.cantidad > 0
                    ? `${l.recibido.cantidad === 1 ? 'Llegó' : 'Llegaron'} ${numero(l.recibido.cantidad, 2)} de ${numero(l.cantidad, 2)} el ${dia(l.recibido.fecha)}`
                    : `No llegó (se pidieron ${numero(l.cantidad, 2)})`
                  : <span className="text-ambar-texto">En camino: {numero(l.cantidad, 2)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// "Por recibir" en Pedidos: lo que la empresa espera, de cualquier persona.
export function PorRecibir() {
  const [pedidos, setPedidos] = useState<Recepcion[] | null>(null)
  useEffect(() => {
    api<{ pedidos: Recepcion[] }>('GET', '/pedidos/por-recibir').then((r) => setPedidos(r.pedidos)).catch(() => setPedidos([]))
  }, [])
  if (!pedidos || !pedidos.length) return null
  return (
    <Tarjeta aria-labelledby="t-por-recibir" className="flex flex-col gap-4 p-5 sm:p-6">
      <div>
        <h2 id="t-por-recibir" className="text-xl font-bold">Por recibir</h2>
        <p className="mt-1 text-muted-foreground">Pedidos cerrados de su empresa que todavía no han llegado. Cuando llegue la mercancía, registre la llegada y quedará en sus existencias.</p>
      </div>
      {pedidos.map((r) => (
        <div key={r.pedidoId} className="flex flex-col gap-3">
          <p className="font-semibold">
            <Link href={`/pedidos/${r.pedidoId}`} className="text-primary hover:text-primary-hover">Pedido {r.numero}{r.por ? ` de ${r.por}` : ''}</Link>
            <span className="font-normal text-muted-foreground"> · cerrado el {fecha(r.terminadoEn)} · {plural(r.pendientes, 'producto', 'productos')} por llegar</span>
          </p>
          <RecibirPedido recepcion={r} titulo={false} />
        </div>
      ))}
    </Tarjeta>
  )
}
