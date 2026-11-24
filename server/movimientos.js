'use strict';

// Inventario diario de la empresa: catálogo de productos, entradas y salidas, existencias de hoy
// y el inventario "al día" que combina el último archivo con lo registrado después.
//
//   GET  /api/catalogo?q=               productos de la empresa (para buscar al registrar)
//   POST /api/catalogo                  crear un producto
//   PUT  /api/catalogo/:id              corregir nombre, costo, proveedor, unidad, familia, múltiplo o mínimo
//   POST /api/catalogo/lote             familia, múltiplo y mínimo de varios productos a la vez (pegados de Excel)
//   POST /api/movimientos               registrar uno o varios movimientos (todo o nada); una venta
//                                       con `desde` es el total de un periodo (desde → fecha)
//   POST /api/movimientos/importar      leer código y cantidad de un archivo (no guarda nada)
//   GET  /api/movimientos               historial (?desde=&hasta=&codigo=)
//   POST /api/movimientos/:id/anular    anular uno (no se borra)
//   GET  /api/existencias               existencias de hoy por producto
//   GET  /api/existencias/:codigo       historial de un producto con su saldo (kardex)
//
// Los movimientos no reemplazan el archivo del programa contable: producen un export más, de
// origen 'movimientos', con la misma forma. Así el panel, los productos, el pedido sugerido y el
// flujo de 5 pasos ("usar el último inventario") funcionan sin cambios (D8: el modelo sigue en semanas).

const express = require('express');
const db = require('./db');
const { requiereUsuario, requiereAdminEmpresa, requiereProveedores, rolEmpresa, registrarEvento, ErrorUsuario } = require('./cuentas');
const { calcularRotacion } = require('./rotacion');
const { seriesSemanales } = require('./series');
const { leerAjustes } = require('./inventario');
const { fechaBogota } = require('./recordatorios');
const { claveCodigo, leerNumero, MS_DIA, diaHoy } = require('./valores');
const S = require('./saldos');
const { productosParecidos } = require('./parecidos');

const MAX_LINEAS = 2000;
const DIAS_ATRAS = 730; // no se registra nada de hace más de dos años
const DIAS_PERIODO = 366; // un movimiento de un periodo cubre como mucho un año
const TEXTO_TIPO = { entrada: 'entrada', venta: 'venta', devolucion: 'devolución', salida: 'salida', conteo: 'conteo' };

const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// --- Archivo base y movimientos -------------------------------------------------------------

// El último archivo subido por alguien de la empresa (no un inventario calculado con movimientos).
async function exportBase(empresaId) {
  return db.uno(
    `SELECT id, usuario_id, subido_en, reporte, series, catalogo FROM exports
      WHERE empresa_id = $1 AND origen = 'archivo' AND estado = 'ok' AND ${db.EXPORT_VIGENTE}
      ORDER BY subido_en DESC, id DESC LIMIT 1`,
    [empresaId],
  );
}

async function movimientosDe(empresaId, { conAnulados = false, productoId = null } = {}) {
  return db.query(
    `SELECT m.id, m.tipo, m.cantidad::float AS cantidad, m.fecha, m.desde, m.nota, m.proyecto, m.pedido_id, m.creado_en, m.anulado_en, m.usuario_id,
            p.codigo, p.nombre, u.nombre AS registro
       FROM movimientos m JOIN productos p ON p.id = m.producto_id LEFT JOIN usuarios u ON u.id = m.usuario_id
      WHERE m.empresa_id = $1 ${conAnulados ? '' : 'AND m.anulado_en IS NULL'} ${productoId ? 'AND m.producto_id = $2' : ''}
      ORDER BY m.fecha, m.id`,
    productoId ? [empresaId, productoId] : [empresaId],
  );
}

// --- Inventario al día ----------------------------------------------------------------------

/**
 * Recalcula el inventario de la empresa con los movimientos, si cambiaron o si llegó otro archivo
 * desde el último cálculo. El resultado es una fila de exports de origen 'movimientos'.
 *
 * El reporte que vio un pedido nunca cambia: si algún pedido ya usa el inventario calculado, se
 * crea otro en vez de reescribirlo. Devuelve el id del export o null si no hubo nada que calcular.
 */
// Súbala cuando cambie cómo se combinan los movimientos (server/saldos.js): así cada empresa se
// recalcula en su siguiente visita, aunque no haya registrado nada nuevo. 2: ventas de los conteos.
// 3: las semanas del archivo van en su último día al combinarlas (saldos.ventasDeExport). Subirla recalcula todo.
const VERSION_CALCULO = 3;

