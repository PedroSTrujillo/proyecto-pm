'use strict';

// Trazabilidad de un pedido (SP6 de docs/PLAN_ALPHA_02.md): quién cambió qué línea, cuándo y por
// qué. El servidor compara la lista guardada con la que llega en cada guardado, así que no depende
// de la pantalla. Una persona que escribe "1", "12", "120" en la misma línea deja una sola fila:
// los cambios de la misma persona sobre el mismo código en 10 minutos se juntan.
//
// El historial que ve el pedido junta estas filas con los eventos del pedido (creado, enviado,
// devuelto, aprobado, cerrado, anulado) de la tabla eventos.

const db = require('./db');
const { claveCodigo, leerNumero } = require('./valores');

const MINUTOS_JUNTAR = 10;
const MAX_HISTORIAL = 300;

// La cantidad de una línea como número (las del borrador pueden venir como texto). undefined si no
// se entiende todavía (por ejemplo, "1," mientras se escribe): ese cambio no se anota.
function cantidadDe(l) {
  if (typeof l.cantidad === 'number') return Number.isFinite(l.cantidad) ? l.cantidad : undefined;
  const n = leerNumero(l.cantidad);
  return n === null ? undefined : n;
}

/**
 * Las líneas que cambiaron entre dos listas, por código: [{ clave, codigo, nombre, antes, despues,
 * nota, cambioNota }]. antes/despues = null si la línea no estaba;
 * campo = null (la cantidad) o 'costo' (el precio de la línea, T19). Función pura.
 */
function diferencias(antes, despues) {
  const mapa = (ls) => new Map((ls || []).filter((l) => l && claveCodigo(l.codigo)).map((l) => [claveCodigo(l.codigo), l]));
  const a = mapa(antes);
  const d = mapa(despues);
  const out = [];
  for (const clave of new Set([...a.keys(), ...d.keys()])) {
    const la = a.get(clave);
    const ld = d.get(clave);
    const ca = la ? cantidadDe(la) : null;
    const cd = ld ? cantidadDe(ld) : null;
    if (ca === undefined || cd === undefined) continue;
    const notaA = (la && la.nota) || '';
    const notaD = (ld && ld.nota) || '';
    const l = ld || la;
    const base = { clave, codigo: String(l.codigo).slice(0, 100), nombre: String(l.nombre || '').slice(0, 200) };
    if (ca !== cd || notaA !== notaD) out.push({ ...base, campo: null, antes: ca, despues: cd, nota: notaD || null, cambioNota: notaA !== notaD });
    // El precio de la línea (T19), solo si está en las dos listas: agregarla o quitarla ya lo dice la cantidad.
    const pa = la && Number.isFinite(la.costo) ? la.costo : null;
    const pd = ld && Number.isFinite(ld.costo) ? ld.costo : null;
    if (la && ld && pa !== pd) out.push({ ...base, campo: 'costo', antes: pa, despues: pd, nota: null, cambioNota: false });
  }
  return out;
}

const igual = (x, y) => (x === null || x === undefined ? y === null || y === undefined : y !== null && y !== undefined && Number(x) === Number(y));

/**
 * Anota los cambios de una persona sobre la lista de un pedido. Si ya hay una fila suya del mismo
 * código de hace menos de 10 minutos, la actualiza (conserva el "antes" de la primera); si con eso
 * la cantidad vuelve a la de antes y no cambió la nota, la borra.
 */
async function anotarCambios(pedidoId, usuarioId, antes, despues, cliente = null) {
  const cambios = diferencias(antes, despues);
  if (!cambios.length) return 0;
  const q = cliente ? (s, p) => cliente.query(s, p).then((r) => r.rows) : db.query;
  const recientes = await q(
    `SELECT id, codigo, campo, antes, nota FROM pedido_cambios
      WHERE pedido_id = $1 AND usuario_id = $2 AND creado_en > now() - interval '${MINUTOS_JUNTAR} minutes'
      ORDER BY creado_en DESC`,
    [pedidoId, usuarioId],
  );
  const porClave = new Map();
  // Una fila por código y por campo: la cantidad y el precio de una línea se anotan aparte.
  const llave = (codigo, campo) => `${claveCodigo(codigo)}|${campo || ''}`;
  for (const r of recientes) if (!porClave.has(llave(r.codigo, r.campo))) porClave.set(llave(r.codigo, r.campo), r);
  for (const c of cambios) {
    const previa = porClave.get(llave(c.clave, c.campo));
    if (previa) {
      if (igual(previa.antes, c.despues) && !c.cambioNota && !previa.nota) await q('DELETE FROM pedido_cambios WHERE id = $1', [previa.id]);
      else await q('UPDATE pedido_cambios SET despues = $1, nota = $2, nombre = $3, creado_en = now() WHERE id = $4', [c.despues, c.nota, c.nombre, previa.id]);
    } else {
      await q('INSERT INTO pedido_cambios (pedido_id, usuario_id, codigo, nombre, antes, despues, nota, campo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [pedidoId, usuarioId, c.codigo, c.nombre, c.antes, c.despues, c.nota, c.campo]);
    }
  }
  return cambios.length;
}

// Los eventos del pedido que van en el historial, con lo que dice cada uno.
const EVENTOS = {
  pedido_iniciado: 'Empezó el pedido',
  pedido_enviado: 'Lo envió a aprobación',
  pedido_devuelto: 'Lo devolvió',
  pedido_aprobado: 'Lo aprobó',
  pedido_terminado: 'Cerró el pedido',
  pedido_anulado: 'Lo anuló',
  pedido_reactivado: 'Lo reactivó',
  pedido_recibido: 'Registró la llegada',
};

const numeroO = (v) => (v === null || v === undefined ? null : Number(v));

/**
 * El historial de un pedido, del más reciente al más viejo: [{ en, quien, tipo: 'cambio' | 'estado',
 * texto?, codigo?, nombre?, antes?, despues?, nota?, motivo? }].
 */
async function historial(pedidoId) {
  const cambios = await db.query(
    `SELECT c.creado_en, c.codigo, c.campo, c.nombre, c.antes, c.despues, c.nota, u.nombre AS quien
       FROM pedido_cambios c LEFT JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.pedido_id = $1 ORDER BY c.creado_en DESC LIMIT ${MAX_HISTORIAL}`,
    [pedidoId],
  );
  const eventos = await db.query(
    `SELECT e.creado_en, e.tipo, e.detalle, u.nombre AS quien
       FROM eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id
      WHERE e.pedido_id = $1 AND e.tipo = ANY($2::text[]) ORDER BY e.creado_en DESC LIMIT ${MAX_HISTORIAL}`,
    [pedidoId, Object.keys(EVENTOS)],
  );
  return [
    ...cambios.map((c) => ({ en: c.creado_en, quien: c.quien || 'Alguien que ya no está', tipo: 'cambio', campo: c.campo || null, codigo: c.codigo, nombre: c.nombre, antes: numeroO(c.antes), despues: numeroO(c.despues), nota: c.nota || '' })),
    ...eventos.map((e) => ({ en: e.creado_en, quien: e.quien || 'Alguien que ya no está', tipo: 'estado', texto: EVENTOS[e.tipo], motivo: (e.detalle && e.detalle.motivo) || '' })),
  ]
    .sort((x, y) => new Date(y.en) - new Date(x.en))
    .slice(0, MAX_HISTORIAL);
}

module.exports = { diferencias, anotarCambios, historial, MINUTOS_JUNTAR };
