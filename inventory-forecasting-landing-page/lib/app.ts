// Dirección de la aplicación (el servidor de Express de la raíz del repositorio).
// En producción apunta a la app en Render y en desarrollo al servidor local.
// NEXT_PUBLIC_APP_URL es opcional: si está definida, reemplaza a ambas.
const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.NODE_ENV === 'production' ? 'https://rotacion-inventario.onrender.com' : 'http://localhost:3000')
).replace(/\/+$/, '')

export const URL_CREAR_CUENTA = `${APP_URL}/#/crear-cuenta`
export const URL_ENTRAR = `${APP_URL}/#/entrar`
export const URL_PLANTILLA_EXPORT = `${APP_URL}/plantillas/export.xlsx`
