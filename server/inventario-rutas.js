'use strict';

// El inventario guardado del usuario (panel, productos y pedido sugerido) y la demo.
//
//   GET  /api/demo                  los negocios de ejemplo
//   GET  /api/demo/:id              el inventario de ejemplo, igual al de un usuario
//   GET  /api/inventario            el inventario de la empresa: el último archivo y los movimientos
//                                   registrados después (?horizonte= semanas del pronóstico)
//   PUT  /api/inventario/ajustes    tiempos de entrega por proveedor y cada cuánto pide
//   POST /api/inventario/export     subir un archivo nuevo sin estar en un pedido (+ columnas, documentos, periodo)
//
// Regla de la prueba: un probador solo puede subir su inventario por fuera de un pedido después
// de guardar su primera lista inicial. Si lo viera antes, su primera lista ya no sería "lo que
// iba a pedir sin el reporte" y la métrica M no mediría nada. La cantidad sugerida tampoco se
// le muestra durante sus 14 días de prueba (docs/PLAN_REESTRUCTURACION.md).

const express = require('express');
const db = require('./db');
const { requiereUsuario, registrarEvento, ErrorUsuario, leerPreferencias } = require('./cuentas');
const { procesarExport, leerPeriodo, leerMapeoManual, subida, archivoSubido, leerDocumentos } = require('./pedidos');
const { DIAS_PRUEBA } = require('./equipo');
const { leerExport } = require('./lector');
const { seriesSemanales } = require('./series');
const { construirInventario, leerAjustes, resumirParaOperador } = require('./inventario');
const { inventarioAlDia, agregarAlCatalogo } = require('./movimientos');
const { inventarioDemo, sectores } = require('./demo');
const { estadoDe } = require('./recordatorios');

// --- Demo (sin cuenta) -------------------------------------------------------------------

const demo = express.Router();

demo.get('/', (_req, res) => {
  res.json({ sectores: sectores() });
});

// ?ajustes={"entregas":{...},"cadaCuanto":4}: los tiempos de entrega que el visitante cambió.
// ?horizonte=8 y ?perfil=operador: lo mismo que elige una cuenta, para ver las dos vistas sin cuenta.
demo.get('/:id', (req, res) => {
  let ajustes = null;
  if (req.query.ajustes) {
    try {
      ajustes = leerAjustes(JSON.parse(String(req.query.ajustes)));
    } catch {
      ajustes = null;
    }
  }
  const horizonte = leerPreferencias({ horizonte: req.query.horizonte }).horizonte;
  const operador = req.query.perfil === 'operador';
  const inv = inventarioDemo(String(req.params.id), ajustes, horizonte);
  if (!inv) throw new ErrorUsuario('No tenemos ese ejemplo.', 404);
  const propio = ajustes || req.query.horizonte !== undefined || operador;
  res.setHeader('Cache-Control', propio ? 'no-store' : 'public, max-age=600');
  res.json({ inventario: operador ? resumirParaOperador(inv) : inv });
});

// --- Inventario del usuario ---------------------------------------------------------------

const rutas = express.Router();
rutas.use(requiereUsuario);

async function inicioDePrueba(usuarioId) {
  const r = await db.uno('SELECT min(inicial_guardada_en) AS inicio FROM pedidos WHERE usuario_id = $1 AND inicial_guardada_en IS NOT NULL', [usuarioId]);
  return r && r.inicio ? new Date(r.inicio) : null;
}

// Qué puede ver y hacer el usuario: el inventario aparece después de su primera lista inicial.
async function permisos(usuario) {
  if (usuario.rol === 'equipo') return { puedeSubir: true, sugerencias: true, alcance: 'completo', finPrueba: null };
  const inicio = await inicioDePrueba(usuario.id);
  const fin = inicio ? new Date(inicio.getTime() + DIAS_PRUEBA * 86400000) : null;
  const terminada = Boolean(fin && Date.now() > fin.getTime());
  // Desde el 2026-10-14 (decisión del equipo) el probador ve todo desde el primer día: el reporte,
  // el pronóstico y la cantidad sugerida. La ventana de 14 días de la prueba no cambia.
  return {
    puedeSubir: Boolean(inicio),
    sugerencias: true,
    alcance: 'completo',
    finPrueba: terminada ? null : fin,
  };
}

