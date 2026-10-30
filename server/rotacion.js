'use strict';

// Cálculo de la rotación por producto (ver docs/modelo-rotacion.md).
//
//   T   = semanas del histórico = (último día − primer día + 1) / 7
//   Tᵢ  = semanas que cuentan para el producto i: todo el histórico, o desde su primera
//         venta si empezó a venderse hace poco (mínimo 13 semanas)
//   Qᵢ  = total vendido de i, con su mes fuera de lo normal recortado a 3 veces lo normal
//   Rᵢ  = semanas recientes (las últimas 13, o Tᵢ si es menor); Q⁽ʳ⁾ᵢ = lo vendido en ellas
//   d̄ᵢ  = ventas por semana = (Qᵢ + Q⁽ʳ⁾ᵢ) / (Tᵢ + Rᵢ)   (lo reciente cuenta doble)
//   Sᵢ  = semanas de inventario restantes = existencias de i / d̄ᵢ
//
// Se usa todo el histórico (uno o dos años) porque en catálogos grandes muchos
// productos de baja rotación saldrían en cero si se mirara un periodo corto. Los tres
// ajustes acercan el promedio a lo que se va a vender sin pedirle nada al usuario.

const { claveCodigo, finDeMes, textoDia, MS_DIA } = require('./valores');

const SEMANAS_SE_AGOTA = 2; // menos de esto: "se agota", si el usuario no eligió otro umbral en Datos
const SEMANAS_SOBRA = 12; // más de esto (unos 3 meses): "sobra"
const SEMANAS_HISTORICO_MINIMO = 26;
const SEMANAS_HISTORICO_MAXIMO = 110;
const SEMANAS_RECIENTES = 13; // unos 3 meses: lo vendido aquí cuenta doble
const SEMANAS_MINIMAS_PRODUCTO = 13; // un producto nuevo se promedia sobre al menos esto
const VECES_INTERVALO = 3; // nuevo = apareció tarde comparado con cada cuánto se vende
const MESES_MINIMOS_PICO = 6; // con menos meses con venta no se sabe qué es "lo normal"
const VECES_LO_NORMAL = 3; // un mes que vende más que esto × la mediana de los demás se recorta...
const VECES_OTRO_MES = 2; // ...si además vende más del doble que cualquier otro mes (pico aislado)

// Avisos sobre el periodo que no cambian el cálculo pero sí cómo se lee: un archivo que llega
// hasta hace semanas (las existencias son de ese día) y un hueco sin ninguna venta en la mitad
// (casi siempre falta un archivo; el promedio sale más bajo).
// Códigos que no coinciden entre ventas y existencias (SP5, Hito 1.6): si menos de la mitad de los
// códigos vendidos aparecen en las existencias, casi seguro los dos informes escriben el código
// distinto, y esos productos salen con 0 existencias (el sugerido pediría de más).
const PARTE_MINIMA_COINCIDEN = 0.5;
const MINIMO_CODIGOS_ALERTA = 5; // con 2 o 3 productos un porcentaje no dice nada
const MAX_LISTA_CODIGOS = 500;
const DIAS_ARCHIVO_VIEJO = 30;
const DIAS_HUECO = 45;
const DIAS_HUECO_MENSUAL = 62;
const MESES_TEXTO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaTexto = (dia) => { const d = new Date(dia * MS_DIA); return `${d.getUTCDate()} de ${MESES_TEXTO[d.getUTCMonth()]} de ${d.getUTCFullYear()}`; };

function avisosDelPeriodo(ventas, hasta, mensual, hoy) {
  const avisos = [];
  if (hoy !== undefined && hoy - hasta > DIAS_ARCHIVO_VIEJO) {
    avisos.push(`Sus ventas llegan hasta el ${fechaTexto(hasta)}, hace ${Math.round((hoy - hasta) / 7)} semanas. Las existencias son las de ese día: si desde entonces vendió o le llegó mercancía, saque el informe hasta hoy.`);
  }
  const dias = [...new Set(ventas.filter((v) => v.cantidad > 0).map((v) => v.dia))].sort((a, b) => a - b);
  let hueco = null;
  for (let i = 1; i < dias.length; i++) if (!hueco || dias[i] - dias[i - 1] > hueco.dias) hueco = { desde: dias[i - 1], hasta: dias[i], dias: dias[i] - dias[i - 1] };
  if (hueco && hueco.dias > (mensual ? DIAS_HUECO_MENSUAL : DIAS_HUECO)) {
    avisos.push(`No hay ninguna venta entre el ${fechaTexto(hueco.desde + 1)} y el ${fechaTexto(hueco.hasta - 1)}. Si le falta el archivo de esas fechas, súbalo junto con los demás: sin él, el promedio de venta sale más bajo.`);
  }
  return avisos;
}

