'use strict';

// Resultados de la prueba, solo para el equipo y fuera de la aplicación: no hay pantalla ni ruta de
// la API que los muestre (el producto es para el usuario). Se leen con `npm run resultados`
// (scripts/resultados.js). Todo sale de los datos guardados.
//
// Hipótesis: 3 de 5 usuarios cambian 5 o más líneas de su pedido en 14 días.
// Pivote:    3 o más de los 5 no cambian ninguna línea o cambian solo una.
//
// Para cada usuario se cuentan los pedidos cuya lista final guardó dentro de sus
// 14 días de prueba (desde que guardó su primera lista inicial) y se toma el
// pedido con más líneas cambiadas.

const db = require('./db');
const { crearEnlaceRestablecer, registrarEvento, ErrorUsuario } = require('./cuentas');
const { pasoDe, filasDelReporte } = require('./pedidos');
const { compararListas, coherenciaConReporte } = require('./listas');
const { fechaBogota, urlApp } = require('./recordatorios');
const { construirInventario, leerAjustes } = require('./inventario');

const DIAS_PRUEBA = 14;
const META_LINEAS = 5;
const META_USUARIOS = 3;
const PIVOTE_LINEAS = 1;
const PIVOTE_USUARIOS = 3;
const USUARIOS_ESPERADOS = 5;
// Apoyo para el segundo criterio de pivote, no cambia el veredicto: de los que cumplen,
// cuántos movieron la mayoría de sus líneas en la dirección que indica el reporte.
const COHERENCIA_MAYORIA = 0.5;

function evaluarUsuario(pedidos) {
  const iniciales = pedidos.filter((p) => p.inicialGuardadaEn).map((p) => new Date(p.inicialGuardadaEn).getTime());
  if (!iniciales.length) return { inicio: null, fin: null, mejor: null, categoria: 'sin_pedido' };
  const inicio = Math.min(...iniciales);
  const fin = inicio + DIAS_PRUEBA * 86400000;
  let mejor = null;
  for (const p of pedidos) {
    if (p.borrado || p.anulado || !p.finalGuardadaEn || !p.conteo) continue;
    const t = new Date(p.finalGuardadaEn).getTime();
    p.dentroDePrueba = t <= fin;
    if (!p.dentroDePrueba) continue;
    if (!mejor || p.conteo.total > mejor.conteo.total || (p.conteo.total === mejor.conteo.total && p.tipo === 'real' && mejor.tipo !== 'real')) mejor = p;
  }
  let categoria = 'sin_pedido';
  if (mejor) {
    // Segundo criterio de pivote del plan: si cambió líneas, pero el equipo leyó en su "¿por qué?"
    // que fue por probar la herramienta, el cambio lo produjo el experimento y no el producto.
    if (mejor.conteo.total > PIVOTE_LINEAS && mejor.clasificacion === 'probar') categoria = 'por_probar';
    else if (mejor.conteo.total >= META_LINEAS) categoria = 'cumple';
    else if (mejor.conteo.total <= PIVOTE_LINEAS) categoria = 'no_cambia';
    else categoria = 'intermedio';
  }
  const coherencia = mejor && mejor.coherencia ? mejor.coherencia.porcentaje : null;
  return { inicio: new Date(inicio), fin: new Date(fin), mejor: mejor ? { id: mejor.id, total: mejor.conteo.total, tipo: mejor.tipo, coherencia, clasificacion: mejor.clasificacion || null } : null, categoria };
}

