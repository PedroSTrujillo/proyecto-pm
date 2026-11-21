'use strict';

// El inventario del usuario tal como lo muestran el panel, la lista de productos y el pedido:
// el reporte de rotación (sin cambios) más el pronóstico, el riesgo de agotarse antes de que
// llegue un pedido, el dinero en inventario y la cantidad sugerida.
//
// Se calcula al pedirlo, con los tiempos de entrega que el usuario tenga guardados, a partir de
// lo que se guardó al subir el archivo: el reporte, las ventas por semana y el catálogo
// (costo y proveedor, si venían).

const P = require('./pronostico');
const { conUmbral, SEMANAS_SE_AGOTA, SEMANAS_SOBRA } = require('./rotacion');
const { inicioDeSemana } = require('./series');
const { claveCodigo, MS_DIA } = require('./valores');

const SEMANAS_GRAFICO = 52;
const SEMANAS_PRONOSTICO = 8; // mínimo del gráfico; si el usuario elige un horizonte más largo, se alarga
const ENTREGA_POR_DEFECTO = 1; // semanas, si el usuario no ha dicho cuánto tarda su proveedor
const CADA_CUANTO_POR_DEFECTO = 4; // semanas entre un pedido y el siguiente
const NIVEL_SERVICIO = 0.9; // la cantidad sugerida alcanza en 9 de cada 10 casos
const SIN_PROVEEDOR = 'Sin proveedor';
const DIAS_HABILES_SEMANA = 5; // el tiempo de entrega se escribe en días hábiles (lunes a viernes)
const MAX_DIAS_ENTREGA = 260; // un año hábil
const VENDE_FRECUENTE = 0.5; // vende en la mitad de sus semanas o más: "frecuente"
const PARTE_VENTA_ALTA = 0.2; // el 20 % de productos que más vende
const MAX_ASIGNACIONES = 20000;
const MAX_PREFIJOS = 200;

function redondear(n, dec = 2) {
  const f = 10 ** dec;
  return Math.round(n * f) / f;
}

function suma(v) {
  return v.reduce((s, x) => s + x, 0);
}

// Ajustes que el usuario guarda en "Datos": cuánto tarda cada proveedor, cada cuánto pide y
// con cuántas semanas un producto ya "se agota".
//
// El tiempo de entrega se escribe en días hábiles (entregasDias, SP4); el modelo sigue en semanas
// (días ÷ 5). Los ajustes guardados antes solo traen `entregas` en semanas y siguen sirviendo: si
// un proveedor tiene días escritos, mandan los días.
function leerAjustes(a) {
  const ajustes = a && typeof a === 'object' ? a : {};
  const num = (v, def, min, max) => (Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : def);
  const entregas = {};
  for (const [k, v] of Object.entries(ajustes.entregas || {})) {
    const n = num(v, null, 0, 52);
    if (n !== null) entregas[String(k).slice(0, 80)] = n;
  }
  const entregasDias = {};
  for (const [k, v] of Object.entries(ajustes.entregasDias || {})) {
    const n = num(v, null, 0, MAX_DIAS_ENTREGA);
    if (n === null) continue;
    entregasDias[String(k).slice(0, 80)] = Math.round(n);
    entregas[String(k).slice(0, 80)] = Math.round(n) / DIAS_HABILES_SEMANA;
  }
  const entregaPorDefectoDias = ajustes.entregaPorDefectoDias === undefined || ajustes.entregaPorDefectoDias === null
    ? null
    : num(ajustes.entregaPorDefectoDias, null, 0, MAX_DIAS_ENTREGA);
  // Proveedor de cada producto cuando el archivo no lo trae: uno por uno (código → proveedor) o
  // por el comienzo del código ("TOR-" → Tornillería Central).
  const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const asignaciones = {};
  for (const [k, v] of Object.entries(ajustes.asignaciones || {}).slice(0, MAX_ASIGNACIONES)) {
    const p = texto(v, 80);
    if (p) asignaciones[claveCodigo(k)] = p;
  }
  const prefijos = (Array.isArray(ajustes.prefijos) ? ajustes.prefijos : [])
    .slice(0, MAX_PREFIJOS)
    .map((x) => ({ prefijo: claveCodigo(texto(x && x.prefijo, 30)), proveedor: texto(x && x.proveedor, 80) }))
    .filter((x) => x.prefijo && x.proveedor);
  return {
    entregaPorDefecto: entregaPorDefectoDias !== null ? Math.round(entregaPorDefectoDias) / DIAS_HABILES_SEMANA : num(ajustes.entregaPorDefecto, ENTREGA_POR_DEFECTO, 0, 52),
    entregaPorDefectoDias: entregaPorDefectoDias !== null ? Math.round(entregaPorDefectoDias) : null,
    entregasDias,
    // Se guarda con 3 decimales: en días o meses (la unidad que eligió el usuario) no da un número entero de semanas.
    cadaCuanto: Math.round(num(ajustes.cadaCuanto, CADA_CUANTO_POR_DEFECTO, 1, 26) * 1000) / 1000,
    // Entero y por debajo de "sobra" (12): si no, un producto podría salir con los dos estados.
    semanasAgota: Number.isInteger(Number(ajustes.semanasAgota)) ? num(ajustes.semanasAgota, SEMANAS_SE_AGOTA, 1, SEMANAS_SOBRA - 1) : SEMANAS_SE_AGOTA,
    entregas,
    asignaciones,
    prefijos,
  };
}

