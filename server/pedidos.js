'use strict';

// Dos formas de armar un pedido (D9 de docs/PLAN_ALPHA_02.md):
//   modo 'sugerido' (la de siempre desde el 2026-10-29): arranca con todas las líneas sugeridas por
//     proveedor; la persona quita, ajusta o agrega y lo cierra. Al cerrarlo se mide cuánto de lo
//     sugerido quedó tal cual (comparacion.aceptacion), sin mostrárselo a nadie (D16).
//   modo 'lista' ("Comparar con mi propia lista"), en 5 pasos:
//     1. Lista inicial → 2. Subir export → 3. Ver reporte → 4. Lista final → 5. Su pedido
// Aprobación (SP6, D11), solo del modo 'sugerido': preparando → "Enviar a aprobación" → aprobado
// (queda cerrado) o devuelto (vuelve a preparando, con el motivo). Quien tiene usuarios.aprueba ve
// los pedidos enviados de su empresa, puede ajustar sus líneas y los aprueba o los devuelve; es la
// única regla de permiso que hace cumplir el servidor. Si nadie de la empresa aprueba, o quien
// prepara aprueba, lo cierra directamente. Cada cambio de línea queda en pedido_cambios (trazas.js).
// Reglas del modo 'lista' que se hacen cumplir aquí (no solo en pantalla):
//   - No se puede subir el export ni ver el reporte sin haber guardado la lista inicial.
//   - La lista inicial queda fija al guardarla.
//   - La comparación se hace en el servidor, por código de producto.

const express = require('express');
const multer = require('multer');
const zlib = require('zlib');
const db = require('./db');
const { requiereUsuario, requiereAdminEmpresa, registrarEvento, ErrorUsuario } = require('./cuentas');
const { leerExport, leerLista } = require('./lector');
const { soloEjemplo } = require('./plantillas');
const { calcularRotacion, conUmbral, SEMANAS_SE_AGOTA } = require('./rotacion');
const { seriesSemanales } = require('./series');
const { revisarLista, compararListas, coherenciaConReporte, medirAceptacion } = require('./listas');
const { libroDePedido } = require('./exportar');
const { pedidoPdf, abrirImagen } = require('./pdf');
const trazas = require('./trazas');
const X = require('./excel');
const recordatorios = require('./recordatorios');
const { correoConfigurado } = require('./correo');
const { leerAjustes, construirInventario } = require('./inventario');
const { claveCodigo, leerNumero } = require('./valores');
const { inventarioDelUsuario, guardarInventarioDelUsuario } = require('./empresas');
const { inventarioAlDia, agregarAlCatalogo, catalogoConEscrito } = require('./movimientos');
const R = require('./recepcion');

const MAX_LINEAS = 5000;
const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024, files: 24 },
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
      throw new ErrorUsuario(`No pudimos abrir "${nombre}". Vuelva a subirlo.`);
    }
    nombre = nombre.replace(/\.gz$/i, '');
  }
  return { nombre, buffer };
}

const rutas = express.Router();
rutas.use(requiereUsuario);
// Los pedidos (y con ellos costos y sugeridos) son de gerente y administrador; el operador no los abre (T4).
rutas.use(requiereAdminEmpresa);

// --- Utilidades --------------------------------------------------------------------

function pasoDe(p) {
  // Desde lo sugerido no hay pasos: se está preparando (4) hasta que se cierra (6).
  if (p.modo === 'sugerido') return p.terminado_en ? 6 : 4;
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
  const [p] = await q('SELECT * FROM pedidos WHERE id = $1 AND usuario_id = $2 AND borrado_en IS NULL', [id, req.usuario.id]);
  if (!p) throw new ErrorUsuario('Ese pedido no existe.', 404);
  return p;
}

// Lo mismo, para cambiarlo: un pedido anulado se puede ver pero no editar.
async function pedidoActivo(req, cliente = null) {
  const p = await pedidoDe(req, cliente);
  if (p.anulado_en) throw new ErrorUsuario('Este pedido está anulado. Reactívelo para seguir.', 409);
  return p;
}

// --- Aprobación (SP6) ---------------------------------------------------------------------

// Quiénes aprueban pedidos en la empresa.
function aprobadoresDe(empresaId) {
  return db.query('SELECT id, nombre, cargo FROM usuarios WHERE empresa_id = $1 AND aprueba ORDER BY nombre', [empresaId]);
}

// Cierra su propio pedido sin enviarlo: si aprueba, o si en su empresa nadie aprueba.
async function puedeCerrarSolo(usuario) {
  if (usuario.aprueba) return true;
  return (await aprobadoresDe(usuario.empresa_id)).length === 0;
}

function estadoAprobacion(p) {
  if (p.terminado_en) return 'cerrado';
  if (p.enviado_en) return 'por_aprobar';
  if (p.devuelto_en) return 'devuelto';
  return 'preparando';
}

/**
 * Un pedido de la empresa para quien lo aprueba. 404 si no es de su empresa (o no es de los que se
 * aprueban); 403 si la persona no aprueba pedidos. pendiente: además tiene que estar esperando
 * aprobación (para ajustarlo, aprobarlo o devolverlo).
 */
async function pedidoParaAprobar(req, { pendiente = true } = {}) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new ErrorUsuario('Ese pedido no existe.', 404);
  const p = await db.uno("SELECT * FROM pedidos WHERE id = $1 AND empresa_id = $2 AND modo = 'sugerido' AND borrado_en IS NULL", [id, req.usuario.empresa_id]);
  // Uno que nunca se envió es solo de quien lo prepara.
  if (!p || (p.usuario_id !== req.usuario.id && !p.enviado_en && !p.aprobado_en && !p.devuelto_en)) throw new ErrorUsuario('Ese pedido no existe.', 404);
  if (!req.usuario.aprueba) throw new ErrorUsuario('Solo quien aprueba pedidos en su empresa puede hacer esto. Quien administra la empresa lo marca en Mi empresa.', 403);
  if (pendiente && (!p.enviado_en || p.terminado_en || p.anulado_en)) throw new ErrorUsuario('Este pedido no está esperando aprobación.', 409);
  return p;
}

// Para verlo y descargarlo: el propio o, para quien aprueba, uno enviado, devuelto o aprobado de su empresa.
async function pedidoVisible(req) {
  try {
    return await pedidoDe(req);
  } catch (e) {
    if (!(e instanceof ErrorUsuario) || e.estado !== 404 || !req.usuario.aprueba) throw e;
  }
  return pedidoParaAprobar(req, { pendiente: false });
}

// Para cambiar sus líneas: el propio mientras se prepara, o uno enviado si la persona lo aprueba.
async function pedidoEditable(req) {
  let p;
  try {
    p = await pedidoActivo(req);
  } catch (e) {
    if (!(e instanceof ErrorUsuario) || e.estado !== 404 || !req.usuario.aprueba) throw e;
    return pedidoParaAprobar(req);
  }
  exigirListaFinalEditable(p);
  if (p.enviado_en && !req.usuario.aprueba) throw new ErrorUsuario('Este pedido está esperando aprobación y ya no se puede cambiar. Si hace falta, pídale a quien lo aprueba que se lo devuelva.', 409);
  return p;
}

async function personaDe(id) {
  if (!id) return null;
  const u = await db.uno('SELECT nombre, cargo FROM usuarios WHERE id = $1', [id]);
  return u ? { nombre: u.nombre, cargo: u.cargo || '' } : null;
}

// Lo que la pantalla necesita para mostrar en qué va la aprobación y qué botones dar.
async function vistaAprobacion(p, usuario) {
  const aprobadores = p.empresa_id ? await aprobadoresDe(p.empresa_id) : [];
  const estado = estadoAprobacion(p);
  const esMio = Boolean(usuario) && p.usuario_id === usuario.id;
  const aprueba = Boolean(usuario && usuario.aprueba);
  return {
    estado,
    preparadoPor: await personaDe(p.usuario_id),
    enviadoEn: p.enviado_en,
    devuelto: p.devuelto_en && !p.enviado_en ? { en: p.devuelto_en, motivo: p.devuelto_motivo || '' } : null,
    aprobado: p.aprobado_en ? { en: p.aprobado_en, ...(await personaDe(p.aprobado_por)) } : null,
    aprobadores: aprobadores.map((a) => a.nombre),
    esMio,
    puedoAprobar: aprueba && estado === 'por_aprobar' && !p.anulado_en,
    puedoCerrar: esMio && (aprueba || !aprobadores.length),
    puedoEnviar: esMio && aprobadores.some((a) => a.id !== usuario.id),
  };
}

// El umbral de "se agota" del pedido: el que quedó fijo al ver el reporte o, antes, el que tiene
// elegido el usuario.
async function umbralDelPedido(p) {
  return p.semanas_agota || semanasAgotaDe(p.usuario_id);
}

async function exportDe(p, semanasAgota) {
  if (!p.export_id) return null;
  const e = await db.uno('SELECT id, subido_en, estado, reporte FROM exports WHERE id = $1', [p.export_id]);
  if (!e) return null;
  const archivos = await db.query('SELECT id, nombre, tamano, subido_en FROM archivos WHERE export_id = $1 ORDER BY id', [e.id]);
  return {
    id: e.id,
    subidoEn: e.subido_en,
    archivos: archivos.map((a) => ({ nombre: a.nombre, tamano: a.tamano, subidoEn: a.subido_en })),
    resumen: e.reporte ? conUmbral(e.reporte, semanasAgota).resumen : null,
  };
}

