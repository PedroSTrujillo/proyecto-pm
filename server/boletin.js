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
//
// Qué secciones lleva lo decide cada persona en Mi cuenta (SP7, server/alertas.js): cada tipo de
// alerta es diario, semanal (lunes), mensual (primer día hábil) o nunca. Si ese día no toca
// ninguna sección con algo que decir, no se manda nada y la fila queda como 'sin_novedad'.

const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const { registrarEvento, ErrorUsuario, leerPreferencias } = require('./cuentas');
const { enviarCorreo, correoConfigurado } = require('./correo');
const { fechaBogota, urlApp } = require('./recordatorios');
const { construirInventario } = require('./inventario');
const { enCaminoDe, porRecibirAtrasados } = require('./recepcion');
const { inventarioAlDia, catalogoConEscrito } = require('./movimientos');
const { tiposDeHoy, habilesEntre } = require('./alertas');
const { armarBoletin, seccionesDelDia, resumenDelDia } = require('./boletin-correo');

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

async function inventarioDeEmpresa(empresaId) {
  await inventarioAlDia(empresaId);
  const e = await db.uno(
    `SELECT id, subido_en, reporte, series, catalogo FROM exports
      WHERE empresa_id = $1 AND estado = 'ok' AND ${db.EXPORT_VIGENTE} ORDER BY subido_en DESC, id DESC LIMIT 1`,
    [empresaId],
  );
  if (!e) return null;
  const emp = await db.uno('SELECT nombre, inventario FROM empresas WHERE id = $1', [empresaId]);
  const inv = construirInventario({ reporte: e.reporte, series: e.series, catalogo: await catalogoConEscrito(empresaId, e.catalogo), ajustes: emp.inventario, fuente: { exportId: e.id, fecha: e.subido_en }, alcance: 'completo', enCamino: await enCaminoDe(empresaId) });
  return { inv, empresa: emp.nombre };
}

async function guardarFila(usuarioId, fecha, empresaId, estado, { resumen = null, error = null } = {}) {
  await db.query(
    `INSERT INTO boletines (usuario_id, fecha, empresa_id, estado, resumen, error) VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (usuario_id, fecha) DO UPDATE SET estado = EXCLUDED.estado, resumen = EXCLUDED.resumen, error = EXCLUDED.error, enviado_en = now()`,
    [usuarioId, fecha, empresaId, estado, resumen ? JSON.stringify(resumen) : null, error],
  );
}

// Lo que una sección necesita de la base y no está en el inventario. Se calcula una vez por empresa
// y solo si alguien de la empresa lo recibe hoy.
async function pedidosPorAprobar(empresaId) {
  const filas = await db.query(
    `SELECT p.id, p.enviado_en, u.nombre AS autor, jsonb_array_length(COALESCE(p.lista_final, '[]'::jsonb)) AS lineas,
            (SELECT count(*)::int FROM pedidos q WHERE q.usuario_id = p.usuario_id AND q.id <= p.id AND q.borrado_en IS NULL) AS numero
       FROM pedidos p JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.empresa_id = $1 AND p.modo = 'sugerido' AND p.enviado_en IS NOT NULL AND p.terminado_en IS NULL
        AND p.anulado_en IS NULL AND p.borrado_en IS NULL
      ORDER BY p.enviado_en`,
    [empresaId],
  );
  return filas.map((p) => ({ id: p.id, numero: p.numero, preparadoPor: p.autor, lineas: p.lineas, enviadoDia: fechaBogota(p.enviado_en) }));
}

// Días hábiles desde el último movimiento registrado o el último archivo subido.
async function sinDatosDe(empresaId, hoy) {
  const r = await db.uno(
    `SELECT GREATEST(
        (SELECT max(creado_en) FROM movimientos WHERE empresa_id = $1 AND anulado_en IS NULL),
        (SELECT max(subido_en) FROM exports WHERE empresa_id = $1 AND origen = 'archivo' AND estado = 'ok')) AS ultimo`,
    [empresaId],
  );
  return { dias: r && r.ultimo ? habilesEntre(fechaBogota(r.ultimo), hoy) : 0 };
}

