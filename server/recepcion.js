'use strict';

// Lo pedido que todavía no ha llegado ("en camino") y la llegada de un pedido (SP5, Hito 1.3).
//
// Un pedido cerrado espera su mercancía. Al registrar la llegada (POST /api/pedidos/:id/recibir)
// cada línea que llegó crea una entrada en Movimientos con su pedido_id, y queda en
// pedidos.recibido = { clave: { cantidad, fecha, mov, por, en } }. Una línea marcada con 0 ("no
// llegó") se cierra sin entrada. Si alguien anula la entrada en Movimientos, la línea vuelve a
// estar en camino: lo que manda es el movimiento, no la marca.
//
// Lo que sigue en camino se suma a las existencias para el sugerido (posición de inventario, §7 del
// modelo): así no se pide dos veces lo mismo mientras el proveedor despacha.
//
// Los pedidos cerrados antes del SP5 tienen recibido = NULL y no cuentan: nadie iba a registrar su
// llegada. Tampoco cuentan los anulados, los borrados, los simulados (Alpha 0.1) ni los de hace más
// de DIAS_EN_CAMINO (un pedido que nunca se recibió no frena el sugerido para siempre).

const db = require('./db');
const { claveCodigo, leerNumero } = require('./valores');
const { leerAjustes, proveedorDe, SIN_PROVEEDOR, DIAS_HABILES_SEMANA } = require('./inventario');
const { sumarHabiles, habilesEntre } = require('./alertas');

const DIAS_EN_CAMINO = 120; // un importado puede tardar 3 o 4 meses

// Las líneas del pedido con cantidad: el proveedor de la línea o, si no tiene, el de la foto de lo sugerido.
function lineasDelPedido(p) {
  const foto = new Map((p.sugerido || []).map((l) => [claveCodigo(l.codigo), l]));
  const vistas = new Set();
  const out = [];
  for (const l of Array.isArray(p.lista_final) ? p.lista_final : []) {
    const clave = claveCodigo(l && l.codigo);
    const cantidad = leerNumero(l && l.cantidad);
    if (!clave || !(cantidad > 0) || vistas.has(clave)) continue;
    vistas.add(clave);
    const f = foto.get(clave) || {};
    out.push({ clave, codigo: String(l.codigo), nombre: l.nombre || f.nombre || '', cantidad, proveedor: l.proveedor || f.proveedor || null });
  }
  return out;
}

// Una línea ya se recibió si tiene su marca y la entrada no se anuló (o llegó en 0, sin entrada).
function recibidaDe(p, clave, anulados) {
  const r = p.recibido && p.recibido[clave];
  if (!r) return null;
  if (r.mov && anulados.has(r.mov)) return null;
  return r;
}

// Pura: cuánto de cada producto sigue en camino en estos pedidos. { clave: { cantidad, fecha, pedidos } },
// con la fecha del pedido más reciente.
function sumarEnCamino(pedidos, anulados = new Set()) {
  const out = new Map();
  for (const p of pedidos) {
    if (!p.recibido) continue;
    for (const l of lineasDelPedido(p)) {
      if (recibidaDe(p, l.clave, anulados)) continue;
      const e = out.get(l.clave) || { cantidad: 0, fecha: null, pedidos: 0 };
      e.cantidad = Math.round((e.cantidad + l.cantidad) * 1000) / 1000;
      e.pedidos++;
      const f = new Date(p.terminado_en).toISOString();
      if (!e.fecha || f > e.fecha) e.fecha = f;
      out.set(l.clave, e);
    }
  }
  return out;
}

// Los pedidos de la empresa que pueden tener algo en camino.
async function pedidosEsperando(empresaId, { id = null } = {}) {
  return db.query(
    `SELECT p.id, p.usuario_id, p.terminado_en, p.lista_final, p.sugerido, p.recibido, u.nombre AS por,
            (SELECT count(*)::int FROM pedidos q WHERE q.usuario_id = p.usuario_id AND q.id <= p.id AND q.borrado_en IS NULL) AS numero
       FROM pedidos p LEFT JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.empresa_id = $1 AND p.terminado_en IS NOT NULL AND p.recibido IS NOT NULL
        AND p.borrado_en IS NULL AND p.anulado_en IS NULL AND p.tipo IS DISTINCT FROM 'simulado'
        AND p.terminado_en >= now() - make_interval(days => $2::int) ${id ? 'AND p.id = $3' : ''}
      ORDER BY p.terminado_en DESC, p.id DESC`,
    id ? [empresaId, DIAS_EN_CAMINO, id] : [empresaId, DIAS_EN_CAMINO],
  );
}

async function entradasAnuladas(empresaId, pedidoIds) {
  if (!pedidoIds.length) return new Set();
  const filas = await db.query('SELECT id FROM movimientos WHERE empresa_id = $1 AND pedido_id = ANY($2::int[]) AND anulado_en IS NOT NULL', [empresaId, pedidoIds]);
  return new Set(filas.map((f) => f.id));
}

// Lo que la empresa tiene en camino: Map clave → { cantidad, fecha, pedidos }.
async function enCaminoDe(empresaId) {
  const pedidos = await pedidosEsperando(empresaId);
  return sumarEnCamino(pedidos, await entradasAnuladas(empresaId, pedidos.map((p) => p.id)));
}

// Para la llave del inventario guardado en memoria: cambia cuando algo llega o se pide.
function firmaEnCamino(enCamino) {
  return [...enCamino].map(([k, v]) => `${k}:${v.cantidad}`).sort().join('|');
}