// Quién le vende cada producto: lo que el usuario asignó a mano manda; después, lo que traía el
// archivo; después, el comienzo de código más largo que coincida.
function proveedorDe(clave, datos, ajustes) {
  if (ajustes.asignaciones[clave]) return { proveedor: ajustes.asignaciones[clave], origen: 'producto' };
  if (datos.proveedor) return { proveedor: datos.proveedor, origen: 'archivo' };
  let mejor = null;
  for (const p of ajustes.prefijos) if (clave.startsWith(p.prefijo) && (!mejor || p.prefijo.length > mejor.prefijo.length)) mejor = p;
  if (mejor) return { proveedor: mejor.proveedor, origen: 'prefijo' };
  return { proveedor: SIN_PROVEEDOR, origen: null };
}

/**
 * Quita de las ventas semanales lo que el reporte recortó del mes de un proyecto. El exceso
 * (vendido − contado) se le quita a las semanas de ese mes que vendieron por encima de lo
 * normal del producto, en proporción a cuánto se pasaron: así el gráfico marca la semana
 * del proyecto y no el mes entero.
 */
function recortarPico(serie, hasta, pico) {
  if (!pico || !serie) return { recortada: serie, semanasPico: [] };
  const [a, m] = pico.mes.split('-').map(Number);
  const iniMes = Math.round(Date.UTC(a, m - 1, 1) / MS_DIA);
  const finMes = Math.round(Date.UTC(a, m, 0) / MS_DIA);
  const n = serie.length;
  const [ha, hm, hd] = hasta.split('-').map(Number);
  const ultimo = Math.round(Date.UTC(ha, hm - 1, hd) / MS_DIA);
  const dentro = serie.map((_, i) => {
    const ini = ultimo - (n - i) * 7 + 1;
    return Math.max(0, Math.min(ini + 6, finMes) - Math.max(ini, iniMes) + 1) / 7;
  });
  const enMes = dentro.map((d, i) => (d > 0 ? i : -1)).filter((i) => i >= 0);
  if (!enMes.length) return { recortada: serie, semanasPico: [] };
  const desde = Math.max(0, enMes[0] - 13);
  const hastaI = Math.min(n - 1, enMes[enMes.length - 1] + 13);
  const vecinas = [];
  for (let i = desde; i <= hastaI; i++) if (dentro[i] === 0) vecinas.push(serie[i]);
  const normal = P.mediana(vecinas);
  let pesos = enMes.map((i) => Math.max(0, serie[i] - normal) * dentro[i]);
  if (suma(pesos) <= 0) pesos = enMes.map((i) => serie[i] * dentro[i]);
  const total = suma(pesos);
  const exceso = Math.max(0, pico.vendido - pico.contado);
  const recortada = serie.slice();
  const semanasPico = [];
  enMes.forEach((i, k) => {
    const quita = total > 0 ? Math.min(serie[i] * dentro[i], (exceso * pesos[k]) / total) : 0;
    recortada[i] = serie[i] - quita;
    if (quita > 0.25 * serie[i]) semanasPico.push(i);
  });
  return { recortada, semanasPico };
}

