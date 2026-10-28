'use strict';

const path = require('path');
const express = require('express');
const multer = require('multer');
const cuentas = require('./cuentas');
const pedidos = require('./pedidos');
const inventario = require('./inventario-rutas');
const ejemplos = require('./ejemplos');
const exportar = require('./exportar');
const empresas = require('./empresas');
const movimientos = require('./movimientos');
const boletin = require('./boletin');
const { limitar, comprimirJson } = require('./limites');
const errores = require('./errores');
const { plantillaExport, plantillaLista, plantillaInventario } = require('./plantillas');
const { PLANTILLA_EXPORT, PLANTILLA_LISTA, PLANTILLA_INVENTARIO } = require('./formatos');

// La API y las plantillas tienen la política más estricta. Las páginas de Next.js necesitan
// scripts y estilos en línea (así hidrata React); en desarrollo, además, eval y el websocket
// de recarga.
const CSP_API = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
function cspWeb(dev) {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

/**
 * web: el manejador de Next.js (server/index.js). Sin él, se sirve la versión anterior de la
 * aplicación desde public/ (la usan las pruebas automáticas, que no necesitan compilar Next).
 */
function crearApp({ web = null, dev = false } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    const esApi = req.path.startsWith('/api/') || req.path.startsWith('/plantillas/');
    res.setHeader('Content-Security-Policy', !web || esApi ? CSP_API : cspWeb(dev));
    next();
  });

  app.use('/api', express.json({ limit: '5mb' }));
  app.use('/api', comprimirJson);
  // Contra quien prueba contraseñas a la fuerza: la app queda pública desde la página.
  const porCorreo = (req) => req.body && req.body.email;
  app.use('/api/cuenta/entrar', limitar({ max: 8, minutos: 15, clave: porCorreo, mensaje: 'Demasiados intentos para entrar. Espera 15 minutos o pide un enlace para cambiar tu contraseña.' }));
  app.use('/api/cuenta/crear', limitar({ max: 10, minutos: 60 }));
  app.use('/api/cuenta/olvide', limitar({ max: 5, minutos: 60, clave: porCorreo }));
  app.use('/api/cuenta/restablecer', limitar({ max: 10, minutos: 15 }));
  app.use('/api/empresa/invitaciones', limitar({ max: 30, minutos: 60 }));
  app.use('/api/boletin/baja', limitar({ max: 20, minutos: 15 }));

  // Las rutas de la API cargan la sesión; las páginas y los archivos de Next no la necesitan.
  app.use('/api', cuentas.cargarUsuario);
  app.use('/api/cuenta', cuentas.rutas);
  app.use('/api/pedidos', pedidos.rutas);
  app.use('/api/equipo/ejemplos', ejemplos.rutas);
  app.use('/api/inventario', inventario.rutas);
  app.use('/api/demo', inventario.demo);
  app.use('/api/empresa', empresas.rutas);
  app.use('/api/catalogo', movimientos.catalogo);
  app.use('/api/movimientos', movimientos.rutas);
  app.use('/api/existencias', movimientos.existencias);
  app.use('/api/tareas', boletin.tareas);
  app.use('/api/boletin', boletin.baja);
  app.use('/api/exportar', exportar.rutas);
  app.use('/api/errores', errores.rutas);

  const enviarXlsx = (nombre, generar) => async (_req, res) => {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.send(await generar());
  };
  // En Vercel todo llega por /api (next.config.mjs reescribe /plantillas y /salud): por eso
  // también responden con /api adelante.
  for (const base of ['/plantillas', '/api/plantillas']) {
    app.get(`${base}/export.xlsx`, enviarXlsx(PLANTILLA_EXPORT.archivo, plantillaExport));
    app.get(`${base}/lista-pedido.xlsx`, enviarXlsx(PLANTILLA_LISTA.archivo, plantillaLista));
    app.get(`${base}/inventario.xlsx`, enviarXlsx(PLANTILLA_INVENTARIO.archivo, plantillaInventario));
  }

  app.get(['/salud', '/api/salud'], (_req, res) => res.json({ ok: true }));
  app.use('/api', (_req, _res, next) => next(new cuentas.ErrorUsuario('No encontramos eso.', 404)));

  if (web) app.use((req, res) => web(req, res));
  else app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], maxAge: 0 }));

  // Errores: siempre en lenguaje sencillo.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof cuentas.ErrorUsuario) {
      return res.status(err.estado).json({ error: err.message, ...err.extra });
    }
    if (err instanceof multer.MulterError) {
      const mensaje = err.code === 'LIMIT_FILE_SIZE'
        ? 'El archivo es muy grande (máximo 40 MB). Si es un Excel, prueba guardarlo como CSV.'
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Sube como máximo 24 archivos a la vez (por ejemplo, dos años mes por mes).'
          : 'No pudimos recibir el archivo. Intenta de nuevo.';
      return res.status(400).json({ error: mensaje });
    }
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'La lista es demasiado grande.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'No entendimos los datos enviados.' });
    console.error(err);
    errores.registrarError({ usuarioId: req.usuario ? req.usuario.id : null, origen: 'servidor', mensaje: err.message, ruta: `${req.method} ${req.originalUrl}`, detalle: err.stack });
    res.status(500).json({ error: 'Algo salió mal de nuestro lado. Intenta de nuevo en un momento.' });
  });

  return app;
}

module.exports = { crearApp };