async function inventarioAlDia(empresaId) {
  const emp = await db.uno('SELECT movimientos_cambiaron_en, inventario_firma, inventario FROM empresas WHERE id = $1', [empresaId]);
  if (!emp || !emp.movimientos_cambiaron_en) return null;
  const base = await exportBase(empresaId);
  // Está al día si se calculó con los mismos movimientos y el mismo archivo. Antes se comparaban
  // horas, pero now() es la hora en que empezó la transacción: un lote grande que se confirmaba
  // mientras el panel calculaba quedaba con una hora anterior al cálculo y no se volvía a sumar.
  const mov = await db.uno('SELECT count(*)::int AS n, COALESCE(max(id), 0)::int AS ultimo, count(anulado_en)::int AS anulados FROM movimientos WHERE empresa_id = $1', [empresaId]);
  const firma = [VERSION_CALCULO, mov.n, mov.ultimo, mov.anulados, base ? base.id : 0, base ? new Date(base.subido_en).getTime() : 0].join(':');
  if (emp.inventario_firma === firma) return null;

  const movimientos = await movimientosDe(empresaId);
  const combinado = S.combinar({ base: base ? S.ventasDeExport(base) : null, movimientos });
  let exportId = null;
  // Sin movimientos nuevos después del archivo, el inventario es el archivo. Sin ninguna venta no
  // hay promedio que calcular: las existencias se ven igual en "Existencias".
  if (combinado.usados && combinado.ventas.length) {
    const semanasAgota = leerAjustes(emp.inventario).semanasAgota;
    const rotacion = calcularRotacion({
      ventas: combinado.ventas,
      existencias: combinado.existencias,
      semanasAgota,
      hoy: diaHoy(),
      hastaDia: combinado.hasta,
      desdeDia: combinado.desde,
    });
    const reporte = {
      ...rotacion,
      avisos: [...combinado.avisos, ...rotacion.avisos],
      hojasUsadas: base && base.reporte.hojasUsadas ? base.reporte.hojasUsadas : [],
    };
    const series = seriesSemanales(combinado.ventas, { hastaDia: combinado.hasta });
    const catalogo = await catalogoDe(empresaId, base ? base.catalogo : null);
    const ultimoMov = movimientos[movimientos.length - 1];
    const dueno = (ultimoMov && ultimoMov.usuario_id) || (base && base.usuario_id) || (await db.uno('SELECT id FROM usuarios WHERE empresa_id = $1 ORDER BY admin_empresa DESC, id LIMIT 1', [empresaId])).id;
    const valores = [JSON.stringify(reporte), series ? JSON.stringify(series) : null, JSON.stringify(catalogo), base ? base.id : null, combinado.usados, dueno];
    const previo = await db.uno(
      `SELECT x.id FROM exports x WHERE x.empresa_id = $1 AND x.origen = 'movimientos'
         AND NOT EXISTS (SELECT 1 FROM pedidos p WHERE p.export_id = x.id)
       ORDER BY x.subido_en DESC, x.id DESC LIMIT 1`,
      [empresaId],
    );
    if (previo) {
      await db.query(
        `UPDATE exports SET reporte = $1::jsonb, series = $2::jsonb, catalogo = $3::jsonb, base_export_id = $4, movimientos = $5, usuario_id = $6,
                subido_en = now(), estado = 'ok' WHERE id = $7`,
        [...valores, previo.id],
      );
      exportId = previo.id;
    } else {
      const r = await db.uno(
        `INSERT INTO exports (reporte, series, catalogo, base_export_id, movimientos, usuario_id, empresa_id, origen, estado)
         VALUES ($1::jsonb, $2::jsonb, $3::jsonb, $4, $5, $6, $7, 'movimientos', 'ok') RETURNING id`,
        [...valores, empresaId],
      );
      exportId = r.id;
    }
  }
  await db.query('UPDATE empresas SET inventario_calculado_en = now(), inventario_firma = $2 WHERE id = $1', [empresaId, firma]);
  return exportId;
}

// Costo y proveedor de cada producto: los del archivo y, encima, lo que la empresa corrigió en el catálogo.
async function catalogoDe(empresaId, delArchivo) {
  const out = { ...(delArchivo || {}) };
  const filas = await db.query('SELECT clave, costo::float AS costo, proveedor FROM productos WHERE empresa_id = $1 AND (costo IS NOT NULL OR proveedor IS NOT NULL)', [empresaId]);
  for (const f of filas) out[f.clave] = { ...(out[f.clave] || {}), ...(f.costo !== null ? { costo: f.costo } : {}), ...(f.proveedor ? { proveedor: f.proveedor } : {}) };
  return out;
}

/**
 * Agrega al catálogo de la empresa los productos de un archivo procesado (código, nombre, costo,
 * proveedor y familia), sin pisar lo que ya está: la empresa pudo haberlo corregido a mano. La
 * familia solo se llena si el producto no tenía.
 */
async function agregarAlCatalogo(exportId) {
  const e = await db.uno("SELECT empresa_id, reporte->'filas' AS filas, catalogo FROM exports WHERE id = $1 AND estado = 'ok'", [exportId]);
  if (!e || !e.empresa_id || !Array.isArray(e.filas) || !e.filas.length) return 0;
  const vistos = new Set();
  const cols = { clave: [], codigo: [], nombre: [], costo: [], proveedor: [], familia: [] };
  for (const f of e.filas) {
    const k = claveCodigo(f.codigo);
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    const c = (e.catalogo && e.catalogo[k]) || {};
    cols.clave.push(k);
    cols.codigo.push(texto(f.codigo, 100));
    cols.nombre.push(texto(f.nombre, 200));
    cols.costo.push(c.costo > 0 ? c.costo : null);
    cols.proveedor.push(c.proveedor ? texto(c.proveedor, 80) : null);
    cols.familia.push(c.familia ? texto(c.familia, 80) : null);
  }
  // xmax = 0: la fila es nueva (las que solo recibieron su familia no cuentan como agregadas).
  const r = await db.query(
    `INSERT INTO productos (empresa_id, clave, codigo, nombre, costo, proveedor, familia)
     SELECT $1, * FROM unnest($2::text[], $3::text[], $4::text[], $5::numeric[], $6::text[], $7::text[])
     ON CONFLICT (empresa_id, clave) DO UPDATE SET familia = EXCLUDED.familia
       WHERE productos.familia IS NULL AND EXCLUDED.familia IS NOT NULL
     RETURNING (xmax = 0) AS nuevo`,
    [e.empresa_id, cols.clave, cols.codigo, cols.nombre, cols.costo, cols.proveedor, cols.familia],
  );
  if (r.some((x) => !x.nuevo)) await db.query('UPDATE empresas SET catalogo_cambio_en = now() WHERE id = $1', [e.empresa_id]);
  return r.filter((x) => x.nuevo).length;
}

