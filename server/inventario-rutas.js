'use strict';

// El inventario guardado del usuario (panel, productos y pedido sugerido) y la demo.
//
//   GET  /api/demo                  los negocios de ejemplo
//   GET  /api/demo/:id              el inventario de ejemplo, igual al de un usuario
//   GET  /api/inventario            el inventario del último archivo que subió el usuario
//   PUT  /api/inventario/ajustes    tiempos de entrega por proveedor y cada cuánto pide
//   POST /api/inventario/export     subir un archivo nuevo sin estar en un pedido (+ columnas, documentos, periodo)
//
// Regla de la prueba: un probador solo puede subir su inventario por fuera de un pedido después
// de guardar su primera lista inicial. Si lo viera antes, su primera lista ya no sería "lo que
// iba a pedir sin el reporte" y la métrica M no mediría nada. La cantidad sugerida tampoco se
// le muestra durante sus 14 días de prueba (docs/PLAN_REESTRUCTURACION.md).

const express = require('express');
const db = require('./db');
const { requiereUsuario, registrarEvento, ErrorUsuario } = require('./cuentas');
const { procesarExport, leerPeriodo, leerMapeoManual, subida } = require('./pedidos');
const { DIAS_PRUEBA } = require('./equipo');
const { leerExport } = require('./lector');
const { seriesSemanales } = require('./series');
const { construirInventario, leerAjustes } = require('./inventario');
const { inventarioDemo, sectores } = require('./demo');
const { estadoDe } = require('./recordatorios');

// --- Demo (sin cuenta) -------------------------------------------------------------------

const demo = express.Router();

demo.get('/', (_req, res) => {
  res.json({ sectores: sectores() });
});

// ?ajustes={"entregas":{...},"cadaCuanto":4}: los tiempos de entrega que el visitante cambió.
demo.get('/:id', (req, res) => {
  let ajustes = null;
  if (req.query.ajustes) {
    try {
      ajustes = leerAjustes(JSON.parse(String(req.query.ajustes)));
    } catch {
      ajustes = null;
    }
  }
  const inv = inventarioDemo(String(req.params.id), ajustes);
  if (!inv) throw new ErrorUsuario('No tenemos ese ejemplo.', 404);
  res.setHeader('Cache-Control', ajustes ? 'no-store' : 'public, max-age=600');
  res.json({ inventario: inv });
});

// --- Inventario del usuario ---------------------------------------------------------------

const rutas = express.Router();
rutas.use(requiereUsuario);

async function inicioDePrueba(usuarioId) {
  const r = await db.uno('SELECT min(inicial_guardada_en) AS inicio FROM pedidos WHERE usuario_id = $1 AND inicial_guardada_en IS NOT NULL', [usuarioId]);
  return r && r.inicio ? new Date(r.inicio) : null;
}

// Qué puede ver y hacer el usuario según dónde va en la prueba. Durante sus 14 días un probador
// ve solo el alcance declarado en el plan de prueba (el reporte de semanas); después, todo.
async function permisos(usuario) {
  if (usuario.rol === 'equipo') return { puedeSubir: true, sugerencias: true, alcance: 'completo', finPrueba: null };
  const inicio = await inicioDePrueba(usuario.id);
  const fin = inicio ? new Date(inicio.getTime() + DIAS_PRUEBA * 86400000) : null;
  const terminada = Boolean(fin && Date.now() > fin.getTime());
  return {
    puedeSubir: Boolean(inicio),
    sugerencias: terminada,
    alcance: terminada ? 'completo' : 'prueba',
    finPrueba: fin,
  };
}

async function ultimoExport(usuarioId) {
  return db.uno(
    `SELECT id, pedido_id, subido_en, reporte, series, catalogo, periodo, documentos
       FROM exports WHERE usuario_id = $1 AND estado = 'ok' ORDER BY subido_en DESC, id DESC LIMIT 1`,
    [usuarioId],
  );
}