// El inventario es de la empresa: el último archivo bueno de cualquiera de sus miembros, o el
// calculado con los movimientos del día (origen 'movimientos').
async function ultimoExport(empresaId) {
  return db.uno(
    `SELECT id, usuario_id, pedido_id, subido_en, reporte, series, catalogo, periodo, documentos, origen, movimientos, base_export_id
       FROM exports WHERE empresa_id = $1 AND estado = 'ok' AND ${db.EXPORT_VIGENTE} ORDER BY subido_en DESC, id DESC LIMIT 1`,
    [empresaId],
  );
}

// Los archivos subidos antes de que existiera el panel no tienen las ventas por semana: se
// leen de nuevo una vez y se guardan. El reporte no se toca (es el que vio el probador).
async function completarSeries(e) {
  if (e.series || (e.reporte && e.reporte.periodo && e.reporte.periodo.totales)) return e;
  const archivos = await db.query('SELECT nombre, contenido FROM archivos WHERE export_id = $1 ORDER BY id', [e.id]);
  if (!archivos.length) return e;
  // Las columnas que recordó quien subió el archivo (puede ser otra persona de la empresa).
  const u = await db.uno('SELECT mapeos FROM usuarios WHERE id = $1', [e.usuario_id]);
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
  const empresaId = req.usuario.empresa_id;
  const perfil = req.usuario.perfil || 'analista';
  // Horizonte del pronóstico en semanas: el de la cuenta, o el que pide la pantalla.
  const pref = leerPreferencias(req.usuario.preferencias);
  const horizonte = req.query.horizonte !== undefined ? leerPreferencias({ horizonte: req.query.horizonte }).horizonte : pref.horizonte;
  await inventarioAlDia(empresaId);
  const emp = await db.uno('SELECT inventario FROM empresas WHERE id = $1', [empresaId]);
  const cab = await db.uno(`SELECT id FROM exports WHERE empresa_id = $1 AND estado = 'ok' AND ${db.EXPORT_VIGENTE} ORDER BY subido_en DESC, id DESC LIMIT 1`, [empresaId]);
  if (!cab) {
    // Sin archivo todavía: igual van sus ajustes (proveedores y tiempos), para el paso 1 del pedido.
    return res.json({ inventario: null, ajustes: leerAjustes(emp && emp.inventario), ...per, perfil });
  }
  const llave = JSON.stringify([cab.id, per.alcance, emp.inventario, req.usuario.sistema, req.usuario.nombre, horizonte]);
  let inventario = calculados.get(llave);
  if (!inventario) {
    const e = await completarSeries(await ultimoExport(empresaId));
    const archivos = await db.query('SELECT nombre FROM archivos WHERE export_id = $1 ORDER BY id', [e.base_export_id || e.id]);
    inventario = construirInventario({
      reporte: e.reporte,
      series: e.series,
      catalogo: e.catalogo,
      ajustes: emp.inventario,
      semanasPronostico: horizonte,
      fuente: {
        exportId: e.id,
        pedidoId: e.pedido_id,
        fecha: e.subido_en,
        archivos: archivos.map((a) => a.nombre),
        programa: req.usuario.sistema,
        persona: req.usuario.nombre,
        origen: e.origen || 'archivo',
        movimientos: e.movimientos || 0,
      },
      alcance: per.alcance,
    });
    calculados.set(llave, inventario);
    if (calculados.size > MAX_CALCULADOS) calculados.delete(calculados.keys().next().value);
  }
  // El operador ve las métricas gruesas: se recorta la respuesta, el cálculo es el mismo (D3).
  res.json({ inventario: perfil === 'operador' ? resumirParaOperador(inventario) : inventario, ...per, perfil, recordatorio: await estadoDe(req.usuario.id) });
});

