'use strict';

// Recordatorio antes de que un producto se agote: es el stickiness del Entregable 2
// (corrección del 2026-10-07). Después de ver el reporte, el usuario puede pedir que le
// recordemos 3 días antes de que un producto que hoy tiene buen nivel (más de 4 semanas)
// llegue a 2 semanas de inventario.
//
//   fecha en que llega a 2 semanas = fecha del reporte + 7 · (Sᵢ − 2) días
//   fecha del recordatorio         = esa fecha − 3 días
//
// No hay tareas programadas: el recordatorio es un archivo de calendario (.ics) que el
// usuario agrega a su Google Calendar, Outlook o celular, y es su calendario el que avisa.
// Si hay BREVO_API_KEY, la misma invitación le llega además al correo en el momento en que
// dice que sí. Supone que se sigue vendiendo al ritmo del reporte; por eso cada recordatorio
// pide subir un export nuevo para confirmar.

const db = require('./db');
const { registrarEvento } = require('./cuentas');
const { enviarCorreo, correoConfigurado } = require('./correo');
const { diaDe, textoDia } = require('./valores');
const { SEMANAS_SE_AGOTA } = require('./rotacion');

const SEMANAS_BUEN_NIVEL = 4; // solo se sigue lo que hoy tiene más que esto
const DIAS_ANTES = 3;
const DIAS_AGRUPAR = 7; // un recordatorio junta lo que llega al umbral en la misma semana
const SEMANAS_HORIZONTE = 13; // más allá de 3 meses la estimación ya no vale: que suba otro export
const HORA_UTC = 13; // 8 a. m. en Colombia

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
 * Productos que llegan al umbral de "se agota" (2 semanas si el usuario no eligió otro) dentro
 * de los próximos 3 meses, con la fecha de cada recordatorio, del primero al último.
 * fechaReporte: "YYYY-MM-DD", el día en que se subió el export (las existencias son de ese día).
 */
