'use strict';

// Recordatorio por correo: es el stickiness del Entregable 2 (corrección del 2026-10-07).
// Después de ver el reporte, el usuario puede pedir que le avisemos antes de que un producto
// que hoy tiene buen nivel (más de 4 semanas) llegue a 2 semanas de inventario.
//
//   fecha en que llega a 2 semanas = fecha del reporte + 7 · (Sᵢ − 2) días
//   fecha del aviso                = esa fecha − 3 días
//
// Supone que se sigue vendiendo al ritmo del reporte (d̄ᵢ). Por eso el correo pide subir un
// export nuevo para confirmar, y un reporte nuevo puede reemplazar al anterior.

const db = require('./db');
const { registrarEvento } = require('./cuentas');
const { enviarCorreo } = require('./correo');
const { diaDe, textoDia } = require('./valores');
const { SEMANAS_SE_AGOTA } = require('./rotacion');

const SEMANAS_BUEN_NIVEL = 4; // solo se sigue lo que hoy tiene más que esto
const DIAS_ANTES = 3;
const DIAS_AGRUPAR = 7; // un correo junta lo que llega al umbral en la misma semana
const HORAS_ENTRE_REVISIONES = 1;

// --- Cálculo ---------------------------------------------------------------------

function diaDeTexto(texto) {
  const [a, m, d] = texto.split('-').map(Number);
  return diaDe(a, m, d);
}

