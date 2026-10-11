'use strict';

const path = require('path');
const express = require('express');
const multer = require('multer');
const cuentas = require('./cuentas');
const pedidos = require('./pedidos');
const equipo = require('./equipo');
const { plantillaExport, plantillaLista, plantillaInventario } = require('./plantillas');
const { PLANTILLA_EXPORT, PLANTILLA_LISTA, PLANTILLA_INVENTARIO } = require('./formatos');

function crearApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    next();
  });

  app.use(express.json({ limit: '5mb' }));
  app.use(cuentas.cargarUsuario);

  app.use('/api/cuenta', cuentas.rutas);
  app.use('/api/pedidos', pedidos.rutas);
  app.use('/api/equipo', equipo.rutas);

  const enviarXlsx = (nombre, generar) => (_req, res) => {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.send(generar());
  };
  app.get('/plantillas/export.xlsx', enviarXlsx(PLANTILLA_EXPORT.archivo, plantillaExport));
  app.get('/plantillas/lista-pedido.xlsx', enviarXlsx(PLANTILLA_LISTA.archivo, plantillaLista));
  app.get('/plantillas/inventario.xlsx', enviarXlsx(PLANTILLA_INVENTARIO.archivo, plantillaInventario));

  app.get('/salud', (_req, res) => res.json({ ok: true }));
  app.use('/api', (_req, _res, next) => next(new cuentas.ErrorUsuario('No encontramos eso.', 404)));
  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], maxAge: 0 }));

  // Errores: siempre en lenguaje sencillo.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof cuentas.ErrorUsuario) {
      return res.status(err.estado).json({ error: err.message, ...err.extra });
    }
    if (err instanceof multer.MulterError) {
      const mensaje = err.code === 'LIMIT_FILE_SIZE'
        ? 'El archivo es muy grande (máximo 40 MB). Si es un Excel, prueba guardarlo como CSV.'
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Sube como máximo 5 archivos a la vez.'
          : 'No pudimos recibir el archivo. Intenta de nuevo.';
      return res.status(400).json({ error: mensaje });
    }
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'La lista es demasiado grande.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'No entendimos los datos enviados.' });
    console.error(err);
    res.status(500).json({ error: 'Algo salió mal de nuestro lado. Intenta de nuevo en un momento.' });
  });

  return app;
}

module.exports = { crearApp };