/**
 * ventas: [{ codigo, nombre, dia, cantidad, proyecto? }]  (dia = días desde 1970-01-01)
 *   proyecto: true = venta para un proyecto (D12). Cuenta para el periodo del archivo, pero no
 *   para el promedio: se guarda aparte en vendidoProyecto.
 * existencias: [{ codigo, nombre, existencias }]
 * mensual: true si las ventas vienen agrupadas por mes (la fecha es el día 1 de cada mes)
 * periodo: { desde, hasta } (días) si las ventas son totales de un periodo, sin fecha por venta.
 *   Sin fechas no se sabe qué es reciente, qué mes fue un pico ni cuándo empezó un producto,
 *   así que se usa el promedio simple Q ÷ T.
 * semanasAgota: el umbral de "se agota" que eligió el usuario (2 si no eligió). Queda guardado
 *   en el reporte, así que cada pedido conserva el umbral con el que se vio.
 * hastaDia: el último día del periodo si es después de la última venta. Lo usa el inventario
 *   calculado con movimientos (server/movimientos.js): las existencias son las del último día
 *   con movimientos, aunque ese día no se haya vendido nada.
 */
function calcularRotacion({ ventas, existencias, mensual = false, periodo: totales = null, semanasAgota = SEMANAS_SE_AGOTA, hoy, hastaDia }) {
  if (!ventas.length) throw new Error('No hay ventas para calcular.');

  let desde = Infinity;
  let hasta = -Infinity;
  for (const v of ventas) {
    if (v.dia < desde) desde = v.dia;
    if (v.dia > hasta) hasta = v.dia;
  }
  if (mensual) hasta = finDeMes(hasta); // el último mes cuenta completo
  if (hastaDia !== undefined && hastaDia > hasta) hasta = hastaDia;
  if (totales) ({ desde, hasta } = totales);
  const dias = hasta - desde + 1;
  const semanasHistorico = dias / 7;
  const inicioReciente = Math.max(desde, inicioDeLoReciente(hasta, mensual));
  const semanasRecientes = (hasta - inicioReciente + 1) / 7;

  const productos = new Map();
  const producto = (codigo, nombre) => {
    const clave = claveCodigo(codigo);
    let p = productos.get(clave);
    if (!p) {
      p = { clave, codigo, nombre: nombre || '', vendido: 0, vendidoProyecto: 0, reciente: 0, primeraVenta: null, diasConVenta: new Set(), meses: new Map(), filasVenta: 0, existencias: 0, filasExistencias: 0 };
      productos.set(clave, p);
    }
    return p;
  };

  for (const v of ventas) {
    const p = producto(v.codigo, v.nombre);
    if (v.proyecto) {
      p.vendidoProyecto += v.cantidad;
      p.filasVenta++;
      if (!p.nombre && v.nombre) p.nombre = v.nombre;
      continue;
    }
    const esReciente = v.dia >= inicioReciente;
    p.vendido += v.cantidad;
    if (esReciente) p.reciente += v.cantidad;
    if (v.cantidad > 0) {
      if (p.primeraVenta === null || v.dia < p.primeraVenta) p.primeraVenta = v.dia;
      p.diasConVenta.add(v.dia);
    }
    const mes = mesDe(v.dia);
    const m = p.meses.get(mes) || { total: 0, reciente: 0 };
    m.total += v.cantidad;
    if (esReciente) m.reciente += v.cantidad;
    p.meses.set(mes, m);
    p.filasVenta++;
    if (!p.nombre && v.nombre) p.nombre = v.nombre;
  }
  for (const e of existencias) {
    const p = producto(e.codigo, e.nombre);
    p.existencias += e.existencias; // varias bodegas = varias filas: se suman
    p.filasExistencias++;
    if (e.nombre) p.nombreExistencias = p.nombreExistencias || e.nombre;
  }

  const filas = [];
  let variasBodegas = 0;
  for (const p of productos.values()) {
    const enVentas = p.filasVenta > 0;
    const enExistencias = p.filasExistencias > 0;
    if (p.filasExistencias > 1) variasBodegas++;
    const existenciasActuales = enExistencias ? redondear(p.existencias) : 0;
    const vendido = redondear(p.vendido);
    const ajuste = vendido <= 0 ? null
      : totales ? promedioSimple(vendido, semanasHistorico)
        : ventasPorSemana(p, { desde, hasta, semanasHistorico, semanasRecientes });
    const promedioSemanal = ajuste ? ajuste.promedioSemanal : 0;
    const senales = [];
    if (!enVentas) senales.push('no_en_ventas');
    if (!enExistencias) senales.push('no_en_existencias');
    if (existenciasActuales < 0) senales.push('existencias_negativas');
    const vendidoProyecto = redondear(p.vendidoProyecto);
    if (enVentas && vendido <= 0 && !vendidoProyecto) senales.push('devoluciones');
    if (vendidoProyecto > 0) senales.push('proyecto');
    if (ajuste && ajuste.pico) senales.push('pico_recortado');
    if (ajuste && ajuste.semanasProducto < semanasHistorico) senales.push('producto_nuevo');

    let semanasInventario = null;
    let estado;
    if (vendido <= 0) {
      estado = 'sin_ventas';
    } else {
      semanasInventario = Math.max(existenciasActuales, 0) / promedioSemanal;
      estado = estadoPorSemanas(semanasInventario, semanasAgota);
    }
    const sobra = estado === 'sobra' || (estado === 'sin_ventas' && existenciasActuales > 0);

    filas.push({
      codigo: p.codigo,
      nombre: p.nombreExistencias || p.nombre,
      vendido,
      vendidoProyecto,
      promedioSemanal,
      // El desglose del promedio, para explicarlo producto por producto.
      promedioSimple: vendido > 0 ? vendido / semanasHistorico : 0,
      vendidoAjustado: ajuste ? ajuste.vendidoAjustado : vendido,
      vendidoReciente: ajuste ? ajuste.vendidoReciente : 0,
      semanasProducto: ajuste ? ajuste.semanasProducto : semanasHistorico,
      semanasRecientes: ajuste ? ajuste.semanasRecientes : 0,
      pico: ajuste ? ajuste.pico : null,
      existencias: existenciasActuales,
      semanasInventario,
      estado,
      sobra,
      senales,
    });
  }

  // De menos a más semanas: lo que se agota primero va arriba. Sin ventas, al final.
  filas.sort((a, b) => {
    if (a.semanasInventario === null && b.semanasInventario === null) return b.existencias - a.existencias || comparaCodigo(a, b);
    if (a.semanasInventario === null) return 1;
    if (b.semanasInventario === null) return -1;
    return a.semanasInventario - b.semanasInventario || b.promedioSemanal - a.promedioSemanal || comparaCodigo(a, b);
  });

  const cuenta = (fn) => filas.reduce((n, f) => n + (fn(f) ? 1 : 0), 0);
  const resumen = {
    productos: filas.length,
    seAgotan: cuenta((f) => f.estado === 'se_agota'),
    sobran: cuenta((f) => f.sobra),
    sinVentas: cuenta((f) => f.estado === 'sin_ventas'),
    sinExistenciaCero: cuenta((f) => f.semanasInventario === 0),
    noEnVentas: cuenta((f) => f.senales.includes('no_en_ventas')),
    noEnExistencias: cuenta((f) => f.senales.includes('no_en_existencias')),
    picosRecortados: cuenta((f) => f.senales.includes('pico_recortado')),
    productosNuevos: cuenta((f) => f.senales.includes('producto_nuevo')),
    conProyectos: cuenta((f) => f.senales.includes('proyecto')),
    filasVenta: ventas.length,
  };

  const periodo = {
    desde: textoDia(desde),
    hasta: textoDia(hasta),
    dias,
    semanas: semanasHistorico,
    recientesDesde: textoDia(inicioReciente),
    semanasRecientes,
    mensual,
    totales: Boolean(totales),
  };

  const avisos = [];
  if (semanasHistorico < SEMANAS_HISTORICO_MINIMO) {
    avisos.push(`Su archivo trae ventas de solo ${Math.round(semanasHistorico)} semanas. El cálculo es más confiable con uno o dos años de ventas.`);
  } else if (semanasHistorico > SEMANAS_HISTORICO_MAXIMO) {
    avisos.push(`Su archivo trae ventas de ${Math.round(semanasHistorico)} semanas (más de dos años). Se usaron todas.`);
  }
  if (!totales) avisos.push(...avisosDelPeriodo(ventas, hasta, mensual, hoy));
  const codigos = revisarCodigos(filas);
  if (codigos.alerta) {
    avisos.unshift(`Solo ${codigos.coinciden} de los ${codigos.ventas} códigos de las ventas aparecen en las existencias. Casi siempre es porque los dos informes escriben el código distinto (con guiones, ceros o un sufijo). Esos productos salen con 0 existencias y se sugiere pedirlos de más: revise la lista de códigos que no coinciden.`);
  }
  if (resumen.noEnVentas) avisos.push(`${plural(resumen.noEnVentas, 'producto tiene', 'productos tienen')} existencias pero no aparece${resumen.noEnVentas === 1 ? '' : 'n'} en las ventas. Se muestra${resumen.noEnVentas === 1 ? '' : 'n'} como "sin ventas en el periodo".`);
  if (resumen.noEnExistencias) avisos.push(`${plural(resumen.noEnExistencias, 'producto aparece', 'productos aparecen')} en las ventas pero no en las existencias. Se tomaron con 0 existencias.`);
  if (variasBodegas) avisos.push(`${plural(variasBodegas, 'producto aparece', 'productos aparecen')} en varias filas de existencias (por ejemplo, varias bodegas). Se sumaron.`);
  const negativas = cuenta((f) => f.senales.includes('existencias_negativas'));
  if (negativas) avisos.push(`${plural(negativas, 'producto tiene', 'productos tienen')} existencias negativas en el archivo. Se cuentan como 0 semanas.`);
  if (resumen.picosRecortados) avisos.push(`En ${plural(resumen.picosRecortados, 'producto', 'productos')} un mes vendió más de ${VECES_LO_NORMAL} veces lo normal (por ejemplo, una venta para un proyecto). Ese mes se contó como ${VECES_LO_NORMAL} veces lo normal.`);
  if (resumen.productosNuevos) avisos.push(`${plural(resumen.productosNuevos, 'producto empezó', 'productos empezaron')} a venderse hace poco. Su promedio se calcula desde su primera venta (mínimo ${SEMANAS_MINIMAS_PRODUCTO} semanas) y no sobre todo el archivo.`);

  return {
    filas,
    resumen,
    periodo,
    ejemplo: elegirEjemplo(filas, semanasHistorico),
    avisos,
    codigos,
    umbrales: { seAgota: semanasAgota, sobra: SEMANAS_SOBRA },
    ajustes: { semanasRecientes: SEMANAS_RECIENTES, semanasMinimasProducto: SEMANAS_MINIMAS_PRODUCTO, vecesLoNormal: VECES_LO_NORMAL, vecesOtroMes: VECES_OTRO_MES, mesesMinimosPico: MESES_MINIMOS_PICO },
  };
}

