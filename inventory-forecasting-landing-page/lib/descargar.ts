// Pide al servidor un archivo armado con lo que se ve en pantalla y lo descarga.
export async function descargar(ruta: string, cuerpo: unknown, nombre: string) {
  const r = await fetch(`/api${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No pudimos armar el archivo.')
  const url = URL.createObjectURL(await r.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}
