'use strict';

// Resultados de la prueba, solo para el equipo. Todo sale de los datos guardados.
//
// Hipótesis: 3 de 5 usuarios cambian 5 o más líneas de su pedido en 14 días.
// Pivote:    3 o más de los 5 no cambian ninguna línea o cambian solo una.
//
// Para cada usuario se cuentan los pedidos cuya lista final guardó dentro de sus
// 14 días de prueba (desde que guardó su primera lista inicial) y se toma el
// pedido con más líneas cambiadas.

const express = require('express');
const db = require('./db');
const { requiereEquipo, crearEnlaceRestablecer, baseDe, registrarEvento, ErrorUsuario } = require('./cuentas');
const { pasoDe, filasDelReporte } = require('./pedidos');
const { compararListas, coherenciaConReporte } = require('./listas');
const { fechaBogota } = require('./recordatorios');
const { construirInventario } = require('./inventario');

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
    if (p.borrado || !p.finalGuardadaEn || !p.conteo) continue;
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
    `SELECT id, export_id, lista_inicial, lista_final FROM pedidos
      WHERE comparacion IS NOT NULL AND lista_final IS NOT NULL
        AND (comparacion->'coherencia' IS NULL OR comparacion->'magnitud' IS NULL)`,
  );
  for (const p of viejos) {
    const c = compararListas(p.lista_inicial, p.lista_final);
    c.coherencia = coherenciaConReporte(c, await filasDelReporte(p.export_id));
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

const rutas = express.Router();
rutas.use(requiereEquipo);

rutas.get('/resultados', async (_req, res) => {
  await completarComparaciones();
  const usuarios = await db.query("SELECT id, nombre, email, sistema, creado_en FROM usuarios WHERE rol = 'usuario' ORDER BY creado_en");
  const pedidos = await db.query(
    `SELECT p.id, p.usuario_id, p.proveedor, p.tipo, p.creado_en, p.inicial_guardada_en, p.export_id,
            p.reporte_visto_en, p.final_guardada_en, p.terminado_en, p.por_que, p.clasificacion, p.borrado_en,
            p.comparacion->'conteo' AS conteo, p.comparacion->'magnitud' AS magnitud,
            (p.comparacion->'coherencia') - 'detalle'::text AS coherencia, jsonb_array_length(p.lista_inicial) AS lineas_inicial,
            CASE WHEN p.lista_final IS NULL THEN NULL ELSE jsonb_array_length(p.lista_final) END AS lineas_final
       FROM pedidos p JOIN usuarios u ON u.id = p.usuario_id
      WHERE u.rol = 'usuario' ORDER BY p.creado_en`,
  );
  const eventos = await db.query(
    `SELECT e.usuario_id, e.tipo, e.pedido_id, e.detalle, e.creado_en
       FROM eventos e JOIN usuarios u ON u.id = e.usuario_id
      WHERE u.rol = 'usuario' AND e.tipo IN ('ingreso', 'archivo_subido', 'lista_inicial_guardada', 'reporte_visto', 'lista_final_guardada', 'pedido_terminado', 'recordatorio_respondido', 'recordatorio_enviado', 'calendario_descargado')
      ORDER BY e.creado_en`,
  );
  const recordatorios = await db.query('SELECT usuario_id, activo, respondido_en, primer_aviso FROM recordatorios');
  const archivos = await db.query(
    `SELECT a.usuario_id, a.tipo, count(*)::int AS n FROM archivos a JOIN usuarios u ON u.id = a.usuario_id
      WHERE u.rol = 'usuario' GROUP BY a.usuario_id, a.tipo`,
  );

  // "Qué seguimos sin saber" (Entregable 2): cuánto les cuesta equivocarse y cada cuánto piden.
  // Sale del último archivo de cada probador y de las fechas de sus listas iniciales.
  const ultimos = await db.query(
    `SELECT DISTINCT ON (usuario_id) usuario_id, subido_en, reporte, catalogo
       FROM exports WHERE estado = 'ok' AND ${db.EXPORT_VIGENTE} ORDER BY usuario_id, subido_en DESC, id DESC`,
  );
  const costoDe = (usuarioId) => {
    const e = ultimos.find((x) => x.usuario_id === usuarioId);
    if (!e || !e.reporte) return null;
    const inv = construirInventario({ reporte: e.reporte, series: null, catalogo: e.catalogo, ajustes: {}, alcance: 'prueba' });
    const r = inv.resumen;
    return { fecha: e.subido_en, productos: r.productos, seAgotan: r.seAgotan, enCero: r.enCero, sobran: r.sobran, tieneCostos: r.tieneCostos, valorInventario: r.valorInventario, dineroQuieto: r.dineroQuieto };
  };
  const diasEntre = (suyos) => {
    const t = suyos.filter((p) => p.inicialGuardadaEn && !p.borrado).map((p) => new Date(p.inicialGuardadaEn).getTime()).sort((a, b) => a - b);
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
      inventario: costoDe(u.id),
      diasEntrePedidos: diasEntre(suyos),
      actividad,
    };
  });

  res.json({ resumen: resumirPrueba(lista), usuarios: lista, generadoEn: new Date() });
});

// El equipo lee el "¿por qué cambió?" y lo clasifica (criterio de pivote del plan de prueba).
rutas.post('/pedidos/:id/clasificacion', async (req, res) => {
  const valor = req.body?.valor === null ? null : String(req.body?.valor || '');
  if (valor !== null && !['dato', 'probar'].includes(valor)) throw new ErrorUsuario('Elige una de las dos opciones.');
  const p = await db.uno('UPDATE pedidos SET clasificacion = $1 WHERE id = $2 AND por_que IS NOT NULL RETURNING id', [valor, Number(req.params.id)]);
  if (!p) throw new ErrorUsuario('Ese pedido no existe o todavía no tiene respuesta.', 404);
  await registrarEvento(req.usuario.id, 'por_que_clasificado', { pedidoId: p.id, detalle: { valor } });
  res.json({ ok: true, valor });
});

// Alguien del grupo que creó su cuenta con un correo que no está en TEAM_EMAILS: queda como equipo
// para siempre (es_equipo) y deja de contar como probador. Sus datos no se borran.
rutas.post('/usuarios/:id/equipo', async (req, res) => {
  const u = await db.uno("UPDATE usuarios SET es_equipo = true, rol = 'equipo' WHERE id = $1 RETURNING id", [Number(req.params.id)]);
  if (!u) throw new ErrorUsuario('Ese usuario no existe.', 404);
  await registrarEvento(req.usuario.id, 'marcado_equipo', { detalle: { usuario: u.id } });
  res.json({ ok: true });
});

// Sin correo configurado, el equipo genera el enlace y se lo manda al probador (por ejemplo, por WhatsApp).
rutas.post('/usuarios/:id/restablecer', async (req, res) => {
  const u = await db.uno('SELECT id FROM usuarios WHERE id = $1', [Number(req.params.id)]);
  if (!u) throw new ErrorUsuario('Ese usuario no existe.', 404);
  const r = await crearEnlaceRestablecer(u.id, baseDe(req));
  await registrarEvento(req.usuario.id, 'enlace_restablecer_creado', { detalle: { para: u.id } });
  res.json(r);
});

module.exports = { rutas, evaluarUsuario, resumirPrueba, DIAS_PRUEBA };