/**
 * Una venta de una sola vez: todo lo vendido cae en 1 o 2 semanas seguidas de un archivo de 6
 * meses o más, y en las últimas 4 semanas no se vendió. Casi siempre es un proyecto o un cliente
 * puntual (o un producto que se vende una vez al año). Pronosticarlo como venta de todas las
 * semanas haría sugerir repetir el proyecto entero, así que no se sugiere ni se pronostica.
 */
function ventaUnica(serie, hasta) {
  if (!serie || serie.length < 26) return null;
  const con = serie.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
  if (!con.length || con.length > 2 || con[con.length - 1] - con[0] > 1) return null;
  if (serie.length - 1 - con[con.length - 1] < 4) return null;
  const [a, m, d] = hasta.split('-').map(Number);
  const ultimo = Math.round(Date.UTC(a, m - 1, d) / MS_DIA);
  const inicio = ultimo - (serie.length - con[0]) * 7 + 1;
  return { vendido: redondear(suma(con.map((i) => serie[i])), 1), semanas: con.length, desde: new Date(inicio * MS_DIA).toISOString().slice(0, 10) };
}

/**
 * Qué clase de venta tiene un producto (SP4):
 *   unica       todo lo vendido cayó en 1 o 2 semanas (ventaUnica)
 *   proyecto    más de la mitad de lo vendido fue para proyectos marcados (D12)
 *   frecuente   vende en la mitad de sus semanas o más
 *   esporadico  vende en menos de la mitad de sus semanas
 * Sin ventas por semana (un informe con el total del periodo) o sin ventas, null.
 */
function clasificar({ serie, semanasProducto, vendido, vendidoProyecto = 0, unica = null }) {
  if (unica) return 'unica';
  if (vendidoProyecto > 0 && vendidoProyecto > (Math.max(vendido, 0) + vendidoProyecto) / 2) return 'proyecto';
  if (!serie || !(vendido > 0)) return null;
  const ventana = serie.slice(-Math.max(1, Math.round(semanasProducto || serie.length)));
  const conVenta = ventana.filter((x) => x > 0).length;
  return conVenta / ventana.length >= VENDE_FRECUENTE ? 'frecuente' : 'esporadico';
}

// Los productos que hoy están bien y llegan al umbral de "se agota" en los próximos 3 meses (lo mismo que
// ofrece el recordatorio de calendario, server/recordatorios.js).
function proximosAvisos(filas, fecha, semanasAgota) {
  if (!fecha) return null;
  const { planearAvisos, fechaBogota } = require('./recordatorios');
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(String(fecha)) ? String(fecha) : fechaBogota(fecha);
  const avisos = planearAvisos(filas, dia, semanasAgota);
  return { productos: avisos.length, primero: avisos[0] || null };
}

// enCamino: lo pedido que no ha llegado. No quita el "se agota" (lo que hay hoy no alcanza), pero
// sí el "pedir ya": ese pedido ya se hizo.
function estadoDe(f, entrega, enCamino = 0) {
  if (f.estado === 'sin_ventas') return 'sin_ventas';
  if (f.estado === 'se_agota') return 'agota';
  const semanasPosicion = f.semanasInventario + (enCamino > 0 && f.promedioSemanal > 0 ? enCamino / f.promedioSemanal : 0);
  if (semanasPosicion < entrega + 1) return 'pide';
  if (f.sobra) return 'sobra';
  return 'normal';
}

// Un producto con su propio umbral de "sobra" (productos.sobra_semanas, SP7): se aplica sobre la fila
// del reporte guardado, sin recalcularla, como conUmbral con "se agota". Sin ventas y con existencias
// sobra siempre, con cualquier umbral. Si el producto ya se agota, no puede sobrar.
function conSobraPropia(f, sobraSemanas) {
  if (!(sobraSemanas > 0) || sobraSemanas === SEMANAS_SOBRA || f.semanasInventario === null) return f;
  const sobra = f.estado !== 'se_agota' && f.semanasInventario > sobraSemanas;
  return { ...f, sobra, estado: f.estado === 'se_agota' ? f.estado : sobra ? 'sobra' : 'normal' };
}