// La primera vez que alguien abre el catálogo, se llena con el último archivo de la empresa.
async function asegurarCatalogo(empresaId) {
  const hay = await db.uno('SELECT 1 FROM productos WHERE empresa_id = $1 LIMIT 1', [empresaId]);
  if (hay) return;
  const base = await exportBase(empresaId);
  if (base) await agregarAlCatalogo(base.id);
}

// --- Catálogo -----------------------------------------------------------------------------

const catalogo = express.Router();
catalogo.use(requiereUsuario);

const numeroONulo = (v) => (v === null || v === undefined ? null : Number(v));

// El costo es dinero: el operador no lo recibe (T4).
function vistaProducto(p, usuario) {
  return {
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    unidad: p.unidad,
    costo: usuario && rolEmpresa(usuario) === 'operador' ? null : numeroONulo(p.costo),
    proveedor: p.proveedor,
    familia: p.familia || null,
    multiplo: numeroONulo(p.multiplo),
    minimoPedido: numeroONulo(p.minimo_pedido),
    sobraSemanas: numeroONulo(p.sobra_semanas),
    medidas: p.medidas_cm || null,
    activo: p.activo,
  };
}

/**
 * Lo que la empresa escribió en el catálogo y cambia el sugerido o los filtros: familia, múltiplo de
 * empaque, mínimo de pedido y desde cuántas semanas sobra. { clave: { familia?, multiplo?,
 * minimoPedido?, sobraSemanas? } }, para ponerlo encima del catálogo del archivo (server/inventario-rutas.js).
 */
async function catalogoEscrito(empresaId) {
  const filas = await db.query(
    `SELECT clave, familia, multiplo::float AS multiplo, minimo_pedido::float AS minimo, sobra_semanas::float AS sobra, medidas_cm FROM productos
      WHERE empresa_id = $1 AND (familia IS NOT NULL OR multiplo IS NOT NULL OR minimo_pedido IS NOT NULL OR sobra_semanas IS NOT NULL OR medidas_cm IS NOT NULL)`,
    [empresaId],
  );
  const out = {};
  for (const f of filas) {
    out[f.clave] = {
      ...(f.familia ? { familia: f.familia } : {}),
      ...(f.multiplo > 0 ? { multiplo: f.multiplo } : {}),
      ...(f.minimo > 0 ? { minimoPedido: f.minimo } : {}),
      ...(f.sobra > 0 ? { sobraSemanas: f.sobra } : {}),
      ...(f.medidas_cm ? { medidas: f.medidas_cm, volumenPaquete: volumenDeMedidas(f.medidas_cm) } : {}),
    };
  }
  return out;
}

// El catálogo del archivo con lo que la empresa escribió encima (familia, múltiplo, mínimo y sobra).
async function catalogoConEscrito(empresaId, delArchivo) {
  const escrito = await catalogoEscrito(empresaId);
  const out = { ...(delArchivo || {}) };
  for (const [k, v] of Object.entries(escrito)) out[k] = { ...(out[k] || {}), ...v };
  return out;
}

// Múltiplo y mínimo: vacío = sin dato; si no, un número mayor que 0.
function leerCantidadCatalogo(v, nombre, donde = '') {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = leerNumero(v);
  if (n === null || !(n > 0)) throw new ErrorUsuario(`${donde}${nombre} tiene que ser un número mayor que 0, o quedar vacío.`);
  if (n > 1e6) throw new ErrorUsuario(`${donde}${nombre} es demasiado grande.`);
  return n;
}

// Medidas de un paquete en cm, "largo x ancho x alto" (T14): se guardan como "40x30x20" y vacío las borra.
function leerMedidas(v, donde = '') {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const lados = String(v).toLowerCase().replace(/,/g, '.').split(/\s*[x×*]\s*/).map(Number);
  if (lados.length !== 3 || !lados.every((n) => Number.isFinite(n) && n > 0 && n <= 1000)) {
    throw new ErrorUsuario(`${donde}Las medidas se escriben como largo × ancho × alto en centímetros, por ejemplo 40 × 30 × 20.`);
  }
  return lados.map((n) => Math.round(n * 10) / 10).join('x');
}
const volumenDeMedidas = (medidas) => (medidas ? medidas.split('x').reduce((a, n) => a * Number(n), 1) / 1e6 : null);

// Desde cuántas semanas sobra: vacío = las 12 de siempre. Entre 1 y 104 (dos años).
const MAX_SOBRA_SEMANAS = 104;
function leerSobraSemanas(v, donde = '') {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = leerNumero(v);
  if (n === null || !(n >= 1 && n <= MAX_SOBRA_SEMANAS)) throw new ErrorUsuario(`${donde}Las semanas para que sobre tienen que ser un número entre 1 y ${MAX_SOBRA_SEMANAS}, o quedar vacías.`);
  return Math.round(n * 10) / 10;
}

catalogo.get('/', async (req, res) => {
  await asegurarCatalogo(req.usuario.empresa_id);
  const q = texto(req.query.q, 80);
  const limite = Math.min(Math.max(Number(req.query.limite) || 50, 1), 500);
  const filas = q
    ? await db.query(
      `SELECT * FROM productos WHERE empresa_id = $1 AND activo AND (clave LIKE $2 OR lower(nombre) LIKE $3)
        ORDER BY (clave = $4) DESC, (clave LIKE $2) DESC, codigo LIMIT $5`,
      [req.usuario.empresa_id, `${claveCodigo(q)}%`, `%${q.toLowerCase()}%`, claveCodigo(q), limite],
    )
    : await db.query('SELECT * FROM productos WHERE empresa_id = $1 AND activo ORDER BY codigo LIMIT $2', [req.usuario.empresa_id, limite]);
  const { n } = await db.uno('SELECT count(*)::int AS n FROM productos WHERE empresa_id = $1 AND activo', [req.usuario.empresa_id]);
  res.json({ productos: filas.map((f) => vistaProducto(f, req.usuario)), total: n });
});