// El código sin guiones, puntos, barras ni espacios, y sin ceros a la izquierda: "TOR-0610" y
// "TOR0610" son el mismo; "00123" y "123" también.
function claveSuelta(codigo) {
  const t = claveCodigo(codigo).replace(/[^0-9A-Z]/g, '');
  return t.replace(/^0+(?=\d)/, '');
}

// El código sin su último pedazo ("TOR-0610-UN" → "TOR-0610"), si después de quitarlo queda algo.
function sinSufijo(codigo) {
  const t = String(codigo).trim();
  const i = Math.max(t.lastIndexOf('-'), t.lastIndexOf('_'), t.lastIndexOf('.'), t.lastIndexOf('/'), t.lastIndexOf(' '));
  if (i < 2) return null;
  const resto = claveSuelta(t.slice(0, i));
  return resto.length >= 3 ? resto : null;
}

/**
 * Qué códigos de las ventas no están en las existencias y al revés, y parejas probables: el mismo
 * código escrito distinto (sin guiones ni sufijos). Pura; las listas van recortadas.
 */
function revisarCodigos(filas) {
  const soloVentas = filas.filter((f) => f.senales.includes('no_en_existencias'));
  const soloExistencias = filas.filter((f) => f.senales.includes('no_en_ventas'));
  const ventas = filas.length - soloExistencias.length;
  const existencias = filas.length - soloVentas.length;
  const coinciden = ventas - soloVentas.length;

  const porSuelta = new Map();
  const porSinSufijo = new Map();
  for (const f of soloExistencias) {
    const k = claveSuelta(f.codigo);
    if (!porSuelta.has(k)) porSuelta.set(k, f);
    const c = sinSufijo(f.codigo);
    if (c && !porSinSufijo.has(c)) porSinSufijo.set(c, f);
  }
  const usados = new Set();
  const parejas = [];
  for (const v of soloVentas) {
    const k = claveSuelta(v.codigo);
    const c = sinSufijo(v.codigo);
    const e = [porSuelta.get(k), c && porSuelta.get(c), porSinSufijo.get(k)].find((x) => x && !usados.has(x.codigo));
    if (!e) continue;
    usados.add(e.codigo);
    parejas.push({ ventas: v.codigo, existencias: e.codigo, nombre: v.nombre || e.nombre || '' });
  }
  return {
    ventas,
    existencias,
    coinciden,
    // Solo tiene sentido si las existencias vinieron aparte (si no, no hay nada que coincida).
    alerta: existencias > 0 && ventas >= MINIMO_CODIGOS_ALERTA && coinciden < ventas * PARTE_MINIMA_COINCIDEN,
    soloVentas: soloVentas.slice(0, MAX_LISTA_CODIGOS).map((f) => ({ codigo: f.codigo, nombre: f.nombre, vendido: f.vendido })),
    soloExistencias: soloExistencias.slice(0, MAX_LISTA_CODIGOS).map((f) => ({ codigo: f.codigo, nombre: f.nombre, existencias: f.existencias })),
    totalSoloVentas: soloVentas.length,
    totalSoloExistencias: soloExistencias.length,
    parejas: parejas.slice(0, MAX_LISTA_CODIGOS),
  };
}