// "YYYY-MM-DD" en hora de Colombia: el día que vive el usuario, no el del servidor.
function fechaBogota(instante = new Date()) {
  return new Date(instante).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

/**
 * Productos a seguir y la fecha de cada aviso, ordenados del primero al último.
 * fechaReporte: "YYYY-MM-DD", el día en que se subió el export (las existencias son de ese día).
 */
function planearAvisos(filas, fechaReporte) {
  const dia0 = diaDeTexto(fechaReporte);
  return filas
    .filter((f) => f.semanasInventario !== null && f.semanasInventario > SEMANAS_BUEN_NIVEL)
    .map((f) => {
      // Hacia abajo: avisar un día antes es mejor que un día tarde.
      const umbral = dia0 + Math.floor(7 * (f.semanasInventario - SEMANAS_SE_AGOTA));
      return {
        codigo: String(f.codigo),
        nombre: f.nombre || '',
        semanas: f.semanasInventario,
        fechaUmbral: textoDia(umbral),
        fechaAviso: textoDia(umbral - DIAS_ANTES),
      };
    })
    .sort((a, b) => a.fechaAviso.localeCompare(b.fechaAviso) || a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
}

/**
 * Qué avisos pendientes salen hoy. Si alguno ya llegó a su fecha, se manda un solo correo con
 * ese y con los que llegan en los próximos 7 días, para no escribir más de una vez por semana.
 */
function lotePorEnviar(pendientes, hoy) {
  if (!pendientes.some((a) => a.fechaAviso <= hoy)) return [];
  const limite = textoDia(diaDeTexto(hoy) + DIAS_AGRUPAR);
  return pendientes.filter((a) => a.fechaAviso <= limite);
}

const fmtDia = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
function diaLargo(texto) {
  return fmtDia.format(new Date(`${texto}T00:00:00Z`));
}

function textoCorreo({ nombre, fechaReporte, avisos, url }) {
  const n = avisos.length;
  const asunto = n === 1
    ? `${avisos[0].codigo} llega a ${SEMANAS_SE_AGOTA} semanas de inventario`
    : `${n} productos llegan a ${SEMANAS_SE_AGOTA} semanas de inventario`;
  const lineas = avisos.map((a) => `- ${a.codigo}${a.nombre ? ` (${a.nombre})` : ''}: hacia el ${diaLargo(a.fechaUmbral)}`);
  const texto = [
    `Hola, ${nombre}:`,
    '',
    `Según tu reporte del ${diaLargo(fechaReporte)}, ${n === 1 ? 'este producto va' : 'estos productos van'} a quedar con menos de ${SEMANAS_SE_AGOTA} semanas de inventario:`,
    '',
    ...lineas,
    '',
    'La cuenta supone que sigues vendiendo al mismo ritmo de ese reporte. Si quieres confirmarlo, sube tu export más reciente:',
    url,
    '',
    'Si ya no quieres estos correos, abre el reporte de tu último pedido y elige "Dejar de recibir avisos".',
  ].join('\n');
  return { asunto, texto };
}

// --- Datos -----------------------------------------------------------------------

async function estadoDe(usuarioId) {
  const r = await db.uno('SELECT pedido_id, activo, fecha_reporte, respondido_en FROM recordatorios WHERE usuario_id = $1', [usuarioId]);
  if (!r) return null;
  const pendientes = await db.query('SELECT fecha_aviso FROM avisos WHERE usuario_id = $1 AND enviado_en IS NULL ORDER BY fecha_aviso LIMIT 1', [usuarioId]);
  return {
    activo: r.activo,
    pedidoId: r.pedido_id,
    fechaReporte: r.fecha_reporte,
    respondidoEn: r.respondido_en,
    proximoAviso: pendientes.length ? pendientes[0].fecha_aviso : null,
  };
}

// Guarda la respuesta. Un "sí" reemplaza los avisos pendientes con los de este reporte;
// un "no" los borra. Los ya enviados se quedan, como registro.
async function responder(usuarioId, pedidoId, activo, plan, fechaReporte) {
  await db.tx(async (c) => {
    await c.query(
      `INSERT INTO recordatorios (usuario_id, pedido_id, activo, fecha_reporte, respondido_en) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (usuario_id) DO UPDATE SET pedido_id = $2, activo = $3, fecha_reporte = $4, respondido_en = now()`,
      [usuarioId, pedidoId, activo, fechaReporte],
    );
    await c.query('DELETE FROM avisos WHERE usuario_id = $1 AND enviado_en IS NULL', [usuarioId]);
    if (!activo) return;
    for (const a of plan) {
      await c.query(
        'INSERT INTO avisos (usuario_id, pedido_id, codigo, nombre, semanas, fecha_umbral, fecha_aviso) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [usuarioId, pedidoId, a.codigo, a.nombre, a.semanas, a.fechaUmbral, a.fechaAviso],
      );
    }
  });
  await registrarEvento(usuarioId, 'recordatorio_respondido', { pedidoId, detalle: { activo, productos: plan.length } });
}

// --- Envío -----------------------------------------------------------------------

/**
 * Revisa todos los avisos pendientes y manda los que tocan hoy. Se puede llamar varias veces
 * al día (y desde dos lugares a la vez): cada aviso se marca antes de enviarlo.
 */
async function enviarPendientes({ hoy = fechaBogota(), enviar = enviarCorreo } = {}) {
  const filas = await db.query(
    `SELECT a.id, a.usuario_id, a.codigo, a.nombre, a.fecha_umbral, a.fecha_aviso, r.fecha_reporte, u.email, u.nombre AS usuario
       FROM avisos a
       JOIN recordatorios r ON r.usuario_id = a.usuario_id AND r.activo
       JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.enviado_en IS NULL
      ORDER BY a.usuario_id, a.fecha_aviso, a.codigo`,
  );
  const porUsuario = new Map();
  for (const f of filas) {
    if (!porUsuario.has(f.usuario_id)) porUsuario.set(f.usuario_id, []);
    porUsuario.get(f.usuario_id).push({ ...f, fechaAviso: f.fecha_aviso, fechaUmbral: f.fecha_umbral });
  }

  let enviados = 0;
  for (const [usuarioId, pendientes] of porUsuario) {
    const lote = lotePorEnviar(pendientes, hoy);
    if (!lote.length) continue;
    const ids = lote.map((a) => a.id);
    const tomados = await db.query('UPDATE avisos SET enviado_en = now() WHERE id = ANY($1::int[]) AND enviado_en IS NULL RETURNING id', [ids]);
    if (tomados.length !== ids.length) continue; // otra revisión ya los está mandando
    const { email, usuario, fecha_reporte: fechaReporte } = lote[0];
    const correo = textoCorreo({ nombre: usuario, fechaReporte, avisos: lote, url: `${urlApp()}/#/` });
    try {
      const r = await enviar({ para: email, nombre: usuario, ...correo });
      await registrarEvento(usuarioId, 'recordatorio_enviado', { detalle: { productos: lote.length, codigos: lote.map((a) => a.codigo), asunto: correo.asunto, via: r.via } });
      enviados++;
    } catch (e) {
      await db.query('UPDATE avisos SET enviado_en = NULL WHERE id = ANY($1::int[])', [ids]);
      console.error(`No se pudo enviar el recordatorio a ${email}:`, e.message);
    }
  }
  return { enviados };
}

function urlApp() {
  return (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
}

// Mientras el servidor está despierto, revisa cada hora. En el plan gratis de Render el
// servidor se duerme, así que además conviene llamar POST /api/tareas/recordatorios una vez
// al día desde afuera (ver README).
function programarEnvios() {
  const revisar = () => enviarPendientes().catch((e) => console.error('Error revisando recordatorios:', e));
  setTimeout(revisar, 15000).unref();
  setInterval(revisar, HORAS_ENTRE_REVISIONES * 3600000).unref();
}

module.exports = {
  planearAvisos,
  lotePorEnviar,
  textoCorreo,
  fechaBogota,
  estadoDe,
  responder,
  enviarPendientes,
  programarEnvios,
  SEMANAS_BUEN_NIVEL,
  DIAS_ANTES,
};