function leerProducto(body, parcial = false) {
  const codigo = texto(body?.codigo, 100);
  const nombre = texto(body?.nombre, 200);
  if (!parcial && !claveCodigo(codigo)) throw new ErrorUsuario('Escriba el código del producto.');
  if (!parcial && !nombre) throw new ErrorUsuario('Escriba el nombre del producto.');
  const costo = body?.costo === undefined || body?.costo === null || body?.costo === '' ? null : leerNumero(body.costo);
  if (costo !== null && !(costo >= 0)) throw new ErrorUsuario('El costo tiene que ser un número de 0 en adelante.');
  return {
    codigo,
    nombre,
    costo,
    proveedor: texto(body?.proveedor, 80) || null,
    unidad: texto(body?.unidad, 20) || null,
    familia: texto(body?.familia, 80) || null,
    multiplo: leerCantidadCatalogo(body?.multiplo, 'El múltiplo de empaque'),
    minimoPedido: leerCantidadCatalogo(body?.minimoPedido, 'El mínimo de pedido'),
    sobraSemanas: leerSobraSemanas(body?.sobraSemanas),
  };
}

async function catalogoCambio(empresaId) {
  // El costo y el proveedor entran al próximo cálculo con movimientos; familia, múltiplo y mínimo, a todos.
  await db.query('UPDATE empresas SET catalogo_cambio_en = now() WHERE id = $1', [empresaId]);
  await db.query('UPDATE empresas SET movimientos_cambiaron_en = now() WHERE id = $1 AND movimientos_cambiaron_en IS NOT NULL', [empresaId]);
}

catalogo.post('/', requiereAdminEmpresa, async (req, res) => {
  const p = leerProducto(req.body);
  const r = await db.uno(
    `INSERT INTO productos (empresa_id, clave, codigo, nombre, costo, proveedor, unidad, familia, multiplo, minimo_pedido, sobra_semanas)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (empresa_id, clave) DO NOTHING RETURNING *`,
    [req.usuario.empresa_id, claveCodigo(p.codigo), p.codigo, p.nombre, p.costo, p.proveedor, p.unidad, p.familia, p.multiplo, p.minimoPedido, p.sobraSemanas],
  );
  if (!r) throw new ErrorUsuario(`Ya hay un producto con el código ${p.codigo}.`, 409);
  await registrarEvento(req.usuario.id, 'producto_creado', { detalle: { codigo: p.codigo } });
  res.status(201).json({ producto: vistaProducto(r, req.usuario) });
});

catalogo.put('/:id', requiereAdminEmpresa, async (req, res) => {
  const actual = await db.uno('SELECT * FROM productos WHERE id = $1 AND empresa_id = $2', [Number(req.params.id), req.usuario.empresa_id]);
  if (!actual) throw new ErrorUsuario('Ese producto no está en su catálogo.', 404);
  const antes = vistaProducto(actual, req.usuario);
  const p = leerProducto({ ...antes, ...req.body }, true);
  const r = await db.uno(
    `UPDATE productos SET nombre = $1, costo = $2, proveedor = $3, unidad = $4, activo = $5, familia = $6, multiplo = $7, minimo_pedido = $8, sobra_semanas = $9
      WHERE id = $10 RETURNING *`,
    [p.nombre || actual.nombre, p.costo, p.proveedor, p.unidad, typeof req.body?.activo === 'boolean' ? req.body.activo : actual.activo, p.familia, p.multiplo, p.minimoPedido, p.sobraSemanas, actual.id],
  );
  await catalogoCambio(req.usuario.empresa_id);
  await registrarEvento(req.usuario.id, 'producto_editado', { detalle: { codigo: actual.codigo, antes, despues: vistaProducto(r, req.usuario) } });
  res.json({ producto: vistaProducto(r, req.usuario) });
});

// Familia, múltiplo, mínimo y semanas para que sobre de varios productos a la vez: pegados de Excel
// (código, familia, múltiplo, mínimo, sobra) o desde la ficha de un producto. Solo cambia lo que
// viene en cada fila: una celda vacía borra ese dato; una columna que no viene lo deja como estaba.
// Todo o nada.
const CAMPOS_LOTE = { familia: 'familia', multiplo: 'multiplo', minimo: 'minimo_pedido', sobra: 'sobra_semanas', medidas: 'medidas_cm' };

// Un operador con permiso de proveedores llega aquí desde la ficha de un proveedor: solo el paquete,
// el mínimo y las medidas de cada producto.
const CAMPOS_LOTE_PROVEEDORES = ['codigo', 'multiplo', 'minimo', 'medidas'];

