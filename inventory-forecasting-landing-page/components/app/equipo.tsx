'use client'

// Resultados de la prueba (solo el equipo): veredicto de la hipótesis, stickiness y el detalle
// de cada probador. Todo sale de server/equipo.js.

import { useCallback, useEffect, useState } from 'react'
import { api, textoErrores } from '@/lib/api'
import { dia, fecha, fechaHora, numero, plata, plural } from '@/lib/formato'
import { sistemaPorId } from '@/lib/sistemas'
import { cn } from '@/lib/utils'
import { Aviso, Boton, Cargando, ErrorLista, Tarjeta, Titulo } from './ui'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Datos = { resumen: any; usuarios: any[]; generadoEn: string }

const TEXTO_EVENTO: Record<string, (e: any) => string> = {
  ingreso: () => 'Entró',
  archivo_subido: (e) => (e.detalle?.tipo === 'lista' ? `Importó una lista (${e.detalle.nombre})` : `Subió export${e.detalle?.archivos ? ` (${e.detalle.archivos.join(', ')})` : ''}`),
  lista_inicial_guardada: (e) => `Guardó la lista inicial del pedido #${e.pedidoId}`,
  reporte_visto: (e) => `Vio el reporte del pedido #${e.pedidoId}`,
  lista_final_guardada: (e) => `Guardó la lista final del pedido #${e.pedidoId}${e.detalle ? ` (${e.detalle.total} cambios)` : ''}`,
  pedido_terminado: (e) => `Terminó el pedido #${e.pedidoId}`,
  recordatorio_respondido: (e) => (e.detalle?.activo ? `Pidió recordatorios (${plural(e.detalle.productos, 'producto', 'productos')})` : 'Dijo que no quiere recordatorios'),
  recordatorio_enviado: () => 'Le llegó la invitación de calendario al correo',
  calendario_descargado: (e) => `Descargó los recordatorios del pedido #${e.pedidoId}`,
}

const CATEGORIAS: Record<string, { texto: string; clase: string }> = {
  cumple: { texto: 'Cambió 5 o más líneas', clase: 'bg-verde-fondo text-verde' },
  no_cambia: { texto: 'Cambió 0 o 1 líneas', clase: 'bg-rojo-fondo text-rojo-texto' },
  intermedio: { texto: 'Cambió entre 2 y 4 líneas', clase: 'bg-ambar-fondo text-ambar-texto' },
  sin_pedido: { texto: 'Sin lista final en sus 14 días', clase: 'bg-muted text-foreground/70' },
  por_probar: { texto: 'Cambió por probar la herramienta', clase: 'bg-rojo-fondo text-rojo-texto' },
}

function textoRecordatorio(r: any) {
  if (!r || r.activo === null) return 'sin responder'
  if (!r.activo) return 'no lo quiso'
  const partes = [`sí, el primero el ${dia(r.primerAviso)}`]
  partes.push(r.descargoCalendario ? 'descargó el calendario' : r.correoEnviado ? 'lo recibió por correo' : 'no ha descargado el calendario')
  if (r.yaLlego) partes.push(`entró ${r.ingresosDesdeAviso} ${r.ingresosDesdeAviso === 1 ? 'vez' : 'veces'} desde ese día`)
  return partes.join(' · ')
}

