// La API de Express (server/app.js) como una función de Vercel: todo lo que llega a /api/* lo
// atiende la misma aplicación que en local corre server/index.js. Las librerías del servidor
// (express, pg, xlsx…) no se empaquetan: ver serverExternalPackages en next.config.mjs.

import db from '../../../server/db.js'
import { crearApp } from '../../../server/app.js'

export const config = {
  api: { bodyParser: false, externalResolver: true, responseLimit: false },
  maxDuration: 60,
}

let app = null

function cargar() {
  if (!app) {
    app = db
      .iniciar()
      .then(() => crearApp())
      .catch((e) => {
        app = null // el próximo pedido lo vuelve a intentar
        throw e
      })
  }
  return app
}

export default async function manejar(req, res) {
  try {
    const express = await cargar()
    express(req, res)
  } catch (e) {
    console.error('No se pudo iniciar la API:', e)
    res.statusCode = 503
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'El servidor no pudo conectarse a la base de datos. Intenta de nuevo en un momento.' }))
  }
}
