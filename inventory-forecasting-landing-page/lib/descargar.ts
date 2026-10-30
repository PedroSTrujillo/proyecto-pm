// Pide al servidor un archivo armado con lo que se ve en pantalla y lo descarga.
export async function descargar(ruta: string, cuerpo: unknown, nombre: string) {
  const r = await fetch(`/api${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
  await guardarRespuesta(r, nombre)
}

// Lo mismo, para un archivo que el servidor arma con lo que tiene guardado (el pedido en PDF o
// Excel). El nombre lo pone el servidor; si no llega, se usa el que se pasa.
export async function bajar(ruta: string, nombre: string) {
  const r = await fetch(`/api${ruta}`, { credentials: 'same-origin' })
  const delServidor = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')
  await guardarRespuesta(r, delServidor ? delServidor[1] : nombre)
}

async function guardarRespuesta(r: Response, nombre: string) {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No pudimos armar el archivo.')
  const url = URL.createObjectURL(await r.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}