function resumirPrueba(usuarios) {
  const cuenta = (cat) => usuarios.filter((u) => u.evaluacion.categoria === cat);
  const cumplen = cuenta('cumple');
  const recordatorio = (u) => u.recordatorio || {};
  const noCambian = cuenta('no_cambia');
  const porProbar = cuenta('por_probar');
  let veredicto = 'en_curso';
  if (cumplen.length >= META_USUARIOS) veredicto = 'meta_cumplida';
  else if (noCambian.length + porProbar.length >= PIVOTE_USUARIOS) veredicto = 'pivotar';
  // Ya terminaron los esperados y no se llegó ni a la meta ni al pivote: la meta no se cumplió.
  else if (usuarios.filter((u) => u.evaluacion.mejor).length >= USUARIOS_ESPERADOS) veredicto = 'meta_no_cumplida';
  return {
    usuarios: usuarios.length,
    usuariosEsperados: USUARIOS_ESPERADOS,
    cumplen: cumplen.length,
    cumplenReal: cumplen.filter((u) => u.evaluacion.mejor.tipo === 'real').length,
    cumplenSimulado: cumplen.filter((u) => u.evaluacion.mejor.tipo === 'simulado').length,
    cumplenCoherentes: cumplen.filter((u) => u.evaluacion.mejor.coherencia !== null && u.evaluacion.mejor.coherencia >= COHERENCIA_MAYORIA).length,
    noCambian: noCambian.length,
    porProbar: porProbar.length,
    // Los que cumplen y todavía nadie del equipo leyó su "¿por qué?".
    cumplenSinClasificar: cumplen.filter((u) => !u.evaluacion.mejor.clasificacion).length,
    intermedios: cuenta('intermedio').length,
    sinPedido: cuenta('sin_pedido').length,
    veredicto,
    // Stickiness: quién pidió el recordatorio, a quién ya le llegó la fecha del primero y
    // quién volvió a entrar desde ese día.
    aceptaronRecordatorio: usuarios.filter((u) => recordatorio(u).activo).length,
    conRecordatorioVencido: usuarios.filter((u) => recordatorio(u).yaLlego).length,
    volvieronTrasRecordatorio: usuarios.filter((u) => recordatorio(u).ingresosDesdeAviso > 0).length,
    reglas: { diasPrueba: DIAS_PRUEBA, metaLineas: META_LINEAS, metaUsuarios: META_USUARIOS, pivoteLineas: PIVOTE_LINEAS, pivoteUsuarios: PIVOTE_USUARIOS, coherenciaMayoria: COHERENCIA_MAYORIA },
  };
}

// Los pedidos guardados antes de que existieran la coherencia y la magnitud se completan
// con los datos que ya están en la base (las dos listas y el reporte que vio el usuario).
async function completarComparaciones() {
  const viejos = await db.query(
    `SELECT id, export_id, semanas_agota, lista_inicial, lista_final FROM pedidos
      WHERE comparacion IS NOT NULL AND lista_final IS NOT NULL
        AND (comparacion->'coherencia' IS NULL OR comparacion->'magnitud' IS NULL)`,
  );
  for (const p of viejos) {
    const c = compararListas(p.lista_inicial, p.lista_final);
    c.coherencia = coherenciaConReporte(c, await filasDelReporte(p.export_id, p.semanas_agota));
    await db.query('UPDATE pedidos SET comparacion = $1::jsonb WHERE id = $2', [JSON.stringify(c), p.id]);
  }
}

// El recordatorio vive en el calendario del usuario, así que no sabemos si lo abrió: se cuenta
// si volvió a entrar desde el día de su primer recordatorio.
function resumenRecordatorio(fila, actividad, hoy = fechaBogota()) {
  const primerAviso = fila && fila.activo ? fila.primer_aviso : null;
  const yaLlego = Boolean(primerAviso && primerAviso <= hoy);
  return {
    activo: fila ? fila.activo : null,
    respondidoEn: fila ? fila.respondido_en : null,
    primerAviso,
    yaLlego,
    descargoCalendario: actividad.some((e) => e.tipo === 'calendario_descargado'),
    correoEnviado: actividad.some((e) => e.tipo === 'recordatorio_enviado'),
    ingresosDesdeAviso: yaLlego ? actividad.filter((e) => e.tipo === 'ingreso' && fechaBogota(e.en) >= primerAviso).length : 0,
  };
}

