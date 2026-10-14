// Llamadas a la API de Express, en la misma dirección que la página (en Vercel, pages/api).

export class ErrorApi extends Error {
  estado: number
  datos: { error?: string; errores?: (string | { mensaje: string })[]; [k: string]: unknown }
  constructor(mensaje: string, estado: number, datos: ErrorApi['datos']) {
    super(mensaje)
    this.estado = estado
    this.datos = datos
  }
}

export async function api<T = unknown>(metodo: string, ruta: string, cuerpo?: unknown, opciones: { formulario?: FormData } = {}): Promise<T> {
  const init: RequestInit = { method: metodo, headers: { Accept: 'application/json' }, credentials: 'same-origin' }
  if (opciones.formulario) init.body = opciones.formulario
  else if (cuerpo !== undefined) {
    ;(init.headers as Record<string, string>)['Content-Type'] = 'application/json'
    init.body = JSON.stringify(cuerpo)
  }
  let r: Response
  try {
    r = await fetch(`/api${ruta}`, init)
  } catch {
    throw new ErrorApi('No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.', 0, {})
  }
  let datos: ErrorApi['datos'] = {}
  try {
    datos = await r.json()
  } catch {
    // sin cuerpo
  }
  if (r.status === 401 && !ruta.startsWith('/cuenta/') && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sesion-cerrada'))
  }
  if (r.status === 413) throw new ErrorApi('El archivo es muy pesado para subirlo (más de 4 MB, incluso comprimido). Si es un Excel .xlsx, guárdalo como .xls o .csv, o sube un periodo más corto.', 413, datos)
  if (!r.ok) throw new ErrorApi(datos.error || 'Algo salió mal. Intenta de nuevo.', r.status, datos)
  return datos as T
}

// Vercel no deja pasar peticiones de más de 4,5 MB. Los archivos de más de 300 KB se comprimen
// con gzip antes de subirlos (un .xls o un .csv baja 5 a 10 veces); el servidor los descomprime
// (server/pedidos.js, archivoSubido). Si el navegador no sabe comprimir, va tal cual.
export async function prepararArchivo(archivo: File): Promise<File> {
  if (archivo.size < 300_000 || typeof CompressionStream === 'undefined') return archivo
  try {
    const comprimido = await new Response(archivo.stream().pipeThrough(new CompressionStream('gzip'))).blob()
    if (comprimido.size >= archivo.size) return archivo
    return new File([comprimido], `${archivo.name}.gz`, { type: 'application/gzip' })
  } catch {
    return archivo
  }
}

export function textoErrores(e: unknown): { mensaje: string; lista: string[] } {
  if (e instanceof ErrorApi) {
    const lista = (e.datos.errores || []).map((x) => (typeof x === 'string' ? x : x.mensaje))
    return { mensaje: e.message, lista }
  }
  return { mensaje: e instanceof Error ? e.message : 'Algo salió mal.', lista: [] }
}