export function Equipo() {
  const [d, setD] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cargar = useCallback(() => {
    api<Datos>('GET', '/equipo/resultados').then(setD).catch((e) => setError(textoErrores(e).mensaje))
  }, [])
  useEffect(cargar, [cargar])
  if (error) return <ErrorLista mensaje={error} />
  if (!d) return <Cargando texto="Cargando resultados…" />
  const r = d.resumen
  const titulos: Record<string, string> = {
    meta_cumplida: `Se cumplió la meta: ${r.cumplen} de ${r.usuarios} cambiaron ${r.reglas.metaLineas} o más líneas`,
    pivotar: `Toca pivotar: ${r.noCambian + (r.porProbar || 0)} de ${r.usuarios} cambiaron 0 o 1 líneas o cambiaron por probar la herramienta`,
    en_curso: 'Todavía no hay resultado',
  }
  const tono = r.veredicto === 'meta_cumplida' ? 'ok' : r.veredicto === 'pivotar' ? 'error' : 'info'

  return (
    <>
      <Titulo sub={`Calculado con los datos guardados el ${fechaHora(d.generadoEn)}.`} acciones={<Boton onClick={cargar}>Actualizar</Boton>}>Resultados de la prueba</Titulo>
      <Aviso tono={tono} titulo={titulos[r.veredicto]}>
        {r.veredicto === 'en_curso' && <p className="font-semibold">Por ahora: {r.cumplen} de {r.usuarios} cambiaron {r.reglas.metaLineas} o más líneas y {r.noCambian} {r.noCambian === 1 ? 'cambió' : 'cambiaron'} 0 o 1{r.sinPedido ? `; ${r.sinPedido} aún no ${r.sinPedido === 1 ? 'guarda' : 'guardan'} su lista final` : ''}.</p>}
        <p>Meta: {r.reglas.metaUsuarios} de {r.usuariosEsperados} usuarios cambian {r.reglas.metaLineas} o más líneas de su pedido en {r.reglas.diasPrueba} días. Pivote: {r.reglas.pivoteUsuarios} o más no cambian ninguna línea o cambian solo una.</p>
        {r.cumplenSinClasificar > 0 && <p className="mt-1 font-semibold">Falta leer y clasificar el &quot;¿por qué?&quot; de {r.cumplenSinClasificar} de los que cambiaron 5 o más líneas: si fue por probar la herramienta, no cuentan para la meta.</p>}
        <p className="mt-1 text-[0.9rem] opacity-90">Lean cada respuesta a &quot;¿por qué cambió?&quot; y márquenla abajo: si cambiaron por probar la herramienta y no porque el dato les pareciera correcto, cuentan para el pivote (plan de prueba, pestaña 2).{r.cumplen ? ` Como apoyo: de los ${r.cumplen} que cumplen, ${r.cumplenCoherentes} movieron la mayoría de sus líneas en la dirección que indica el reporte.` : ''}</p>
      </Aviso>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <Cifra valor={`${r.cumplen} de ${r.usuarios}`} texto={`cambiaron ${r.reglas.metaLineas} o más líneas (meta: ${r.reglas.metaUsuarios})${r.cumplen ? ` · ${r.cumplenReal} real, ${r.cumplenSimulado} simulado` : ''}`} clase="border-verde-borde bg-verde-fondo [&_strong]:text-verde" />
        <Cifra valor={`${r.noCambian} de ${r.usuarios}`} texto={`cambiaron 0 o 1 líneas (pivote si son ${r.reglas.pivoteUsuarios} o más)`} clase="border-rojo-borde bg-rojo-fondo [&_strong]:text-rojo" />
        <Cifra valor={numero(r.intermedios)} texto="cambiaron entre 2 y 4" />
        <Cifra valor={numero(r.porProbar || 0)} texto="cambiaron por probar la herramienta (cuentan para el pivote)" />
        <Cifra valor={numero(r.sinPedido)} texto="aún sin lista final" />
      </div>
      <h2 className="text-xl font-bold">Stickiness: el recordatorio</h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <Cifra valor={`${r.aceptaronRecordatorio} de ${r.usuarios}`} texto="pidieron el recordatorio" />
        <Cifra valor={numero(r.conRecordatorioVencido)} texto="ya pasaron la fecha de su primer recordatorio" />
        <Cifra valor={`${r.volvieronTrasRecordatorio} de ${r.conRecordatorioVencido}`} texto="volvieron a entrar desde ese día" clase="border-verde-borde bg-verde-fondo [&_strong]:text-verde" />
      </div>
      <p className="text-sm text-muted-foreground">
        Para cada usuario se toma el pedido con más líneas cambiadas (agregadas + quitadas + con cantidad distinta) cuya lista final guardó dentro de sus primeros {r.reglas.diasPrueba} días, contados desde que guardó su primera lista inicial.
        {r.usuarios !== r.usuariosEsperados ? ` Hoy hay ${r.usuarios} cuentas de prueba; la meta está pensada para ${r.usuariosEsperados}.` : ''}
      </p>
      {!d.usuarios.length && <Aviso>Todavía no hay usuarios de prueba registrados.</Aviso>}
      {d.usuarios.map((u) => <Probador key={u.id} u={u} />)}
      <ErroresRecientes />
    </>
  )
}

function Cifra({ valor, texto, clase }: { valor: string; texto: string; clase?: string }) {
  return (
    <div className={cn('rounded-2xl border border-border bg-card p-4', clase)}>
      <strong className="font-display text-2xl tabular-nums">{valor}</strong>
      <span className="block text-sm text-muted-foreground">{texto}</span>
    </div>
  )
}