catalogo.post('/lote', requiereProveedores, async (req, res) => {
  const filas = Array.isArray(req.body?.filas) ? req.body.filas : [];
  if (rolEmpresa(req.usuario) === 'operador' && filas.some((f) => f && Object.keys(f).some((k) => !CAMPOS_LOTE_PROVEEDORES.includes(k)))) {
    throw new ErrorUsuario('Usted solo puede cambiar el paquete, el mínimo y las medidas de los productos desde Proveedores.', 403);
  }
  if (!filas.length) throw new ErrorUsuario('Escriba al menos un producto.');
  if (filas.length > MAX_LINEAS) throw new ErrorUsuario(`Son más de ${MAX_LINEAS} productos. Péguelos en partes.`);
  const empresaId = req.usuario.empresa_id;
  await asegurarCatalogo(empresaId);
  const claves = [...new Set(filas.map((f) => claveCodigo(f && f.codigo)).filter(Boolean))];
  const existentes = new Map((await db.query('SELECT id, clave, codigo, familia, multiplo, minimo_pedido, sobra_semanas, medidas_cm FROM productos WHERE empresa_id = $1 AND clave = ANY($2::text[])', [empresaId, claves])).map((p) => [p.clave, p]));
  const errores = [];
  const faltan = [];
  const cambios = [];
  filas.forEach((f, i) => {
    const fila = i + 1;
    const codigo = texto(f && f.codigo, 100);
    if (!codigo) return errores.push(`Fila ${fila}: falta el código del producto.`);
    const producto = existentes.get(claveCodigo(codigo));
    if (!producto) { faltan.push(codigo); return errores.push(`Fila ${fila}: el código ${codigo} no está en su catálogo.`); }
    try {
      const valores = {};
      if (f.familia !== undefined) valores.familia = texto(f.familia, 80) || null;
      if (f.multiplo !== undefined) valores.multiplo = leerCantidadCatalogo(f.multiplo, 'el múltiplo', `Fila ${fila}: `);
      if (f.minimo !== undefined) valores.minimo = leerCantidadCatalogo(f.minimo, 'el mínimo', `Fila ${fila}: `);
      if (f.sobra !== undefined) valores.sobra = leerSobraSemanas(f.sobra, `Fila ${fila}: `);
      if (f.medidas !== undefined) valores.medidas = leerMedidas(f.medidas, `Fila ${fila}: `);
      if (Object.keys(valores).length) cambios.push({ producto, valores });
    } catch (e) {
      if (!(e instanceof ErrorUsuario)) throw e;
      errores.push(e.message);
    }
  });
  if (errores.length) throw new ErrorUsuario('Revise los productos antes de guardar. No se guardó ninguno.', 400, { errores: errores.slice(0, 50), faltan });
  await db.tx(async (t) => {
    for (const c of cambios) {
      const sets = Object.keys(c.valores).map((k, j) => `${CAMPOS_LOTE[k]} = $${j + 1}`);
      await t.query(`UPDATE productos SET ${sets.join(', ')} WHERE id = $${sets.length + 1}`, [...Object.values(c.valores), c.producto.id]);
    }
  });
  await catalogoCambio(empresaId);
  // Trazabilidad (SP6): el antes y el después de cada producto.
  const antesDe = (prod, k) => { const v = prod[CAMPOS_LOTE[k]]; return v === null || v === undefined ? null : k === 'familia' || k === 'medidas' ? v : Number(v); };
  await registrarEvento(req.usuario.id, 'catalogo_editado', {
    detalle: {
      productos: cambios.length,
      cambios: cambios.slice(0, 100).map((c) => ({ codigo: c.producto.codigo, antes: Object.fromEntries(Object.keys(c.valores).map((k) => [k, antesDe(c.producto, k)])), despues: c.valores })),
    },
  });
  res.json({ guardados: cambios.length });
});

// --- Movimientos ----------------------------------------------------------------------------

const rutas = express.Router();
rutas.use(requiereUsuario);

function hoyBogota() {
  return fechaBogota();
}

/**
 * Revisa todas las líneas antes de guardar nada. Devuelve las líneas limpias o los errores con
 * su número de fila, en español sencillo, y los códigos que no están en el catálogo.
 */