// El proveedor de cada línea que no lo trae: el del catálogo de la empresa o el que se asignó en
// Datos (por producto o por el comienzo del código). Sin consultas por línea.
async function conProveedores(empresaId, lineas) {
  const faltan = lineas.filter((l) => !l.proveedor).map((l) => l.clave);
  if (!faltan.length) return lineas;
  const cat = new Map((await db.query('SELECT clave, proveedor FROM productos WHERE empresa_id = $1 AND clave = ANY($2::text[])', [empresaId, faltan])).map((f) => [f.clave, f]));
  const emp = await db.uno('SELECT inventario FROM empresas WHERE id = $1', [empresaId]);
  const ajustes = leerAjustes(emp && emp.inventario);
  return lineas.map((l) => (l.proveedor ? l : { ...l, proveedor: proveedorDe(l.clave, cat.get(l.clave) || {}, ajustes).proveedor }));
}

/**
 * Cómo va la llegada de un pedido, agrupada por proveedor:
 * { pedidoId, numero, por, terminadoEn, pendientes, proveedores: [{ proveedor, lineas: [{ codigo, nombre, cantidad, recibido }] }] }
 */
async function vistaRecepcion(empresaId, p, anulados = null) {
  const anul = anulados || (await entradasAnuladas(empresaId, [p.id]));
  const lineas = await conProveedores(empresaId, lineasDelPedido(p));
  const grupos = new Map();
  let pendientes = 0;
  for (const l of lineas) {
    const r = p.recibido ? recibidaDe(p, l.clave, anul) : null;
    if (!r) pendientes++;
    const prov = l.proveedor || SIN_PROVEEDOR;
    if (!grupos.has(prov)) grupos.set(prov, []);
    grupos.get(prov).push({ codigo: l.codigo, nombre: l.nombre, cantidad: l.cantidad, recibido: r ? { cantidad: r.cantidad, fecha: r.fecha, por: r.por || null } : null });
  }
  const espera = Boolean(p.recibido) && !p.anulado_en && p.tipo !== 'simulado' && Date.now() - new Date(p.terminado_en).getTime() < DIAS_EN_CAMINO * 86400000;
  return {
    pedidoId: p.id,
    numero: p.numero ?? null,
    por: p.por ?? null,
    terminadoEn: p.terminado_en,
    // false: un pedido cerrado antes de que existiera "Registrar llegada", anulado, simulado o de
    // hace más de DIAS_EN_CAMINO; no se espera nada.
    espera,
    pendientes: espera ? pendientes : 0,
    proveedores: [...grupos].map(([proveedor, ls]) => ({ proveedor, lineas: ls })).sort((a, b) => (a.proveedor === SIN_PROVEEDOR) - (b.proveedor === SIN_PROVEEDOR) || a.proveedor.localeCompare(b.proveedor, 'es')),
  };
}

// Los pedidos de la empresa que todavía esperan algo, de cualquier persona (el que recibe la
// mercancía no siempre es el que pidió).
async function porRecibir(empresaId) {
  const pedidos = await pedidosEsperando(empresaId);
  const anulados = await entradasAnuladas(empresaId, pedidos.map((p) => p.id));
  const out = [];
  for (const p of pedidos) {
    const v = await vistaRecepcion(empresaId, p, anulados);
    if (v.pendientes) out.push(v);
  }
  return out;
}

// Los días hábiles que tarda un proveedor: los escritos en Datos o, si no, sus semanas × 5.
function diasDeEntrega(proveedor, ajustes) {
  if (ajustes.entregasDias[proveedor] !== undefined) return ajustes.entregasDias[proveedor];
  const semanas = ajustes.entregas[proveedor] ?? ajustes.entregaPorDefecto;
  return Math.round(semanas * DIAS_HABILES_SEMANA);
}

/**
 * Pura: de lo que espera la empresa (porRecibir), cada proveedor de cada pedido que ya pasó la
 * fecha en que debía llegar (el día del pedido más lo que tarda ese proveedor, en días hábiles).
 * fechaDe: el día "YYYY-MM-DD" de un instante (en Bogotá). Del más atrasado al menos.
 * [{ pedidoId, numero, por, proveedor, pedidoEl, esperado, diasTarde, pendientes }]
 */
function atrasadosDe(esperando, ajustes, hoy, fechaDe) {
  const out = [];
  for (const v of esperando) {
    const pedidoEl = fechaDe(v.terminadoEn);
    for (const g of v.proveedores) {
      const pendientes = g.lineas.filter((l) => !l.recibido).length;
      if (!pendientes) continue;
      const esperado = sumarHabiles(pedidoEl, diasDeEntrega(g.proveedor, ajustes));
      if (hoy <= esperado) continue;
      out.push({ pedidoId: v.pedidoId, numero: v.numero, por: v.por, proveedor: g.proveedor, pedidoEl, esperado, diasTarde: habilesEntre(esperado, hoy), pendientes });
    }
  }
  return out.sort((a, b) => b.diasTarde - a.diasTarde || a.esperado.localeCompare(b.esperado));
}

async function porRecibirAtrasados(empresaId, hoy, fechaDe) {
  const esperando = await porRecibir(empresaId);
  if (!esperando.length) return [];
  const emp = await db.uno('SELECT inventario FROM empresas WHERE id = $1', [empresaId]);
  return atrasadosDe(esperando, leerAjustes(emp && emp.inventario), hoy, fechaDe);
}

module.exports = { DIAS_EN_CAMINO, atrasadosDe, porRecibirAtrasados, diasDeEntrega, lineasDelPedido, sumarEnCamino, enCaminoDe, firmaEnCamino, vistaRecepcion, porRecibir, pedidosEsperando, entradasAnuladas, recibidaDe };