// Los archivos subidos antes de que existiera el panel no tienen las ventas por semana: se
// leen de nuevo una vez y se guardan. El reporte no se toca (es el que vio el probador).
async function completarSeries(usuarioId, e) {
  if (e.series || (e.reporte && e.reporte.periodo && e.reporte.periodo.totales)) return e;
  const archivos = await db.query('SELECT nombre, contenido FROM archivos WHERE export_id = $1 ORDER BY id', [e.id]);
  if (!archivos.length) return e;
  const u = await db.uno('SELECT mapeos FROM usuarios WHERE id = $1', [usuarioId]);
  const mapeos = (u && u.mapeos) || {};
  const lectura = leerExport(
    archivos.map((a) => ({ nombre: a.nombre, buffer: Buffer.from(a.contenido) })),
    { porFirma: mapeos.export },
    { periodo: e.periodo, documentos: e.documentos, documentosPorFirma: mapeos.documentos },
  );
  if (!lectura.ok) return e;
  const series = seriesSemanales(lectura.ventas, { mensual: lectura.mensual, totales: Boolean(lectura.periodo) });
  await db.query('UPDATE exports SET series = $1::jsonb, catalogo = $2::jsonb WHERE id = $3', [series ? JSON.stringify(series) : null, JSON.stringify(lectura.catalogo || {}), e.id]);
  return { ...e, series, catalogo: lectura.catalogo || {} };
}

// El inventario ya calculado, por archivo, alcance y ajustes: con miles de productos el cálculo
// tarda y no cambia hasta que suben otro archivo o cambian sus ajustes.
const calculados = new Map();
const MAX_CALCULADOS = 40;

rutas.get('/', async (req, res) => {
  const per = await permisos(req.usuario);
  const cab = await db.uno("SELECT id FROM exports WHERE usuario_id = $1 AND estado = 'ok' ORDER BY subido_en DESC, id DESC LIMIT 1", [req.usuario.id]);
  if (!cab) return res.json({ inventario: null, ...per });
  const u = await db.uno('SELECT inventario, sistema, nombre FROM usuarios WHERE id = $1', [req.usuario.id]);
  const llave = JSON.stringify([cab.id, per.alcance, u.inventario, u.sistema, u.nombre]);
  let inventario = calculados.get(llave);
  if (!inventario) {
    const e = await completarSeries(req.usuario.id, await ultimoExport(req.usuario.id));
    const archivos = await db.query('SELECT nombre FROM archivos WHERE export_id = $1 ORDER BY id', [e.id]);
    inventario = construirInventario({
      reporte: e.reporte,
      series: e.series,
      catalogo: e.catalogo,
      ajustes: u.inventario,
      fuente: {
        exportId: e.id,
        pedidoId: e.pedido_id,
        fecha: e.subido_en,
        archivos: archivos.map((a) => a.nombre),
        programa: u.sistema,
        persona: u.nombre,
      },
      alcance: per.alcance,
    });
    calculados.set(llave, inventario);
    if (calculados.size > MAX_CALCULADOS) calculados.delete(calculados.keys().next().value);
  }
  res.json({ inventario, ...per, recordatorio: await estadoDe(req.usuario.id) });
});

// Se mezcla con lo guardado: cambiar un tiempo de entrega no borra los proveedores asignados, y al revés.
rutas.put('/ajustes', async (req, res) => {
  const u = await db.uno('SELECT inventario FROM usuarios WHERE id = $1', [req.usuario.id]);
  const cuerpo = req.body && typeof req.body === 'object' ? req.body : {};
  const ajustes = leerAjustes({ ...(u && u.inventario), ...cuerpo });
  await db.query('UPDATE usuarios SET inventario = $1::jsonb WHERE id = $2', [JSON.stringify(ajustes), req.usuario.id]);
  res.json({ ajustes });
});

// --- Subir un archivo desde "Datos" ------------------------------------------------------------

async function exigirPuedeSubir(req) {
  const per = await permisos(req.usuario);
  if (!per.puedeSubir) {
    throw new ErrorUsuario('Antes de ver tu inventario, prepara tu primer pedido y anota lo que ibas a pedir. Así podemos medir si el reporte te sirve.', 403);
  }
}

