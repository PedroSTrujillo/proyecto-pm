'use client'

// Preparar un pedido desde lo sugerido (D9 de docs/PLAN_ALPHA_02.md): arranca con todas las líneas
// que sugiere SINESC, agrupadas por proveedor. La persona quita, ajusta, agrega y lo cierra. El
// borrador se guarda solo (PUT /lista-final) y al cerrarlo o enviarlo el servidor mide cuánto de lo
// sugerido quedó tal cual; eso no se muestra aquí (D16).
//
// Aprobación (SP6, D11): si en la empresa alguien aprueba pedidos y quien prepara no, lo envía a
// aprobación. Quien aprueba abre el mismo pedido, puede ajustar las líneas y lo aprueba o lo
// devuelve con un motivo. Cada cambio queda en el historial (server/trazas.js).
//
// Funciona con unas 1.000 líneas de 10 a 15 proveedores sin librerías nuevas: cada proveedor va
// en un Desplegable y solo se dibujan las filas de los que están abiertos.

import { useMemo, useState } from 'react'
import { Copy, FileSpreadsheet, FileText, RotateCcw, Send, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, textoErrores } from '@/lib/api'
import { bajar } from '@/lib/descargar'
import { alcance, claveCodigo, fechaHora, numero, plata, plural } from '@/lib/formato'
import type { Clase, EntradaHistorial, Estado, Producto } from '@/lib/tipos'
import { useInventario, useSesion } from './contexto'
import { useConfirmar } from './confirmar'
import { useAutoguardado } from './autoguardado'
import { EVENTO_POR_APROBAR } from './marco'
import { Aviso, Boton, CLASES, ChipEstado, ChipsProducto, Desplegable, ErrorLista, Pildoras, Tarjeta, claseEntrada } from './ui'
import type { LineaGuardada, Pedido } from './pedido-flujo'

type Fila = {
  clave: string
  codigo: string
  nombre: string
  proveedor: string
  sugerido: number | null // null: no estaba en lo sugerido (lo agregó la persona)
  estado: Estado | null
  semanas: number | null
  existencias: number | null
  costo: number | null // el del catálogo
  precio: string // el de este pedido (T19): empieza en el del catálogo y se puede negociar
  familia: string | null
  clase: Clase | null
  ventaAlta: boolean
  pedidoReciente: Producto['pedidoReciente']
  enCamino: Producto['enCamino']
  cantidad: string
  nota: string
  incluida: boolean
}

// Familia, clase y "pedido hace poco" salen del inventario de hoy (si el producto sigue ahí) o de la foto.
function etiquetas(p: Producto | undefined, foto?: { familia?: string | null; clase?: Clase | null }) {
  return { familia: p?.familia ?? foto?.familia ?? null, clase: p?.clase ?? foto?.clase ?? null, ventaAlta: Boolean(p?.ventaAlta), pedidoReciente: p?.pedidoReciente ?? null, enCamino: p?.enCamino ?? null }
}

type FiltroEstado = 'todos' | 'agota' | 'pide' | 'otros'
const MUCHAS_FILAS = 80 // con más, al entrar solo se abre el primer proveedor

// El precio con el que arranca una línea: el que se guardó en el pedido o, si no, el del catálogo.
const precioInicial = (guardado: number | string | undefined, base: number | null) => String(guardado ?? (base && base > 0 ? base : ''))