// Número del pedido para el usuario (1, 2, 3…): el id es de toda la base y no le dice nada.
async function numeroDe(p) {
  const { n } = await db.uno('SELECT count(*)::int AS n FROM pedidos WHERE usuario_id = $1 AND id <= $2 AND borrado_en IS NULL', [p.usuario_id, p.id]);
  return n;
}

// usuario: quien lo mira (para saber si lo puede aprobar, cerrar o enviar).
async function vistaPedido(p, usuario = null) {
  const paso = pasoDe(p);
  const numero = await numeroDe(p);
  const sugerido = p.modo === 'sugerido';
  let listaFinal = p.lista_final;
  if (!listaFinal && p.reporte_visto_en) listaFinal = p.lista_inicial; // arranca como copia de la inicial
  const archivosSubidos = await db.query(
    "SELECT nombre, tamano, subido_en FROM archivos WHERE pedido_id = $1 AND tipo = 'export' ORDER BY id DESC",
    [p.id],
  );
  const semanasAgota = await umbralDelPedido(p);
  return {
    id: p.id,
    modo: sugerido ? 'sugerido' : 'lista',
    proveedor: p.proveedor,
    tipo: p.tipo,
    creadoEn: p.creado_en,
    numero,
    paso,
    terminado: paso === 6,
    listaInicial: p.lista_inicial,
    inicialGuardadaEn: p.inicial_guardada_en,
    semanasAgota,
    export: await exportDe(p, semanasAgota),
    archivosSubidos: archivosSubidos.map((a) => ({ nombre: a.nombre, tamano: a.tamano, subidoEn: a.subido_en })),
    reporteVistoEn: p.reporte_visto_en,
    listaFinal: sugerido || p.reporte_visto_en ? listaFinal : null,
    // La foto de lo sugerido (para la columna "Sugerido" y "volver a lo sugerido").
    sugerido: sugerido ? p.sugerido || [] : null,
    observaciones: p.observaciones || '',
    finalGuardadaEn: p.final_guardada_en,
    // La coherencia con el reporte y la aceptación del sugerido son solo para el equipo (D16):
    // mostrarlas le diría al usuario qué respuesta esperamos.
    comparacion: p.comparacion && !sugerido ? { ...p.comparacion, coherencia: undefined, aceptacion: undefined } : null,
    porQue: p.por_que,
    anulado: p.anulado_en ? { en: p.anulado_en, motivo: p.anulado_motivo || '' } : null,
    terminadoEn: p.terminado_en,
    // Qué ha llegado de este pedido, por proveedor (SP5). Solo de los cerrados.
    recepcion: p.terminado_en && p.empresa_id ? await R.vistaRecepcion(p.empresa_id, { ...p, numero }) : null,
    // Aprobación e historial de cambios (SP6), solo desde lo sugerido.
    aprobacion: sugerido ? await vistaAprobacion(p, usuario) : null,
    historial: sugerido ? await trazas.historial(p.id) : null,
  };
}

function lineasDelCuerpo(body) {
  const lineas = Array.isArray(body?.lineas) ? body.lineas : [];
  if (lineas.length > MAX_LINEAS) throw new ErrorUsuario(`La lista tiene más de ${MAX_LINEAS} filas.`);
  return lineas.map((l) => ({
    codigo: l && l.codigo !== undefined && l.codigo !== null ? String(l.codigo).slice(0, 100) : '',
    nombre: l && l.nombre !== undefined && l.nombre !== null ? String(l.nombre).slice(0, 200) : '',
    cantidad: l && l.cantidad !== undefined && l.cantidad !== null ? (typeof l.cantidad === 'number' ? l.cantidad : String(l.cantidad).slice(0, 30)) : '',
    ...(l && l.proveedor ? { proveedor: String(l.proveedor).replace(/\s+/g, ' ').trim().slice(0, 80) } : {}),
    ...(l && l.nota ? { nota: String(l.nota).replace(/\s+/g, ' ').trim().slice(0, 200) } : {}),
  }));
}

// Lo que se escribe para quien recibe o aprueba el pedido. undefined si no vino (no se toca).
function observacionesDe(body) {
  if (!body || body.observaciones === undefined || body.observaciones === null) return undefined;
  return String(body.observaciones).trim().slice(0, 2000);
}

// El proveedor que el usuario puso en su lista queda como el de ese producto, igual que si lo
// asignara en Datos o en la ficha: así el panel, el sugerido y la orden de compra lo usan.
async function asignarProveedores(usuarioId, lineas) {
  const conProveedor = lineas.filter((l) => l.codigo && l.proveedor);
  if (!conProveedor.length) return;
  const actual = await inventarioDelUsuario(usuarioId);
  const asignaciones = { ...(actual.asignaciones || {}) };
  for (const l of conProveedor) asignaciones[claveCodigo(l.codigo)] = l.proveedor;
  await guardarInventarioDelUsuario(usuarioId, leerAjustes({ ...actual, asignaciones }));
}

// Borrador: quita filas vacías del final para no guardar basura.
function borrador(lineas) {
  const out = lineas.slice();
  while (out.length && !out[out.length - 1].codigo && out[out.length - 1].cantidad === '' && !out[out.length - 1].nombre) out.pop();
  return out;
}

// "Real o simulado" ya no se pregunta (retroalimentación de las pruebas): si no viene, es real. La
// columna se queda porque los pedidos de Alpha 0.1 la tienen y server/equipo.js la lee.
function tipoValido(t) {
  return t === 'simulado' ? 'simulado' : 'real';
}

function errorLista(revision) {
  return new ErrorUsuario('Revise la lista antes de guardar.', 400, { errores: revision.errores });
}

// Las columnas, documentos y canales recordados son de la empresa (SP5): si una persona eligió las
// columnas de un informe, a las demás ya se les lee solo. Debajo quedan los que cada persona
// recordó antes de eso (usuarios.mapeos); lo de la empresa manda.
async function mapeosDe(usuarioId) {
  const u = await db.uno('SELECT u.mapeos AS propios, e.mapeos AS empresa FROM usuarios u LEFT JOIN empresas e ON e.id = u.empresa_id WHERE u.id = $1', [usuarioId]);
  const out = {};
  for (const fuente of [u && u.propios, u && u.empresa]) {
    for (const [tipo, porFirma] of Object.entries(fuente || {})) out[tipo] = { ...(out[tipo] || {}), ...porFirma };
  }
  return out;
}

// El umbral de "se agota" que la empresa eligió en Datos (2 si no eligió).
async function semanasAgotaDe(usuarioId) {
  return leerAjustes(await inventarioDelUsuario(usuarioId)).semanasAgota;
}