async function resultados() {
  await completarComparaciones();
  const usuarios = await db.query(
    `SELECT u.id, u.nombre, u.email, u.sistema, u.creado_en, u.perfil, u.boletin, u.empresa_id, e.inventario, e.nombre AS empresa, e.vacia
       FROM usuarios u LEFT JOIN empresas e ON e.id = u.empresa_id WHERE u.rol = 'usuario' ORDER BY u.creado_en`,
  );
  const pedidos = await db.query(
    `SELECT p.id, p.usuario_id, p.proveedor, p.tipo, p.creado_en, p.inicial_guardada_en, p.export_id,
            p.reporte_visto_en, p.final_guardada_en, p.terminado_en, p.por_que, p.clasificacion, p.borrado_en,
            p.anulado_en, p.anulado_motivo,
            p.comparacion->'conteo' AS conteo, p.comparacion->'magnitud' AS magnitud,
            (p.comparacion->'coherencia') - 'detalle'::text AS coherencia, jsonb_array_length(p.lista_inicial) AS lineas_inicial,
            CASE WHEN p.lista_final IS NULL THEN NULL ELSE jsonb_array_length(p.lista_final) END AS lineas_final,
            COALESCE(p.semanas_agota, (x.reporte->'umbrales'->>'seAgota')::int) AS se_agota
       FROM pedidos p JOIN usuarios u ON u.id = p.usuario_id LEFT JOIN exports x ON x.id = p.export_id
      WHERE u.rol = 'usuario' ORDER BY p.creado_en`,
  );
  const eventos = await db.query(
    `SELECT e.usuario_id, e.tipo, e.pedido_id, e.detalle, e.creado_en
       FROM eventos e JOIN usuarios u ON u.id = e.usuario_id
      WHERE u.rol = 'usuario' AND e.tipo IN ('ingreso', 'archivo_subido', 'lista_inicial_guardada', 'reporte_visto', 'lista_final_guardada', 'pedido_terminado', 'recordatorio_respondido', 'recordatorio_enviado', 'calendario_descargado', 'umbral_elegido', 'movimientos_registrados', 'perfil_cambiado', 'boletin_enviado')
      ORDER BY e.creado_en`,
  );
  const recordatorios = await db.query('SELECT usuario_id, activo, respondido_en, primer_aviso FROM recordatorios');
  const archivos = await db.query(
    `SELECT a.usuario_id, a.tipo, count(*)::int AS n FROM archivos a JOIN usuarios u ON u.id = a.usuario_id
      WHERE u.rol = 'usuario' GROUP BY a.usuario_id, a.tipo`,
  );

  // "Qué seguimos sin saber" (Entregable 2): cuánto les cuesta equivocarse y cada cuánto piden.
  // Sale del último inventario de la empresa de cada probador y de las fechas de sus listas iniciales.
  const ultimos = await db.query(
    `SELECT DISTINCT ON (empresa_id) empresa_id, subido_en, reporte, catalogo
       FROM exports WHERE estado = 'ok' AND empresa_id IS NOT NULL AND ${db.EXPORT_VIGENTE} ORDER BY empresa_id, subido_en DESC, id DESC`,
  );
  const boletines = await db.query("SELECT usuario_id, count(*)::int AS n FROM boletines WHERE estado = 'enviado' GROUP BY usuario_id");
  const costoDe = (empresaId) => {
    const e = ultimos.find((x) => x.empresa_id === empresaId);
    if (!e || !e.reporte) return null;
    const inv = construirInventario({ reporte: e.reporte, series: null, catalogo: e.catalogo, ajustes: {}, alcance: 'prueba' });
    const r = inv.resumen;
    return { fecha: e.subido_en, productos: r.productos, seAgotan: r.seAgotan, enCero: r.enCero, sobran: r.sobran, tieneCostos: r.tieneCostos, valorInventario: r.valorInventario, dineroQuieto: r.dineroQuieto };
  };
  const diasEntre = (suyos) => {
    const t = suyos.filter((p) => p.inicialGuardadaEn && !p.borrado && !p.anulado).map((p) => new Date(p.inicialGuardadaEn).getTime()).sort((a, b) => a - b);
    if (t.length < 2) return null;
    return Math.round(((t[t.length - 1] - t[0]) / (t.length - 1) / 86400000) * 10) / 10;
  };

  const lista = usuarios.map((u) => {
    const suyos = pedidos.filter((p) => p.usuario_id === u.id).map((p) => ({
      id: p.id,
      proveedor: p.proveedor,
      tipo: p.tipo,
      creadoEn: p.creado_en,
      paso: pasoDe(p),
      inicialGuardadaEn: p.inicial_guardada_en,
      reporteVistoEn: p.reporte_visto_en,
      finalGuardadaEn: p.final_guardada_en,
      terminadoEn: p.terminado_en,
      lineasInicial: p.lineas_inicial,
      lineasFinal: p.lineas_final,
      conteo: p.conteo,
      magnitud: p.magnitud,
      coherencia: p.coherencia,
      porQue: p.por_que,
      clasificacion: p.clasificacion,
      borrado: Boolean(p.borrado_en),
      anulado: p.anulado_en ? { en: p.anulado_en, motivo: p.anulado_motivo || '' } : null,
      // El umbral de "se agota" con el que vio su reporte (cambia el tratamiento si no es 2).
      semanasAgota: p.se_agota === null || p.se_agota === undefined ? null : Number(p.se_agota),
    }));
    const evaluacion = evaluarUsuario(suyos);
    const actividad = eventos.filter((e) => e.usuario_id === u.id).map((e) => ({ tipo: e.tipo, pedidoId: e.pedido_id, detalle: e.detalle, en: e.creado_en }));
    const ingresos = actividad.filter((e) => e.tipo === 'ingreso');
    const nArchivos = (tipo) => (archivos.find((a) => a.usuario_id === u.id && a.tipo === tipo) || { n: 0 }).n;
    return {
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      sistema: u.sistema,
      semanasAgota: leerAjustes(u.inventario).semanasAgota,
      // Dos probadores de la misma empresa (Disferral) comparten inventario: se ve aquí (vacío 13).
      empresa: { id: u.empresa_id, nombre: u.empresa || '', vacia: Boolean(u.vacia) },
      perfil: u.perfil,
      boletin: { activo: Boolean(u.boletin), enviados: (boletines.find((b) => b.usuario_id === u.id) || { n: 0 }).n, ingresos: ingresos.filter((e) => e.detalle && e.detalle.como === 'boletin').length },
      movimientos: actividad.filter((e) => e.tipo === 'movimientos_registrados').reduce((n, e) => n + ((e.detalle && e.detalle.cantidad) || 0), 0),
      creadoEn: u.creado_en,
      ingresos: ingresos.length,
      ultimoIngreso: ingresos.length ? ingresos[ingresos.length - 1].en : null,
      exportsSubidos: actividad.filter((e) => e.tipo === 'archivo_subido' && e.detalle && e.detalle.tipo === 'export').length,
      archivosExport: nArchivos('export'),
      archivosLista: nArchivos('lista'),
      diasConActividad: new Set(actividad.map((e) => new Date(e.en).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }))).size,
      pedidos: suyos,
      evaluacion,
      recordatorio: resumenRecordatorio(recordatorios.find((r) => r.usuario_id === u.id), actividad),
      inventario: costoDe(u.empresa_id),
      diasEntrePedidos: diasEntre(suyos),
      actividad,
    };
  });

  return { resumen: resumirPrueba(lista), usuarios: lista, generadoEn: new Date() };
}

