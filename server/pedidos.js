'use strict';

// Flujo guiado de un pedido:
//   1. Lista inicial → 2. Subir export → 3. Ver reporte → 4. Lista final → 5. ¿Por qué cambió?
// Reglas que se hacen cumplir aquí (no solo en pantalla):
//   - No se puede subir el export ni ver el reporte sin haber guardado la lista inicial.
//   - La lista inicial queda fija al guardarla.
//   - La comparación se hace en el servidor, por código de producto.

const express = require('express');
const multer = require('multer');
const zlib = require('zlib');
const db = require('./db');
const { requiereUsuario, registrarEvento, ErrorUsuario } = require('./cuentas');
const { leerExport, leerLista } = require('./lector');
const { calcularRotacion } = require('./rotacion');
const { seriesSemanales } = require('./series');
const { revisarLista, compararListas, coherenciaConReporte } = require('./listas');
const recordatorios = require('./recordatorios');
const { correoConfigurado } = require('./correo');

const MAX_LINEAS = 5000;
const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024, files: 5 },
});

// Un archivo subido: nombre en UTF-8 y contenido. En Vercel una petición no puede pasar de 4,5 MB,
// así que el navegador comprime con gzip los archivos grandes (lib/api.ts, prepararArchivo) y
// les agrega ".gz" al nombre: aquí se descomprimen y se guardan como el original.
const MAX_DESCOMPRIMIDO = 80 * 1024 * 1024;
function archivoSubido(f) {
  let nombre = Buffer.from(f.originalname, 'latin1').toString('utf8');
  let buffer = f.buffer;
  if (/\.gz$/i.test(nombre)) {
    try {
      buffer = zlib.gunzipSync(buffer, { maxOutputLength: MAX_DESCOMPRIMIDO });
    } catch {
      throw new ErrorUsuario(`No pudimos abrir "${nombre}". Vuelve a subirlo.`);
    }
    nombre = nombre.replace(/\.gz$/i, '');
  }
  return { nombre, buffer };
}

const rutas = express.Router();
rutas.use(requiereUsuario);

// --- Utilidades --------------------------------------------------------------------

function pasoDe(p) {
  if (!p.inicial_guardada_en) return 1;
  if (!p.export_id) return 2;
  if (!p.reporte_visto_en) return 3;
  if (!p.final_guardada_en) return 4;
  if (!p.terminado_en) return 5;
  return 6; // terminado
}

async function pedidoDe(req, cliente = null) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new ErrorUsuario('Ese pedido no existe.', 404);
  const q = cliente ? (s, p) => cliente.query(s, p).then((r) => r.rows) : db.query;
  const [p] = await q('SELECT * FROM pedidos WHERE id = $1 AND usuario_id = $2', [id, req.usuario.id]);
  if (!p) throw new ErrorUsuario('Ese pedido no existe.', 404);
  return p;
}

async function exportDe(p) {
  if (!p.export_id) return null;
  const e = await db.uno('SELECT id, subido_en, estado, reporte FROM exports WHERE id = $1', [p.export_id]);
  if (!e) return null;
  const archivos = await db.query('SELECT id, nombre, tamano, subido_en FROM archivos WHERE export_id = $1 ORDER BY id', [e.id]);
  return {
    id: e.id,
    subidoEn: e.subido_en,
    archivos: archivos.map((a) => ({ nombre: a.nombre, tamano: a.tamano, subidoEn: a.subido_en })),
    resumen: e.reporte ? e.reporte.resumen : null,
  };
}