function Probador({ u }: { u: any }) {
  const [enlace, setEnlace] = useState<{ enlace: string; horas: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cat = CATEGORIAS[u.evaluacion.categoria]
  async function generar() {
    try {
      const r = await api<{ enlace: string; horas: number }>('POST', `/equipo/usuarios/${u.id}/restablecer`)
      setEnlace(r)
      navigator.clipboard?.writeText(r.enlace).catch(() => {})
    } catch (e) {
      setError(textoErrores(e).mensaje)
    }
  }
  return (
    <Tarjeta className="flex flex-col gap-4 p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{u.nombre} <span className="text-[0.9rem] font-normal text-muted-foreground">{u.email}</span></h2>
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', cat.clase)}>{cat.texto}</span>
      </header>
      <p className="text-sm text-muted-foreground">
        Programa contable: <strong className="text-foreground">{u.sistema ? (sistemaPorId(u.sistema) || { nombre: u.sistema }).nombre : 'no lo ha dicho'}</strong> ·{' '}
        <button type="button" onClick={generar} className="font-semibold text-primary hover:text-primary-hover">Enlace para que cambie su contraseña</button>
      </p>
      {enlace && (
        <Aviso>
          <p>Mándale este enlace (por ejemplo, por WhatsApp). Sirve una sola vez y durante {enlace.horas} horas. Ya quedó copiado:</p>
          <input readOnly value={enlace.enlace} className="mt-2 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" onFocus={(e) => e.currentTarget.select()} aria-label="Enlace para cambiar la contraseña" />
        </Aviso>
      )}
      {error && <ErrorLista mensaje={error} />}
      <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-[0.93rem]">
        <span>Entró <strong>{u.ingresos}</strong> {u.ingresos === 1 ? 'vez' : 'veces'}{u.ultimoIngreso ? ` (última: ${fechaHora(u.ultimoIngreso)})` : ''}</span>
        <span>Subió <strong>{u.archivosExport}</strong> {u.archivosExport === 1 ? 'archivo' : 'archivos'} de export{u.archivosLista ? ` y ${u.archivosLista} de lista` : ''}</span>
        <span>Días con actividad: <strong>{u.diasConActividad}</strong></span>
        <span>Cuenta creada: {fecha(u.creadoEn)}</span>
        {u.evaluacion.inicio && <span>Sus 14 días: {fecha(u.evaluacion.inicio)} – {fecha(u.evaluacion.fin)}</span>}
        <span>Recordatorio: <strong>{textoRecordatorio(u.recordatorio)}</strong></span>
        <span>Cada cuánto pide: <strong>{u.diasEntrePedidos === null ? 'aún no se sabe (un solo pedido)' : u.diasEntrePedidos < 1 ? 'aún no se sabe (sus pedidos son del mismo día)' : `cada ${numero(u.diasEntrePedidos, 1)} días`}</strong></span>
      </div>
      {u.inventario && (
        <div className="rounded-xl bg-muted px-4 py-3 text-[0.93rem]">
          <strong>Cuánto le cuesta equivocarse</strong> <span className="text-muted-foreground">(último archivo, {fecha(u.inventario.fecha)})</span>
          <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
            <span><strong>{numero(u.inventario.enCero)}</strong> productos que se venden y están en cero</span>
            <span><strong>{numero(u.inventario.seAgotan)}</strong> se agotan en 2 semanas</span>
            <span><strong>{numero(u.inventario.sobran)}</strong> sobran de {numero(u.inventario.productos)}</span>
            {u.inventario.tieneCostos && <span>Dinero quieto: <strong>{plata(u.inventario.dineroQuieto)}</strong> de {plata(u.inventario.valorInventario)}</span>}
          </div>
        </div>
      )}
      {u.pedidos.length ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[980px] border-collapse text-[0.9rem]">
            <thead className="bg-muted text-left text-[0.8rem] text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Pedido</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Lista inicial</th><th className="px-3 py-2">Lista final</th>
                <th className="px-3 py-2 text-right">Agregadas</th><th className="px-3 py-2 text-right">Quitadas</th><th className="px-3 py-2 text-right">Cantidad distinta</th><th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right" title="Cambios en la dirección que indica el reporte">Coherentes con el reporte</th>
                <th className="px-3 py-2 text-right" title="Unidades agregadas, quitadas o cambiadas, sobre las unidades de la lista inicial">Unidades movidas</th>
                <th className="px-3 py-2">¿Por qué cambió?</th>
              </tr>
            </thead>
            <tbody>
              {u.pedidos.map((p: any) => (
                <tr key={p.id} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    #{p.id}{p.proveedor ? ` · ${p.proveedor}` : ''}
                    {p.borrado ? <span className="block text-xs font-semibold text-rojo-texto">Lo borró sin terminar</span> : p.paso < 6 && <span className="block text-xs text-muted-foreground">Va en el paso {p.paso} de 5</span>}
                    {p.finalGuardadaEn && p.dentroDePrueba === false && <span className="block text-xs text-muted-foreground">Fuera de sus 14 días</span>}
                    {u.evaluacion.mejor?.id === p.id && <span className="block text-xs font-semibold text-verde">Es el que cuenta</span>}
                  </td>
                  <td className="px-3 py-2">{p.tipo === 'real' ? 'Real' : p.tipo === 'simulado' ? 'Simulado' : '—'}</td>
                  <td className="px-3 py-2">{fechaHora(p.inicialGuardadaEn)}{p.inicialGuardadaEn && <span className="block text-xs text-muted-foreground">{plural(p.lineasInicial, 'línea', 'líneas')}</span>}</td>
                  <td className="px-3 py-2">{fechaHora(p.finalGuardadaEn)}{p.finalGuardadaEn && <span className="block text-xs text-muted-foreground">{plural(p.lineasFinal, 'línea', 'líneas')}</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.conteo ? p.conteo.agregadas : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.conteo ? p.conteo.quitadas : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.conteo ? p.conteo.cambiadas : '—'}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{p.conteo ? p.conteo.total : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.coherencia?.total ? `${p.coherencia.coherentes} de ${p.coherencia.total}` : '—'}{p.coherencia?.contrarias ? <span className="block text-xs text-muted-foreground">{p.coherencia.contrarias} en contra del reporte</span> : null}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.magnitud && p.magnitud.porcentaje !== null ? `${numero(p.magnitud.porcentaje * 100)} %` : '—'}{p.magnitud && <span className="block text-xs text-muted-foreground">{numero(p.magnitud.unidadesMovidas)} de {numero(p.magnitud.unidadesIniciales)}</span>}</td>
                  <td className="max-w-80 px-3 py-2">
                    <span className="whitespace-pre-line">{p.porQue || '—'}</span>
                    {p.porQue && <Clasificar pedidoId={p.id} inicial={p.clasificacion} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted-foreground">Todavía no ha empezado ningún pedido.</p>
      )}
      {u.actividad.length > 0 && (
        <details>
          <summary className="cursor-pointer font-semibold">Actividad con fecha ({u.actividad.length})</summary>
          <ul className="mt-2 flex flex-col gap-1 text-[0.9rem]">
            {u.actividad.slice().reverse().map((e: any, i: number) => <li key={i}>{fechaHora(e.en)} · {(TEXTO_EVENTO[e.tipo] || (() => e.tipo))(e)}</li>)}
          </ul>
        </details>
      )}
    </Tarjeta>
  )
}

// El equipo lee la respuesta y la marca: es el segundo criterio de pivote del plan de prueba.
function Clasificar({ pedidoId, inicial }: { pedidoId: number; inicial: string | null }) {
  const [valor, setValor] = useState<string | null>(inicial)
  const [guardando, setGuardando] = useState(false)
  async function poner(v: string | null) {
    setGuardando(true)
    try {
      await api('POST', `/equipo/pedidos/${pedidoId}/clasificacion`, { valor: v })
      setValor(v)
    } finally {
      setGuardando(false)
    }
  }
  const opcion = (v: string, texto: string) => (
    <button
      type="button"
      disabled={guardando}
      aria-pressed={valor === v}
      onClick={() => poner(valor === v ? null : v)}
      className={cn('rounded-full border px-2 py-0.5 text-xs font-semibold', valor === v ? (v === 'dato' ? 'border-verde bg-verde-fondo text-verde' : 'border-rojo bg-rojo-fondo text-rojo-texto') : 'border-input bg-card text-muted-foreground hover:bg-muted')}
    >
      {texto}
    </button>
  )
  return (
    <span className="mt-1.5 flex flex-wrap gap-1.5">
      {opcion('dato', 'El dato le sirvió')}
      {opcion('probar', 'Por probar la herramienta')}
    </span>
  )
}

// Si un probador se tropezó con la aplicación, aparece aquí (server/errores.js).
function ErroresRecientes() {
  const [lista, setLista] = useState<any[] | null>(null)
  useEffect(() => {
    api<{ errores: any[] }>('GET', '/errores').then((r) => setLista(r.errores)).catch(() => setLista([]))
  }, [])
  if (!lista) return null
  return (
    <Tarjeta className="flex flex-col gap-2 p-5">
      <h2 className="text-lg font-bold">Errores recientes</h2>
      {lista.length === 0 ? (
        <p className="text-muted-foreground">Ninguno.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-[0.9rem]">
          {lista.map((e) => (
            <li key={e.id} className="border-t border-border pt-1.5 first:border-t-0">
              <span className="text-muted-foreground">{fechaHora(e.en)} · {e.origen === 'servidor' ? 'Servidor' : 'Pantalla'}{e.email ? ` · ${e.email}` : ''}</span>
              <span className="block"><strong>{e.mensaje}</strong> <span className="text-muted-foreground">{e.ruta}</span></span>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  )
}
