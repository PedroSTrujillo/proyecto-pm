'use strict';

// El inventario del usuario tal como lo muestran el panel, la lista de productos y el pedido:
// el reporte de rotación (sin cambios) más el pronóstico, el riesgo de agotarse antes de que
// llegue un pedido, el dinero en inventario y la cantidad sugerida.
//
// Se calcula al pedirlo, con los tiempos de entrega que el usuario tenga guardados, a partir de
// lo que se guardó al subir el archivo: el reporte, las ventas por semana y el catálogo
// (costo y proveedor, si venían).

const P = require('./pronostico');
const { SEMANAS_SE_AGOTA, SEMANAS_SOBRA } = require('./rotacion');
const { inicioDeSemana } = require('./series');
const { claveCodigo, MS_DIA } = require('./valores');

const SEMANAS_GRAFICO = 52;
const SEMANAS_PRONOSTICO = 8;
const ENTREGA_POR_DEFECTO = 1; // semanas, si el usuario no ha dicho cuánto tarda su proveedor
const CADA_CUANTO_POR_DEFECTO = 4; // semanas entre un pedido y el siguiente
const NIVEL_SERVICIO = 0.9; // la cantidad sugerida alcanza en 9 de cada 10 casos
const SIN_PROVEEDOR = 'Sin proveedor';
const MAX_ASIGNACIONES = 20000;
const MAX_PREFIJOS = 200;

function redondear(n, dec = 2) {
  const f = 10 ** dec;
  return Math.round(n * f) / f;
}

function suma(v) {
  return v.reduce((s, x) => s + x, 0);
}