async function vistaPedido(p) {
  const paso = pasoDe(p);
  // Número del pedido para el usuario (1, 2, 3…): el id es de toda la base y no le dice nada.
  const { n: numero } = await db.uno('SELECT count(*)::int AS n FROM pedidos WHERE usuario_id = $1 AND id <= $2', [p.usuario_id, p.id]);
  let listaFinal = p.lista_final;
  if (!listaFinal && p.reporte_visto_en) listaFinal = p.lista_inicial; // arranca como copia de la inicial
  const archivosSubidos = await db.query(
    "SELECT nombre, tamano, subido_en FROM archivos WHERE pedido_id = $1 AND tipo = 'export' ORDER BY id DESC",
    [p.id],
  );
  return {
    id: p.id,
    proveedor: p.proveedor,
    tipo: p.tipo,
    creadoEn: p.creado_en,
    numero,
    paso,
    terminado: paso === 6,
    listaInicial: p.lista_inicial,
    inicialGuardadaEn: p.inicial_guardada_en,
    export: await exportDe(p),
    archivosSubidos: archivosSubidos.map((a) => ({ nombre: a.nombre, tamano: a.tamano, subidoEn: a.subido_en })),
    reporteVistoEn: p.reporte_visto_en,
    listaFinal: p.reporte_visto_en ? listaFinal : null,
    finalGuardadaEn: p.final_guardada_en,
    // La coherencia con el reporte es solo para el equipo: mostrarla antes del
    // "¿por qué cambió?" le diría al usuario qué respuesta esperamos.
    comparacion: p.comparacion ? { ...p.comparacion, coherencia: undefined } : null,
    porQue: p.por_que,
    terminadoEn: p.terminado_en,
  };
}

function lineasDelCuerpo(body) {
  const lineas = Array.isArray(body?.lineas) ? body.lineas : [];
  if (lineas.length > MAX_LINEAS) throw new ErrorUsuario(`La lista tiene más de ${MAX_LINEAS} filas.`);
  return lineas.map((l) => ({
    codigo: l && l.codigo !== undefined && l.codigo !== null ? String(l.codigo).slice(0, 100) : '',
    nombre: l && l.nombre !== undefined && l.nombre !== null ? String(l.nombre).slice(0, 200) : '',
    cantidad: l && l.cantidad !== undefined && l.cantidad !== null ? (typeof l.cantidad === 'number' ? l.cantidad : String(l.cantidad).slice(0, 30)) : '',
  }));
}

// Borrador: quita filas vacías del final para no guardar basura.
function borrador(lineas) {
  const out = lineas.slice();
  while (out.length && !out[out.length - 1].codigo && out[out.length - 1].cantidad === '' && !out[out.length - 1].nombre) out.pop();
  return out;
}

function tipoValido(t) {
  return t === 'real' || t === 'simulado' ? t : null;
}

function errorLista(revision) {
  return new ErrorUsuario('Revisa la lista antes de guardar.', 400, { errores: revision.errores });
}

async function mapeosDe(usuarioId) {
  const u = await db.uno('SELECT mapeos FROM usuarios WHERE id = $1', [usuarioId]);
  return (u && u.mapeos) || {};
}

// Recuerda las columnas que el usuario eligió, para que la próxima vez su archivo se lea solo.
async function recordarMapeo(usuarioId, tipo, firma, columnas) {
  const mapeos = await mapeosDe(usuarioId);
  mapeos[tipo] = mapeos[tipo] || {};
  mapeos[tipo][firma] = columnas;
  await db.query('UPDATE usuarios SET mapeos = $1::jsonb WHERE id = $2', [JSON.stringify(mapeos), usuarioId]);
}

function leerMapeoManual(valor) {
  if (!valor) return null;
  try {
    const m = typeof valor === 'string' ? JSON.parse(valor) : valor;
    return m && typeof m === 'object' ? m : null;
  } catch {
    return null;
  }
}

// --- Pedidos ------------------------------------------------------------------------

rutas.get('/', async (req, res) => {
  const filas = await db.query(
    `SELECT id, proveedor, tipo, creado_en, inicial_guardada_en, export_id, reporte_visto_en,
            final_guardada_en, terminado_en, comparacion->'conteo' AS conteo,
            jsonb_array_length(lista_inicial) AS lineas_inicial
       FROM pedidos WHERE usuario_id = $1 ORDER BY creado_en DESC`,
    [req.usuario.id],
  );
  res.json({
    pedidos: filas.map((p) => ({
      id: p.id,
      proveedor: p.proveedor,
      tipo: p.tipo,
      creadoEn: p.creado_en,
      paso: pasoDe(p),
      lineasInicial: p.lineas_inicial,
      conteo: p.conteo,
      terminadoEn: p.terminado_en,
    })),
  });
});

