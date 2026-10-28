'use strict';

// Boletín diario por correo con el estado del inventario de la empresa.
//
// Es la única tarea programada de la app (D5 de docs/PLAN_EMPRESAS_INVENTARIO.md; antes el
// equipo había decidido no tener ninguna, 2026-10-11). En Vercel la dispara un Cron una vez al día
// (inventory-forecasting-landing-page/vercel.json) con Authorization: Bearer CRON_SECRET; en local
// o en un servidor propio, `npm run boletin`.
//
//   GET|POST /api/tareas/boletin     manda los boletines de hoy (solo con CRON_SECRET)
//   GET|POST /api/boletin/baja       dejar de recibirlo con un clic, sin iniciar sesión
//
// Llega a quien lo activó (D6). La tabla boletines guarda uno por persona y día: correr la tarea
// dos veces no manda dos correos, y si se corta por tiempo, la siguiente corrida sigue.

const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const { registrarEvento, ErrorUsuario, leerPreferencias } = require('./cuentas');
const { enviarCorreo, correoConfigurado } = require('./correo');
const { fechaBogota, urlApp } = require('./recordatorios');
const { construirInventario } = require('./inventario');
const { inventarioAlDia } = require('./movimientos');
const { armarBoletin, resumenDelDia, cambiosDesde } = require('./boletin-correo');

const TANDA = 20;
const LIMITE_MS = 50000; // se detiene antes del límite de tiempo de una función de Vercel

// --- Enlace para darse de baja ---------------------------------------------------------------

function secreto() {
  return process.env.BOLETIN_SECRETO || process.env.CRON_SECRET || (process.env.NODE_ENV === 'production' ? null : 'sinesc-local');
}

function firma(usuarioId) {
  const s = secreto();
  return s ? crypto.createHmac('sha256', s).update(`baja:${usuarioId}`).digest('base64url').slice(0, 32) : null;
}

function enlaceBaja(usuarioId, url) {
  const f = firma(usuarioId);
  return f ? `${url}/api/boletin/baja?u=${usuarioId}&f=${f}` : null;
}

function firmaValida(usuarioId, f) {
  const esperada = firma(usuarioId);
  if (!esperada || typeof f !== 'string' || f.length !== esperada.length) return false;
  return crypto.timingSafeEqual(Buffer.from(f), Buffer.from(esperada));
}

// --- Envío ------------------------------------------------------------------------------------

