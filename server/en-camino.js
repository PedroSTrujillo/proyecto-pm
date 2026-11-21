'use strict';

// Lo que ya se pidió: la etiqueta "Pedido: N" y lo "en camino" que se suma a las existencias para el
// sugerido y el "pida ya" (T5 de docs/PLAN_CAMBIOS_SINESC.md, §10 de docs/modelo-rotacion.md).
//
// Un pedido no cambia las existencias ni deja nada por marcar. Un pedido cerrado (aprobado, o cerrado
// por quien lo preparó si nadie aprueba) cuenta como "en camino" mientras no entre la mercancía: se le
// restan las entradas del producto que se registren en Movimientos desde el día del pedido, y deja de
// contar solo cuando pasan 14 días o lo que tarda el proveedor, si es más.
//
// shortcut: solo cuenta el pedido más reciente de cada producto, y si la mercancía entra únicamente por
// un archivo de inventario nuevo (sin registrar la entrada) sigue contando hasta que venza la ventana.
// Subir a sumar varios pedidos o a mirar las existencias del archivo si lo piden.

const db = require('./db');
const { claveCodigo, leerNumero } = require('./valores');
const { leerAjustes, proveedorDe, DIAS_HABILES_SEMANA } = require('./inventario');
const { fechaBogota } = require('./recordatorios');

const DIAS_MINIMOS = 14;
const DIAS_MAXIMOS = 120; // un importado puede tardar 3 o 4 meses: tope de la consulta

// Cuántos días corridos se considera reciente un pedido de este producto: 14, o lo que tarda su
// proveedor (en días hábiles o en semanas) si es más.
function ventanaDe(clave, producto, ajustes) {
  const { proveedor } = proveedorDe(clave, producto || {}, ajustes);
  const dias = ajustes.entregasDias[proveedor] !== undefined
    ? (ajustes.entregasDias[proveedor] * 7) / DIAS_HABILES_SEMANA
    : (ajustes.entregas[proveedor] ?? ajustes.entregaPorDefecto) * 7;
  return Math.max(DIAS_MINIMOS, Math.ceil(dias));
}

/**
 * Lo último que se pidió de cada producto y que sigue dentro de su ventana, por cualquier persona de
 * la empresa (pedidos cerrados, sin borrados, anulados ni simulados): { clave: { fecha, cantidad,
 * numero, por } }. Sirve para la etiqueta "Pedido: N" y para no pedir dos veces lo mismo.
 */
async function pedidosRecientes(empresaId) {
  const filas = await db.query(
    `SELECT p.id, p.terminado_en, p.lista_final, u.nombre AS por,
            (SELECT count(*)::int FROM pedidos q WHERE q.usuario_id = p.usuario_id AND q.id <= p.id AND q.borrado_en IS NULL) AS numero
       FROM pedidos p LEFT JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.empresa_id = $1 AND p.terminado_en IS NOT NULL AND p.terminado_en >= now() - make_interval(days => $2::int)
        AND p.borrado_en IS NULL AND p.anulado_en IS NULL AND p.tipo IS DISTINCT FROM 'simulado'
      ORDER BY p.terminado_en DESC, p.id DESC`,
    [empresaId, DIAS_MAXIMOS],
  );
  const out = new Map();
  for (const f of filas) {
    for (const l of Array.isArray(f.lista_final) ? f.lista_final : []) {
      const k = claveCodigo(l && l.codigo);
      const cantidad = leerNumero(l && l.cantidad);
      if (!k || out.has(k) || !(cantidad > 0)) continue;
      out.set(k, { fecha: f.terminado_en, cantidad, numero: f.numero, por: f.por || null });
    }
  }
  if (!out.size) return out;
  const emp = await db.uno('SELECT inventario FROM empresas WHERE id = $1', [empresaId]);
  const ajustes = leerAjustes(emp && emp.inventario);
  const catalogo = new Map((await db.query('SELECT clave, proveedor FROM productos WHERE empresa_id = $1 AND clave = ANY($2::text[])', [empresaId, [...out.keys()]])).map((f) => [f.clave, f]));
  const ahora = Date.now();
  for (const [k, v] of out) {
    if ((ahora - new Date(v.fecha).getTime()) / 86400000 > ventanaDe(k, catalogo.get(k), ajustes)) out.delete(k);
  }
  return out;
}

// Lo que la empresa tiene en camino: Map clave → { cantidad, fecha }, lo pedido menos las entradas
// registradas desde el día del pedido. `recientes` se puede pasar si ya se calculó.
async function enCaminoDe(empresaId, recientes = null) {
  const pedidos = recientes || (await pedidosRecientes(empresaId));
  const out = new Map();
  if (!pedidos.size) return out;
  const dia = (v) => fechaBogota(new Date(v.fecha));
  const desde = [...pedidos.values()].map(dia).sort()[0];
  const entradas = await db.query(
    `SELECT pr.clave, m.fecha, m.cantidad
       FROM movimientos m JOIN productos pr ON pr.id = m.producto_id
      WHERE m.empresa_id = $1 AND m.tipo = 'entrada' AND m.anulado_en IS NULL AND m.fecha >= $2 AND pr.clave = ANY($3::text[])`,
    [empresaId, desde, [...pedidos.keys()]],
  );
  for (const [k, v] of pedidos) {
    const d = dia(v);
    const llegado = entradas.filter((e) => e.clave === k && e.fecha >= d).reduce((s, e) => s + Number(e.cantidad), 0);
    const falta = Math.round((v.cantidad - llegado) * 1000) / 1000;
    if (falta > 0) out.set(k, { cantidad: falta, fecha: new Date(v.fecha).toISOString() });
  }
  return out;
}

// Para la llave del inventario guardado en memoria: cambia cuando algo entra o se pide.
function firmaEnCamino(enCamino) {
  return [...enCamino].map(([k, v]) => `${k}:${v.cantidad}`).sort().join('|');
}

module.exports = { pedidosRecientes, enCaminoDe, firmaEnCamino, ventanaDe };