rutas.post('/', async (req, res) => {
  const p = await db.uno(
    'INSERT INTO pedidos (usuario_id, proveedor) VALUES ($1, $2) RETURNING *',
    [req.usuario.id, String(req.body?.proveedor || '').trim().slice(0, 120)],
  );
  await registrarEvento(req.usuario.id, 'pedido_iniciado', { pedidoId: p.id });
  res.status(201).json({ pedido: await vistaPedido(p) });
});

rutas.get('/:id', async (req, res) => {
  res.json({ pedido: await vistaPedido(await pedidoDe(req)) });
});

// --- Paso 1: lista inicial --------------------------------------------------------------

rutas.put('/:id/lista-inicial', async (req, res) => {
  const p = await pedidoDe(req);
  if (p.inicial_guardada_en) throw new ErrorUsuario('La lista inicial ya está guardada y no se puede cambiar.', 409);
  const lineas = borrador(lineasDelCuerpo(req.body));
  await db.query(
    'UPDATE pedidos SET lista_inicial = $1::jsonb, tipo = $2, proveedor = $3 WHERE id = $4 AND inicial_guardada_en IS NULL',
    [JSON.stringify(lineas), tipoValido(req.body?.tipo), String(req.body?.proveedor ?? p.proveedor).trim().slice(0, 120), p.id],
  );
  res.json({ ok: true });
});

rutas.post('/:id/lista-inicial', async (req, res) => {
  const p = await pedidoDe(req);
  if (p.inicial_guardada_en) throw new ErrorUsuario('La lista inicial ya está guardada y no se puede cambiar.', 409);
  const tipo = tipoValido(req.body?.tipo);
  if (!tipo) throw new ErrorUsuario('Marca si el pedido es real o simulado.');
  const revision = revisarLista(lineasDelCuerpo(req.body));
  if (revision.errores.length) throw errorLista(revision);
  if (!revision.lineas.length) throw new ErrorUsuario('La lista está vacía. Escribe al menos un producto con su cantidad.');
  // revisar: true -> solo valida (para avisar antes de dejarla fija)
  if (req.body?.revisar) return res.json({ lineas: revision.lineas.length, avisos: revision.avisos });
  const actualizado = await db.uno(
    `UPDATE pedidos SET lista_inicial = $1::jsonb, tipo = $2, proveedor = $3, inicial_guardada_en = now()
      WHERE id = $4 AND usuario_id = $5 AND inicial_guardada_en IS NULL RETURNING *`,
    [JSON.stringify(revision.lineas), tipo, String(req.body?.proveedor ?? p.proveedor).trim().slice(0, 120), p.id, req.usuario.id],
  );
  if (!actualizado) throw new ErrorUsuario('La lista inicial ya está guardada y no se puede cambiar.', 409);
  await registrarEvento(req.usuario.id, 'lista_inicial_guardada', { pedidoId: p.id, detalle: { lineas: revision.lineas.length, tipo } });
  res.json({ pedido: await vistaPedido(actualizado), avisos: revision.avisos });
});