function diaAnterior(dia) {
  return new Date(Date.parse(`${dia}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
}

async function inventarioDeEmpresa(empresaId) {
  await inventarioAlDia(empresaId);
  const e = await db.uno(
    `SELECT id, subido_en, reporte, series, catalogo FROM exports
      WHERE empresa_id = $1 AND estado = 'ok' AND ${db.EXPORT_VIGENTE} ORDER BY subido_en DESC, id DESC LIMIT 1`,
    [empresaId],
  );
  if (!e) return null;
  const emp = await db.uno('SELECT nombre, inventario, movimientos_cambiaron_en FROM empresas WHERE id = $1', [empresaId]);
  const inv = construirInventario({ reporte: e.reporte, series: e.series, catalogo: e.catalogo, ajustes: emp.inventario, fuente: { exportId: e.id, fecha: e.subido_en }, alcance: 'completo' });
  return { inv, empresa: emp.nombre, usaMovimientos: Boolean(emp.movimientos_cambiaron_en) };
}

async function guardarFila(usuarioId, fecha, empresaId, estado, { resumen = null, error = null } = {}) {
  await db.query(
    `INSERT INTO boletines (usuario_id, fecha, empresa_id, estado, resumen, error) VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (usuario_id, fecha) DO UPDATE SET estado = EXCLUDED.estado, resumen = EXCLUDED.resumen, error = EXCLUDED.error, enviado_en = now()`,
    [usuarioId, fecha, empresaId, estado, resumen ? JSON.stringify(resumen) : null, error],
  );
}

/**
 * Manda los boletines de hoy a quienes los activaron y todavía no lo recibieron.
 * soloUsuario + forzar: `npm run boletin -- --email` para revisarlo (aunque ya se haya mandado).
 * Devuelve cuántos se mandaron, cuántos quedaron sin datos y cuántos fallaron.
 */
async function enviarBoletines({ hoy = fechaBogota(), soloUsuario = null, forzar = false, limiteMs = LIMITE_MS, url = urlApp() } = {}) {
  const inicio = Date.now();
  const r = { enviados: 0, sinDatos: 0, errores: 0, pendientes: 0 };
  if (!correoConfigurado()) return { ...r, motivo: 'sin correo' };
  const usuarios = await db.query(
    `SELECT u.id, u.nombre, u.email, u.perfil, u.preferencias, u.empresa_id FROM usuarios u
      WHERE u.empresa_id IS NOT NULL AND ${soloUsuario ? 'u.id = $2' : 'u.boletin'}
        ${forzar ? '' : 'AND NOT EXISTS (SELECT 1 FROM boletines b WHERE b.usuario_id = u.id AND b.fecha = $1)'}
      ORDER BY u.empresa_id, u.id`,
    soloUsuario ? [hoy, soloUsuario] : [hoy],
  );
  const porEmpresa = new Map();
  for (const u of usuarios) {
    if (!porEmpresa.has(u.empresa_id)) porEmpresa.set(u.empresa_id, []);
    porEmpresa.get(u.empresa_id).push(u);
  }
  const ayer = diaAnterior(hoy);
  let enTanda = 0;
  for (const [empresaId, miembros] of porEmpresa) {
    if (Date.now() - inicio > limiteMs) {
      r.pendientes += miembros.length;
      continue;
    }
    // El inventario se calcula una vez por empresa.
    const datos = await inventarioDeEmpresa(empresaId);
    if (!datos) {
      // Sin inventario no se manda nada: quien lo activó sabe que llega cuando haya datos (D6).
      for (const u of miembros) await guardarFila(u.id, hoy, empresaId, 'sin_datos');
      r.sinDatos += miembros.length;
      continue;
    }
    const resumen = resumenDelDia(datos.inv);
    const { n: movimientosAyer } = await db.uno('SELECT count(*)::int AS n FROM movimientos WHERE empresa_id = $1 AND fecha = $2 AND anulado_en IS NULL', [empresaId, ayer]);
    for (const u of miembros) {
      const baja = enlaceBaja(u.id, url);
      const previo = await db.uno("SELECT resumen FROM boletines WHERE usuario_id = $1 AND fecha < $2 AND estado = 'enviado' ORDER BY fecha DESC LIMIT 1", [u.id, hoy]);
      const correo = armarBoletin({
        usuario: { nombre: u.nombre, perfil: u.perfil, unidad: leerPreferencias(u.preferencias).unidad },
        empresa: datos.empresa,
        inv: datos.inv,
        cambios: cambiosDesde(previo && previo.resumen, resumen),
        movimientos: { ayer: movimientosAyer, usaMovimientos: datos.usaMovimientos },
        hoy,
        url,
        baja,
      });
      try {
        await enviarCorreo({
          para: u.email,
          nombre: u.nombre,
          asunto: correo.asunto,
          texto: correo.texto,
          html: correo.html,
          encabezados: baja ? { 'List-Unsubscribe': `<${baja}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : null,
        });
        await guardarFila(u.id, hoy, empresaId, 'enviado', { resumen });
        await registrarEvento(u.id, 'boletin_enviado', { detalle: { fecha: hoy } });
        r.enviados++;
      } catch (e) {
        await guardarFila(u.id, hoy, empresaId, 'error', { error: String(e.message).slice(0, 500) });
        r.errores++;
      }
      // Brevo deja unas 10 peticiones por segundo en el plan gratis: una pausa corta cada tanda.
      if (++enTanda % TANDA === 0) await new Promise((ok) => setTimeout(ok, 1000));
    }
  }
  return r;
}

// --- Rutas ------------------------------------------------------------------------------------

const tareas = express.Router();

function exigirCron(req) {
  const esperado = process.env.CRON_SECRET;
  const recibido = String(req.get('authorization') || '');
  const ok = esperado && recibido.length === `Bearer ${esperado}`.length && crypto.timingSafeEqual(Buffer.from(recibido), Buffer.from(`Bearer ${esperado}`));
  if (!ok) throw new ErrorUsuario('No autorizado.', 401);
}

const correrBoletin = async (req, res) => {
  exigirCron(req);
  res.json(await enviarBoletines());
};
tareas.get('/boletin', correrBoletin);
tareas.post('/boletin', correrBoletin);

const baja = express.Router();

// GET: el enlace del correo. POST: el botón "Cancelar suscripción" de Gmail (List-Unsubscribe-Post).
const darDeBaja = async (req, res) => {
  const id = Number(req.query.u);
  if (!Number.isInteger(id) || !firmaValida(id, String(req.query.f || ''))) throw new ErrorUsuario('Este enlace no es válido. Desactiva el boletín en Mi cuenta.', 400);
  const u = await db.uno('UPDATE usuarios SET boletin = false WHERE id = $1 RETURNING id', [id]);
  if (u) await registrarEvento(u.id, 'boletin_desactivado', { detalle: { como: 'enlace' } });
  res.type('html').send('<!doctype html><html lang="es"><meta charset="utf-8"><title>SINESC</title><p>Listo: ya no recibirás el boletín diario. Si cambias de opinión, actívalo de nuevo en Mi cuenta.</p></html>');
};
baja.get('/baja', darDeBaja);
baja.post('/baja', darDeBaja);

module.exports = { tareas, baja, enviarBoletines, enlaceBaja, firmaValida };