/**
 * reporte: lo que guardó procesarExport (calcularRotacion + avisos).
 * series: seriesSemanales(...) o null (totales de un periodo).
 * catalogo: { clave: { costo, proveedor, familia?, multiplo?, minimoPedido?, sobraSemanas? } } o null.
 * ajustes: leerAjustes(empresas.inventario).
 * semanasPronostico: el horizonte que eligió el usuario para "venderás en…" (ventaHorizonte).
 *   El gráfico pronostica al menos 8 semanas, o el horizonte si es más largo.
 * alcance: 'completo' o 'prueba'. En 'prueba' (un probador en sus 14 días) solo sale lo que
 *   declara el plan de prueba del Entregable 2: el reporte de semanas de inventario, sin
 *   pronóstico, sin temporada, sin tiempo de entrega ("pide ya", riesgo) y sin cantidad
 *   sugerida. Así el tratamiento de la prueba es el que se declaró y M mide el reporte.
 * sugerencias: forma antigua de pedir el alcance (false = 'prueba').
 * enCamino: Map clave → { cantidad, fecha } de lo pedido que no ha llegado (server/recepcion.js). El
 *   sugerido descuenta existencias más en camino (posición de inventario, §7 del modelo).
 */
function construirInventario({ reporte, series, catalogo, ajustes: ajustesCrudos, fuente = {}, alcance = null, sugerencias = true, semanasPronostico = 4, enCamino = null }) {
  const completo = alcance ? alcance === 'completo' : sugerencias !== false;
  const ajustes = leerAjustes(ajustesCrudos);
  const cat = catalogo || {};
  const hasta = series ? series.hasta : reporte.periodo.hasta;
  const semanasSerie = series ? series.semanas : 0;
  const porProducto = series ? series.porProducto : {};
  const deProyecto = (series && series.proyecto) || {};

  // El panel usa el umbral de "se agota" que el usuario tiene hoy, aunque el archivo se haya
  // subido con otro. El reporte guardado no cambia.
  const filas = conUmbral(reporte, ajustes.semanasAgota).filas;

  // Las ventas de cada producto sin el pico de un proyecto.
  const recortes = new Map();
  for (const f of filas) {
    const k = claveCodigo(f.codigo);
    const serie = porProducto[k] || null;
    recortes.set(k, serie ? recortarPico(serie, hasta, f.pico) : { recortada: null, semanasPico: [] });
  }

  // Referencias del catálogo.
  const conVentas = filas.filter((f) => f.promedioSemanal > 0);
  const dispersiones = [];
  for (const f of conVentas) {
    const r = recortes.get(claveCodigo(f.codigo)).recortada;
    const d = r ? P.dispersion(r.slice(-Math.round(f.semanasProducto))) : null;
    if (d !== null) dispersiones.push(d);
  }
  const referencia = {
    tasa: P.mediana(conVentas.map((f) => f.promedioSemanal)) || 1,
    phi: P.mediana(dispersiones) || 1.5,
  };

  // Temporada del catálogo completo (sin picos).
  const totalesRecortados = new Array(semanasSerie).fill(0);
  const totalesCrudos = new Array(semanasSerie).fill(0);
  for (const f of filas) {
    const k = claveCodigo(f.codigo);
    const crudo = porProducto[k];
    const r = recortes.get(k).recortada;
    if (!crudo) continue;
    for (let i = 0; i < semanasSerie; i++) {
      totalesCrudos[i] += crudo[i];
      totalesRecortados[i] += r[i];
    }
  }
  const indice = series && completo ? P.indiceTemporada(totalesRecortados, hasta) : null;
  const futuro = (h) => P.semanasConTemporada(indice, hasta, semanasSerie, h);
  // El horizonte que eligió el usuario ("venderás en…") y las semanas del gráfico.
  const horizonte = Math.max(0.5, Number(semanasPronostico) || 4);
  const semanasGrafico = Math.max(SEMANAS_PRONOSTICO, Math.ceil(horizonte));

  // Lo que se vendió para proyectos marcados (D12), por semana: no se pronostica, pero se ve en el gráfico.
  const totalesProyecto = new Array(semanasSerie).fill(0);
  for (const s of Object.values(deProyecto)) for (let i = 0; i < semanasSerie; i++) totalesProyecto[i] += s[i] || 0;

  const productos = [];
  let varianzaSemana = new Array(semanasGrafico).fill(0);
  let mediaSemana = new Array(semanasGrafico).fill(0);
  for (const fila of filas) {
    const k = claveCodigo(fila.codigo);
    const datos = cat[k] || {};
    const sobraSemanas = datos.sobraSemanas > 0 ? datos.sobraSemanas : SEMANAS_SOBRA;
    const f = conSobraPropia(fila, sobraSemanas);
    const { proveedor, origen: origenProveedor } = proveedorDe(k, datos, ajustes);
    const entrega = ajustes.entregas[proveedor] ?? ajustes.entregaPorDefecto;
    const costo = datos.costo > 0 ? datos.costo : null;
    const { recortada, semanasPico } = recortes.get(k);
    const crudo = porProducto[k] || null;
    const existencias = Math.max(f.existencias, 0);
    const unica = completo ? ventaUnica(crudo, hasta) : null;
    const llegando = (enCamino && enCamino.get(k)) || null;
    const cantidadEnCamino = llegando && completo ? llegando.cantidad : 0;

    // El múltiplo de empaque escrito en el catálogo manda; si no hay, el paquete en que siempre se vende.
    const multiplo = datos.multiplo > 0 ? datos.multiplo : null;
    const minimoPedido = datos.minimoPedido > 0 ? datos.minimoPedido : null;
    const lote = multiplo || P.loteDe(crudo);
    let riesgo = null;
    let sugerido = null;
    let minimo = null;
    let maximo = null;
    let pronostico = null;
    let detalleSugerido = null;
    let ventaHorizonte = null;
    if (unica) sugerido = 0;
    if (f.promedioSemanal > 0 && completo && !unica) {
      const ventana = P.temporadaDeLaVentana(indice, hasta, semanasSerie, f.semanasProducto, f.semanasRecientes);
      const ajuste = P.ajustarProducto({
        tasa: f.promedioSemanal / ventana,
        semanas: f.semanasProducto,
        serie: recortada ? recortada.slice(-Math.round(f.semanasProducto)) : null,
        referencia,
      });
      // Riesgo de quedarse sin él antes de reponerlo: dentro del umbral de "se agota"
      // o, si el proveedor tarda más, antes de que llegue un pedido hecho hoy.
      riesgo = redondear(P.predictiva(ajuste, futuro(Math.max(entrega, ajustes.semanasAgota))).probMayorQue(existencias), 3);
      const necesidad = P.predictiva(ajuste, futuro(entrega + ajustes.cadaCuanto)).cuantil(NIVEL_SERVICIO);
      // Se pide en paquetes completos: los del catálogo (cajas de 80) o los que se deducen de las ventas.
      // Lo que ya viene en camino cuenta como si estuviera: si no, se pediría dos veces.
      const falta = Math.max(0, Math.ceil(necesidad - existencias - cantidadEnCamino));
      sugerido = P.aLote(falta, lote);
      // Si el proveedor tiene un pedido mínimo, lo que quede entre 0 y ese mínimo sube al mínimo.
      const subioAlMinimo = Boolean(minimoPedido && sugerido > 0 && sugerido < minimoPedido);
      if (subioAlMinimo) sugerido = P.aLote(minimoPedido, lote);
      // Lo que el reporte marca como "sobra" (más de 12 semanas, o las del producto) no se sugiere pedir, aunque el
      // margen para ventas de golpe diera algo: sería contradecir el reporte que el usuario acaba de ver.
      if (f.sobra) sugerido = 0;
      // Por qué esa cantidad: las semanas que hay que cubrir (lo que tarda el proveedor más lo que
      // falta para el siguiente pedido), lo más probable que se venda en ellas y lo que alcanza en
      // 9 de cada 10 casos. ventaSemana (con temporada) dice para cuánto alcanza cualquier cantidad.
      const cubrir = entrega + ajustes.cadaCuanto;
      const enCubrir = P.predictiva(ajuste, futuro(cubrir));
      const media = enCubrir.media;
      detalleSugerido = {
        semanasCubrir: cubrir,
        media: redondear(media, 1),
        // De bajo a alto cae lo que se vende en 8 de cada 10 casos: con eso se compara después lo
        // que de verdad se vendió (server/equipo.js, sugerido contra ocurrido).
        bajo: redondear(enCubrir.cuantil(0.1), 1),
        alto: redondear(necesidad, 1),
        ventaSemana: redondear(media / Math.max(cubrir, 0.5), 2),
        // Para explicar el redondeo: lo que faltaba, en qué paquete se pidió y si subió al mínimo.
        falta,
        lote,
        loteOrigen: multiplo ? 'catalogo' : lote > 1 ? 'ventas' : null,
        minimoPedido: subioAlMinimo ? minimoPedido : null,
        enCamino: cantidadEnCamino,
      };
      // Mínimo y máximo, como los llevan muchos programas contables: cuando quedan "mínimo" o
      // menos, se pide hasta llegar al máximo. El mínimo cubre la entrega en 9 de cada 10 casos.
      minimo = Math.ceil(P.predictiva(ajuste, futuro(Math.max(entrega, 0.5))).cuantil(NIVEL_SERVICIO));
      maximo = P.aLote(Math.max(minimo, Math.ceil(necesidad)), lote);
      const enHorizonte = P.predictiva(ajuste, futuro(horizonte));
      ventaHorizonte = { media: redondear(enHorizonte.media, 1), bajo: redondear(enHorizonte.cuantil(0.1), 1), alto: redondear(enHorizonte.cuantil(0.9), 1) };
      pronostico = [];
      for (let s = 0; s < semanasGrafico; s++) {
        const t = P.temporadaDeSemana(indice, hasta, semanasSerie, semanasSerie + s);
        const pred = P.predictiva(ajuste, t);
        pronostico.push({ media: redondear(pred.media, 2), bajo: redondear(pred.cuantil(0.1), 2), alto: redondear(pred.cuantil(0.9), 2) });
        mediaSemana[s] += pred.media;
        varianzaSemana[s] += pred.varianza;
      }
    }

    const tendencia = crudo && semanasSerie >= 26
      ? (() => {
        const ult = suma(recortada.slice(-13));
        const ant = suma(recortada.slice(-26, -13));
        return ant > 0 ? redondear(ult / ant - 1, 3) : null;
      })()
      : null;
    const estado = estadoDe(f, completo ? entrega : 0, cantidadEnCamino);
    const clase = clasificar({ serie: crudo, semanasProducto: f.semanasProducto, vendido: f.vendido, vendidoProyecto: f.vendidoProyecto || 0, unica });
    const sobrante = f.promedioSemanal > 0 ? Math.max(0, existencias - sobraSemanas * f.promedioSemanal) : existencias;
    const desde = Math.max(0, semanasSerie - SEMANAS_GRAFICO);
    productos.push({
      codigo: f.codigo,
      nombre: f.nombre,
      proveedor,
      origenProveedor,
      entrega,
      entregaDias: ajustes.entregasDias[proveedor] ?? (proveedor === SIN_PROVEEDOR || ajustes.entregas[proveedor] === undefined ? ajustes.entregaPorDefectoDias : null),
      familia: datos.familia || null,
      multiplo,
      minimoPedido,
      // Desde cuántas semanas sobra, si la empresa lo escribió (si no, las 12 de umbrales.sobra).
      sobraSemanas: sobraSemanas === SEMANAS_SOBRA ? null : sobraSemanas,
      clase,
      ventaAlta: false,
      enCamino: llegando ? { cantidad: llegando.cantidad, fecha: llegando.fecha } : null,
      costo,
      ventasSemana: f.promedioSemanal,
      existencias: f.existencias,
      semanas: f.semanasInventario,
      estado,
      riesgo,
      sugerido: completo ? sugerido : null,
      detalleSugerido,
      ventaUnica: unica,
      lote,
      minimo: completo ? minimo : null,
      maximo: completo ? maximo : null,
      valor: costo !== null ? Math.round(existencias * costo) : null,
      quieto: costo !== null && f.sobra ? Math.round(sobrante * costo) : null,
      unidadesQuietas: f.sobra ? redondear(sobrante, 1) : 0,
      tendencia,
      senales: f.senales,
      pico: f.pico,
      explicacion: {
        vendido: f.vendido,
        vendidoProyecto: f.vendidoProyecto || 0,
        vendidoAjustado: f.vendidoAjustado,
        vendidoReciente: f.vendidoReciente,
        semanasProducto: f.semanasProducto,
        semanasRecientes: f.semanasRecientes,
        promedioSimple: f.promedioSimple,
      },
      serie: crudo ? crudo.slice(desde).map((x) => redondear(x, 1)) : null,
      semanasPico: semanasPico.filter((i) => i >= desde).map((i) => i - desde),
      pronostico,
      ventaHorizonte,
    });
  }

  // Venta alta: el 20 % de los productos que más unidades venden por semana.
  const vendedores = productos.filter((p) => p.ventasSemana > 0).sort((a, b) => b.ventasSemana - a.ventasSemana);
  vendedores.slice(0, Math.ceil(vendedores.length * PARTE_VENTA_ALTA)).forEach((p) => { p.ventaAlta = true; });

  // Ventas del catálogo por semana: el último año y las próximas semanas.
  const desde = Math.max(0, semanasSerie - SEMANAS_GRAFICO);
  const z = P.zNormal(0.9);
  // Sumar las varianzas de cada producto supone que sus ventas suben y bajan por separado; en
  // la práctica una semana floja lo es para casi todo. El rango del total no es más angosto
  // que lo que de verdad varió el total en el último semestre (sin temporada).
  const recientes = [];
  for (let i = Math.max(0, semanasSerie - 26); i < semanasSerie; i++) {
    recientes.push(totalesRecortados[i] / P.temporadaDeSemana(indice, hasta, semanasSerie, i));
  }
  const mediaRec = recientes.length ? suma(recientes) / recientes.length : 0;
  const cv = recientes.length > 4 && mediaRec > 0 ? Math.sqrt(suma(recientes.map((x) => (x - mediaRec) ** 2)) / (recientes.length - 1)) / mediaRec : 0;
  const desviacion = (s) => Math.max(Math.sqrt(varianzaSemana[s]), cv * mediaSemana[s]);
  const grafico = series ? {
    semanas: totalesCrudos.slice(desde).map((total, j) => ({
      inicio: inicioDeSemana(hasta, semanasSerie, desde + j),
      total: Math.round(total + totalesProyecto[desde + j]),
      proyectos: Math.round(total - totalesRecortados[desde + j] + totalesProyecto[desde + j]),
    })),
    pronostico: !completo ? [] : mediaSemana.map((m, s) => ({
      inicio: inicioDeSemana(hasta, semanasSerie, semanasSerie + s),
      media: Math.round(m),
      bajo: Math.max(0, Math.round(m - z * desviacion(s))),
      alto: Math.round(m + z * desviacion(s)),
    })),
  } : null;

  const cuenta = (fn) => productos.reduce((n, p) => n + (fn(p) ? 1 : 0), 0);
  const tieneCostos = productos.some((p) => p.costo !== null);
  const ult4 = suma(totalesRecortados.slice(-4));
  const ant4 = suma(totalesRecortados.slice(-8, -4));
  const proveedores = new Map();
  for (const p of productos) {
    const e = proveedores.get(p.proveedor) || { nombre: p.proveedor, entrega: p.entrega, productos: 0, pideYa: 0, seAgotan: 0 };
    e.productos++;
    if (p.estado === 'pide') e.pideYa++;
    if (p.estado === 'agota') e.seAgotan++;
    proveedores.set(p.proveedor, e);
  }

  return {
    fuente: {
      ...fuente,
      desde: reporte.periodo.desde,
      hasta: reporte.periodo.hasta,
      semanas: reporte.periodo.semanas,
      totales: reporte.periodo.totales,
      mensual: reporte.periodo.mensual,
    },
    umbrales: { seAgota: ajustes.semanasAgota, sobra: SEMANAS_SOBRA },
    horizonte,
    vista: 'analista',
    ajustes: { ...ajustes, nivelServicio: NIVEL_SERVICIO },
    sugerencias: completo,
    alcance: completo ? 'completo' : 'prueba',
    temporada: indice,
    proveedores: [...proveedores.values()].sort((a, b) => (a.nombre === SIN_PROVEEDOR) - (b.nombre === SIN_PROVEEDOR) || b.productos - a.productos),
    resumen: {
      productos: productos.length,
      seAgotan: cuenta((p) => p.estado === 'agota'),
      enCero: cuenta((p) => p.estado === 'agota' && p.existencias <= 0),
      pideYa: cuenta((p) => p.estado === 'pide'),
      sobran: cuenta((p) => p.estado === 'sobra' || (p.estado === 'sin_ventas' && p.existencias > 0)),
      sinVentas: cuenta((p) => p.estado === 'sin_ventas'),
      // Para cuántas semanas alcanza el producto típico (la mediana de los que se venden).
      cobertura: P.mediana(productos.filter((p) => p.semanas !== null).map((p) => p.semanas)) || null,
      sinProveedor: cuenta((p) => p.proveedor === SIN_PROVEEDOR),
      enCamino: cuenta((p) => Boolean(p.enCamino)),
      tieneCostos,
      valorInventario: tieneCostos ? suma(productos.map((p) => p.valor || 0)) : null,
      dineroQuieto: tieneCostos ? suma(productos.map((p) => p.quieto || 0)) : null,
      // Con muy pocas unidades un porcentaje engaña (de 2 a 20 es +900 %).
      tendencia4: ant4 >= 20 ? redondear(ult4 / ant4 - 1, 3) : null,
      picosRecortados: reporte.resumen.picosRecortados || 0,
      productosNuevos: reporte.resumen.productosNuevos || 0,
      acierto: series && completo ? P.medirAcierto(porProducto, hasta, semanasSerie, referencia) : null,
      avisos: proximosAvisos(filas, fuente.fecha, ajustes.semanasAgota),
    },
    grafico,
    productos,
    ejemplo: reporte.ejemplo,
    avisos: reporte.avisos || [],
    hojasUsadas: reporte.hojasUsadas || [],
  };
}

