// Dirección de la aplicación (el servidor de Express de la raíz del repositorio).
// Al publicar esta página, configura NEXT_PUBLIC_APP_URL con la URL de la app en Render.
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '')

export const URL_CREAR_CUENTA = `${APP_URL}/#/crear-cuenta`
export const URL_ENTRAR = `${APP_URL}/#/entrar`
export const URL_PLANTILLA_EXPORT = `${APP_URL}/plantillas/export.xlsx`