// Importar la lista desde el Excel o CSV con el que el usuario arma su pedido.
rutas.post('/:id/importar-lista', subida.single('archivo'), async (req, res) => {
  const p = await pedidoDe(req);
  const para = req.body?.para === 'final' ? 'final' : 'inicial';
  if (para === 'inicial' && p.inicial_guardada_en) throw new ErrorUsuario('La lista inicial ya está guardada y no se puede cambiar.', 409);
  if (para === 'final' && (!p.reporte_visto_en || p.terminado_en)) throw new ErrorUsuario('Ahora no se puede cambiar la lista final.', 409);

  let archivo;
  if (req.body?.archivoId) {
    archivo = await db.uno(
      "SELECT id, nombre, contenido FROM archivos WHERE id = $1 AND usuario_id = $2 AND pedido_id = $3 AND tipo = 'lista'",
      [Number(req.body.archivoId), req.usuario.id, p.id],
    );
    if (!archivo) throw new ErrorUsuario('No encontramos ese archivo. Vuelve a subirlo.', 404);
  } else {
    if (!req.file) throw new ErrorUsuario('Elige un archivo de Excel o CSV.');
    const { nombre, buffer } = archivoSubido(req.file);
    archivo = await db.uno(
      "INSERT INTO archivos (usuario_id, pedido_id, tipo, nombre, tamano, contenido) VALUES ($1, $2, 'lista', $3, $4, $5) RETURNING id, nombre, contenido",
      [req.usuario.id, p.id, nombre, buffer.length, buffer],
    );
    await registrarEvento(req.usuario.id, 'archivo_subido', { pedidoId: p.id, detalle: { tipo: 'lista', nombre } });
  }

  const manual = leerMapeoManual(req.body?.mapeo);
  const mapeos = await mapeosDe(req.usuario.id);
  const resultado = leerLista(Buffer.from(archivo.contenido), archivo.nombre, manual ? { porClave: manual } : { porFirma: mapeos.lista });
  if (resultado.ok && manual && manual[resultado.clave]) await recordarMapeo(req.usuario.id, 'lista', resultado.firma, manual[resultado.clave]);
  res.json({ ...resultado, archivoId: archivo.id, archivo: archivo.nombre });
});

// --- Paso 2: export de ventas y existencias -----------------------------------------------

// Periodo de un informe que trae el total vendido sin fecha por venta: "YYYY-MM-DD".
function leerPeriodo(body) {
  const desde = String(body?.desde || '').trim();
  const hasta = String(body?.hasta || '').trim();
  if (!desde && !hasta) return null;
  const valida = (t) => /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(`${t}T00:00:00Z`));
  if (!valida(desde) || !valida(hasta)) throw new ErrorUsuario('Escribe las dos fechas del periodo.');
  const dias = (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000 + 1;
  if (dias < 7) throw new ErrorUsuario('El periodo tiene que ser de al menos una semana, y la fecha final no puede ser antes de la inicial.');
  if (dias > 366 * 5) throw new ErrorUsuario('El periodo no puede ser de más de cinco años.');
  if (Date.parse(`${hasta}T00:00:00Z`) > Date.now() + 86400000) throw new ErrorUsuario('La fecha final no puede ser después de hoy.');
  return { desde, hasta };
}

