'use strict';

// Registro de errores, para que el equipo sepa si un probador se tropezó con la aplicación
// (un error del servidor o una pantalla que falló en su navegador). Se ve en "Resultados de la
// prueba". Nunca se guarda el contenido de sus archivos, solo el mensaje y dónde pasó.

const express = require('express');
const db = require('./db');
const { requiereEquipo } = require('./cuentas');
const { limitar } = require('./limites');

function texto(v, max) {
  return String(v ?? '').slice(0, max);
}

async function registrarError({ usuarioId = null, origen, mensaje, ruta = '', detalle = '' }) {
  try {
    await db.query('INSERT INTO errores (usuario_id, origen, mensaje, ruta, detalle) VALUES ($1, $2, $3, $4, $5)', [
      usuarioId, origen, texto(mensaje, 500), texto(ruta, 300), texto(detalle, 4000),
    ]);
  } catch (e) {
    console.error('No se pudo guardar el error:', e.message);
  }
}

const rutas = express.Router();

// Desde el navegador (pantalla de error de la aplicación).
rutas.post('/', limitar({ max: 30, minutos: 10 }), async (req, res) => {
  await registrarError({
    usuarioId: req.usuario ? req.usuario.id : null,
    origen: 'navegador',
    mensaje: req.body?.mensaje || 'Error sin mensaje',
    ruta: req.body?.ruta,
    detalle: req.body?.detalle,
  });
  res.status(204).end();
});

rutas.get('/', requiereEquipo, async (_req, res) => {
  const filas = await db.query(
    `SELECT e.id, e.origen, e.mensaje, e.ruta, e.creado_en, u.email
       FROM errores e LEFT JOIN usuarios u ON u.id = e.usuario_id
      ORDER BY e.creado_en DESC LIMIT 50`,
  );
  res.json({ errores: filas.map((f) => ({ id: f.id, origen: f.origen, mensaje: f.mensaje, ruta: f.ruta, en: f.creado_en, email: f.email })) });
});

module.exports = { rutas, registrarError };