async function exportSuelto(req) {
  const e = await db.uno('SELECT id FROM exports WHERE id = $1 AND usuario_id = $2 AND pedido_id IS NULL', [Number(req.params.exportId), req.usuario.id]);
  if (!e) throw new ErrorUsuario('No encontramos ese archivo. Vuelve a subirlo.', 404);
  return e;
}

rutas.post('/export', subida.array('archivos', 5), async (req, res) => {
  await exigirPuedeSubir(req);
  if (!req.files || !req.files.length) throw new ErrorUsuario('Elige el archivo de ventas y existencias.');
  const periodo = leerPeriodo(req.body);
  const exp = await db.uno("INSERT INTO exports (usuario_id, pedido_id, estado, periodo) VALUES ($1, NULL, 'procesando', $2::jsonb) RETURNING id", [req.usuario.id, periodo ? JSON.stringify(periodo) : null]);
  const nombres = [];
  for (const f of req.files) {
    const nombre = Buffer.from(f.originalname, 'latin1').toString('utf8');
    nombres.push(nombre);
    await db.query(
      "INSERT INTO archivos (usuario_id, pedido_id, export_id, tipo, nombre, tamano, contenido) VALUES ($1, NULL, $2, 'export', $3, $4, $5)",
      [req.usuario.id, exp.id, nombre, f.size, f.buffer],
    );
  }
  await registrarEvento(req.usuario.id, 'archivo_subido', { detalle: { tipo: 'export', archivos: nombres, desde: 'datos' } });
  res.json(await procesarExport(req.usuario.id, null, exp.id, null));
});

rutas.post('/export/:exportId/columnas', async (req, res) => {
  await exigirPuedeSubir(req);
  const exp = await exportSuelto(req);
  const manual = leerMapeoManual(req.body?.mapeo);
  if (!manual) throw new ErrorUsuario('Elige las columnas.');
  res.json(await procesarExport(req.usuario.id, null, exp.id, manual));
});

rutas.post('/export/:exportId/documentos', async (req, res) => {
  await exigirPuedeSubir(req);
  const exp = await exportSuelto(req);
  const lista = Array.isArray(req.body?.documentos) ? req.body.documentos.map((x) => String(x).slice(0, 30)).slice(0, 50) : [];
  if (!lista.length) throw new ErrorUsuario('Marca al menos un tipo de documento que sea venta.');
  await db.query('UPDATE exports SET documentos = $1::jsonb WHERE id = $2', [JSON.stringify(lista), exp.id]);
  res.json(await procesarExport(req.usuario.id, null, exp.id, leerMapeoManual(req.body?.mapeo)));
});

rutas.post('/export/:exportId/periodo', async (req, res) => {
  await exigirPuedeSubir(req);
  const exp = await exportSuelto(req);
  const periodo = leerPeriodo(req.body);
  if (!periodo) throw new ErrorUsuario('Escribe las dos fechas del periodo.');
  await db.query('UPDATE exports SET periodo = $1::jsonb WHERE id = $2', [JSON.stringify(periodo), exp.id]);
  res.json(await procesarExport(req.usuario.id, null, exp.id, leerMapeoManual(req.body?.mapeo)));
});

// Historial de cargas: lo que subió y cuándo.
rutas.get('/cargas', async (req, res) => {
  const filas = await db.query(
    `SELECT e.id, e.subido_en, e.estado, e.pedido_id, e.reporte->'resumen'->>'productos' AS productos,
            (SELECT json_agg(a.nombre ORDER BY a.id) FROM archivos a WHERE a.export_id = e.id) AS archivos
       FROM exports e WHERE e.usuario_id = $1 ORDER BY e.subido_en DESC, e.id DESC LIMIT 30`,
    [req.usuario.id],
  );
  res.json({
    cargas: filas.map((f) => ({ id: f.id, subidoEn: f.subido_en, estado: f.estado, pedidoId: f.pedido_id, productos: f.productos === null ? null : Number(f.productos), archivos: f.archivos || [] })),
  });
});

module.exports = { rutas, demo, permisos };