async function procesarExport(usuarioId, pedido, exportId, manual) {
  const archivos = await db.query('SELECT nombre, contenido FROM archivos WHERE export_id = $1 ORDER BY id', [exportId]);
  const { periodo, documentos } = await db.uno('SELECT periodo, documentos FROM exports WHERE id = $1', [exportId]);
  const mapeos = await mapeosDe(usuarioId);
  const lectura = leerExport(
    archivos.map((a) => ({ nombre: a.nombre, buffer: Buffer.from(a.contenido) })),
    manual ? { porClave: manual } : { porFirma: mapeos.export },
    { periodo, documentos, documentosPorFirma: mapeos.documentos },
  );
  if (!lectura.ok) {
    await db.query("UPDATE exports SET estado = 'error', errores = $1::jsonb, hojas = $2::jsonb WHERE id = $3", [JSON.stringify(lectura.errores), JSON.stringify(lectura.hojas), exportId]);
    return {
      ok: false,
      errores: lectura.errores,
      hojas: lectura.hojas,
      necesitaPeriodo: Boolean(lectura.necesitaPeriodo),
      periodoSugerido: lectura.periodoSugerido || null,
      necesitaDocumentos: Boolean(lectura.necesitaDocumentos),
      documentos: lectura.necesitaDocumentos ? lectura.documentos : undefined,
      exportId,
    };
  }
  // Los documentos que marcó como ventas se recuerdan: la próxima vez su informe se lee solo.
  if (lectura.documentos) for (const [firma, lista] of Object.entries(lectura.documentos)) await recordarMapeo(usuarioId, 'documentos', firma, lista);
  const rotacion = calcularRotacion({ ventas: lectura.ventas, existencias: lectura.existencias, mensual: lectura.mensual, periodo: lectura.periodo });
  const reporte = {
    ...rotacion,
    avisos: [...lectura.avisos, ...rotacion.avisos],
    hojasUsadas: lectura.hojasUsadas.map(({ archivo, hoja, uso, columnas, porMes }) => ({ archivo, hoja, uso, columnas, porMes })),
  };
  const series = seriesSemanales(lectura.ventas, { mensual: lectura.mensual, totales: Boolean(lectura.periodo) });
  await db.query(
    "UPDATE exports SET estado = 'ok', errores = NULL, hojas = $1::jsonb, reporte = $2::jsonb, series = $3::jsonb, catalogo = $4::jsonb WHERE id = $5",
    [JSON.stringify(lectura.hojas), JSON.stringify(reporte), series ? JSON.stringify(series) : null, JSON.stringify(lectura.catalogo || {}), exportId],
  );
  // Sin pedido: el archivo se subió desde "Datos" y solo actualiza el inventario guardado.
  if (pedido) await db.query('UPDATE pedidos SET export_id = $1 WHERE id = $2', [exportId, pedido.id]);
  if (manual) {
    for (const h of lectura.hojasUsadas) if (manual[h.clave]) await recordarMapeo(usuarioId, 'export', h.firma, manual[h.clave]);
  }
  return { ok: true, exportId, resumen: rotacion.resumen, periodo: rotacion.periodo, hojasUsadas: reporte.hojasUsadas };
}

function exigirInicialGuardada(p) {
  if (!p.inicial_guardada_en) {
    throw new ErrorUsuario('Primero guarda tu lista inicial. Así podemos comparar lo que ibas a pedir con lo que decidas después de ver el reporte.', 403);
  }
}

rutas.post('/:id/export', subida.array('archivos', 5), async (req, res) => {
  const p = await pedidoDe(req);
  exigirInicialGuardada(p);
  if (p.terminado_en) throw new ErrorUsuario('Este pedido ya está terminado.', 409);
  if (!req.files || !req.files.length) throw new ErrorUsuario('Elige el archivo de ventas y existencias.');

  const periodo = leerPeriodo(req.body);
  const exp = await db.uno("INSERT INTO exports (usuario_id, pedido_id, estado, periodo) VALUES ($1, $2, 'procesando', $3::jsonb) RETURNING id", [req.usuario.id, p.id, periodo ? JSON.stringify(periodo) : null]);
  const nombres = [];
  for (const f of req.files) {
    const { nombre, buffer } = archivoSubido(f);
    nombres.push(nombre);
    await db.query(
      "INSERT INTO archivos (usuario_id, pedido_id, export_id, tipo, nombre, tamano, contenido) VALUES ($1, $2, $3, 'export', $4, $5, $6)",
      [req.usuario.id, p.id, exp.id, nombre, buffer.length, buffer],
    );
  }
  await registrarEvento(req.usuario.id, 'archivo_subido', { pedidoId: p.id, detalle: { tipo: 'export', archivos: nombres } });
  res.json(await procesarExport(req.usuario.id, p, exp.id, null));
});