// Lo que ve el operador (D3): cuántos productos hay en cada estado y, por producto, existencias,
// estado y para cuánto alcanza. Sin pronóstico, probabilidades, sugeridos ni dinero. Es la misma
// respuesta con los detalles en null, para que las pantallas usen los mismos tipos.
const CAMPOS_RESUMEN_OPERADOR = ['productos', 'seAgotan', 'enCero', 'pideYa', 'sobran', 'sinVentas', 'cobertura', 'sinProveedor', 'enCamino'];

function resumirParaOperador(inv) {
  const resumen = {};
  for (const k of Object.keys(inv.resumen)) resumen[k] = CAMPOS_RESUMEN_OPERADOR.includes(k) ? inv.resumen[k] : null;
  resumen.picosRecortados = 0;
  resumen.productosNuevos = 0;
  return {
    ...inv,
    vista: 'operador',
    temporada: null,
    grafico: null,
    resumen,
    productos: inv.productos.map((p) => ({
      ...p,
      riesgo: null,
      sugerido: null,
      detalleSugerido: null,
      minimo: null,
      maximo: null,
      costo: null,
      valor: null,
      quieto: null,
      tendencia: null,
      serie: null,
      semanasPico: [],
      pronostico: null,
      ventaHorizonte: null,
    })),
  };
}

module.exports = { construirInventario, resumirParaOperador, leerAjustes, recortarPico, ventaUnica, proveedorDe, clasificar, SIN_PROVEEDOR, ENTREGA_POR_DEFECTO, CADA_CUANTO_POR_DEFECTO, DIAS_HABILES_SEMANA };