// Las acciones quedan en la actividad del dueño del pedido o de la cuenta, marcadas como del equipo.

// El equipo lee el "¿por qué cambió?" y lo clasifica (criterio de pivote del plan de prueba).
async function clasificar(pedidoId, valor) {
  if (valor !== null && !['dato', 'probar'].includes(valor)) throw new ErrorUsuario('La clasificación es dato, probar o ninguna.');
  const p = await db.uno('UPDATE pedidos SET clasificacion = $1 WHERE id = $2 AND por_que IS NOT NULL RETURNING id, usuario_id', [valor, Number(pedidoId)]);
  if (!p) throw new ErrorUsuario('Ese pedido no existe o todavía no tiene respuesta.', 404);
  await registrarEvento(p.usuario_id, 'por_que_clasificado', { pedidoId: p.id, detalle: { valor, porEquipo: true } });
  return { id: p.id, valor };
}

// Anula un pedido (por ejemplo, uno de prueba que no es un pedido de verdad) sin borrarlo: sigue
// a la vista del usuario y deja de contar en el veredicto.
async function anular(pedidoId, motivo = '') {
  motivo = String(motivo || '').trim().slice(0, 300);
  const p = await db.uno('UPDATE pedidos SET anulado_en = now(), anulado_motivo = $2 WHERE id = $1 AND anulado_en IS NULL AND borrado_en IS NULL RETURNING id, usuario_id', [Number(pedidoId), motivo || null]);
  if (!p) throw new ErrorUsuario('Ese pedido no existe o ya está anulado.', 404);
  await registrarEvento(p.usuario_id, 'pedido_anulado', { pedidoId: p.id, detalle: { motivo, porEquipo: true } });
  return { id: p.id };
}