// Usar el inventario que ya subió (desde "Datos" o en otro pedido) en vez de subirlo otra vez.
// Igual que subirlo: solo después de guardar la lista inicial.
rutas.post('/:id/export/usar-ultimo', async (req, res) => {
  const p = await pedidoDe(req);
  exigirInicialGuardada(p);
  if (p.terminado_en) throw new ErrorUsuario('Este pedido ya está terminado.', 409);
  const e = await db.uno("SELECT id, reporte->'resumen' AS resumen, reporte->'periodo' AS periodo FROM exports WHERE usuario_id = $1 AND estado = 'ok' ORDER BY subido_en DESC, id DESC LIMIT 1", [req.usuario.id]);
  if (!e) throw new ErrorUsuario('Todavía no has subido tu inventario. Súbelo aquí.', 404);
  await db.query('UPDATE pedidos SET export_id = $1 WHERE id = $2', [e.id, p.id]);
  await registrarEvento(req.usuario.id, 'export_reusado', { pedidoId: p.id, detalle: { exportId: e.id } });
  res.json({ ok: true, exportId: e.id, resumen: e.resumen, periodo: e.periodo });
});

// Cuando no reconocemos una columna, el usuario la elige y se vuelve a leer el mismo archivo.
rutas.post('/:id/export/:exportId/columnas', async (req, res) => {
  const p = await pedidoDe(req);
  exigirInicialGuardada(p);
  if (p.terminado_en) throw new ErrorUsuario('Este pedido ya está terminado.', 409);
  const exp = await db.uno('SELECT id FROM exports WHERE id = $1 AND pedido_id = $2 AND usuario_id = $3', [Number(req.params.exportId), p.id, req.usuario.id]);
  if (!exp) throw new ErrorUsuario('No encontramos ese archivo. Vuelve a subirlo.', 404);
  const manual = leerMapeoManual(req.body?.mapeo);
  if (!manual) throw new ErrorUsuario('Elige las columnas.');
  res.json(await procesarExport(req.usuario.id, p, exp.id, manual));
});

// El informe mezcla compras, ventas y ajustes: el usuario marca qué documentos son ventas.
rutas.post('/:id/export/:exportId/documentos', async (req, res) => {
  const p = await pedidoDe(req);
  exigirInicialGuardada(p);
  if (p.terminado_en) throw new ErrorUsuario('Este pedido ya está terminado.', 409);
  const exp = await db.uno('SELECT id FROM exports WHERE id = $1 AND pedido_id = $2 AND usuario_id = $3', [Number(req.params.exportId), p.id, req.usuario.id]);
  if (!exp) throw new ErrorUsuario('No encontramos ese archivo. Vuelve a subirlo.', 404);
  const lista = Array.isArray(req.body?.documentos) ? req.body.documentos.map((x) => String(x).slice(0, 30)).slice(0, 50) : [];
  if (!lista.length) throw new ErrorUsuario('Marca al menos un tipo de documento que sea venta.');
  await db.query('UPDATE exports SET documentos = $1::jsonb WHERE id = $2', [JSON.stringify(lista), exp.id]);
  res.json(await procesarExport(req.usuario.id, p, exp.id, leerMapeoManual(req.body?.mapeo)));
});

// El archivo trae el total vendido sin fecha por venta: el usuario dice de qué periodo es.
rutas.post('/:id/export/:exportId/periodo', async (req, res) => {
  const p = await pedidoDe(req);
  exigirInicialGuardada(p);
  if (p.terminado_en) throw new ErrorUsuario('Este pedido ya está terminado.', 409);
  const exp = await db.uno('SELECT id FROM exports WHERE id = $1 AND pedido_id = $2 AND usuario_id = $3', [Number(req.params.exportId), p.id, req.usuario.id]);
  if (!exp) throw new ErrorUsuario('No encontramos ese archivo. Vuelve a subirlo.', 404);
  const periodo = leerPeriodo(req.body);
  if (!periodo) throw new ErrorUsuario('Escribe las dos fechas del periodo.');
  await db.query('UPDATE exports SET periodo = $1::jsonb WHERE id = $2', [JSON.stringify(periodo), exp.id]);
  res.json(await procesarExport(req.usuario.id, p, exp.id, leerMapeoManual(req.body?.mapeo)));
});

// --- Paso 3: reporte ----------------------------------------------------------------------