// Ajustes que el usuario guarda en "Datos": cuánto tarda cada proveedor y cada cuánto pide.
function leerAjustes(a) {
  const ajustes = a && typeof a === 'object' ? a : {};
  const num = (v, def, min, max) => (Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : def);
  const entregas = {};
  for (const [k, v] of Object.entries(ajustes.entregas || {})) {
    const n = num(v, null, 0, 52);
    if (n !== null) entregas[String(k).slice(0, 80)] = n;
  }
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
    entregaPorDefecto: num(ajustes.entregaPorDefecto, ENTREGA_POR_DEFECTO, 0, 52),
    cadaCuanto: num(ajustes.cadaCuanto, CADA_CUANTO_POR_DEFECTO, 1, 26),
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

// Los productos que hoy están bien y llegan a 2 semanas en los próximos 3 meses (lo mismo que
// ofrece el recordatorio de calendario, server/recordatorios.js).
function proximosAvisos(filas, fecha) {
  if (!fecha) return null;
  const { planearAvisos, fechaBogota } = require('./recordatorios');
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(String(fecha)) ? String(fecha) : fechaBogota(fecha);
  const avisos = planearAvisos(filas, dia);
  return { productos: avisos.length, primero: avisos[0] || null };
}

function estadoDe(f, entrega) {
  if (f.estado === 'sin_ventas') return 'sin_ventas';
  if (f.estado === 'se_agota') return 'agota';
  if (f.semanasInventario < entrega + 1) return 'pide';
  if (f.sobra) return 'sobra';
  return 'normal';
}

/**
 * reporte: lo que guardó procesarExport (calcularRotacion + avisos).
 * series: seriesSemanales(...) o null (totales de un periodo).
 * catalogo: { clave: { costo, proveedor } } o null.
 * ajustes: leerAjustes(usuarios.inventario).
 * sugerencias: si se muestra la cantidad sugerida (apagada para probadores en su prueba).
 */
function construirInventario({ reporte, series, catalogo, ajustes: ajustesCrudos, fuente = {}, sugerencias = true }) {
  const ajustes = leerAjustes(ajustesCrudos);
  const cat = catalogo || {};
  const hasta = series ? series.hasta : reporte.periodo.hasta;
  const semanasSerie = series ? series.semanas : 0;
  const porProducto = series ? series.porProducto : {};

  // Las ventas de cada producto sin el pico de un proyecto.
  const filas = reporte.filas;
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
  const indice = series ? P.indiceTemporada(totalesRecortados, hasta) : null;
  const futuro = (h) => P.semanasConTemporada(indice, hasta, semanasSerie, h);

  const productos = [];
  let varianzaSemana = new Array(SEMANAS_PRONOSTICO).fill(0);
  let mediaSemana = new Array(SEMANAS_PRONOSTICO).fill(0);
  for (const f of filas) {
    const k = claveCodigo(f.codigo);
    const datos = cat[k] || {};
    const { proveedor, origen: origenProveedor } = proveedorDe(k, datos, ajustes);
    const entrega = ajustes.entregas[proveedor] ?? ajustes.entregaPorDefecto;
    const costo = datos.costo > 0 ? datos.costo : null;
    const { recortada, semanasPico } = recortes.get(k);
    const crudo = porProducto[k] || null;
    const existencias = Math.max(f.existencias, 0);

    let riesgo = null;
    let sugerido = null;
    let minimo = null;
    let maximo = null;
    let pronostico = null;
    if (f.promedioSemanal > 0) {
      const ventana = P.temporadaDeLaVentana(indice, hasta, semanasSerie, f.semanasProducto, f.semanasRecientes);
      const ajuste = P.ajustarProducto({
        tasa: f.promedioSemanal / ventana,
        semanas: f.semanasProducto,
        serie: recortada ? recortada.slice(-Math.round(f.semanasProducto)) : null,
        referencia,
      });
      // Riesgo de quedarse sin él antes de reponerlo: en 2 semanas (el umbral de "se agota")
      // o, si el proveedor tarda más, antes de que llegue un pedido hecho hoy.
      riesgo = redondear(P.predictiva(ajuste, futuro(Math.max(entrega, SEMANAS_SE_AGOTA))).probMayorQue(existencias), 3);
      const necesidad = P.predictiva(ajuste, futuro(entrega + ajustes.cadaCuanto)).cuantil(NIVEL_SERVICIO);
      sugerido = Math.max(0, Math.ceil(necesidad - existencias));
      // Mínimo y máximo, como los llevan muchos programas contables: cuando quedan "mínimo" o
      // menos, se pide hasta llegar al máximo. El mínimo cubre la entrega en 9 de cada 10 casos.
      minimo = Math.ceil(P.predictiva(ajuste, futuro(Math.max(entrega, 0.5))).cuantil(NIVEL_SERVICIO));
      maximo = Math.max(minimo, Math.ceil(necesidad));
      pronostico = [];
      for (let s = 0; s < SEMANAS_PRONOSTICO; s++) {
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
    const estado = estadoDe(f, entrega);
    const sobrante = f.promedioSemanal > 0 ? Math.max(0, existencias - SEMANAS_SOBRA * f.promedioSemanal) : existencias;
    const desde = Math.max(0, semanasSerie - SEMANAS_GRAFICO);
    productos.push({
      codigo: f.codigo,
      nombre: f.nombre,
      proveedor,
      origenProveedor,
      entrega,
      costo,
      ventasSemana: f.promedioSemanal,
      existencias: f.existencias,
      semanas: f.semanasInventario,
      estado,
      riesgo,
      sugerido: sugerencias ? sugerido : null,
      minimo: sugerencias ? minimo : null,
      maximo: sugerencias ? maximo : null,
      valor: costo !== null ? Math.round(existencias * costo) : null,
      quieto: costo !== null && f.sobra ? Math.round(sobrante * costo) : null,
      unidadesQuietas: f.sobra ? redondear(sobrante, 1) : 0,
      tendencia,
      senales: f.senales,
      pico: f.pico,
      explicacion: {
        vendido: f.vendido,
        vendidoAjustado: f.vendidoAjustado,
        vendidoReciente: f.vendidoReciente,
        semanasProducto: f.semanasProducto,
        semanasRecientes: f.semanasRecientes,
        promedioSimple: f.promedioSimple,
      },
      serie: crudo ? crudo.slice(desde).map((x) => redondear(x, 1)) : null,
      semanasPico: semanasPico.filter((i) => i >= desde).map((i) => i - desde),
      pronostico,
    });
  }

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
      total: Math.round(total),
      proyectos: Math.round(total - totalesRecortados[desde + j]),
    })),
    pronostico: mediaSemana.map((m, s) => ({
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
    umbrales: { seAgota: SEMANAS_SE_AGOTA, sobra: SEMANAS_SOBRA },
    ajustes: { ...ajustes, nivelServicio: NIVEL_SERVICIO },
    sugerencias,
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
      tieneCostos,
      valorInventario: tieneCostos ? suma(productos.map((p) => p.valor || 0)) : null,
      dineroQuieto: tieneCostos ? suma(productos.map((p) => p.quieto || 0)) : null,
      // Con muy pocas unidades un porcentaje engaña (de 2 a 20 es +900 %).
      tendencia4: ant4 >= 20 ? redondear(ult4 / ant4 - 1, 3) : null,
      picosRecortados: reporte.resumen.picosRecortados || 0,
      productosNuevos: reporte.resumen.productosNuevos || 0,
      acierto: series ? P.medirAcierto(porProducto, hasta, semanasSerie, referencia) : null,
      avisos: proximosAvisos(filas, fuente.fecha),
    },
    grafico,
    productos,
    ejemplo: reporte.ejemplo,
    avisos: reporte.avisos || [],
    hojasUsadas: reporte.hojasUsadas || [],
  };
}

module.exports = { construirInventario, leerAjustes, recortarPico, proveedorDe, SIN_PROVEEDOR, ENTREGA_POR_DEFECTO, CADA_CUANTO_POR_DEFECTO };
