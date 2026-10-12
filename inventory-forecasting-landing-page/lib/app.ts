// La página y la aplicación son un solo sitio (server/index.js sirve las dos con la API), así que
// los enlaces son relativos. Si la página se publica sola (por ejemplo, en Vercel), API_URL en
// next.config.mjs manda /api y /plantillas a la aplicación.

export const URL_CREAR_CUENTA = '/crear-cuenta'
export const URL_ENTRAR = '/entrar'
export const URL_DEMO = '/demo'
export const URL_PLANTILLA_EXPORT = '/plantillas/export.xlsx'
export const URL_PLANTILLA_INVENTARIO = '/plantillas/inventario.xlsx'