rutas.get('/:id/reporte', async (req, res) => {
  const p = await pedidoDe(req);
  exigirInicialGuardada(p);
  if (!p.export_id) throw new ErrorUsuario('Primero sube tu export de ventas y existencias.', 409);
  const e = await db.uno("SELECT id, subido_en, reporte FROM exports WHERE id = $1 AND estado = 'ok'", [p.export_id]);
  if (!e) throw new ErrorUsuario('Primero sube tu export de ventas y existencias.', 409);
  if (!p.reporte_visto_en) {
    const r = await db.uno('UPDATE pedidos SET reporte_visto_en = now() WHERE id = $1 AND reporte_visto_en IS NULL RETURNING id', [p.id]);
    if (r) await registrarEvento(req.usuario.id, 'reporte_visto', { pedidoId: p.id });
  }
  const archivos = await db.query('SELECT nombre FROM archivos WHERE export_id = $1 ORDER BY id', [e.id]);
  res.json({ reporte: { ...e.reporte, subidoEn: e.subido_en, archivos: archivos.map((a) => a.nombre) } });
});

// --- Recordatorio por correo (se ofrece al ver el reporte) ---------------------------------

async function planDelPedido(p) {
  if (!p.reporte_visto_en || !p.export_id) throw new ErrorUsuario('Primero mira el reporte de rotación.', 409);
  const e = await db.uno("SELECT subido_en, reporte->'filas' AS filas FROM exports WHERE id = $1 AND estado = 'ok'", [p.export_id]);
  if (!e) throw new ErrorUsuario('Primero sube tu export de ventas y existencias.', 409);
  const fechaReporte = recordatorios.fechaBogota(e.subido_en);
  return { fechaReporte, avisos: recordatorios.planearAvisos(e.filas || [], fechaReporte) };
}

async function vistaRecordatorio(req, p, extra = {}) {
  const plan = await planDelPedido(p);
  const primero = plan.avisos[0] || null;
  return {
    email: req.usuario.email,
    plan: {
      fechaReporte: plan.fechaReporte,
      productos: plan.avisos.length,
      recordatorios: recordatorios.agruparPorSemana(plan.avisos).length,
      primero: primero && { codigo: primero.codigo, nombre: primero.nombre, fechaUmbral: primero.fechaUmbral, fechaAviso: primero.fechaAviso },
      semanasBuenNivel: recordatorios.SEMANAS_BUEN_NIVEL,
      semanasHorizonte: recordatorios.SEMANAS_HORIZONTE,
      diasAntes: recordatorios.DIAS_ANTES,
      correo: correoConfigurado(),
    },
    respuesta: await recordatorios.estadoDe(req.usuario.id),
    ...extra,
  };
}

rutas.get('/:id/recordatorio', async (req, res) => {
  res.json(await vistaRecordatorio(req, await pedidoDe(req)));
});

rutas.post('/:id/recordatorio', async (req, res) => {
  const p = await pedidoDe(req);
  if (typeof req.body?.activo !== 'boolean') throw new ErrorUsuario('Elige si quieres recibir los avisos.');
  const plan = await planDelPedido(p);
  if (req.body.activo && !plan.avisos.length) throw new ErrorUsuario(`Ningún producto de este reporte llega a 2 semanas de inventario en los próximos ${recordatorios.SEMANAS_HORIZONTE} semanas, así que no hay nada que recordar.`);
  const envio = await recordatorios.responder({ usuario: req.usuario, pedidoId: p.id, activo: req.body.activo, avisos: plan.avisos, fechaReporte: plan.fechaReporte });
  res.json(await vistaRecordatorio(req, p, envio));
});

