// Llamadas a la API de Express (misma dirección: server/index.js sirve las dos cosas).

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
  if (!r.ok) throw new ErrorApi(datos.error || 'Algo salió mal. Intenta de nuevo.', r.status, datos)
  return datos as T
}

export function textoErrores(e: unknown): { mensaje: string; lista: string[] } {
  if (e instanceof ErrorApi) {
    const lista = (e.datos.errores || []).map((x) => (typeof x === 'string' ? x : x.mensaje))
    return { mensaje: e.message, lista }
  }
  return { mensaje: e instanceof Error ? e.message : 'Algo salió mal.', lista: [] }
}