function estadoPorSemanas(semanas, semanasAgota = SEMANAS_SE_AGOTA) {
  if (semanas < semanasAgota) return 'se_agota';
  if (semanas > SEMANAS_SOBRA) return 'sobra';
  return 'normal';
}

// El mismo reporte con otro umbral de "se agota": las semanas no cambian, solo qué se marca.
// Sirve para un pedido que usa un archivo ya subido con otro umbral ("usar ese inventario").
function conUmbral(reporte, semanasAgota) {
  if (!reporte || !reporte.filas || !semanasAgota) return reporte;
  const umbrales = reporte.umbrales || { seAgota: SEMANAS_SE_AGOTA, sobra: SEMANAS_SOBRA };
  if (umbrales.seAgota === semanasAgota) return reporte;
  const filas = reporte.filas.map((f) => {
    if (f.semanasInventario === null) return f;
    const estado = estadoPorSemanas(f.semanasInventario, semanasAgota);
    return { ...f, estado, sobra: estado === 'sobra' };
  });
  const cuenta = (fn) => filas.reduce((n, f) => n + (fn(f) ? 1 : 0), 0);
  const resumen = reporte.resumen && { ...reporte.resumen, seAgotan: cuenta((f) => f.estado === 'se_agota'), sobran: cuenta((f) => f.sobra) };
  return { ...reporte, filas, resumen, umbrales: { ...umbrales, seAgota: semanasAgota } };
}