function revisarMovimientos(lineas, porClave) {
  const hoy = hoyBogota();
  const minimo = new Date(Date.parse(`${hoy}T12:00:00Z`) - DIAS_ATRAS * MS_DIA).toISOString().slice(0, 10);
  const errores = [];
  const faltan = new Set();
  const limpias = [];
  lineas.forEach((l, i) => {
    const fila = i + 1;
    const codigo = texto(l && l.codigo, 100);
    if (!codigo) return errores.push(`Fila ${fila}: falta el código del producto.`);
    const producto = porClave.get(claveCodigo(codigo));
    if (!producto) {
      faltan.add(codigo);
      return errores.push(`Fila ${fila}: el código ${codigo} no está en su catálogo.`);
    }
    const tipo = l.tipo;
    if (!S.TIPOS.includes(tipo)) return errores.push(`Fila ${fila}: elija si es entrada, venta, devolución, salida o conteo.`);
    const cantidad = leerNumero(l.cantidad);
    if (cantidad === null) return errores.push(`Fila ${fila}: la cantidad "${texto(l.cantidad, 20)}" no es un número.`);
    if (cantidad < 0) return errores.push(`Fila ${fila}: la cantidad no puede ser negativa. Para restar, use venta o salida.`);
    if (cantidad === 0 && tipo !== 'conteo') return errores.push(`Fila ${fila}: la cantidad es 0. Solo un conteo puede ser 0.`);
    const fecha = l.fecha ? String(l.fecha).trim() : hoy;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(`${fecha}T12:00:00Z`))) return errores.push(`Fila ${fila}: la fecha no es válida.`);
    if (fecha > hoy) return errores.push(`Fila ${fila}: la fecha es después de hoy.`);
    if (fecha < minimo) return errores.push(`Fila ${fila}: la fecha es de hace más de dos años.`);
    // Cualquier movimiento puede ser el total de un periodo (desde → fecha; Correcciones finales: antes
    // solo las ventas). Las ventas y devoluciones se reparten entre sus días para el promedio; las
    // existencias cambian el último día; un conteo es lo que había al terminar el periodo (server/saldos.js).
    let desde = null;
    if (l.desde && String(l.desde).trim() !== fecha) {
      desde = String(l.desde).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || Number.isNaN(Date.parse(`${desde}T12:00:00Z`))) return errores.push(`Fila ${fila}: la fecha de inicio del periodo no es válida.`);
      if (desde > fecha) return errores.push(`Fila ${fila}: el periodo empieza después de terminar.`);
      if (desde < minimo) return errores.push(`Fila ${fila}: el periodo empieza hace más de dos años.`);
      if ((Date.parse(`${fecha}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / MS_DIA + 1 > DIAS_PERIODO) return errores.push(`Fila ${fila}: el periodo es de más de un año. Regístrelo por partes.`);
    }
    // Solo una venta puede ser de proyecto (D12): baja existencias, pero no cuenta en el promedio.
    limpias.push({ producto, tipo, cantidad, fecha, desde, nota: texto(l.nota, 200), proyecto: tipo === 'venta' && l.proyecto === true });
  });
  return { limpias, errores, faltan: [...faltan] };
}

/**
 * Códigos que no están en el catálogo. `resolver` ({ código: código existente | 'nuevo' }) trae lo
 * que la persona ya contestó. Los demás: si se parecen a productos que ya existen, van a
 * `parecidos` para preguntarle; si no, a `nuevos`, que se crean al guardar. Deja en `porClave` un
 * producto para cada uno (el elegido o uno nuevo sin id), para que la revisión siga con las filas.
 */
async function resolverDesconocidos(empresaId, lineas, porClave, resolver) {
  const desconocidos = new Map();
  for (const l of lineas) {
    const codigo = texto(l && l.codigo, 100);
    const k = claveCodigo(codigo);
    if (codigo && !porClave.has(k) && !desconocidos.has(k)) desconocidos.set(k, { codigo, nombre: texto(l.nombre, 200) });
  }
  const parecidos = [];
  const nuevos = [];
  const errores = [];
  if (!desconocidos.size) return { parecidos, nuevos, errores };
  const respuestas = new Map(Object.entries(resolver && typeof resolver === 'object' ? resolver : {}).map(([k, v]) => [claveCodigo(k), String(v ?? '')]));
  const catalogo = await db.query('SELECT id, clave, codigo, nombre FROM productos WHERE empresa_id = $1 AND activo', [empresaId]);
  const delCatalogo = new Map(catalogo.map((p) => [p.clave, p]));
  for (const [k, d] of desconocidos) {
    const respuesta = respuestas.get(k);
    if (respuesta && respuesta !== 'nuevo') {
      const elegido = delCatalogo.get(claveCodigo(respuesta));
      if (elegido) { porClave.set(k, elegido); continue; }
      errores.push(`El producto ${respuesta} que eligió para ${d.codigo} ya no está en su catálogo.`);
    }
    const opciones = respuesta === 'nuevo' ? [] : productosParecidos(d.codigo, d.nombre, catalogo);
    if (opciones.length) parecidos.push({ ...d, opciones });
    else nuevos.push(d);
    porClave.set(k, { id: null, clave: k, codigo: d.codigo, nombre: d.nombre });
  }
  return { parecidos, nuevos, errores };
}

// Un operador registra entradas, ventas, devoluciones y salidas, o hace conteos, solo si quien administra
// se lo marcó (T18). Gerente y administrador no necesitan permiso.
function exigirPermisoMovimientos(usuario, tipos) {
  if (rolEmpresa(usuario) !== 'operador') return;
  if (tipos.some((t) => t !== 'conteo') && !usuario.registra_movimientos) throw new ErrorUsuario('No tiene permiso para registrar movimientos. Consulte al administrador de su empresa.', 403);
  if (tipos.includes('conteo') && !usuario.hace_conteos) throw new ErrorUsuario('No tiene permiso para hacer conteos. Consulte al administrador de su empresa.', 403);
}

rutas.post('/', async (req, res) => {
  const lineas = Array.isArray(req.body?.movimientos) ? req.body.movimientos : [];
  exigirPermisoMovimientos(req.usuario, lineas.map((l) => l?.tipo));
  if (!lineas.length) throw new ErrorUsuario('Escriba al menos un movimiento.');
  if (lineas.length > MAX_LINEAS) throw new ErrorUsuario(`Son más de ${MAX_LINEAS} movimientos. Regístrelos en partes.`);
  const empresaId = req.usuario.empresa_id;
  await asegurarCatalogo(empresaId);
  const claves = [...new Set(lineas.map((l) => claveCodigo(l && l.codigo)).filter(Boolean))];
  const productos = await db.query('SELECT id, clave, codigo, nombre FROM productos WHERE empresa_id = $1 AND clave = ANY($2::text[])', [empresaId, claves]);
  const porClave = new Map(productos.map((p) => [p.clave, p]));
  const desconocidos = await resolverDesconocidos(empresaId, lineas, porClave, req.body?.resolver);
  const revision = revisarMovimientos(lineas, porClave);
  const errores = [...desconocidos.errores, ...revision.errores];
  if (errores.length) {
    throw new ErrorUsuario('Revise los movimientos antes de guardar. No se guardó ninguno.', 400, { errores: errores.slice(0, 50) });
  }
  // Un código que se parece a uno del catálogo puede ser un error al escribirlo: se pregunta antes
  // de crear un producto repetido. Los demás códigos nuevos se crean al guardar, con aviso.
  if (desconocidos.parecidos.length) {
    throw new ErrorUsuario(
      desconocidos.parecidos.length === 1 ? 'Un código no está en su catálogo, pero se parece a un producto que ya tiene.' : `${desconocidos.parecidos.length} códigos no están en su catálogo, pero se parecen a productos que ya tiene.`,
      409,
      { parecidos: desconocidos.parecidos.slice(0, 50), nuevos: desconocidos.nuevos.slice(0, 50) },
    );
  }
  await db.tx(async (t) => {
    for (const d of desconocidos.nuevos) {
      const p = porClave.get(claveCodigo(d.codigo));
      const r = await t.query(
        `INSERT INTO productos (empresa_id, clave, codigo, nombre) VALUES ($1, $2, $3, $4)
         ON CONFLICT (empresa_id, clave) DO UPDATE SET clave = EXCLUDED.clave RETURNING id`,
        [empresaId, p.clave, p.codigo, p.nombre],
      );
      p.id = r.rows[0].id;
    }
    for (const m of revision.limpias) {
      await t.query(
        'INSERT INTO movimientos (empresa_id, producto_id, usuario_id, tipo, cantidad, fecha, desde, nota, proyecto) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [empresaId, m.producto.id, req.usuario.id, m.tipo, m.cantidad, m.fecha, m.desde, m.nota, m.proyecto],
      );
    }
    await t.query('UPDATE empresas SET movimientos_cambiaron_en = now() WHERE id = $1', [empresaId]);
  });
  const tipos = {};
  for (const m of revision.limpias) tipos[m.tipo] = (tipos[m.tipo] || 0) + 1;
  const periodos = revision.limpias.filter((m) => m.desde).length;
  const creados = desconocidos.nuevos.map((d) => d.codigo);
  await registrarEvento(req.usuario.id, 'movimientos_registrados', { detalle: { cantidad: revision.limpias.length, tipos, ...(periodos ? { periodos } : {}), ...(creados.length ? { creados: creados.length } : {}) } });
  for (const codigo of creados.slice(0, 100)) await registrarEvento(req.usuario.id, 'producto_creado', { detalle: { codigo, desde: 'movimientos' } });

  // Avisos sobre lo que se acaba de guardar: productos creados, fechas que ya están en el archivo y
  // saldos negativos.
  const estado = await existenciasDe(empresaId);
  const avisos = [];
  if (creados.length) {
    const lista = creados.slice(0, 10).join(', ') + (creados.length > 10 ? ` y ${creados.length - 10} más` : '');
    avisos.push(creados.length === 1 ? `${lista} no estaba en su catálogo: se creó como producto nuevo.` : `${creados.length} códigos no estaban en su catálogo y se crearon como productos nuevos: ${lista}.`);
  }
  if (estado.base) {
    const viejos = revision.limpias.filter((m) => m.fecha <= estado.base.hasta).length;
    if (viejos) avisos.push(`${viejos === 1 ? '1 movimiento es' : `${viejos} movimientos son`} del ${estado.base.hasta} o antes: ese día ya está en el archivo que subieron, así que no cambia las existencias.`);
    // Un conteo no se reparte (es lo que había el último día): no entra en este aviso.
    const cruzan = revision.limpias.filter((m) => m.tipo !== 'conteo' && m.desde && m.desde <= estado.base.hasta && m.fecha > estado.base.hasta).length;
    if (cruzan) avisos.push(`${cruzan === 1 ? '1 movimiento del periodo empieza' : `${cruzan} movimientos del periodo empiezan`} antes del ${estado.base.hasta}, el último día del archivo que subieron: se cuenta solo la parte de los días siguientes.`);
  }
  const tocados = new Set(revision.limpias.map((m) => m.producto.clave));
  for (const p of estado.productos) {
    if (tocados.has(claveCodigo(p.codigo)) && p.existencias < 0) avisos.push(`${p.codigo} quedó en ${p.existencias}. ¿Falta registrar una entrada?`);
  }
  res.status(201).json({ guardados: revision.limpias.length, creados, avisos: avisos.slice(0, 20) });
});

function vistaMovimiento(m) {
  return { id: m.id, codigo: m.codigo, nombre: m.nombre, tipo: m.tipo, cantidad: Number(m.cantidad), fecha: m.fecha, desde: m.desde || null, nota: m.nota, proyecto: Boolean(m.proyecto), pedidoId: m.pedido_id || null, registro: m.registro || null, creadoEn: m.creado_en, anulado: Boolean(m.anulado_en) };
}

rutas.get('/', async (req, res) => {
  const valida = (t) => (/^\d{4}-\d{2}-\d{2}$/.test(String(t || '')) ? String(t) : null);
  const desde = valida(req.query.desde);
  const hasta = valida(req.query.hasta);
  const codigo = req.query.codigo ? claveCodigo(req.query.codigo) : null;
  const params = [req.usuario.empresa_id];
  let filtro = '';
  if (desde) { params.push(desde); filtro += ` AND m.fecha >= $${params.length}`; }
  if (hasta) { params.push(hasta); filtro += ` AND m.fecha <= $${params.length}`; }
  if (codigo) { params.push(codigo); filtro += ` AND p.clave = $${params.length}`; }
  const filas = await db.query(
    `SELECT m.id, m.tipo, m.cantidad::float AS cantidad, m.fecha, m.desde, m.nota, m.proyecto, m.pedido_id, m.creado_en, m.anulado_en, p.codigo, p.nombre, u.nombre AS registro
       FROM movimientos m JOIN productos p ON p.id = m.producto_id LEFT JOIN usuarios u ON u.id = m.usuario_id
      WHERE m.empresa_id = $1${filtro} ORDER BY m.fecha DESC, m.id DESC LIMIT 500`,
    params,
  );
  res.json({ movimientos: filas.map(vistaMovimiento), hoy: hoyBogota() });
});

// Código y cantidad desde un archivo de Excel o CSV, con el mismo lector de las listas de pedido
// (columnas por sinónimos y, si no las reconoce, la persona las elige). No guarda movimientos: las
// filas vuelven a la hoja de la pantalla para revisarlas, elegir el tipo y la fecha, y guardar.
rutas.post(
  '/importar',
  (req, res, next) => require('./pedidos').subida.single('archivo')(req, res, next),
  async (req, res) => {
    // Solo se lee el archivo: lo que se guarda lo revisa POST /. Basta con tener alguno de los dos permisos.
    if (rolEmpresa(req.usuario) === 'operador' && !req.usuario.registra_movimientos && !req.usuario.hace_conteos) exigirPermisoMovimientos(req.usuario, ['venta']);
    // Aquí y no arriba: pedidos.js usa este archivo.
    const { importarLista } = require('./pedidos');
    res.json(await importarLista(req, null));
  },
);

rutas.post('/:id/anular', async (req, res) => {
  const previo = await db.uno('SELECT tipo FROM movimientos WHERE id = $1 AND empresa_id = $2', [Number(req.params.id), req.usuario.empresa_id]);
  if (previo) exigirPermisoMovimientos(req.usuario, [previo.tipo]);
  const m = await db.uno(
    'UPDATE movimientos SET anulado_en = now() WHERE id = $1 AND empresa_id = $2 AND anulado_en IS NULL RETURNING id, tipo',
    [Number(req.params.id), req.usuario.empresa_id],
  );
  if (!m) throw new ErrorUsuario('Ese movimiento no existe o ya está anulado.', 404);
  await db.query('UPDATE empresas SET movimientos_cambiaron_en = now() WHERE id = $1', [req.usuario.empresa_id]);
  await registrarEvento(req.usuario.id, 'movimiento_anulado', { detalle: { movimiento: m.id, tipo: TEXTO_TIPO[m.tipo] } });
  res.json({ ok: true });
});

// --- Existencias ----------------------------------------------------------------------------

// Existencias de hoy: las del último archivo más los movimientos posteriores. Incluye los productos
// del catálogo que no están en el archivo ni tienen movimientos (con 0).
async function existenciasDe(empresaId) {
  await asegurarCatalogo(empresaId);
  const base = await exportBase(empresaId);
  const movimientos = await movimientosDe(empresaId);
  const combinado = S.combinar({ base: base ? { ...S.ventasDeExport(base), ventas: [] } : null, movimientos });
  const porClave = new Map(combinado.existencias.map((e) => [claveCodigo(e.codigo), e]));
  const ultimo = new Map();
  for (const m of movimientos) ultimo.set(claveCodigo(m.codigo), { fecha: m.fecha, tipo: m.tipo, cantidad: Number(m.cantidad) });
  const catalogoFilas = await db.query('SELECT clave, codigo, nombre, unidad FROM productos WHERE empresa_id = $1 AND activo', [empresaId]);
  const productos = [];
  const vistos = new Set();
  for (const p of catalogoFilas) {
    const e = porClave.get(p.clave);
    vistos.add(p.clave);
    productos.push({ codigo: p.codigo, nombre: p.nombre || (e && e.nombre) || '', unidad: p.unidad, existencias: e ? e.existencias : 0, ultimo: ultimo.get(p.clave) || null });
  }
  for (const [k, e] of porClave) if (!vistos.has(k)) productos.push({ codigo: e.codigo, nombre: e.nombre, unidad: null, existencias: e.existencias, ultimo: ultimo.get(k) || null });
  productos.sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
  return {
    base: base ? { exportId: base.id, hasta: base.reporte.periodo.hasta, subidoEn: base.subido_en } : null,
    movimientos: combinado.usados,
    ignorados: combinado.ignorados,
    negativos: combinado.negativos.length,
    hoy: hoyBogota(),
    productos,
  };
}

const existencias = express.Router();
existencias.use(requiereUsuario);

existencias.get('/', async (req, res) => {
  res.json(await existenciasDe(req.usuario.empresa_id));
});

existencias.get('/:codigo', async (req, res) => {
  const empresaId = req.usuario.empresa_id;
  const clave = claveCodigo(req.params.codigo);
  const p = await db.uno('SELECT * FROM productos WHERE empresa_id = $1 AND clave = $2', [empresaId, clave]);
  if (!p) throw new ErrorUsuario('Ese producto no está en su catálogo.', 404);
  const base = await exportBase(empresaId);
  const fila = base ? (base.reporte.filas || []).find((f) => claveCodigo(f.codigo) === clave) : null;
  const inicial = base ? { dia: S.diaDeFecha(base.reporte.periodo.hasta), fecha: base.reporte.periodo.hasta, existencias: fila ? fila.existencias : 0 } : null;
  const movimientos = (await movimientosDe(empresaId, { conAnulados: true, productoId: p.id })).map((m) => ({ ...vistaMovimiento(m), anulado: Boolean(m.anulado_en) }));
  const k = S.kardex({ inicial, movimientos });
  res.json({ producto: vistaProducto(p, req.usuario), inicial: inicial && { fecha: inicial.fecha, existencias: inicial.existencias }, filas: k.filas.reverse(), existencias: k.saldo });
});

module.exports = { rutas, catalogo, existencias, inventarioAlDia, agregarAlCatalogo, catalogoEscrito, catalogoConEscrito, revisarMovimientos };