// El precio escrito como número, o null si está vacío o no se entiende (entonces vale el del catálogo).
const precioDe = (f: { precio: string }) => {
  const n = f.precio.trim() === '' ? NaN : Number(f.precio.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

const cantidadDe = (t: string) => {
  const n = Number(String(t).replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

function mensajeWhatsapp(proveedor: string, filas: Fila[], empresa?: string) {
  const items = filas.map((f) => `• ${numero(cantidadDe(f.cantidad), 2)} × ${f.nombre || f.codigo} (${f.codigo})${f.nota ? `. ${f.nota}` : ''}`).join('\n')
  const para = proveedor === 'Sin proveedor' ? '' : ` ${proveedor}`
  return `Buenos días${para}. ${empresa ? `Les escribo de ${empresa}. ` : ''}Por favor, nos envían:\n${items}\nQuedo atento a la fecha de entrega. Gracias.`
}

export function PedidoPreparar({ pedido, alCambiar }: { pedido: Pedido; alCambiar: (p: Pedido) => void }) {
  const { inventario } = useInventario()
  const { usuario } = useSesion()
  const { ventana, preguntar, preguntarTexto } = useConfirmar()
  const cerrado = pedido.terminado
  const ap = pedido.aprobacion
  // Quién puede cambiar las líneas: quien lo prepara (si no lo ha enviado) o quien lo aprueba.
  const editable = !cerrado && Boolean(ap && ((ap.esMio && ap.estado !== 'por_aprobar') || ap.puedoAprobar))
  const bloqueado = !editable
  const productos = useMemo(() => new Map((inventario?.productos || []).map((p) => [claveCodigo(p.codigo), p])), [inventario])

  // Las filas: la foto de lo sugerido (marcadas si siguen en la lista) y lo que se agregó.
  const [filas, setFilas] = useState<Fila[]>(() => {
    const final = new Map((pedido.listaFinal || []).map((l) => [claveCodigo(l.codigo), l]))
    const deFoto: Fila[] = (pedido.sugerido || []).map((s) => {
      const clave = claveCodigo(s.codigo)
      const l = final.get(clave)
      return { clave, codigo: s.codigo, nombre: s.nombre, proveedor: s.proveedor || 'Sin proveedor', sugerido: s.cantidad, estado: s.estado, semanas: s.semanas, existencias: s.existencias, costo: s.costo, precio: precioInicial(l?.costo, s.costo), ...etiquetas(productos.get(clave), s), cantidad: String(l ? l.cantidad : s.cantidad), nota: l?.nota || '', incluida: Boolean(l) }
    })
    const enFoto = new Set(deFoto.map((f) => f.clave))
    const agregadas: Fila[] = (pedido.listaFinal || []).filter((l) => !enFoto.has(claveCodigo(l.codigo))).map((l) => {
      const p = productos.get(claveCodigo(l.codigo))
      return { clave: claveCodigo(l.codigo), codigo: l.codigo, nombre: l.nombre || p?.nombre || '', proveedor: l.proveedor || p?.proveedor || 'Sin proveedor', sugerido: null, estado: p?.estado ?? null, semanas: p?.semanas ?? null, existencias: p?.existencias ?? null, costo: p?.costo ?? null, precio: precioInicial(l.costo, p?.costo ?? null), ...etiquetas(p), cantidad: String(l.cantidad), nota: l.nota || '', incluida: true }
    })
    return [...deFoto, ...agregadas]
  })
  const [observaciones, setObservaciones] = useState(pedido.observaciones || '')
  const [q, setQ] = useState('')
  const [proveedor, setProveedor] = useState('todos')
  const [familia, setFamilia] = useState('todas')
  const [clase, setClase] = useState<'todas' | Clase | 'ventaAlta' | 'reciente'>('todas')
  const [estado, setEstado] = useState<FiltroEstado>('todos')
  const [abiertos, setAbiertos] = useState<Set<string>>(() => {
    const nombres = [...new Set(filas.map((f) => f.proveedor))]
    return new Set(filas.length <= MUCHAS_FILAS ? nombres : nombres.slice(0, 1))
  })
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)
  const [porQue, setPorQue] = useState('')
  const [cerrando, setCerrando] = useState(false)

  const lineas = (fs: Fila[] = filas): LineaGuardada[] =>
    fs.filter((f) => f.incluida).map((f) => ({ codigo: f.codigo, nombre: f.nombre, cantidad: f.cantidad, proveedor: f.proveedor === 'Sin proveedor' ? undefined : f.proveedor, ...(f.nota.trim() ? { nota: f.nota.trim() } : {}), ...(precioDe(f) !== null ? { costo: precioDe(f)! } : {}) }))
  // El hook guarda con la versión de esta función del último dibujo: siempre lo más reciente.
  const auto = useAutoguardado(() => api('PUT', `/pedidos/${pedido.id}/lista-final`, { lineas: lineas(), observaciones }))

  function cambiarFilas(fn: (fs: Fila[]) => Fila[]) {
    setFilas((fs) => fn(fs))
    setAviso(null)
    auto.cambio()
  }
  const cambiarFila = (clave: string, cambio: Partial<Fila>) => cambiarFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)))

  // Filtros: por código o nombre, proveedor y estado.
  const texto = q.trim().toLowerCase()
  const visibles = filas.filter((f) =>
    (proveedor === 'todos' || f.proveedor === proveedor) &&
    (familia === 'todas' || f.familia === familia) &&
    (clase === 'todas' || (clase === 'ventaAlta' ? f.ventaAlta : clase === 'reciente' ? Boolean(f.pedidoReciente) : f.clase === clase)) &&
    (estado === 'todos' || (estado === 'otros' ? f.estado !== 'agota' && f.estado !== 'pide' : f.estado === estado)) &&
    (!texto || f.codigo.toLowerCase().includes(texto) || f.nombre.toLowerCase().includes(texto)))
  const grupos = useMemo(() => {
    const m = new Map<string, Fila[]>()
    for (const f of visibles) {
      if (!m.has(f.proveedor)) m.set(f.proveedor, [])
      m.get(f.proveedor)!.push(f)
    }
    return [...m].sort((a, b) => (a[0] === 'Sin proveedor' ? 1 : b[0] === 'Sin proveedor' ? -1 : a[0].localeCompare(b[0], 'es')))
  }, [visibles])
  const nombresProveedores = [...new Set(filas.map((f) => f.proveedor))].sort((a, b) => a.localeCompare(b, 'es'))
  const familias = [...new Set(filas.map((f) => f.familia).filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, 'es'))
  const hayClases = filas.some((f) => f.clase || f.ventaAlta || f.pedidoReciente)

  const conCosto = filas.some((f) => (precioDe(f) ?? 0) > 0)
  const totales = (fs: Fila[]) => {
    const inc = fs.filter((f) => f.incluida)
    return {
      lineas: inc.length,
      unidades: inc.reduce((s, f) => s + (cantidadDe(f.cantidad) || 0), 0),
      valor: inc.reduce((s, f) => s + (cantidadDe(f.cantidad) || 0) * (precioDe(f) ?? 0), 0),
    }
  }
  const total = totales(filas)
  // El mínimo de todo el envío del proveedor (T13): solo avisa, no suma unidades por su cuenta.
  // Importadores (T14): cuánto del contenedor ocupa lo marcado, con las cantidades editadas. Solo si la empresa
  // encendió las importaciones y este proveedor tiene contenedores; las líneas sin medidas no cuentan.
  const ocupacion = (proveedor: string, fs: Fila[]) => {
    const c = inventario?.ajustes.condiciones?.[proveedor]
    if (!inventario?.ajustes.importaciones || !c?.contenedores) return null
    const capacidad = c.contenedores * (c.tipoContenedor === '20' ? 33 : 67) * 0.85 // igual que server/contenedores.js
    let volumen = 0
    let sinMedidas = 0
    for (const f of fs.filter((x) => x.incluida)) {
      const p = productos.get(f.clave)
      if (!p?.volumenPaquete) { sinMedidas++; continue }
      volumen += ((cantidadDe(f.cantidad) || 0) / (p.lote > 0 ? p.lote : 1)) * p.volumenPaquete
    }
    return { ocupa: (volumen / capacidad) * c.contenedores, total: c.contenedores, pasa: volumen > capacidad, sinMedidas }
  }
  const faltaEnvio = (proveedor: string, unidades: number) => Math.max(0, (inventario?.ajustes.condiciones?.[proveedor]?.minimoEnvio ?? 0) - unidades)
  const malas = filas.filter((f) => f.incluida && !(cantidadDe(f.cantidad) > 0))

  function marcarTodas(fs: Fila[], valor: boolean) {
    const claves = new Set(fs.map((f) => f.clave))
    cambiarFilas((todas) => todas.map((f) => (claves.has(f.clave) ? { ...f, incluida: valor } : f)))
  }

  async function volverASugerido() {
    const ok = await preguntar('¿Volver a lo sugerido?', 'Las cantidades y los precios vuelven a los que sugirió SINESC, se marcan todas las líneas sugeridas y se quitan las que agregó. Las notas se conservan.', 'Sí, volver')
    if (!ok) return
    cambiarFilas((fs) => fs.filter((f) => f.sugerido !== null).map((f) => ({ ...f, cantidad: String(f.sugerido), precio: precioInicial(undefined, f.costo), incluida: true })))
  }

  // Descargar desde el pedido guardado: primero se guarda lo pendiente.
  async function descargar(tipo: 'pdf' | 'xlsx', delProveedor?: string) {
    setAviso(null)
    try {
      await auto.ahora()
      await bajar(`/pedidos/${pedido.id}/pedido.${tipo}${delProveedor ? `?proveedor=${encodeURIComponent(delProveedor)}` : ''}`, `pedido-${pedido.numero}.${tipo}`)
      setAviso(tipo === 'pdf' ? 'Listo: el PDF trae el pedido por proveedor, los totales y el espacio para la firma.' : 'Listo: el Excel trae un resumen y una hoja por proveedor.')
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No pudimos armar el archivo.')
    }
  }

  async function copiar(delProveedor: string) {
    const fs = filas.filter((f) => f.proveedor === delProveedor && f.incluida && cantidadDe(f.cantidad) > 0)
    try {
      await navigator.clipboard.writeText(mensajeWhatsapp(delProveedor, fs, usuario?.empresa?.nombre))
      setAviso(`Copiado el mensaje para ${delProveedor === 'Sin proveedor' ? 'su proveedor' : delProveedor}. Péguelo en WhatsApp.`)
    } catch {
      setAviso('Su navegador no dejó copiar. Use el PDF o el Excel de ese proveedor.')
    }
  }

  // Cerrarlo (lo aprueba quien lo prepara, o nadie aprueba en la empresa) o enviarlo a aprobación.
  // En los dos casos primero se guarda la lista: ahí el servidor mide la decisión de quien prepara.
  async function cerrar(como: 'cerrar' | 'enviar') {
    setError(null)
    if (malas.length) return setError({ mensaje: 'Revise la cantidad de estas líneas: tiene que ser un número mayor que 0.', lista: malas.map((f) => `${f.codigo} ${f.nombre}`) })
    const resumen = <p>El pedido tiene <strong>{plural(total.lineas, 'producto', 'productos')}</strong> y {numero(total.unidades, 2)} unidades{conCosto ? `, ${plata(total.valor)} a costo` : ''}.</p>
    const ok = como === 'cerrar'
      ? await preguntar('¿Cerrar el pedido?', <>{resumen}<p className="mt-1">Después ya no se puede cambiar, pero lo puede descargar cuando quiera.</p></>, 'Sí, cerrar')
      : await preguntar('¿Enviarlo a aprobación?', <>{resumen}<p className="mt-1">Lo revisa {ap?.aprobadores.join(' o ')}. Mientras tanto usted no lo puede cambiar; si hace falta, se lo devuelven con un comentario.</p></>, 'Sí, enviar')
    if (!ok) return
    setCerrando(true)
    try {
      auto.cancelar()
      await api('POST', `/pedidos/${pedido.id}/lista-final`, { lineas: lineas(), observaciones })
      const r = await api<{ pedido: Pedido }>('POST', `/pedidos/${pedido.id}/${como === 'cerrar' ? 'por-que' : 'enviar'}`, { respuesta: porQue })
      alCambiar(r.pedido)
    } catch (e) {
      setError(textoErrores(e))
    } finally {
      setCerrando(false)
    }
  }

  async function aprobar() {
    setError(null)
    if (malas.length) return setError({ mensaje: 'Revise la cantidad de estas líneas: tiene que ser un número mayor que 0.', lista: malas.map((f) => `${f.codigo} ${f.nombre}`) })
    const ok = await preguntar('¿Aprobar el pedido?', <p>Queda aprobado a su nombre con <strong>{plural(total.lineas, 'producto', 'productos')}</strong> y {numero(total.unidades, 2)} unidades{conCosto ? `, ${plata(total.valor)} a costo` : ''}. Después ya no se puede cambiar.</p>, 'Sí, aprobar')
    if (!ok) return
    setCerrando(true)
    try {
      await auto.ahora()
      alCambiar((await api<{ pedido: Pedido }>('POST', `/pedidos/${pedido.id}/aprobar`)).pedido)
      window.dispatchEvent(new Event(EVENTO_POR_APROBAR))
    } catch (e) {
      setError(textoErrores(e))
    } finally {
      setCerrando(false)
    }
  }

  async function devolver() {
    setError(null)
    const motivo = await preguntarTexto('¿Devolver el pedido?', `Vuelve a ${ap?.preparadoPor?.nombre || 'quien lo preparó'} con su comentario y con lo que usted haya ajustado.`, 'Qué hay que cambiar', 'Sí, devolver')
    if (motivo === null) return
    setCerrando(true)
    try {
      await auto.ahora()
      alCambiar((await api<{ pedido: Pedido }>('POST', `/pedidos/${pedido.id}/devolver`, { motivo })).pedido)
      window.dispatchEvent(new Event(EVENTO_POR_APROBAR))
    } catch (e) {
      setError(textoErrores(e))
    } finally {
      setCerrando(false)
    }
  }

  // Agregar un producto que no está en la lista.
  const [busca, setBusca] = useState('')
  const enFilas = new Set(filas.map((f) => f.clave))
  const opciones = busca.trim().length >= 2 && inventario
    ? inventario.productos.filter((p) => !enFilas.has(claveCodigo(p.codigo)) && (p.codigo.toLowerCase().includes(busca.toLowerCase()) || p.nombre.toLowerCase().includes(busca.toLowerCase()))).slice(0, 6)
    : []
  function agregar(codigo: string) {
    const p = productos.get(claveCodigo(codigo))
    if (!p) return
    cambiarFilas((fs) => [...fs, { clave: claveCodigo(p.codigo), codigo: p.codigo, nombre: p.nombre, proveedor: p.proveedor || 'Sin proveedor', sugerido: null, estado: p.estado, semanas: p.semanas, existencias: p.existencias, costo: p.costo, precio: precioInicial(undefined, p.costo), ...etiquetas(p), cantidad: String(Math.max(p.sugerido ?? 0, 1)), nota: '', incluida: true }])
    setAbiertos((a) => new Set([...a, p.proveedor || 'Sin proveedor']))
    setBusca('')
  }

  return (
    <>
      {ventana}
      <Tarjeta className="flex flex-col gap-4 p-5 sm:p-6">
        <div>
          <h2 className="text-xl font-bold">{cerrado ? 'Su pedido' : ap?.puedoAprobar && !ap.esMio ? `Pedido de ${ap.preparadoPor?.nombre || 'su equipo'} para aprobar` : ap?.estado === 'por_aprobar' ? 'Enviado a aprobación' : 'Lo que sugiere SINESC, listo para revisar'}</h2>
          <p className="mt-1 text-muted-foreground">
            {cerrado
              ? `${ap?.aprobado ? `Aprobado por ${ap.aprobado.nombre}${ap.aprobado.cargo ? ` (${ap.aprobado.cargo})` : ''} el ${fechaHora(ap.aprobado.en)}` : `Cerrado el ${fechaHora(pedido.terminadoEn)}`}. Descárguelo completo o por proveedor.`
              : ap?.puedoAprobar
                ? 'Revise las líneas y ajuste lo que haga falta: lo que cambie se guarda solo y queda en el historial. Después apruébelo o devuélvalo con un comentario.'
                : ap?.estado === 'por_aprobar'
                  ? `Lo envió el ${fechaHora(ap.enviadoEn)}. Lo aprueba ${ap.aprobadores.join(' o ')}. Mientras tanto no se puede cambiar.`
                  : 'Cubre lo que tarda cada proveedor y el tiempo hasta su siguiente pedido, en 9 de cada 10 casos. Quite lo que no va a pedir, ajuste las cantidades y agregue lo que falte. Lo que cambie se guarda solo.'}
          </p>
        </div>
        {ap?.devuelto && ap.esMio && (
          <Aviso tono="cuidado" titulo={`Se lo devolvieron el ${fechaHora(ap.devuelto.en)}`}>
            {/[.!?]$/.test(ap.devuelto.motivo) ? ap.devuelto.motivo : `${ap.devuelto.motivo}.`} Haga los cambios y vuelva a enviarlo.
          </Aviso>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-live="polite">
          <Cifra titulo="Productos" valor={numero(total.lineas)} destacado />
          <Cifra titulo="Unidades" valor={numero(total.unidades, 2)} />
          <Cifra titulo="Proveedores" valor={numero(new Set(filas.filter((f) => f.incluida).map((f) => f.proveedor)).size)} />
          {conCosto && <Cifra titulo="Valor a costo" valor={plata(total.valor)} />}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {editable && <Boton variante="primario" onClick={() => document.getElementById('cerrar-pedido')?.scrollIntoView({ behavior: 'smooth' })}>{ap?.puedoAprobar ? 'Ir a aprobar' : ap?.puedoCerrar ? 'Ir a cerrar el pedido' : 'Ir a enviar'}</Boton>}
          <Boton variante={cerrado ? 'primario' : 'secundario'} onClick={() => descargar('pdf')} disabled={!total.lineas}><FileText /> PDF del pedido</Boton>
          <Boton onClick={() => descargar('xlsx')} disabled={!total.lineas}><FileSpreadsheet /> Excel por proveedor</Boton>
          {editable && <span className="text-sm text-muted-foreground" aria-live="polite">{auto.estado}</span>}
        </div>
        {aviso && <Aviso tono="ok">{aviso}</Aviso>}
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-0 flex-[1_1_16rem] flex-col gap-1.5 text-sm font-semibold">
              Buscar
              <input className={claseEntrada} placeholder="Código o nombre" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            {nombresProveedores.length > 1 && (
              <label className="flex min-w-0 flex-[1_1_14rem] flex-col gap-1.5 text-sm font-semibold">
                Proveedor
                <select className={claseEntrada} value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
                  <option value="todos">Todos ({nombresProveedores.length})</option>
                  {nombresProveedores.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            )}
            {familias.length > 0 && (
              <label className="flex min-w-0 flex-[1_1_12rem] flex-col gap-1.5 text-sm font-semibold">
                Familia
                <select className={claseEntrada} value={familia} onChange={(e) => setFamilia(e.target.value)}>
                  <option value="todas">Todas ({familias.length})</option>
                  {familias.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
            )}
            {hayClases && (
              <label className="flex min-w-0 flex-[1_1_12rem] flex-col gap-1.5 text-sm font-semibold">
                Cómo se vende
                <select className={claseEntrada} value={clase} onChange={(e) => setClase(e.target.value as typeof clase)}>
                  <option value="todas">Todos</option>
                  {(Object.keys(CLASES) as Clase[]).map((c) => <option key={c} value={c}>{CLASES[c].texto}</option>)}
                  <option value="ventaAlta">Venta alta</option>
                  <option value="reciente">Pedidos en las últimas 2 semanas</option>
                </select>
              </label>
            )}
          </div>
          <Pildoras<FiltroEstado>
            etiqueta="Filtrar por estado"
            valor={estado}
            onCambio={setEstado}
            opciones={[
              { id: 'todos', texto: 'Todos', cuenta: filas.length },
              { id: 'agota', texto: 'Se agotan', cuenta: filas.filter((f) => f.estado === 'agota').length },
              { id: 'pide', texto: 'Pedir ya', cuenta: filas.filter((f) => f.estado === 'pide').length },
              { id: 'otros', texto: 'Los demás', cuenta: filas.filter((f) => f.estado !== 'agota' && f.estado !== 'pide').length },
            ]}
          />
          {editable && visibles.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-chico">
              <span className="text-muted-foreground">{visibles.length === filas.length ? 'Todas las líneas:' : `Las ${numero(visibles.length)} líneas del filtro:`}</span>
              <Boton tamano="chico" onClick={() => marcarTodas(visibles, true)}>Seleccionar todas</Boton>
              <Boton tamano="chico" onClick={() => marcarTodas(visibles, false)}>Ninguna</Boton>
              <Boton tamano="chico" variante="fantasma" onClick={volverASugerido}><RotateCcw /> Volver a lo sugerido</Boton>
            </div>
          )}
        </div>

        {filas.length === 0 && <p className="text-muted-foreground">Hoy SINESC no sugiere pedir nada: todo alcanza hasta el siguiente pedido. Si necesita algo, agréguelo abajo.</p>}
        {filas.length > 0 && visibles.length === 0 && <p className="text-muted-foreground">No hay líneas con ese filtro.</p>}

        <div className="flex flex-col gap-3">
          {grupos.map(([nombre, fs]) => {
            const t = totales(fs)
            const oc = ocupacion(nombre, fs)
            const abierto = abiertos.has(nombre)
            return (
              <Desplegable
                key={nombre}
                abierto={abierto}
                alCambiar={(a) => setAbiertos((x) => { const s = new Set(x); if (a) s.add(nombre); else s.delete(nombre); return s })}
                titulo={
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span>{nombre}</span>
                    <span className="text-chico font-normal text-muted-foreground">
                      {t.lineas} de {fs.length} {fs.length === 1 ? 'línea' : 'líneas'} · {numero(t.unidades, 2)} unidades{conCosto ? ` · ${plata(t.valor)}` : ''}
                    </span>
                    {oc && (
                      <span className={cn('text-chico font-semibold', oc.pasa ? 'text-rojo-texto' : 'text-muted-foreground')}>
                        Ocupa {numero(oc.ocupa, 1)} de {plural(oc.total, 'contenedor', 'contenedores')}{oc.sinMedidas ? ` · ${plural(oc.sinMedidas, 'línea sin medidas no cuenta', 'líneas sin medidas no cuentan')}` : ''}
                      </span>
                    )}
                    {t.lineas > 0 && faltaEnvio(nombre, t.unidades) > 0 && <span className="text-chico font-semibold text-ambar-texto">Faltan {numero(faltaEnvio(nombre, t.unidades), 2)} unidades para el mínimo de envío</span>}
                  </span>
                }
              >
                {abierto && (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {editable && <Boton tamano="chico" onClick={() => marcarTodas(fs, !fs.every((f) => f.incluida))}>{fs.every((f) => f.incluida) ? 'Quitar las de este proveedor' : 'Marcar las de este proveedor'}</Boton>}
                      <Boton tamano="chico" onClick={() => descargar('pdf', nombre)} disabled={!t.lineas}><FileText /> PDF</Boton>
                      <Boton tamano="chico" onClick={() => copiar(nombre)} disabled={!t.lineas}><Copy /> WhatsApp</Boton>
                    </div>
                    <TablaGrupo filas={fs} cerrado={bloqueado} conCosto={conCosto} alCambiar={cambiarFila} />
                  </div>
                )}
              </Desplegable>
            )
          })}
        </div>

        {editable && (
          <div className="relative max-w-md">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Agregar un producto que no está en la lista
              <input className={claseEntrada} placeholder="Código o nombre" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </label>
            {opciones.length > 0 && (
              <ul className="aparecer absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                {opciones.map((p) => (
                  <li key={p.codigo}>
                    <button type="button" className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-muted" onClick={() => agregar(p.codigo)}>
                      <span><span className="block text-nota text-muted-foreground">{p.codigo} · {p.proveedor}</span>{p.nombre}</span>
                      <span className="text-sm whitespace-nowrap text-muted-foreground">{alcance(p.semanas, true)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Tarjeta>

      <Tarjeta id="cerrar-pedido" className="flex flex-col gap-4 p-5 sm:p-6">
        {ap?.puedoAprobar ? (
          <>
            <h2 className="text-xl font-bold">Aprobar el pedido</h2>
            <p className="text-chico text-muted-foreground">
              Lo preparó <strong className="text-foreground">{persona(ap.preparadoPor)}</strong> y lo envió el {fechaHora(ap.enviadoEn)}.
            </p>
            <p className="text-cuerpo"><strong>Observaciones:</strong> {pedido.observaciones || 'Sin observaciones.'}</p>
            {pedido.porQue && <p className="text-chico text-muted-foreground"><strong className="text-foreground">Lo que tuvo en cuenta:</strong> {pedido.porQue}</p>}
            {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
            <div className="flex flex-wrap gap-2.5">
              <Boton variante="primario" onClick={aprobar} disabled={cerrando}>{cerrando ? 'Aprobando…' : 'Aprobar pedido'}</Boton>
              <Boton onClick={devolver} disabled={cerrando}><Undo2 /> Devolver con un comentario</Boton>
            </div>
          </>
        ) : cerrado || !editable ? (
          <>
            <h2 className="text-xl font-bold">Observaciones</h2>
            <p className="text-cuerpo">{pedido.observaciones || 'Sin observaciones.'}</p>
            {pedido.porQue && <p className="text-chico text-muted-foreground"><strong className="text-foreground">Lo que tuvo en cuenta:</strong> {pedido.porQue}</p>}
            {ap?.aprobado && <p className="text-chico text-muted-foreground"><strong className="text-foreground">Aprobado por</strong> {persona(ap.aprobado)} el {fechaHora(ap.aprobado.en)}.</p>}
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold">{ap?.puedoCerrar ? 'Cerrar el pedido' : 'Enviar a aprobación'}</h2>
            <label className="flex flex-col gap-1.5 font-semibold">
              <span>Observaciones para quien recibe el pedido o lo aprueba <span className="font-normal text-muted-foreground">(opcional, van en el PDF y el Excel)</span></span>
              <textarea className={cn(claseEntrada, 'min-h-20 py-3 font-normal')} maxLength={2000} value={observaciones} onChange={(e) => { setObservaciones(e.target.value); auto.cambio() }} />
            </label>
            <label className="flex flex-col gap-1.5 font-semibold">
              <span>¿Qué tuvo en cuenta para decidir su pedido? <span className="font-normal text-muted-foreground">(opcional)</span></span>
              <textarea className={cn(claseEntrada, 'min-h-20 py-3 font-normal')} maxLength={5000} value={porQue} onChange={(e) => setPorQue(e.target.value)} />
            </label>
            {ap?.puedoEnviar && <p className="text-chico text-muted-foreground">Lo aprueba {ap.aprobadores.join(' o ')}. Mientras lo revisa, usted no lo puede cambiar.</p>}
            {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
            <div className="flex flex-wrap gap-2.5">
              {ap?.puedoCerrar && <Boton variante="primario" onClick={() => cerrar('cerrar')} disabled={cerrando}>{cerrando ? 'Guardando…' : usuario?.aprueba ? 'Aprobar y cerrar' : 'Cerrar pedido'}</Boton>}
              {ap?.puedoEnviar && <Boton variante={ap.puedoCerrar ? 'secundario' : 'primario'} onClick={() => cerrar('enviar')} disabled={cerrando}><Send /> {cerrando && !ap.puedoCerrar ? 'Enviando…' : 'Enviar a aprobación'}</Boton>}
            </div>
          </>
        )}
      </Tarjeta>

      {pedido.historial && pedido.historial.length > 0 && (
        <Desplegable titulo={`Historial (${numero(pedido.historial.length)})`}>
          <Historial entradas={pedido.historial} />
        </Desplegable>
      )}
    </>
  )
}

// "Ana Pérez (jefe de compras)"
const persona = (p: { nombre: string; cargo: string } | null | undefined) => (p ? `${p.nombre}${p.cargo ? ` (${p.cargo})` : ''}` : '')

function Historial({ entradas }: { entradas: EntradaHistorial[] }) {
  const cant = (n: number | null) => (n === null ? '' : numero(n, 2))
  return (
    <ol className="flex flex-col divide-y divide-border text-chico" data-privado>
      {entradas.map((h, i) => (
        <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
          <span className="min-w-0">
            <strong>{h.quien}</strong>{' '}
            {h.tipo === 'estado' ? (
              <>{h.texto.charAt(0).toLowerCase() + h.texto.slice(1)}{h.motivo ? `: «${h.motivo}»` : ''}</>
            ) : h.campo === 'costo' ? (
              <>cambió el precio de {h.nombre || h.codigo} ({h.codigo}) de {h.antes === null ? 'sin precio' : plata(h.antes)} a {h.despues === null ? 'sin precio' : plata(h.despues)}</>
            ) : h.antes === null ? (
              <>agregó {h.nombre || h.codigo} ({h.codigo}): {cant(h.despues)}</>
            ) : h.despues === null ? (
              <>quitó {h.nombre || h.codigo} ({h.codigo}), que tenía {cant(h.antes)}</>
            ) : h.antes === h.despues ? (
              <>cambió la nota de {h.nombre || h.codigo} ({h.codigo})</>
            ) : (
              <>cambió {h.nombre || h.codigo} ({h.codigo}) de {cant(h.antes)} a {cant(h.despues)}</>
            )}
            {h.tipo === 'cambio' && h.nota && <span className="text-muted-foreground">. Nota: {h.nota}</span>}
          </span>
          <span className="whitespace-nowrap text-nota text-muted-foreground">{fechaHora(h.en)}</span>
        </li>
      ))}
    </ol>
  )
}

function Cifra({ titulo, valor, destacado }: { titulo: string; valor: string; destacado?: boolean }) {
  return (
    <div className={cn('rounded-xl p-3', destacado ? 'bg-secondary text-secondary-foreground' : 'bg-muted')}>
      <span className={cn('block text-nota font-semibold', !destacado && 'text-muted-foreground')}>{titulo}</span>
      <strong className="font-display text-[1.5rem] whitespace-nowrap tabular-nums">{valor}</strong>
    </div>
  )
}

function TablaGrupo({ filas, cerrado, conCosto, alCambiar }: { filas: Fila[]; cerrado: boolean; conCosto: boolean; alCambiar: (clave: string, cambio: Partial<Fila>) => void }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-cuerpo" data-privado>
        <thead>
          <tr className="text-left text-nota text-muted-foreground">
            <th scope="col" className="w-10 border-b border-border px-2 py-2 font-semibold"><span className="sr-only">Va en el pedido</span></th>
            <th scope="col" className="border-b border-border px-2 py-2 font-semibold">Producto</th>
            <th scope="col" className="border-b border-border px-2 py-2 text-right font-semibold">Alcanza para</th>
            <th scope="col" className="border-b border-border px-2 py-2 text-right font-semibold">Sugerido</th>
            <th scope="col" className="border-b border-border px-2 py-2 font-semibold">Cantidad</th>
            <th scope="col" className="border-b border-border px-2 py-2 font-semibold">Precio unitario</th>
            {conCosto && <th scope="col" className="border-b border-border px-2 py-2 text-right font-semibold">Valor</th>}
            <th scope="col" className="border-b border-border px-2 py-2 font-semibold">Nota</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const c = cantidadDe(f.cantidad)
            const distinta = f.sugerido !== null && c !== f.sugerido
            return (
              <tr key={f.clave} className={cn(!f.incluida && 'text-muted-foreground')}>
                <td className="border-b border-[#f0f1ee] px-2 py-2 align-top">
                  <input type="checkbox" checked={f.incluida} disabled={cerrado} onChange={(e) => alCambiar(f.clave, { incluida: e.target.checked })} aria-label={`Incluir ${f.nombre || f.codigo}`} className="mt-1 size-5 accent-[var(--primary)]" />
                </td>
                <td className="border-b border-[#f0f1ee] px-2 py-2 align-top">
                  <span className="block text-nota text-muted-foreground">{f.codigo}{f.sugerido === null ? ' · agregado' : ''}</span>
                  <span className={cn('font-semibold', f.incluida && 'text-foreground', !f.incluida && 'line-through')}>{f.nombre || f.codigo}</span>
                  {f.estado && <span className="mt-1 block"><ChipEstado estado={f.estado} existencias={f.existencias} /></span>}
                  <ChipsProducto p={f} className="mt-1" />
                </td>
                <td className="border-b border-[#f0f1ee] px-2 py-2 text-right align-top whitespace-nowrap tabular-nums">{f.semanas === null && f.estado === null ? '—' : alcance(f.semanas, true)}</td>
                <td className="border-b border-[#f0f1ee] px-2 py-2 text-right align-top tabular-nums">{f.sugerido === null ? '—' : numero(f.sugerido, 2)}</td>
                <td className="border-b border-[#f0f1ee] px-2 py-2 align-top">
                  <input
                    aria-label={`Cantidad de ${f.nombre || f.codigo}`}
                    inputMode="decimal"
                    value={f.cantidad}
                    disabled={cerrado || !f.incluida}
                    onChange={(e) => alCambiar(f.clave, { cantidad: e.target.value.replace(/[^\d.,]/g, '') })}
                    className={cn('h-10 w-24 rounded-lg border bg-card px-2 text-center font-bold tabular-nums focus:border-primary focus:outline-3 focus:outline-ring disabled:bg-muted', f.incluida && !(c > 0) ? 'border-rojo' : distinta ? 'border-highlight' : 'border-input')}
                  />
                </td>
                <td className="border-b border-[#f0f1ee] px-2 py-2 align-top">
                  <input
                    aria-label={`Precio unitario de ${f.nombre || f.codigo}`}
                    inputMode="decimal"
                    value={f.precio}
                    disabled={cerrado || !f.incluida}
                    placeholder={cerrado ? '' : 'Sin precio'}
                    onChange={(e) => alCambiar(f.clave, { precio: e.target.value.replace(/[^\d.,]/g, '') })}
                    className={cn('h-10 w-28 rounded-lg border bg-card px-2 text-right tabular-nums focus:border-primary focus:outline-3 focus:outline-ring disabled:bg-muted', precioDe(f) !== null && precioDe(f) !== (f.costo ?? null) ? 'border-highlight' : 'border-input')}
                  />
                </td>
                {conCosto && <td className="border-b border-[#f0f1ee] px-2 py-2 text-right align-top whitespace-nowrap tabular-nums">{f.incluida && (precioDe(f) ?? 0) > 0 && c > 0 ? plata(c * precioDe(f)!) : '—'}</td>}
                <td className="border-b border-[#f0f1ee] px-2 py-2 align-top">
                  <input
                    aria-label={`Nota de ${f.nombre || f.codigo}`}
                    value={f.nota}
                    maxLength={200}
                    disabled={cerrado || !f.incluida}
                    placeholder={cerrado ? '' : 'Opcional'}
                    onChange={(e) => alCambiar(f.clave, { nota: e.target.value })}
                    className="h-10 w-full min-w-40 rounded-lg border border-input bg-card px-2.5 text-chico focus:border-primary focus:outline-3 focus:outline-ring disabled:bg-muted"
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