// Se mezcla con lo guardado: cambiar un tiempo de entrega no borra los proveedores asignados, y al revés.
// Son de la empresa: lo que cambie una persona lo ven las demás.
rutas.put('/ajustes', async (req, res) => {
  const e = await db.uno('SELECT inventario FROM empresas WHERE id = $1', [req.usuario.empresa_id]);
  const cuerpo = req.body && typeof req.body === 'object' ? req.body : {};
  const ajustes = leerAjustes({ ...(e && e.inventario), ...cuerpo });
  await db.query('UPDATE empresas SET inventario = $1::jsonb WHERE id = $2', [JSON.stringify(ajustes), req.usuario.empresa_id]);
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
  const e = await db.uno("SELECT id FROM exports WHERE id = $1 AND empresa_id = $2 AND pedido_id IS NULL AND origen = 'archivo'", [Number(req.params.exportId), req.usuario.empresa_id]);
  if (!e) throw new ErrorUsuario('No encontramos ese archivo. Vuelve a subirlo.', 404);
  return e;
}

// Guarda los archivos como un export sin pedido (el inventario de la cuenta) y los procesa.
// archivos: [{ nombre, buffer }]. También lo usa la página de ejemplos del equipo.
async function guardarExport(usuarioId, archivos, { periodo = null, desde = 'datos' } = {}) {
  const exp = await db.uno(
    "INSERT INTO exports (usuario_id, empresa_id, pedido_id, estado, periodo) VALUES ($1, (SELECT empresa_id FROM usuarios WHERE id = $1), NULL, 'procesando', $2::jsonb) RETURNING id",
    [usuarioId, periodo ? JSON.stringify(periodo) : null],
  );
  for (const a of archivos) {
    await db.query(
      "INSERT INTO archivos (usuario_id, pedido_id, export_id, tipo, nombre, tamano, contenido) VALUES ($1, NULL, $2, 'export', $3, $4, $5)",
      [usuarioId, exp.id, a.nombre, a.buffer.length, a.buffer],
    );
  }
  await registrarEvento(usuarioId, 'archivo_subido', { detalle: { tipo: 'export', archivos: archivos.map((a) => a.nombre), desde } });
  return procesarExport(usuarioId, null, exp.id, null);
}

rutas.post('/export', subida.array('archivos', 24), async (req, res) => {
  await exigirPuedeSubir(req);
  if (!req.files || !req.files.length) throw new ErrorUsuario('Elige el archivo de ventas y existencias.');
  const archivos = req.files.map(archivoSubido);
  res.json(await guardarExport(req.usuario.id, archivos, { periodo: leerPeriodo(req.body) }));
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
  await db.query('UPDATE exports SET documentos = $1::jsonb WHERE id = $2', [JSON.stringify(leerDocumentos(req.body)), exp.id]);
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

// Historial de cargas de la empresa: lo que se subió, quién y cuándo. Los inventarios calculados
// con movimientos no se listan: no son algo que alguien haya subido.
rutas.get('/cargas', async (req, res) => {
  const filas = await db.query(
    `SELECT e.id, e.subido_en, e.estado, e.pedido_id, e.reporte->'resumen'->>'productos' AS productos,
            (SELECT u.nombre FROM usuarios u WHERE u.id = e.usuario_id) AS subido_por,
            (SELECT json_agg(a.nombre ORDER BY a.id) FROM archivos a WHERE a.export_id = e.id) AS archivos
       FROM exports e WHERE e.empresa_id = $1 AND e.origen = 'archivo' AND ${db.EXPORT_VIGENTE} ORDER BY e.subido_en DESC, e.id DESC LIMIT 30`,
    [req.usuario.empresa_id],
  );
  res.json({
    cargas: filas.map((f) => ({ id: f.id, subidoEn: f.subido_en, estado: f.estado, pedidoId: f.pedido_id, productos: f.productos === null ? null : Number(f.productos), archivos: f.archivos || [], subidoPor: f.subido_por || null })),
  });
});

module.exports = { rutas, demo, permisos, guardarExport };