function planearAvisos(filas, fechaReporte, semanasAgota = SEMANAS_SE_AGOTA) {
  const dia0 = diaDeTexto(fechaReporte);
  // Con un umbral alto, lo que tiene 4 semanas ya estaría por debajo: se sigue lo que tiene
  // al menos 2 semanas más que el umbral.
  const buenNivel = Math.max(SEMANAS_BUEN_NIVEL, semanasAgota + 2);
  return filas
    .filter((f) => f.semanasInventario !== null && f.semanasInventario > buenNivel)
    .map((f) => {
      // Hacia abajo: avisar un día antes es mejor que un día tarde.
      const umbral = dia0 + Math.floor(7 * (f.semanasInventario - semanasAgota));
      return {
        codigo: String(f.codigo),
        nombre: f.nombre || '',
        semanas: f.semanasInventario,
        dia: umbral,
        fechaUmbral: textoDia(umbral),
        fechaAviso: textoDia(umbral - DIAS_ANTES),
        semanasAgota,
      };
    })
    .filter((a) => a.dia - dia0 <= SEMANAS_HORIZONTE * 7)
    .sort((a, b) => a.fechaAviso.localeCompare(b.fechaAviso) || a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
    .map(({ dia, ...a }) => a);
}

// Un recordatorio por semana: el primero junta los productos de los 7 días siguientes, y así.
function agruparPorSemana(avisos) {
  const grupos = [];
  for (const a of avisos) {
    const g = grupos[grupos.length - 1];
    if (g && diaDeTexto(a.fechaAviso) - diaDeTexto(g.fecha) < DIAS_AGRUPAR) g.productos.push(a);
    else grupos.push({ fecha: a.fechaAviso, productos: [a] });
  }
  return grupos;
}

const fmtDia = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
function diaLargo(texto) {
  return fmtDia.format(new Date(`${texto}T00:00:00Z`));
}

// Todos los avisos de un plan llevan el mismo umbral.
function umbralDe(g) {
  return g.productos[0].semanasAgota ?? SEMANAS_SE_AGOTA;
}

function tituloGrupo(g) {
  const n = g.productos.length;
  return n === 1
    ? `Revisar inventario: ${g.productos[0].codigo} llega a ${umbralDe(g)} semanas`
    : `Revisar inventario: ${n} productos llegan a ${umbralDe(g)} semanas`;
}

function textoGrupo(g, fechaReporte, url) {
  return [
    `Según su reporte del ${diaLargo(fechaReporte)}, ${g.productos.length === 1 ? 'este producto va' : 'estos productos van'} a quedar con menos de ${umbralDe(g)} semanas de inventario:`,
    '',
    ...g.productos.map((a) => `- ${a.codigo}${a.nombre ? ` (${a.nombre})` : ''}: hacia el ${diaLargo(a.fechaUmbral)}`),
    '',
    'La cuenta supone que sigue vendiendo al mismo ritmo de ese reporte. Para confirmarlo, suba su export más reciente:',
    url,
  ].join('\n');
}

// --- Archivo de calendario (RFC 5545) -----------------------------------------------

function escaparIcs(texto) {
  return String(texto).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Las líneas de un .ics no pueden pasar de 75 bytes: se parten y la continuación empieza con espacio.
function plegar(linea) {
  const partes = [];
  let actual = '';
  let bytes = 0;
  for (const c of linea) {
    const b = Buffer.byteLength(c);
    if (bytes + b > (partes.length ? 74 : 75)) { partes.push(actual); actual = ''; bytes = 0; }
    actual += c;
    bytes += b;
  }
  partes.push(actual);
  return partes.join('\r\n ');
}

function sello(dia, hora = HORA_UTC, minuto = 0) {
  const d = new Date(dia * 86400000 + (hora * 60 + minuto) * 60000);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function calendarioIcs({ avisos, fechaReporte, url, idBase, ahora = new Date() }) {
  const stamp = new Date(ahora).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rotacion de inventario//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  agruparPorSemana(avisos).forEach((g, i) => {
    const dia = diaDeTexto(g.fecha);
    lineas.push(
      'BEGIN:VEVENT',
      `UID:${idBase}-${i + 1}@rotacion-inventario`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${sello(dia)}`,
      `DTEND:${sello(dia, HORA_UTC, 30)}`,
      `SUMMARY:${escaparIcs(tituloGrupo(g))}`,
      `DESCRIPTION:${escaparIcs(textoGrupo(g, fechaReporte, url))}`,
      `URL:${url}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escaparIcs(tituloGrupo(g))}`,
      'TRIGGER:-PT0M',
      'END:VALARM',
      'END:VEVENT',
    );
  });
  lineas.push('END:VCALENDAR');
  return lineas.map(plegar).join('\r\n') + '\r\n';
}

// --- Datos -----------------------------------------------------------------------

async function estadoDe(usuarioId) {
  const r = await db.uno('SELECT pedido_id, activo, fecha_reporte, primer_aviso, respondido_en FROM recordatorios WHERE usuario_id = $1', [usuarioId]);
  if (!r) return null;
  return { activo: r.activo, pedidoId: r.pedido_id, fechaReporte: r.fecha_reporte, primerAviso: r.primer_aviso, respondidoEn: r.respondido_en };
}

/**
 * Guarda la respuesta. Con un "sí" y el correo configurado, manda en ese momento la
 * invitación de calendario. Devuelve { correo: 'enviado' | 'no_configurado' | 'fallo' | null }.
 */
async function responder({ usuario, pedidoId, activo, avisos, fechaReporte }) {
  await db.query(
    `INSERT INTO recordatorios (usuario_id, pedido_id, activo, fecha_reporte, primer_aviso, respondido_en) VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (usuario_id) DO UPDATE SET pedido_id = $2, activo = $3, fecha_reporte = $4, primer_aviso = $5, respondido_en = now()`,
    [usuario.id, pedidoId, activo, fechaReporte, activo && avisos.length ? avisos[0].fechaAviso : null],
  );
  await registrarEvento(usuario.id, 'recordatorio_respondido', { pedidoId, detalle: { activo, productos: avisos.length } });
  if (!activo) return { correo: null };
  if (!correoConfigurado()) return { correo: 'no_configurado' };
  const url = `${urlApp()}/panel`;
  const ics = calendarioIcs({ avisos, fechaReporte, url, idBase: `${usuario.id}-${pedidoId}` });
  const primero = agruparPorSemana(avisos)[0];
  try {
    await enviarCorreo({
      para: usuario.email,
      nombre: usuario.nombre,
      asunto: 'Sus recordatorios de inventario',
      texto: [
        `Hola, ${usuario.nombre}:`,
        '',
        `Adjuntamos los recordatorios para su calendario. El primero es el ${diaLargo(primero.fecha)}:`,
        '',
        textoGrupo(primero, fechaReporte, url),
        '',
        'Abra el archivo adjunto para agregarlos a su calendario.',
      ].join('\n'),
      adjuntos: [{ nombre: 'recordatorios-inventario.ics', contenido: ics }],
    });
    await registrarEvento(usuario.id, 'recordatorio_enviado', { pedidoId, detalle: { productos: avisos.length } });
    return { correo: 'enviado' };
  } catch (e) {
    console.error(`No se pudo enviar el recordatorio a ${usuario.email}:`, e.message);
    return { correo: 'fallo' };
  }
}

function urlApp() {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '';
  return (process.env.APP_URL || vercel || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
}

module.exports = {
  planearAvisos,
  agruparPorSemana,
  calendarioIcs,
  fechaBogota,
  estadoDe,
  responder,
  urlApp,
  SEMANAS_BUEN_NIVEL,
  SEMANAS_HORIZONTE,
  DIAS_ANTES,
};