async function reactivar(pedidoId) {
  const p = await db.uno('UPDATE pedidos SET anulado_en = NULL, anulado_motivo = NULL WHERE id = $1 AND anulado_en IS NOT NULL RETURNING id, usuario_id', [Number(pedidoId)]);
  if (!p) throw new ErrorUsuario('Ese pedido no existe o no está anulado.', 404);
  await registrarEvento(p.usuario_id, 'pedido_reactivado', { pedidoId: p.id, detalle: { porEquipo: true } });
  return { id: p.id };
}

async function usuarioPorEmail(email) {
  const u = await db.uno('SELECT id, email FROM usuarios WHERE lower(email) = lower($1)', [String(email || '').trim()]);
  if (!u) throw new ErrorUsuario(`No hay ninguna cuenta con el correo ${email}.`, 404);
  return u;
}

// Alguien del grupo que creó su cuenta con un correo que no está en TEAM_EMAILS: queda como equipo
// para siempre (es_equipo) y deja de contar como probador. Sus datos no se borran.
async function marcarEquipo(email) {
  const u = await usuarioPorEmail(email);
  await db.query("UPDATE usuarios SET es_equipo = true, rol = 'equipo' WHERE id = $1", [u.id]);
  await registrarEvento(u.id, 'marcado_equipo', { detalle: { porEquipo: true } });
  return u;
}

// Sin correo configurado, el equipo genera el enlace y se lo manda a la persona (por ejemplo, por WhatsApp).
async function enlaceRestablecer(email, base = urlApp()) {
  const u = await usuarioPorEmail(email);
  const r = await crearEnlaceRestablecer(u.id, base);
  await registrarEvento(u.id, 'enlace_restablecer_creado', { detalle: { porEquipo: true } });
  return r;
}

// Los últimos errores que vio alguien en la aplicación (server/errores.js).
async function erroresRecientes(limite = 50) {
  const filas = await db.query(
    `SELECT e.id, e.origen, e.mensaje, e.ruta, e.creado_en, u.email
       FROM errores e LEFT JOIN usuarios u ON u.id = e.usuario_id
      ORDER BY e.creado_en DESC LIMIT $1`,
    [limite],
  );
  return filas.map((f) => ({ id: f.id, origen: f.origen, mensaje: f.mensaje, ruta: f.ruta, en: f.creado_en, email: f.email }));
}

module.exports = { resultados, clasificar, anular, reactivar, marcarEquipo, enlaceRestablecer, erroresRecientes, evaluarUsuario, resumirPrueba, DIAS_PRUEBA };