// El archivo de calendario: Google Calendar, Outlook y los celulares lo abren y agregan los recordatorios.
rutas.get('/:id/recordatorio.ics', async (req, res) => {
  const p = await pedidoDe(req);
  const plan = await planDelPedido(p);
  if (!plan.avisos.length) throw new ErrorUsuario('Este reporte no tiene productos para recordar.', 404);
  await registrarEvento(req.usuario.id, 'calendario_descargado', { pedidoId: p.id, detalle: { productos: plan.avisos.length } });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="recordatorios-inventario-pedido-${p.id}.ics"`);
  res.send(recordatorios.calendarioIcs({ avisos: plan.avisos, fechaReporte: plan.fechaReporte, url: `${recordatorios.urlApp()}/panel`, idBase: `${req.usuario.id}-${p.id}` }));
});

// --- Paso 4: lista final --------------------------------------------------------------------

async function filasDelReporte(exportId) {
  if (!exportId) return [];
  const e = await db.uno("SELECT reporte->'filas' AS filas FROM exports WHERE id = $1", [exportId]);
  return (e && e.filas) || [];
}

function exigirListaFinalEditable(p) {
  exigirInicialGuardada(p);
  if (!p.reporte_visto_en) throw new ErrorUsuario('Primero mira el reporte de rotación.', 409);
  if (p.terminado_en) throw new ErrorUsuario('Este pedido ya está terminado.', 409);
}

rutas.put('/:id/lista-final', async (req, res) => {
  const p = await pedidoDe(req);
  exigirListaFinalEditable(p);
  await db.query('UPDATE pedidos SET lista_final = $1::jsonb WHERE id = $2', [JSON.stringify(borrador(lineasDelCuerpo(req.body))), p.id]);
  res.json({ ok: true });
});

rutas.post('/:id/lista-final', async (req, res) => {
  const p = await pedidoDe(req);
  exigirListaFinalEditable(p);
  const revision = revisarLista(lineasDelCuerpo(req.body));
  if (revision.errores.length) throw errorLista(revision);
  if (req.body?.revisar) return res.json({ lineas: revision.lineas.length, avisos: revision.avisos });
  const comparacion = compararListas(p.lista_inicial, revision.lineas);
  comparacion.coherencia = coherenciaConReporte(comparacion, await filasDelReporte(p.export_id));
  const actualizado = await db.uno(
    `UPDATE pedidos SET lista_final = $1::jsonb, comparacion = $2::jsonb, final_guardada_en = now()
      WHERE id = $3 AND terminado_en IS NULL RETURNING *`,
    [JSON.stringify(revision.lineas), JSON.stringify(comparacion), p.id],
  );
  if (!actualizado) throw new ErrorUsuario('Este pedido ya está terminado.', 409);
  await registrarEvento(req.usuario.id, 'lista_final_guardada', { pedidoId: p.id, detalle: comparacion.conteo });
  res.json({ pedido: await vistaPedido(actualizado), avisos: revision.avisos });
});

// --- Paso 5: ¿por qué cambió? ------------------------------------------------------------------

rutas.post('/:id/por-que', async (req, res) => {
  const p = await pedidoDe(req);
  if (!p.final_guardada_en) throw new ErrorUsuario('Primero guarda tu lista final.', 409);
  if (p.terminado_en) throw new ErrorUsuario('Este pedido ya está terminado.', 409);
  const respuesta = String(req.body?.respuesta || '').trim().slice(0, 5000);
  if (!respuesta) throw new ErrorUsuario('Cuéntanos en una o dos frases por qué cambiaste lo que cambiaste.');
  const actualizado = await db.uno(
    'UPDATE pedidos SET por_que = $1, terminado_en = now() WHERE id = $2 AND terminado_en IS NULL RETURNING *',
    [respuesta, p.id],
  );
  if (!actualizado) throw new ErrorUsuario('Este pedido ya está terminado.', 409);
  await registrarEvento(req.usuario.id, 'pedido_terminado', { pedidoId: p.id, detalle: { ...p.comparacion.conteo, tipo: p.tipo } });
  res.json({ pedido: await vistaPedido(actualizado) });
});

module.exports = { rutas, pasoDe, filasDelReporte, procesarExport, leerPeriodo, leerMapeoManual, subida, archivoSubido };