function contextoDeEmpresa(empresaId, inv, hoy) {
  const memo = {};
  const una = (k, fn) => (memo[k] ||= fn());
  return async (tipos) => ({
    inv,
    porAprobar: tipos.includes('porAprobar') ? await una('porAprobar', () => pedidosPorAprobar(empresaId)) : null,
    porRecibir: tipos.includes('porRecibir') ? await una('porRecibir', () => porRecibirAtrasados(empresaId, hoy, fechaBogota)) : null,
    sinDatos: tipos.includes('sinDatos') ? await una('sinDatos', () => sinDatosDe(empresaId, hoy)) : null,
  });
}

/**
 * Manda los boletines de hoy a quienes los activaron y todavía no lo recibieron.
 * soloUsuario + forzar: `npm run boletin -- --email` para revisarlo (aunque ya se haya mandado).
 * Devuelve cuántos se mandaron, cuántos quedaron sin datos, cuántos sin novedad y cuántos fallaron.
 */
async function enviarBoletines({ hoy = fechaBogota(), soloUsuario = null, forzar = false, limiteMs = LIMITE_MS, url = urlApp() } = {}) {
  const inicio = Date.now();
  const r = { enviados: 0, sinDatos: 0, sinNovedad: 0, errores: 0, pendientes: 0 };
  if (!correoConfigurado()) return { ...r, motivo: 'sin correo' };
  const usuarios = await db.query(
    `SELECT u.id, u.nombre, u.email, u.perfil, u.preferencias, u.empresa_id, u.aprueba, u.admin_empresa FROM usuarios u
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
    const contexto = contextoDeEmpresa(empresaId, datos.inv, hoy);
    for (const u of miembros) {
      const tipos = tiposDeHoy({ perfil: u.perfil, preferencias: u.preferencias, aprueba: u.aprueba, admin: u.admin_empresa }, hoy);
      const secciones = seccionesDelDia(tipos, await contexto(tipos));
      // La última vez que se revisó cada tipo: también cuenta un día sin novedad.
      const previo = await db.uno(
        "SELECT resumen FROM boletines WHERE usuario_id = $1 AND fecha < $2 AND estado IN ('enviado', 'sin_novedad') AND resumen IS NOT NULL ORDER BY fecha DESC LIMIT 1",
        [u.id, hoy],
      );
      const anterior = previo && previo.resumen && previo.resumen.tipos ? previo.resumen : null;
      const resumen = resumenDelDia(tipos, secciones, hoy, anterior);
      if (!secciones.length) {
        await guardarFila(u.id, hoy, empresaId, 'sin_novedad', { resumen });
        r.sinNovedad++;
        continue;
      }
      const baja = enlaceBaja(u.id, url);
      const correo = armarBoletin({
        usuario: { nombre: u.nombre, perfil: u.perfil, unidad: leerPreferencias(u.preferencias).unidad },
        empresa: datos.empresa,
        inv: datos.inv,
        secciones,
        previo: anterior,
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
        await registrarEvento(u.id, 'boletin_enviado', { detalle: { fecha: hoy, secciones: secciones.map((x) => x.tipo) } });
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
// Solo apaga el interruptor: las alertas que eligió en Mi cuenta quedan guardadas por si vuelve.
const darDeBaja = async (req, res) => {
  const id = Number(req.query.u);
  if (!Number.isInteger(id) || !firmaValida(id, String(req.query.f || ''))) throw new ErrorUsuario('Este enlace no es válido. Desactive el boletín en Mi cuenta.', 400);
  const u = await db.uno('UPDATE usuarios SET boletin = false WHERE id = $1 RETURNING id', [id]);
  if (u) await registrarEvento(u.id, 'boletin_desactivado', { detalle: { como: 'enlace' } });
  res.type('html').send('<!doctype html><html lang="es"><meta charset="utf-8"><title>SINESC</title><p>Listo: ya no recibirá el boletín diario. Si cambia de opinión, actívelo de nuevo en Mi cuenta.</p></html>');
};
baja.get('/baja', darDeBaja);
baja.post('/baja', darDeBaja);

module.exports = { tareas, baja, enviarBoletines, enlaceBaja, firmaValida };