function promedioSimple(vendido, semanas) {
  return { promedioSemanal: vendido / semanas, vendidoAjustado: vendido, vendidoReciente: 0, semanasProducto: semanas, semanasRecientes: 0, pico: null };
}

// Lo reciente: las últimas 13 semanas, o los últimos 3 meses completos si el archivo viene por mes.
function inicioDeLoReciente(hasta, mensual) {
  if (!mensual) return hasta - SEMANAS_RECIENTES * 7 + 1;
  const d = new Date(hasta * MS_DIA);
  return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 2, 1) / MS_DIA);
}

function mesDe(dia) {
  const d = new Date(dia * MS_DIA);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

function textoMes(mes) {
  return `${Math.floor(mes / 12)}-${String((mes % 12) + 1).padStart(2, '0')}`;
}

/**
 * Ventas por semana de un producto con los tres ajustes. Devuelve también cada paso,
 * para que el reporte pueda mostrar el cálculo desglosado.
 */
function ventasPorSemana(p, { desde, hasta, semanasHistorico, semanasRecientes }) {
  const pico = mesFueraDeLoNormal(p.meses);
  const vendidoAjustado = redondear(p.vendido - (pico ? pico.exceso : 0));
  // Si en lo reciente hubo más devoluciones que ventas, eso no suma doble (ni resta doble).
  const vendidoReciente = redondear(Math.max(p.reciente - (pico ? pico.excesoReciente : 0), 0));
  const semanasProducto = esNuevo(p, desde, hasta)
    ? Math.min(semanasHistorico, Math.max(SEMANAS_MINIMAS_PRODUCTO, (hasta - p.primeraVenta + 1) / 7))
    : semanasHistorico;
  const semanasRecientesProducto = Math.min(semanasRecientes, semanasProducto);
  const promedioSemanal = Math.max(vendidoAjustado + vendidoReciente, 0) / (semanasProducto + semanasRecientesProducto);
  return {
    promedioSemanal,
    vendidoAjustado,
    vendidoReciente,
    semanasProducto,
    semanasRecientes: semanasRecientesProducto,
    pico: pico ? { mes: pico.mes, vendido: redondear(pico.vendido), contado: redondear(pico.tope) } : null,
  };
}

// Nuevo = su primera venta llega mucho después del inicio del archivo: más de 13 semanas y más
// de 3 veces lo que suele tardar entre una venta y otra. Así, un producto que se vende de vez en
// cuando (y por eso tardó en aparecer) no se toma por nuevo ni se le infla el promedio.
function esNuevo(p, desde, hasta) {
  if (p.primeraVenta === null) return false;
  // Todo vendido en un par de semanas y nada en el último mes: es una venta puntual (un
  // proyecto), no un producto que empezó a venderse. Promediarlo desde ahí lo inflaría.
  const ultimaVenta = Math.max(...p.diasConVenta);
  if (ultimaVenta - p.primeraVenta <= 13 && hasta - ultimaVenta >= 28) return false;
  const espera = p.primeraVenta - desde;
  const intervalo = (hasta - p.primeraVenta + 1) / p.diasConVenta.size;
  return espera >= SEMANAS_MINIMAS_PRODUCTO * 7 && espera > VECES_INTERVALO * intervalo;
}

// Un solo mes que vende más de 3 veces lo normal del producto (la mediana de sus otros
// meses con venta) y más del doble que cualquier otro mes es casi siempre una venta
// puntual, como un proyecto: se cuenta como 3 veces lo normal. La segunda condición
// deja quieta una subida sostenida (varios meses altos seguidos), que es demanda real
// y que el peso doble de lo reciente debe recoger.
function mesFueraDeLoNormal(meses) {
  const conVenta = [...meses].filter(([, m]) => m.total > 0).sort((a, b) => b[1].total - a[1].total);
  if (conVenta.length < MESES_MINIMOS_PICO) return null;
  const [mes, mayor] = conVenta[0];
  if (mayor.total <= VECES_OTRO_MES * conVenta[1][1].total) return null;
  const tope = VECES_LO_NORMAL * mediana(conVenta.slice(1).map(([, m]) => m.total));
  if (mayor.total <= tope) return null;
  const exceso = mayor.total - tope;
  return { mes: textoMes(mes), vendido: mayor.total, tope, exceso, excesoReciente: exceso * Math.max(mayor.reciente, 0) / mayor.total };
}

function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// Un producto del propio archivo para explicar el cálculo con sus números.
function elegirEjemplo(filas, semanasHistorico) {
  const conDatos = filas.filter((f) => f.vendido > 0 && f.existencias > 0 && f.senales.length === 0);
  const elegido = conDatos.find((f) => f.estado === 'se_agota')
    || conDatos.find((f) => f.estado === 'normal')
    || conDatos[0]
    || filas.find((f) => f.vendido > 0);
  if (!elegido) return null;
  return {
    codigo: elegido.codigo,
    nombre: elegido.nombre,
    vendido: elegido.vendido,
    semanasHistorico,
    vendidoAjustado: elegido.vendidoAjustado,
    vendidoReciente: elegido.vendidoReciente,
    semanasProducto: elegido.semanasProducto,
    semanasRecientes: elegido.semanasRecientes,
    pico: elegido.pico,
    promedioSimple: elegido.promedioSimple,
    promedioSemanal: elegido.promedioSemanal,
    existencias: elegido.existencias,
    semanasInventario: elegido.semanasInventario,
  };
}

function comparaCodigo(a, b) {
  return String(a.codigo).localeCompare(String(b.codigo), 'es', { numeric: true });
}

function redondear(n) {
  return Math.round(n * 1e6) / 1e6; // evita 0.30000000000000004 al sumar
}

function plural(n, uno, varios) {
  return n === 1 ? `1 ${uno}` : `${n} ${varios}`;
}

module.exports = { calcularRotacion, conUmbral, estadoPorSemanas, revisarCodigos, claveSuelta, SEMANAS_SE_AGOTA, SEMANAS_SOBRA };