// Recuerda las columnas que el usuario eligió, para que la próxima vez su archivo se lea solo.
async function recordarMapeo(usuarioId, tipo, firma, columnas) {
  const u = await db.uno('SELECT u.empresa_id, e.mapeos FROM usuarios u LEFT JOIN empresas e ON e.id = u.empresa_id WHERE u.id = $1', [usuarioId]);
  if (!u || !u.empresa_id) {
    const p = await db.uno('SELECT mapeos FROM usuarios WHERE id = $1', [usuarioId]);
    const mapeos = (p && p.mapeos) || {};
    mapeos[tipo] = { ...(mapeos[tipo] || {}), [firma]: columnas };
    return db.query('UPDATE usuarios SET mapeos = $1::jsonb WHERE id = $2', [JSON.stringify(mapeos), usuarioId]);
  }
  const mapeos = u.mapeos || {};
  mapeos[tipo] = { ...(mapeos[tipo] || {}), [firma]: columnas };
  await db.query('UPDATE empresas SET mapeos = $1::jsonb WHERE id = $2', [JSON.stringify(mapeos), u.empresa_id]);
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
            final_guardada_en, terminado_en, anulado_en, anulado_motivo, modo, enviado_en, devuelto_en, aprobado_en,
            jsonb_array_length(lista_inicial) AS lineas_inicial,
            CASE WHEN lista_final IS NULL THEN NULL ELSE jsonb_array_length(lista_final) END AS lineas_final
       FROM pedidos WHERE usuario_id = $1 AND borrado_en IS NULL ORDER BY creado_en DESC`,
    [req.usuario.id],
  );
  res.json({
    pedidos: filas.map((p) => ({
      id: p.id,
      modo: p.modo === 'sugerido' ? 'sugerido' : 'lista',
      proveedor: p.proveedor,
      creadoEn: p.creado_en,
      paso: pasoDe(p),
      // Cuántos productos lleva: la lista final (o su borrador) o, antes, la inicial.
      lineas: p.lineas_final ?? p.lineas_inicial,
      terminadoEn: p.terminado_en,
      // preparando, por_aprobar, devuelto o cerrado (solo desde lo sugerido).
      aprobacion: p.modo === 'sugerido' ? estadoAprobacion(p) : null,
      aprobado: Boolean(p.aprobado_en),
      anulado: p.anulado_en ? { en: p.anulado_en, motivo: p.anulado_motivo || '' } : null,
    })),
  });
});

// Borrar un pedido sin terminar (por ejemplo, uno que se empezó para probar). Desde que guarda la
// lista final ya no se borra: ahí se calcula la métrica y es parte de los resultados de la prueba.
rutas.delete('/:id', async (req, res) => {
  const p = await pedidoDe(req);
  if (p.terminado_en) throw new ErrorUsuario('Un pedido terminado no se puede borrar: es parte de sus resultados.', 409);
  if (p.final_guardada_en) throw new ErrorUsuario('Ya guardó la lista final de este pedido: es parte de sus resultados y no se puede borrar. Termínelo contándonos por qué cambió.', 409);
  await db.query('UPDATE pedidos SET borrado_en = now() WHERE id = $1', [p.id]);
  await registrarEvento(req.usuario.id, 'pedido_borrado', { pedidoId: p.id });
  res.json({ ok: true });
});

// Anular: el pedido no se hizo o se empezó por error, pero queda a la vista con su motivo.
// No cuenta en los resultados de la prueba y se puede reactivar.
rutas.post('/:id/anular', async (req, res) => {
  const p = await pedidoDe(req);
  if (p.anulado_en) throw new ErrorUsuario('Este pedido ya está anulado.', 409);
  const motivo = String(req.body?.motivo || '').trim().slice(0, 300);
  await db.query('UPDATE pedidos SET anulado_en = now(), anulado_motivo = $2 WHERE id = $1', [p.id, motivo || null]);
  await registrarEvento(req.usuario.id, 'pedido_anulado', { pedidoId: p.id, detalle: { motivo } });
  res.json({ pedido: await vistaPedido(await pedidoDe(req), req.usuario) });
});

rutas.post('/:id/reactivar', async (req, res) => {
  const p = await pedidoDe(req);
  if (!p.anulado_en) throw new ErrorUsuario('Este pedido no está anulado.', 409);
  await db.query('UPDATE pedidos SET anulado_en = NULL, anulado_motivo = NULL WHERE id = $1', [p.id]);
  await registrarEvento(req.usuario.id, 'pedido_reactivado', { pedidoId: p.id });
  res.json({ pedido: await vistaPedido(await pedidoDe(req), req.usuario) });
});

// --- Pedido desde lo sugerido --------------------------------------------------------------

// Lo que entra en la foto: lo que el sugerido dice pedir (más de 0) de lo que se agota, hay que
// pedir ya o está bien. Lo que sobra o no se vende no se sugiere. Es el mismo filtro que usaba la
// pantalla del pedido de la semana (pedido-sugerido.tsx).
const ESTADOS_SUGERIDOS = new Set(['agota', 'pide', 'normal']);

function fotoSugerido(inv) {
  return inv.productos
    .filter((x) => x.sugerido > 0 && ESTADOS_SUGERIDOS.has(x.estado))
    .map((x) => ({
      codigo: x.codigo,
      nombre: x.nombre,
      proveedor: x.proveedor,
      cantidad: x.sugerido,
      estado: x.estado,
      semanas: x.semanas,
      familia: x.familia || null,
      clase: x.clase || null,
      costo: x.costo,
      existencias: x.existencias,
      // Para medir después lo que de verdad se vendió (server/equipo.js): las semanas que cubre
      // el pedido y el rango del pronóstico en ellas.
      cubre: x.detalleSugerido ? x.detalleSugerido.semanasCubrir : null,
      rango: x.detalleSugerido ? { bajo: x.detalleSugerido.bajo ?? null, media: x.detalleSugerido.media, alto: x.detalleSugerido.alto } : null,
    }));
}

async function crearDesdeSugerido(usuario) {
  // Aquí y no arriba: inventario-rutas.js usa este archivo.
  const { inventarioDeEmpresa } = require('./inventario-rutas');
  const base = await inventarioDeEmpresa(usuario.empresa_id);
  if (!base) throw new ErrorUsuario('Para preparar un pedido, primero suba el archivo de su programa contable en Datos o registre sus movimientos.', 403);
  const foto = fotoSugerido(base.inv);
  const lista = foto.map(({ codigo, nombre, cantidad, proveedor }) => ({ codigo, nombre, cantidad, proveedor }));
  const p = await db.uno(
    `INSERT INTO pedidos (usuario_id, empresa_id, modo, tipo, export_id, sugerido, lista_final, semanas_agota)
     VALUES ($1, $2, 'sugerido', 'real', $3, $4::jsonb, $5::jsonb, $6) RETURNING *`,
    [usuario.id, usuario.empresa_id, base.exportId, JSON.stringify(foto), JSON.stringify(lista), base.inv.umbrales ? base.inv.umbrales.seAgota : null],
  );
  await registrarEvento(usuario.id, 'pedido_iniciado', { pedidoId: p.id, detalle: { modo: 'sugerido', lineas: foto.length } });
  return p;
}

// El pedido desde lo sugerido que la persona tiene abierto (sin cerrar, anular ni borrar).
function borradorDe(usuarioId) {
  return db.uno(
    `SELECT * FROM pedidos WHERE usuario_id = $1 AND modo = 'sugerido' AND terminado_en IS NULL AND enviado_en IS NULL
        AND anulado_en IS NULL AND borrado_en IS NULL ORDER BY creado_en DESC, id DESC LIMIT 1`,
    [usuarioId],
  );
}

rutas.get('/borrador', async (req, res) => {
  const p = await borradorDe(req.usuario.id);
  res.json({ pedido: p ? { id: p.id, numero: await numeroDe(p), lineas: p.lista_final || [] } : null });
});

// "Agregar al pedido" desde Productos: la línea va al pedido abierto y, si no hay, se crea uno con
// todo lo sugerido. Cantidad 0 la quita.
rutas.post('/borrador/linea', async (req, res) => {
  const codigo = String(req.body?.codigo ?? '').trim().slice(0, 100);
  if (!claveCodigo(codigo)) throw new ErrorUsuario('Falta el código del producto.');
  const cantidad = Number(req.body?.cantidad);
  if (!Number.isFinite(cantidad) || cantidad < 0) throw new ErrorUsuario('La cantidad tiene que ser un número de 0 en adelante.');
  let p = await borradorDe(req.usuario.id);
  if (!p) {
    if (cantidad === 0) return res.json({ pedido: null });
    p = await crearDesdeSugerido(req.usuario);
  }
  const clave = claveCodigo(codigo);
  const lineas = (p.lista_final || []).slice();
  const i = lineas.findIndex((l) => claveCodigo(l.codigo) === clave);
  if (cantidad === 0) {
    if (i >= 0) lineas.splice(i, 1);
  } else {
    const deFoto = (p.sugerido || []).find((l) => claveCodigo(l.codigo) === clave) || {};
    const previa = i >= 0 ? lineas[i] : {};
    const proveedor = String(req.body?.proveedor || previa.proveedor || deFoto.proveedor || '').trim().slice(0, 80);
    const linea = {
      ...previa,
      codigo: previa.codigo || deFoto.codigo || codigo,
      nombre: String(previa.nombre || deFoto.nombre || req.body?.nombre || '').slice(0, 200),
      cantidad: Math.round(cantidad * 1e6) / 1e6,
      ...(proveedor ? { proveedor } : {}),
    };
    if (i >= 0) lineas[i] = linea;
    else lineas.push(linea);
  }
  await db.query('UPDATE pedidos SET lista_final = $1::jsonb WHERE id = $2', [JSON.stringify(lineas), p.id]);
  await trazas.anotarCambios(p.id, req.usuario.id, p.lista_final, lineas);
  res.json({ pedido: { id: p.id, numero: await numeroDe(p), lineas } });
});

rutas.post('/', async (req, res) => {
  if (req.body?.modo === 'sugerido') {
    return res.status(201).json({ pedido: await vistaPedido(await crearDesdeSugerido(req.usuario), req.usuario) });
  }
  const p = await db.uno(
    'INSERT INTO pedidos (usuario_id, empresa_id, proveedor) VALUES ($1, $2, $3) RETURNING *',
    [req.usuario.id, req.usuario.empresa_id, String(req.body?.proveedor || '').trim().slice(0, 120)],
  );
  await registrarEvento(req.usuario.id, 'pedido_iniciado', { pedidoId: p.id, detalle: { modo: 'lista' } });
  res.status(201).json({ pedido: await vistaPedido(p, req.usuario) });
});

// Lo que la empresa espera que llegue: pedidos cerrados con líneas sin recibir, de cualquier persona.
rutas.get('/por-recibir', async (req, res) => {
  res.json({ pedidos: await R.porRecibir(req.usuario.empresa_id) });
});

// Los pedidos que esperan aprobación en la empresa (para quien aprueba; a los demás, ninguno).
rutas.get('/por-aprobar', async (req, res) => {
  if (!req.usuario.aprueba) return res.json({ pedidos: [] });
  const filas = await db.query(
    `SELECT p.*, u.nombre AS autor, jsonb_array_length(COALESCE(p.lista_final, '[]'::jsonb)) AS lineas
       FROM pedidos p JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.empresa_id = $1 AND p.modo = 'sugerido' AND p.enviado_en IS NOT NULL AND p.terminado_en IS NULL
        AND p.anulado_en IS NULL AND p.borrado_en IS NULL
      ORDER BY p.enviado_en`,
    [req.usuario.empresa_id],
  );
  const pedidos = [];
  for (const p of filas) pedidos.push({ id: p.id, numero: await numeroDe(p), preparadoPor: p.autor, enviadoEn: p.enviado_en, lineas: p.lineas, observaciones: p.observaciones || '' });
  res.json({ pedidos });
});

rutas.get('/:id', async (req, res) => {
  res.json({ pedido: await vistaPedido(await pedidoVisible(req), req.usuario) });
});

// --- Llegada de un pedido (SP5) -------------------------------------------------------------
// Lo recibe cualquiera de la empresa: quien recibe la mercancía no siempre es quien la pidió. Por
// eso estas rutas buscan el pedido por empresa y no por persona (pedidoDe no cambia).

async function pedidoDeEmpresa(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new ErrorUsuario('Ese pedido no existe.', 404);
  const [p] = await R.pedidosEsperando(req.usuario.empresa_id, { id });
  if (p) return p;
  const otro = await db.uno('SELECT terminado_en, anulado_en, recibido, tipo FROM pedidos WHERE id = $1 AND empresa_id = $2 AND borrado_en IS NULL', [id, req.usuario.empresa_id]);
  if (!otro) throw new ErrorUsuario('Ese pedido no existe.', 404);
  if (!otro.terminado_en) throw new ErrorUsuario('Este pedido todavía no está cerrado: ciérrelo antes de registrar su llegada.', 409);
  if (otro.anulado_en) throw new ErrorUsuario('Este pedido está anulado.', 409);
  throw new ErrorUsuario('Este pedido no espera mercancía: es de antes de que se pudiera registrar la llegada, o de hace más de 4 meses. Registre lo que llegó como una entrada en Movimientos.', 409);
}

rutas.get('/:id/recepcion', async (req, res) => {
  res.json({ recepcion: await R.vistaRecepcion(req.usuario.empresa_id, await pedidoDeEmpresa(req)) });
});

/**
 * Registrar la llegada: { fecha, lineas: [{ codigo, cantidad }] }. Cada línea con cantidad crea una
 * entrada en Movimientos ligada al pedido; con 0 queda como "no llegó" y deja de contar en camino.
 * Las cantidades vienen precargadas con lo pedido y se pueden cambiar. Todo o nada.
 */
rutas.post('/:id/recibir', async (req, res) => {
  const p = await pedidoDeEmpresa(req);
  const empresaId = req.usuario.empresa_id;
  const hoy = recordatorios.fechaBogota();
  const desdeCierre = recordatorios.fechaBogota(p.terminado_en);
  const fecha = req.body?.fecha ? String(req.body.fecha).trim() : hoy;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(`${fecha}T12:00:00Z`))) throw new ErrorUsuario('La fecha de llegada no es válida.');
  if (fecha > hoy) throw new ErrorUsuario('La fecha de llegada es después de hoy.');
  if (fecha < desdeCierre) throw new ErrorUsuario(`La fecha de llegada es antes del ${desdeCierre}, el día en que se cerró el pedido.`);

  const anulados = await R.entradasAnuladas(empresaId, [p.id]);
  const delPedido = new Map(R.lineasDelPedido(p).map((l) => [l.clave, l]));
  const entrada = Array.isArray(req.body?.lineas) ? req.body.lineas : [];
  if (!entrada.length) throw new ErrorUsuario('Elija al menos un producto que haya llegado.');
  const errores = [];
  const limpias = [];
  const vistas = new Set();
  entrada.forEach((l, i) => {
    const fila = i + 1;
    const clave = claveCodigo(l && l.codigo);
    const linea = delPedido.get(clave);
    if (!linea) return errores.push(`Fila ${fila}: ${String((l && l.codigo) || '').slice(0, 40) || 'ese producto'} no está en este pedido.`);
    if (vistas.has(clave)) return errores.push(`Fila ${fila}: ${linea.codigo} está dos veces.`);
    vistas.add(clave);
    if (R.recibidaDe(p, clave, anulados)) return errores.push(`Fila ${fila}: la llegada de ${linea.codigo} ya está registrada.`);
    const cantidad = leerNumero(l.cantidad);
    if (cantidad === null || cantidad < 0) return errores.push(`Fila ${fila}: la cantidad de ${linea.codigo} tiene que ser un número de 0 en adelante.`);
    if (cantidad > 1e9) return errores.push(`Fila ${fila}: la cantidad de ${linea.codigo} es demasiado grande.`);
    limpias.push({ ...linea, recibida: cantidad });
  });
  if (errores.length) throw new ErrorUsuario('Revise las cantidades. No se guardó nada.', 400, { errores: errores.slice(0, 50) });

  const numero = p.numero;
  const marcas = {};
  await db.tx(async (t) => {
    for (const l of limpias) {
      let mov = null;
      if (l.recibida > 0) {
        // Un producto que se agregó a mano al pedido puede no estar en el catálogo todavía.
        await t.query('INSERT INTO productos (empresa_id, clave, codigo, nombre) VALUES ($1, $2, $3, $4) ON CONFLICT (empresa_id, clave) DO NOTHING', [empresaId, l.clave, l.codigo.slice(0, 100), String(l.nombre || '').slice(0, 200)]);
        const r = await t.query(
          `INSERT INTO movimientos (empresa_id, producto_id, usuario_id, tipo, cantidad, fecha, nota, pedido_id)
           VALUES ($1, (SELECT id FROM productos WHERE empresa_id = $1 AND clave = $2), $3, 'entrada', $4, $5, $6, $7) RETURNING id`,
          [empresaId, l.clave, req.usuario.id, l.recibida, fecha, `Llegada del pedido ${numero}${l.proveedor ? ` · ${l.proveedor}` : ''}`.slice(0, 200), p.id],
        );
        mov = r.rows[0].id;
      }
      marcas[l.clave] = { cantidad: l.recibida, pedida: l.cantidad, fecha, mov, por: req.usuario.nombre, en: new Date().toISOString() };
    }
    await t.query("UPDATE pedidos SET recibido = COALESCE(recibido, '{}'::jsonb) || $1::jsonb WHERE id = $2", [JSON.stringify(marcas), p.id]);
    await t.query('UPDATE empresas SET movimientos_cambiaron_en = now() WHERE id = $1', [empresaId]);
  });
  const llegaron = limpias.filter((l) => l.recibida > 0).length;
  await registrarEvento(req.usuario.id, 'pedido_recibido', { pedidoId: p.id, detalle: { lineas: limpias.length, llegaron, fecha } });
  const [actual] = await R.pedidosEsperando(empresaId, { id: p.id });
  res.json({ recepcion: await R.vistaRecepcion(empresaId, actual), entradas: llegaron });
});

// --- Paso 1: lista inicial --------------------------------------------------------------

rutas.put('/:id/lista-inicial', async (req, res) => {
  const p = await pedidoActivo(req);
  exigirModoLista(p);
  if (p.inicial_guardada_en) throw new ErrorUsuario('La lista inicial ya está guardada y no se puede cambiar.', 409);
  const lineas = borrador(lineasDelCuerpo(req.body));
  await db.query(
    'UPDATE pedidos SET lista_inicial = $1::jsonb, tipo = $2, proveedor = $3 WHERE id = $4 AND inicial_guardada_en IS NULL',
    [JSON.stringify(lineas), tipoValido(req.body?.tipo), String(req.body?.proveedor ?? p.proveedor).trim().slice(0, 120), p.id],
  );
  res.json({ ok: true });
});

rutas.post('/:id/lista-inicial', async (req, res) => {
  const p = await pedidoActivo(req);
  exigirModoLista(p);
  if (p.inicial_guardada_en) throw new ErrorUsuario('La lista inicial ya está guardada y no se puede cambiar.', 409);
  const tipo = tipoValido(req.body?.tipo);
  const revision = revisarLista(lineasDelCuerpo(req.body));
  if (revision.errores.length) throw errorLista(revision);
  if (!revision.lineas.length) throw new ErrorUsuario('La lista está vacía. Escriba al menos un producto con su cantidad.');
  // revisar: true -> solo valida (para avisar antes de dejarla fija)
  if (req.body?.revisar) return res.json({ lineas: revision.lineas.length, avisos: revision.avisos });
  const actualizado = await db.uno(
    `UPDATE pedidos SET lista_inicial = $1::jsonb, tipo = $2, proveedor = $3, inicial_guardada_en = now()
      WHERE id = $4 AND usuario_id = $5 AND inicial_guardada_en IS NULL RETURNING *`,
    [JSON.stringify(revision.lineas), tipo, String(req.body?.proveedor ?? p.proveedor).trim().slice(0, 120), p.id, req.usuario.id],
  );
  if (!actualizado) throw new ErrorUsuario('La lista inicial ya está guardada y no se puede cambiar.', 409);
  await asignarProveedores(req.usuario.id, revision.lineas);
  await registrarEvento(req.usuario.id, 'lista_inicial_guardada', { pedidoId: p.id, detalle: { lineas: revision.lineas.length, tipo } });
  res.json({ pedido: await vistaPedido(actualizado, req.usuario), avisos: revision.avisos });
});

// Importar la lista desde el Excel o CSV con el que el usuario arma su pedido.
rutas.post('/:id/importar-lista', subida.single('archivo'), async (req, res) => {
  const p = await pedidoActivo(req);
  const para = req.body?.para === 'final' ? 'final' : 'inicial';
  if (para === 'inicial') exigirModoLista(p);
  if (para === 'inicial' && p.inicial_guardada_en) throw new ErrorUsuario('La lista inicial ya está guardada y no se puede cambiar.', 409);
  if (para === 'final' && ((p.modo !== 'sugerido' && !p.reporte_visto_en) || p.terminado_en)) throw new ErrorUsuario('Ahora no se puede cambiar la lista final.', 409);
  res.json(await importarLista(req, p));
});

/**
 * Lee código, nombre y cantidad de un archivo con el lector de listas (columnas por sinónimos; si no
 * las reconoce, devuelve las hojas para que la persona las elija y se vuelve a llamar con archivoId
 * y mapeo). pedido = null: el archivo no es de un pedido (Movimientos, "Importar de un archivo").
 */
async function importarLista(req, p) {
  const pedidoId = p ? p.id : null;
  let archivo;
  if (req.body?.archivoId) {
    archivo = await db.uno(
      `SELECT id, nombre, contenido FROM archivos WHERE id = $1 AND usuario_id = $2 AND tipo = 'lista' AND ${pedidoId ? 'pedido_id = $3' : 'pedido_id IS NULL'}`,
      pedidoId ? [Number(req.body.archivoId), req.usuario.id, pedidoId] : [Number(req.body.archivoId), req.usuario.id],
    );
    if (!archivo) throw new ErrorUsuario('No encontramos ese archivo. Vuelva a subirlo.', 404);
  } else {
    if (!req.file) throw new ErrorUsuario('Elija un archivo de Excel o CSV.');
    const { nombre, buffer } = archivoSubido(req.file);
    archivo = await db.uno(
      "INSERT INTO archivos (usuario_id, pedido_id, tipo, nombre, tamano, contenido) VALUES ($1, $2, 'lista', $3, $4, $5) RETURNING id, nombre, contenido",
      [req.usuario.id, pedidoId, nombre, buffer.length, buffer],
    );
    await registrarEvento(req.usuario.id, 'archivo_subido', { pedidoId, detalle: { tipo: pedidoId ? 'lista' : 'movimientos', nombre } });
  }

  const manual = leerMapeoManual(req.body?.mapeo);
  const mapeos = await mapeosDe(req.usuario.id);
  let resultado = leerLista(Buffer.from(archivo.contenido), archivo.nombre, manual ? { porClave: manual } : { porFirma: mapeos.lista });
  // Una plantilla vieja sin llenar trae el ejemplo en la hoja Pedido: guardarlo como lista inicial
  // la dejaría fija con productos inventados.
  if (resultado.ok && p && soloEjemplo(resultado.lineas.map((l) => l.codigo))) {
    resultado = { ok: false, errores: ['Este archivo trae los productos de ejemplo de la plantilla. Bórrelos, escriba los que iba a pedir y vuelva a subirlo.'], hojas: [] };
  }
  if (resultado.ok && manual && manual[resultado.clave]) await recordarMapeo(req.usuario.id, 'lista', resultado.firma, manual[resultado.clave]);
  return { ...resultado, archivoId: archivo.id, archivo: archivo.nombre };
}

// --- Paso 2: export de ventas y existencias -----------------------------------------------

// Qué tipos de documento son ventas, cuáles devoluciones de clientes (se restan) y cuáles ventas de
// proyecto (bajan existencias, no cuentan en el promedio; D12).
function leerDocumentos(body) {
  const lista = (x) => (Array.isArray(x) ? [...new Set(x.map((v) => String(v).slice(0, 30)))].slice(0, 50) : []);
  const ventas = lista(body?.documentos);
  const devoluciones = lista(body?.devoluciones).filter((d) => !ventas.includes(d));
  const proyectos = lista(body?.proyectos).filter((d) => !ventas.includes(d) && !devoluciones.includes(d));
  if (!ventas.length) throw new ErrorUsuario('Marque al menos un tipo de documento que sea venta.');
  return { ventas, devoluciones, ...(proyectos.length ? { proyectos } : {}) };
}

// Qué valores de la columna de canal (centro de costo, OT, cliente) son ventas de proyecto. Puede
// no haber ninguno: entonces todas cuentan como venta normal.
function leerCanales(body) {
  const proyectos = Array.isArray(body?.proyectos) ? [...new Set(body.proyectos.map((v) => String(v).slice(0, 60)))].slice(0, 60) : [];
  return { proyectos };
}

// Periodo de un informe que trae el total vendido sin fecha por venta: "YYYY-MM-DD".
function leerPeriodo(body) {
  const desde = String(body?.desde || '').trim();
  const hasta = String(body?.hasta || '').trim();
  if (!desde && !hasta) return null;
  const valida = (t) => /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(`${t}T00:00:00Z`));
  if (!valida(desde) || !valida(hasta)) throw new ErrorUsuario('Escriba las dos fechas del periodo.');
  const dias = (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000 + 1;
  if (dias < 7) throw new ErrorUsuario('El periodo tiene que ser de al menos una semana, y la fecha final no puede ser antes de la inicial.');
  if (dias > 366 * 5) throw new ErrorUsuario('El periodo no puede ser de más de cinco años.');
  if (Date.parse(`${hasta}T00:00:00Z`) > Date.now() + 86400000) throw new ErrorUsuario('La fecha final no puede ser después de hoy.');
  return { desde, hasta };
}

async function procesarExport(usuarioId, pedido, exportId, manual) {
  const archivos = await db.query('SELECT nombre, contenido FROM archivos WHERE export_id = $1 ORDER BY id', [exportId]);
  const { periodo, documentos, canales } = await db.uno('SELECT periodo, documentos, canales FROM exports WHERE id = $1', [exportId]);
  const mapeos = await mapeosDe(usuarioId);
  const lectura = leerExport(
    archivos.map((a) => ({ nombre: a.nombre, buffer: Buffer.from(a.contenido) })),
    manual ? { porClave: manual } : { porFirma: mapeos.export },
    { periodo, documentos, documentosPorFirma: mapeos.documentos, canales, canalesPorFirma: mapeos.canales },
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
      necesitaCanal: Boolean(lectura.necesitaCanal),
      canal: lectura.necesitaCanal ? lectura.canal : undefined,
      exportId,
    };
  }
  // Los documentos que marcó como ventas y los valores de proyecto se recuerdan: la próxima vez su
  // informe se lee solo.
  if (lectura.documentos) for (const [firma, lista] of Object.entries(lectura.documentos)) await recordarMapeo(usuarioId, 'documentos', firma, lista);
  if (lectura.canales) for (const [firma, eleccion] of Object.entries(lectura.canales)) await recordarMapeo(usuarioId, 'canales', firma, eleccion);
  const rotacion = calcularRotacion({ ventas: lectura.ventas, existencias: lectura.existencias, mensual: lectura.mensual, periodo: lectura.periodo, semanasAgota: await semanasAgotaDe(usuarioId), hoy: Math.floor(Date.now() / 86400000) });
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
  // Los productos nuevos del archivo quedan en el catálogo de la empresa, para registrar movimientos.
  await agregarAlCatalogo(exportId).catch((e) => console.error('No se pudo actualizar el catálogo:', e.message));
  if (manual) {
    for (const h of lectura.hojasUsadas) if (manual[h.clave]) await recordarMapeo(usuarioId, 'export', h.firma, manual[h.clave]);
  }
  return { ok: true, exportId, resumen: rotacion.resumen, periodo: rotacion.periodo, hojasUsadas: reporte.hojasUsadas, avisos: reporte.avisos, codigos: rotacion.codigos };
}

// La lista inicial, el archivo propio del pedido y el reporte son del modo 'lista'.
function exigirModoLista(p) {
  if (p.modo === 'sugerido') throw new ErrorUsuario('Este pedido se arma desde lo sugerido: no tiene lista inicial ni archivo propio.', 409);
}

function exigirInicialGuardada(p) {
  exigirModoLista(p);
  if (!p.inicial_guardada_en) {
    throw new ErrorUsuario('Primero guarde su lista inicial. Así podemos comparar lo que iba a pedir con lo que decida después de ver el reporte.', 403);
  }
}

rutas.post('/:id/export', subida.array('archivos', 24), async (req, res) => {
  const p = await pedidoActivo(req);
  exigirInicialGuardada(p);
  if (p.terminado_en) throw new ErrorUsuario('Este pedido ya está terminado.', 409);
  if (!req.files || !req.files.length) throw new ErrorUsuario('Elija el archivo de ventas y existencias.');

  const periodo = leerPeriodo(req.body);
  const exp = await db.uno(
    "INSERT INTO exports (usuario_id, empresa_id, pedido_id, estado, periodo) VALUES ($1, $2, $3, 'procesando', $4::jsonb) RETURNING id",
    [req.usuario.id, req.usuario.empresa_id, p.id, periodo ? JSON.stringify(periodo) : null],
  );
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

// Usar el inventario que ya tiene la empresa (subido desde "Datos", en otro pedido o calculado con
// los movimientos del día) en vez de subirlo otra vez. Igual que subirlo: solo después de guardar
// la lista inicial.
rutas.post('/:id/export/usar-ultimo', async (req, res) => {
  const p = await pedidoActivo(req);
  exigirInicialGuardada(p);
  if (p.terminado_en) throw new ErrorUsuario('Este pedido ya está terminado.', 409);
  // Si hay movimientos nuevos, primero se calcula el inventario al día (server/movimientos.js).
  await inventarioAlDia(req.usuario.empresa_id);
  const e = await db.uno(`SELECT id, reporte->'resumen' AS resumen, reporte->'periodo' AS periodo FROM exports WHERE empresa_id = $1 AND estado = 'ok' AND ${db.EXPORT_VIGENTE} ORDER BY subido_en DESC, id DESC LIMIT 1`, [req.usuario.empresa_id]);
  if (!e) throw new ErrorUsuario('Todavía no ha subido su inventario. Súbalo aquí.', 404);
  await db.query('UPDATE pedidos SET export_id = $1 WHERE id = $2', [e.id, p.id]);
  await registrarEvento(req.usuario.id, 'export_reusado', { pedidoId: p.id, detalle: { exportId: e.id } });
  res.json({ ok: true, exportId: e.id, resumen: e.resumen, periodo: e.periodo });
});

// Cuando no reconocemos una columna, el usuario la elige y se vuelve a leer el mismo archivo.
rutas.post('/:id/export/:exportId/columnas', async (req, res) => {
  const p = await pedidoActivo(req);
  exigirInicialGuardada(p);
  if (p.terminado_en) throw new ErrorUsuario('Este pedido ya está terminado.', 409);
  const exp = await db.uno('SELECT id FROM exports WHERE id = $1 AND pedido_id = $2 AND usuario_id = $3', [Number(req.params.exportId), p.id, req.usuario.id]);
  if (!exp) throw new ErrorUsuario('No encontramos ese archivo. Vuelva a subirlo.', 404);
  const manual = leerMapeoManual(req.body?.mapeo);
  if (!manual) throw new ErrorUsuario('Elija las columnas.');
  res.json(await procesarExport(req.usuario.id, p, exp.id, manual));
});

// El informe mezcla compras, ventas y ajustes: el usuario marca qué documentos son ventas.
rutas.post('/:id/export/:exportId/documentos', async (req, res) => {
  const p = await pedidoActivo(req);
  exigirInicialGuardada(p);
  if (p.terminado_en) throw new ErrorUsuario('Este pedido ya está terminado.', 409);
  const exp = await db.uno('SELECT id FROM exports WHERE id = $1 AND pedido_id = $2 AND usuario_id = $3', [Number(req.params.exportId), p.id, req.usuario.id]);
  if (!exp) throw new ErrorUsuario('No encontramos ese archivo. Vuelva a subirlo.', 404);
  await db.query('UPDATE exports SET documentos = $1::jsonb WHERE id = $2', [JSON.stringify(leerDocumentos(req.body)), exp.id]);
  res.json(await procesarExport(req.usuario.id, p, exp.id, leerMapeoManual(req.body?.mapeo)));
});

// El archivo trae una columna de canal con pocos valores: el usuario marca cuáles son de proyecto.
rutas.post('/:id/export/:exportId/canales', async (req, res) => {
  const p = await pedidoActivo(req);
  exigirInicialGuardada(p);
  if (p.terminado_en) throw new ErrorUsuario('Este pedido ya está terminado.', 409);
  const exp = await db.uno('SELECT id FROM exports WHERE id = $1 AND pedido_id = $2 AND usuario_id = $3', [Number(req.params.exportId), p.id, req.usuario.id]);
  if (!exp) throw new ErrorUsuario('No encontramos ese archivo. Vuelva a subirlo.', 404);
  await db.query('UPDATE exports SET canales = $1::jsonb WHERE id = $2', [JSON.stringify(leerCanales(req.body)), exp.id]);
  res.json(await procesarExport(req.usuario.id, p, exp.id, leerMapeoManual(req.body?.mapeo)));
});

// El archivo trae el total vendido sin fecha por venta: el usuario dice de qué periodo es.
rutas.post('/:id/export/:exportId/periodo', async (req, res) => {
  const p = await pedidoActivo(req);
  exigirInicialGuardada(p);
  if (p.terminado_en) throw new ErrorUsuario('Este pedido ya está terminado.', 409);
  const exp = await db.uno('SELECT id FROM exports WHERE id = $1 AND pedido_id = $2 AND usuario_id = $3', [Number(req.params.exportId), p.id, req.usuario.id]);
  if (!exp) throw new ErrorUsuario('No encontramos ese archivo. Vuelva a subirlo.', 404);
  const periodo = leerPeriodo(req.body);
  if (!periodo) throw new ErrorUsuario('Escriba las dos fechas del periodo.');
  await db.query('UPDATE exports SET periodo = $1::jsonb WHERE id = $2', [JSON.stringify(periodo), exp.id]);
  res.json(await procesarExport(req.usuario.id, p, exp.id, leerMapeoManual(req.body?.mapeo)));
});

// --- Paso 3: reporte ----------------------------------------------------------------------

rutas.get('/:id/reporte', async (req, res) => {
  const p = await pedidoDe(req);
  exigirInicialGuardada(p);
  if (!p.export_id) throw new ErrorUsuario('Primero suba su export de ventas y existencias.', 409);
  const e = await db.uno("SELECT id, subido_en, reporte FROM exports WHERE id = $1 AND estado = 'ok'", [p.export_id]);
  if (!e) throw new ErrorUsuario('Primero suba su export de ventas y existencias.', 409);
  let semanasAgota = p.semanas_agota;
  if (!p.reporte_visto_en && !p.anulado_en) {
    // Al verlo, el umbral queda fijo para este pedido.
    const r = await db.uno(
      'UPDATE pedidos SET reporte_visto_en = now(), semanas_agota = COALESCE(semanas_agota, $2) WHERE id = $1 AND reporte_visto_en IS NULL RETURNING semanas_agota',
      [p.id, await umbralDelPedido(p)],
    );
    if (r) {
      semanasAgota = r.semanas_agota;
      await registrarEvento(req.usuario.id, 'reporte_visto', { pedidoId: p.id });
    }
  }
  const archivos = await db.query('SELECT nombre FROM archivos WHERE export_id = $1 ORDER BY id', [e.id]);
  res.json({ reporte: { ...conUmbral(e.reporte, semanasAgota), subidoEn: e.subido_en, archivos: archivos.map((a) => a.nombre) } });
});

// Paso 4: la cantidad sugerida de cada producto (el modelo de §7: pronóstico, tiempo de entrega,
// cada cuánto pide, paquetes y 9 de cada 10 veces sin quedarse corto), con los tiempos que el
// usuario tiene en Datos. Es una ayuda: la lista final la escribe el usuario y eso es lo que se mide.
rutas.get('/:id/sugerido', async (req, res) => {
  const p = await pedidoDe(req);
  if (!p.export_id || (p.modo !== 'sugerido' && !p.reporte_visto_en)) throw new ErrorUsuario('Primero vea el reporte de rotación.', 409);
  const e = await db.uno("SELECT reporte, series, catalogo FROM exports WHERE id = $1 AND estado = 'ok'", [p.export_id]);
  if (!e) throw new ErrorUsuario('Primero suba su export de ventas y existencias.', 409);
  const ajustes = { ...(await inventarioDelUsuario(req.usuario.id)), semanasAgota: p.semanas_agota || (e.reporte.umbrales && e.reporte.umbrales.seAgota) || SEMANAS_SE_AGOTA };
  const inv = construirInventario({ reporte: e.reporte, series: e.series, catalogo: await catalogoConEscrito(req.usuario.empresa_id, e.catalogo), ajustes, alcance: 'completo', enCamino: await R.enCaminoDe(req.usuario.empresa_id) });
  res.json({
    entrega: inv.ajustes.entregaPorDefecto,
    // Los tiempos por proveedor que ya tiene (para cambiarlos sin borrar los demás).
    entregas: inv.ajustes.entregas,
    cadaCuanto: inv.ajustes.cadaCuanto,
    nivelServicio: inv.ajustes.nivelServicio,
    // Fechas de inicio de cada semana de las ventas y del pronóstico (para la gráfica del detalle).
    semanas: inv.grafico ? inv.grafico.semanas.map((s) => s.inicio) : [],
    semanasPronostico: inv.grafico ? inv.grafico.pronostico.map((s) => s.inicio) : [],
    productos: inv.productos.map((x) => ({
      codigo: x.codigo, nombre: x.nombre, sugerido: x.sugerido, detalle: x.detalleSugerido, semanas: x.semanas, estado: x.estado,
      ventasSemana: x.ventasSemana, existencias: x.existencias, entrega: x.entrega, lote: x.lote, proveedor: x.proveedor, costo: x.costo,
      serie: x.serie, pronostico: x.pronostico, semanasPico: x.semanasPico, pico: x.pico, ventaUnica: x.ventaUnica, explicacion: x.explicacion, enCamino: x.enCamino,
    })),
  });
});

// Paso 2: con cuántas semanas este pedido marca "se agota". También queda como el de Datos.
rutas.put('/:id/semanas-agota', async (req, res) => {
  const p = await pedidoActivo(req);
  exigirInicialGuardada(p);
  if (p.reporte_visto_en) throw new ErrorUsuario(`Ya vio el reporte de este pedido con ${p.semanas_agota || SEMANAS_SE_AGOTA} semanas. El cambio aplica desde su próximo pedido; hágalo en Datos.`, 409);
  const semanas = Number(req.body?.semanas);
  if (!Number.isInteger(semanas) || semanas < 1 || semanas > 11) throw new ErrorUsuario('Elija un número de semanas entre 1 y 11.');
  await guardarInventarioDelUsuario(req.usuario.id, leerAjustes({ ...(await inventarioDelUsuario(req.usuario.id)), semanasAgota: semanas }));
  const actualizado = await db.uno('UPDATE pedidos SET semanas_agota = $1 WHERE id = $2 RETURNING *', [semanas, p.id]);
  await registrarEvento(req.usuario.id, 'umbral_elegido', { pedidoId: p.id, detalle: { semanas } });
  res.json({ pedido: await vistaPedido(actualizado, req.usuario) });
});

// --- Recordatorio por correo (se ofrece al ver el reporte) ---------------------------------

async function planDelPedido(p) {
  if (!p.reporte_visto_en || !p.export_id) throw new ErrorUsuario('Primero vea el reporte de rotación.', 409);
  const e = await db.uno("SELECT subido_en, reporte->'filas' AS filas, reporte->'umbrales' AS umbrales FROM exports WHERE id = $1 AND estado = 'ok'", [p.export_id]);
  if (!e) throw new ErrorUsuario('Primero suba su export de ventas y existencias.', 409);
  const fechaReporte = recordatorios.fechaBogota(e.subido_en);
  // El umbral con el que se vio ese reporte (los pedidos y reportes viejos no lo traen: 2 semanas).
  const semanasAgota = p.semanas_agota || (e.umbrales && e.umbrales.seAgota) || SEMANAS_SE_AGOTA;
  return { fechaReporte, semanasAgota, avisos: recordatorios.planearAvisos(e.filas || [], fechaReporte, semanasAgota) };
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
      semanasBuenNivel: Math.max(recordatorios.SEMANAS_BUEN_NIVEL, plan.semanasAgota + 2),
      semanasAgota: plan.semanasAgota,
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
  const p = await pedidoActivo(req);
  if (typeof req.body?.activo !== 'boolean') throw new ErrorUsuario('Elija si quiere recibir los avisos.');
  const plan = await planDelPedido(p);
  if (req.body.activo && !plan.avisos.length) throw new ErrorUsuario(`Ningún producto de este reporte llega a ${plan.semanasAgota} semanas de inventario en los próximos ${recordatorios.SEMANAS_HORIZONTE} semanas, así que no hay nada que recordar.`);
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

// Las filas del reporte tal como las vio el usuario en ese pedido (con su umbral de "se agota").
async function filasDelReporte(exportId, semanasAgota = null) {
  if (!exportId) return [];
  const e = await db.uno("SELECT reporte->'filas' AS filas, reporte->'umbrales' AS umbrales FROM exports WHERE id = $1", [exportId]);
  if (!e || !e.filas) return [];
  return conUmbral({ filas: e.filas, umbrales: e.umbrales }, semanasAgota).filas;
}

// Desde lo sugerido, la lista final se edita desde el primer momento; en 5 pasos, después de ver
// el reporte.
function exigirListaFinalEditable(p) {
  if (p.modo !== 'sugerido') {
    exigirInicialGuardada(p);
    if (!p.reporte_visto_en) throw new ErrorUsuario('Primero vea el reporte de rotación.', 409);
  }
  if (p.terminado_en) throw new ErrorUsuario('Este pedido ya está terminado.', 409);
}

// El borrador de la lista final: quien prepara el pedido o, si está enviado, quien lo aprueba.
rutas.put('/:id/lista-final', async (req, res) => {
  const p = await pedidoEditable(req);
  const lineas = borrador(lineasDelCuerpo(req.body));
  await db.query(
    'UPDATE pedidos SET lista_final = $1::jsonb, observaciones = COALESCE($3, observaciones) WHERE id = $2',
    [JSON.stringify(lineas), p.id, observacionesDe(req.body) ?? null],
  );
  if (p.modo === 'sugerido') await trazas.anotarCambios(p.id, req.usuario.id, p.lista_final, lineas);
  res.json({ ok: true });
});

rutas.post('/:id/lista-final', async (req, res) => {
  const p = await pedidoActivo(req);
  exigirListaFinalEditable(p);
  if (p.enviado_en) throw new ErrorUsuario('Este pedido está esperando aprobación y ya no se puede cambiar.', 409);
  const revision = revisarLista(lineasDelCuerpo(req.body));
  if (revision.errores.length) throw errorLista(revision);
  if (req.body?.revisar) return res.json({ lineas: revision.lineas.length, avisos: revision.avisos });
  let comparacion;
  if (p.modo === 'sugerido') {
    // La métrica del piloto: cuánto de lo sugerido quedó tal cual. No se le devuelve a nadie (D16).
    comparacion = { aceptacion: medirAceptacion(p.sugerido, revision.lineas) };
  } else {
    comparacion = compararListas(p.lista_inicial, revision.lineas);
    comparacion.coherencia = coherenciaConReporte(comparacion, await filasDelReporte(p.export_id, p.semanas_agota));
  }
  const actualizado = await db.uno(
    `UPDATE pedidos SET lista_final = $1::jsonb, comparacion = $2::jsonb, final_guardada_en = now(), observaciones = COALESCE($4, observaciones)
      WHERE id = $3 AND terminado_en IS NULL RETURNING *`,
    [JSON.stringify(revision.lineas), JSON.stringify(comparacion), p.id, observacionesDe(req.body) ?? null],
  );
  if (!actualizado) throw new ErrorUsuario('Este pedido ya está terminado.', 409);
  if (p.modo === 'sugerido') await trazas.anotarCambios(p.id, req.usuario.id, p.lista_final, revision.lineas);
  await asignarProveedores(req.usuario.id, revision.lineas);
  await registrarEvento(req.usuario.id, 'lista_final_guardada', { pedidoId: p.id, detalle: p.modo === 'sugerido' ? { modo: 'sugerido', lineas: revision.lineas.length } : comparacion.conteo });
  res.json({ pedido: await vistaPedido(actualizado, req.usuario), avisos: revision.avisos });
});

// --- Paso 5: tu pedido -------------------------------------------------------------------------
// Termina el pedido. La respuesta a "¿qué tuviste en cuenta?" es opcional: sin texto queda en NULL
// y el pedido no tiene nada que clasificar (server/equipo.js).

rutas.post('/:id/por-que', async (req, res) => {
  const p = await pedidoActivo(req);
  if (!p.final_guardada_en) throw new ErrorUsuario('Primero guarde su lista final.', 409);
  if (p.terminado_en) throw new ErrorUsuario('Este pedido ya está terminado.', 409);
  // Desde lo sugerido, cerrarlo es aprobarlo: solo si la persona aprueba o nadie en su empresa lo hace.
  let aprueba = false;
  if (p.modo === 'sugerido') {
    if (p.enviado_en) throw new ErrorUsuario('Este pedido está esperando aprobación.', 409);
    if (!(await puedeCerrarSolo(req.usuario))) {
      const nombres = (await aprobadoresDe(req.usuario.empresa_id)).map((a) => a.nombre).join(', ');
      throw new ErrorUsuario(`En su empresa los pedidos los aprueba ${nombres}. Envíelo a aprobación.`, 403);
    }
    aprueba = Boolean(req.usuario.aprueba);
  }
  const respuesta = String(req.body?.respuesta || '').trim().slice(0, 5000);
  // recibido = {}: desde ahora el pedido espera su mercancía y lo que pidió cuenta "en camino"
  // hasta que se registre la llegada (server/recepcion.js). Un pedido simulado no espera nada.
  const actualizado = await db.uno(
    `UPDATE pedidos SET por_que = $1, terminado_en = now(), recibido = CASE WHEN tipo = 'simulado' THEN NULL ELSE '{}'::jsonb END,
            aprobado_en = CASE WHEN $3 THEN now() END, aprobado_por = CASE WHEN $3 THEN $4::int END
      WHERE id = $2 AND terminado_en IS NULL RETURNING *`,
    [respuesta || null, p.id, aprueba, req.usuario.id],
  );
  if (!actualizado) throw new ErrorUsuario('Este pedido ya está terminado.', 409);
  await registrarEvento(req.usuario.id, 'pedido_terminado', { pedidoId: p.id, detalle: { ...(p.comparacion && p.comparacion.conteo), tipo: p.tipo, modo: p.modo } });
  res.json({ pedido: await vistaPedido(actualizado, req.usuario) });
});

// --- Aprobación (SP6) ---------------------------------------------------------------------------

// Quien prepara lo envía. La lista ya se guardó con POST /lista-final, que midió la aceptación: es
// la decisión de quien prepara. Lo que cambie quien aprueba se mide aparte, al aprobar.
rutas.post('/:id/enviar', async (req, res) => {
  const p = await pedidoActivo(req);
  if (p.modo !== 'sugerido') throw new ErrorUsuario('Solo los pedidos desde lo sugerido se envían a aprobación.', 409);
  if (p.terminado_en) throw new ErrorUsuario('Este pedido ya está cerrado.', 409);
  if (p.enviado_en) throw new ErrorUsuario('Este pedido ya está esperando aprobación.', 409);
  if (!p.final_guardada_en) throw new ErrorUsuario('Primero guarde la lista del pedido.', 409);
  const aprobadores = await aprobadoresDe(req.usuario.empresa_id);
  if (!aprobadores.some((a) => a.id !== req.usuario.id)) throw new ErrorUsuario('En su empresa nadie más aprueba pedidos: ciérrelo usted. Quien administra la empresa marca quién aprueba en Mi empresa.', 409);
  const respuesta = String(req.body?.respuesta || '').trim().slice(0, 5000);
  const actualizado = await db.uno(
    `UPDATE pedidos SET enviado_en = now(), lista_enviada = lista_final, por_que = COALESCE($2, por_que), devuelto_en = NULL, devuelto_motivo = NULL
      WHERE id = $1 AND enviado_en IS NULL AND terminado_en IS NULL RETURNING *`,
    [p.id, respuesta || null],
  );
  if (!actualizado) throw new ErrorUsuario('Este pedido ya está esperando aprobación.', 409);
  await registrarEvento(req.usuario.id, 'pedido_enviado', { pedidoId: p.id, detalle: { lineas: (p.lista_final || []).length } });
  res.json({ pedido: await vistaPedido(actualizado, req.usuario) });
});

// Quien aprueba lo aprueba tal como está (con lo que haya ajustado): queda cerrado y en camino.
rutas.post('/:id/aprobar', async (req, res) => {
  const p = await pedidoParaAprobar(req);
  const revision = revisarLista(p.lista_final || []);
  if (revision.errores.length) throw errorLista(revision);
  if (!revision.lineas.length) throw new ErrorUsuario('El pedido no tiene productos. Devuélvalo o anúlelo.');
  const aprobacion = { ...medirAceptacion(p.lista_enviada || [], revision.lineas), por: req.usuario.id };
  const actualizado = await db.uno(
    `UPDATE pedidos SET lista_final = $1::jsonb, comparacion = COALESCE(comparacion, '{}'::jsonb) || $2::jsonb,
            aprobado_en = now(), aprobado_por = $3, terminado_en = now(),
            recibido = CASE WHEN tipo = 'simulado' THEN NULL ELSE '{}'::jsonb END
      WHERE id = $4 AND enviado_en IS NOT NULL AND terminado_en IS NULL RETURNING *`,
    [JSON.stringify(revision.lineas), JSON.stringify({ aprobacion }), req.usuario.id, p.id],
  );
  if (!actualizado) throw new ErrorUsuario('Este pedido no está esperando aprobación.', 409);
  await asignarProveedores(req.usuario.id, revision.lineas);
  await registrarEvento(req.usuario.id, 'pedido_aprobado', { pedidoId: p.id, detalle: { lineas: revision.lineas.length, cambiadas: aprobacion.sugeridas - aprobacion.sinCambio + aprobacion.agregadas } });
  res.json({ pedido: await vistaPedido(actualizado, req.usuario) });
});

// Devolverlo a quien lo preparó, con el motivo: vuelve a prepararse y se puede editar.
rutas.post('/:id/devolver', async (req, res) => {
  const p = await pedidoParaAprobar(req);
  const motivo = String(req.body?.motivo || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!motivo) throw new ErrorUsuario('Escriba por qué lo devuelve: es lo que va a leer quien lo preparó.');
  const actualizado = await db.uno(
    `UPDATE pedidos SET enviado_en = NULL, devuelto_en = now(), devuelto_motivo = $2
      WHERE id = $1 AND enviado_en IS NOT NULL AND terminado_en IS NULL RETURNING *`,
    [p.id, motivo],
  );
  if (!actualizado) throw new ErrorUsuario('Este pedido no está esperando aprobación.', 409);
  await registrarEvento(req.usuario.id, 'pedido_devuelto', { pedidoId: p.id, detalle: { motivo } });
  res.json({ pedido: await vistaPedido(actualizado, req.usuario) });
});

// --- El pedido guardado como PDF o Excel ----------------------------------------------------
// Con ?proveedor= solo las líneas de ese proveedor. Los de la demo y la pantalla en memoria siguen
// en /api/exportar.

// Las líneas del pedido con su proveedor, costo y para cuánto alcanza: de la foto de lo sugerido y,
// para lo que no estaba ahí, del inventario con el que se armó el pedido.
async function lineasParaExportar(req, p) {
  const lista = p.lista_final || p.lista_inicial || [];
  const foto = new Map((p.sugerido || []).map((l) => [claveCodigo(l.codigo), l]));
  let delInventario = new Map();
  if (p.export_id && lista.some((l) => !foto.has(claveCodigo(l.codigo)))) {
    const e = await db.uno("SELECT reporte, series, catalogo FROM exports WHERE id = $1 AND estado = 'ok'", [p.export_id]);
    if (e) {
      const inv = construirInventario({ reporte: e.reporte, series: e.series, catalogo: await catalogoConEscrito(req.usuario.empresa_id, e.catalogo), ajustes: await inventarioDelUsuario(req.usuario.id), alcance: 'completo' });
      delInventario = new Map(inv.productos.map((x) => [claveCodigo(x.codigo), x]));
    }
  }
  return lista
    .map((l) => {
      const k = claveCodigo(l.codigo);
      const d = foto.get(k) || delInventario.get(k) || {};
      return {
        proveedor: l.proveedor || d.proveedor || 'Sin proveedor',
        codigo: String(l.codigo),
        nombre: l.nombre || d.nombre || '',
        cantidad: Math.max(0, Number(l.cantidad) || 0),
        costo: d.costo > 0 ? d.costo : 0,
        semanas: d.semanas ?? null,
        nota: l.nota || '',
      };
    })
    .filter((l) => l.cantidad > 0);
}

async function documentoDelPedido(req) {
  const p = await pedidoVisible(req);
  const proveedor = req.query.proveedor ? String(req.query.proveedor).slice(0, 80) : null;
  let lineas = await lineasParaExportar(req, p);
  if (proveedor) lineas = lineas.filter((l) => l.proveedor === proveedor);
  if (!lineas.length) throw new ErrorUsuario(proveedor ? `Este pedido no tiene productos de ${proveedor}.` : 'Este pedido todavía no tiene productos.', 404);
  const emp = await db.uno('SELECT nombre, logo FROM empresas WHERE id = $1', [p.empresa_id || req.usuario.empresa_id]);
  const autor = await personaDe(p.usuario_id);
  const aprobo = p.aprobado_en ? await personaDe(p.aprobado_por) : null;
  const numero = await numeroDe(p);
  const ajustes = leerAjustes(await inventarioDelUsuario(req.usuario.id));
  // El nombre del archivo, sin tildes ni espacios (algunos navegadores los cambian).
  const sufijo = proveedor ? `-${proveedor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}` : '';
  return {
    nombre: `pedido-${numero}${sufijo}`,
    datos: {
      empresa: (emp && emp.nombre) || 'mi empresa',
      numero,
      // La fecha del pedido (la de cierre o, si sigue abierto, la de creación), no la de hoy.
      fecha: X.fechaHoy(p.terminado_en || p.creado_en),
      // Con nombre, cargo y fecha ya escritos en el PDF (SP6). La fecha de preparado es la de envío o cierre.
      preparadoPor: autor ? { ...autor, fecha: p.enviado_en || p.terminado_en ? X.fechaHoy(p.enviado_en || p.terminado_en) : '' } : null,
      aprobadoPor: aprobo ? { ...aprobo, fecha: X.fechaHoy(p.aprobado_en) } : null,
      logo: emp && emp.logo ? abrirImagen(emp.logo) : null,
      observaciones: p.observaciones || '',
      cadaCuanto: `${ajustes.cadaCuanto} ${ajustes.cadaCuanto === 1 ? 'semana' : 'semanas'}`,
      proveedor,
      lineas,
    },
  };
}

rutas.get('/:id/pedido.pdf', async (req, res) => {
  const { nombre, datos } = await documentoDelPedido(req);
  const buf = await pedidoPdf(datos);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}.pdf"`);
  res.send(buf);
});

rutas.get('/:id/pedido.xlsx', async (req, res) => {
  const { nombre, datos } = await documentoDelPedido(req);
  const buf = await libroDePedido(datos);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}.xlsx"`);
  res.send(buf);
});

module.exports = { rutas, pasoDe, filasDelReporte, procesarExport, leerPeriodo, leerDocumentos, leerCanales, leerMapeoManual, subida, archivoSubido, semanasAgotaDe, importarLista, mapeosDe };
