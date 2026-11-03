'use strict';

// Existencias y ventas a partir de los movimientos del día (entradas, ventas, devoluciones,
// salidas y conteos), sumados al último archivo subido. Sin base de datos: lo usa
// server/movimientos.js y se prueba en test/saldos.test.js.
//
//   último archivo (ventas hasta el día H, existencias del día H)
//     + movimientos con fecha posterior a H
//     = ventas hasta el último movimiento y existencias de ese día
//
// Los tipos son la misma separación que la pregunta de documentos del lector: lo que es venta
// cuenta para el promedio, la devolución de un cliente lo resta y lo demás solo mueve existencias.

const { claveCodigo, textoDia, MS_DIA } = require('./valores');

const TIPOS = ['entrada', 'venta', 'devolucion', 'salida', 'conteo'];
const SIGNO = { entrada: 1, devolucion: 1, venta: -1, salida: -1 };

function diaDeFecha(fecha) {
  const [a, m, d] = String(fecha).split('-').map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / MS_DIA);
}

function redondear(n) {
  return Math.round(n * 1000) / 1000;
}

// En orden de fecha y, el mismo día, en el orden en que se registraron.
function ordenar(movimientos) {
  return movimientos.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.id || 0) - (b.id || 0)));
}

/**
 * base: { clave: existencias } (las del archivo, o nada).
 * movimientos: [{ id, codigo, tipo, cantidad, fecha }] sin anulados.
 * Devuelve un Map clave → existencias. Un conteo fija la cantidad de ese día; lo demás suma o resta.
 */
function saldos({ base = {}, movimientos }) {
  const out = new Map(Object.entries(base));
  for (const m of ordenar(movimientos)) {
    const k = claveCodigo(m.codigo);
    const actual = out.get(k) || 0;
    out.set(k, redondear(m.tipo === 'conteo' ? Number(m.cantidad) : actual + SIGNO[m.tipo] * Number(m.cantidad)));
  }
  return out;
}

// Las ventas con la forma de leerExport: la devolución va en negativo (series.js la descuenta). Una
// venta marcada como de proyecto (D12) baja existencias igual, pero va con su marca para que no
// cuente en el promedio.
//
// Una venta de un periodo (SP5: m.desde → m.fecha, "vendí 120 en octubre") se reparte por partes
// iguales entre sus días, igual que un archivo con el total de un periodo (leerPeriodo). Así el
// promedio la cuenta en las semanas en que de verdad se vendió y no toda en el último día.
function ventasDeMovimientos(movimientos) {
  const out = [];
  for (const m of movimientos) {
    if (m.tipo !== 'venta' && m.tipo !== 'devolucion') continue;
    const signo = m.tipo === 'venta' ? 1 : -1;
    const extra = m.tipo === 'venta' && m.proyecto ? { proyecto: true } : {};
    const fin = diaDeFecha(m.fecha);
    const ini = m.desde ? Math.min(diaDeFecha(m.desde), fin) : fin;
    const dias = fin - ini + 1;
    for (let d = ini; d <= fin; d++) out.push({ codigo: m.codigo, nombre: m.nombre || '', dia: d, cantidad: (signo * Number(m.cantidad)) / dias, ...extra });
  }
  return out;
}

/**
 * Ventas que se deducen de los conteos. Hay empresas que no registran cada venta: cuentan lo que hay
 * (Jose Manuel, 2026-11-03). Sin esto, después del archivo no habría ninguna venta, el promedio
 * bajaría semana a semana (lo reciente pesa doble) y el sugerido saldría corto.
 *
 * Si un conteo encuentra menos de lo que debería haber (el saldo con las entradas, salidas y ventas
 * registradas) y entre ese conteo y el anterior no se registró ninguna venta ni devolución de ese
 * producto, la diferencia se cuenta como lo vendido en ese tiempo, repartida entre esos días (como
 * una venta de un periodo). Si sí se registraron ventas, la diferencia es merma o un error de conteo
 * y no se toca. Un conteo que encuentra más de lo esperado no deduce nada.
 *
 * inicial: { clave: existencias } del archivo; hastaBase: su último día (o null). Los movimientos
 * son los que ya quedaron después del archivo.
 */
function ventasDeConteos({ inicial = {}, hastaBase = null, movimientos }) {
  const estado = new Map();
  const out = [];
  for (const m of ordenar(movimientos)) {
    const k = claveCodigo(m.codigo);
    if (!estado.has(k)) estado.set(k, { saldo: inicial[k] || 0, desde: hastaBase, conVentas: false, contado: k in inicial });
    const e = estado.get(k);
    const dia = diaDeFecha(m.fecha);
    if (m.tipo === 'conteo') {
      const faltan = redondear(e.saldo - Number(m.cantidad));
      // Sin archivo ni conteo antes, no hay con qué comparar el primero.
      if (faltan > 0 && !e.conVentas && e.contado) {
        out.push({ codigo: m.codigo, nombre: m.nombre || '', tipo: 'venta', cantidad: faltan, fecha: m.fecha, desde: e.desde !== null && e.desde + 1 < dia ? textoDia(e.desde + 1) : undefined, deConteo: true });
      }
      Object.assign(e, { saldo: Number(m.cantidad), desde: dia, conVentas: false, contado: true });
    } else {
      e.saldo = redondear(e.saldo + SIGNO[m.tipo] * Number(m.cantidad));
      if (m.tipo === 'venta' || m.tipo === 'devolucion') e.conVentas = true;
    }
  }
  return out;
}

/**
 * Una venta de un periodo que empieza el día del archivo o antes y termina después: los días que ya
 * están en el archivo no se vuelven a contar. Queda la parte proporcional a los días que siguen
 * (de 30 días con 10 ya en el archivo, quedan 20/30 de la cantidad, desde el día siguiente).
 */
function recortarAlArchivo(m, hastaBase) {
  if (!m.desde || hastaBase === null) return m;
  const ini = diaDeFecha(m.desde);
  const fin = diaDeFecha(m.fecha);
  if (ini > hastaBase || fin <= hastaBase) return m;
  const parte = (fin - hastaBase) / (fin - ini + 1);
  return { ...m, desde: textoDia(hastaBase + 1), cantidad: redondear(Number(m.cantidad) * parte), recortado: true };
}

/**
 * Las ventas de un archivo ya procesado, rearmadas desde lo que se guardó (export.series y el
 * reporte), para no volver a leer el archivo. Cada semana queda como una venta en su primer día.
 * Sin series (un informe con el total del periodo), el total se reparte por igual entre sus semanas.
 */
function ventasDeExport({ reporte, series }) {
  const filas = reporte.filas || [];
  const porClave = new Map(filas.map((f) => [claveCodigo(f.codigo), f]));
  const ventas = [];
  let hasta;
  if (series) {
    hasta = diaDeFecha(series.hasta);
    const n = series.semanas;
    const rearmar = (porProducto, extra) => {
      for (const [k, s] of Object.entries(porProducto || {})) {
        const f = porClave.get(k) || { codigo: k, nombre: '' };
        s.forEach((x, i) => {
          if (x) ventas.push({ codigo: f.codigo, nombre: f.nombre, dia: hasta - (n - i) * 7 + 1, cantidad: x, ...extra });
        });
      }
    };
    rearmar(series.porProducto, {});
    rearmar(series.proyecto, { proyecto: true });
  } else {
    const desde = diaDeFecha(reporte.periodo.desde);
    hasta = diaDeFecha(reporte.periodo.hasta);
    const semanas = Math.max(1, Math.floor((hasta - desde + 1) / 7));
    for (const f of filas) {
      if (!(f.vendido > 0)) continue;
      for (let i = 0; i < semanas; i++) ventas.push({ codigo: f.codigo, nombre: f.nombre, dia: hasta - (semanas - i) * 7 + 1, cantidad: f.vendido / semanas });
    }
    for (const f of filas) {
      if (f.vendidoProyecto > 0) ventas.push({ codigo: f.codigo, nombre: f.nombre, dia: hasta, cantidad: f.vendidoProyecto, proyecto: true });
    }
  }
  const existencias = filas.map((f) => ({ codigo: f.codigo, nombre: f.nombre, existencias: f.existencias }));
  return { ventas, existencias, hasta };
}

function fechaTexto(dia) {
  const [a, m, d] = textoDia(dia).split('-');
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${Number(d)} de ${MESES[Number(m) - 1]} de ${a}`;
}

/**
 * base: lo que devuelve ventasDeExport, o null si la empresa no ha subido ningún archivo.
 * movimientos: los registrados (sin anulados), con codigo, nombre, tipo, cantidad y fecha.
 * Devuelve las ventas y existencias combinadas, el último día y los avisos para el reporte.
 */
function combinar({ base = null, movimientos }) {
  const hastaBase = base ? base.hasta : null;
  const usados = [];
  const ignorados = [];
  for (const m of movimientos) {
    if (hastaBase !== null && diaDeFecha(m.fecha) <= hastaBase) ignorados.push(m);
    else usados.push(recortarAlArchivo(m, hastaBase));
  }
  const recortados = usados.filter((m) => m.recortado).length;

  const nombres = new Map();
  const codigos = new Map();
  const inicial = {};
  for (const e of base ? base.existencias : []) {
    const k = claveCodigo(e.codigo);
    inicial[k] = (inicial[k] || 0) + e.existencias;
    codigos.set(k, e.codigo);
    if (e.nombre) nombres.set(k, e.nombre);
  }
  for (const m of usados) {
    const k = claveCodigo(m.codigo);
    if (!codigos.has(k)) codigos.set(k, m.codigo);
    if (m.nombre && !nombres.has(k)) nombres.set(k, m.nombre);
  }
  const finales = saldos({ base: inicial, movimientos: usados });
  const existencias = [...codigos].map(([k, codigo]) => ({ codigo, nombre: nombres.get(k) || '', existencias: finales.get(k) || 0 }));
  const deConteos = ventasDeConteos({ inicial, hastaBase, movimientos: usados });
  const ventas = (base ? base.ventas : []).concat(ventasDeMovimientos(usados), ventasDeMovimientos(deConteos));
  let hasta = hastaBase;
  for (const m of usados) hasta = hasta === null ? diaDeFecha(m.fecha) : Math.max(hasta, diaDeFecha(m.fecha));

  const avisos = [];
  if (base && usados.length) avisos.push(`Este inventario combina su archivo con ventas hasta el ${fechaTexto(hastaBase)} y ${usados.length === 1 ? '1 movimiento registrado' : `${usados.length} movimientos registrados`} hasta el ${fechaTexto(hasta)}.`);
  if (!base && usados.length) avisos.push(`Este inventario sale solo de los movimientos registrados hasta el ${fechaTexto(hasta)}.`);
  if (ignorados.length) {
    avisos.push(`${ignorados.length === 1 ? 'Hay 1 movimiento' : `Hay ${ignorados.length} movimientos`} del ${fechaTexto(hastaBase)} o antes: ese día ya está en su archivo, así que no se ${ignorados.length === 1 ? 'sumó' : 'sumaron'}.`);
  }
  if (deConteos.length) {
    const unidades = redondear(deConteos.reduce((n, m) => n + m.cantidad, 0));
    const productos = new Set(deConteos.map((m) => claveCodigo(m.codigo))).size;
    avisos.push(`En ${productos === 1 ? '1 producto' : `${productos} productos`} un conteo encontró menos de lo que había y no se registraron ventas: esa diferencia (${unidades} unidades en total) se contó como vendida entre un conteo y el anterior. Si fue merma o un error, regístrela como salida.`);
  }
  if (recortados) {
    avisos.push(`${recortados === 1 ? '1 venta de un periodo empieza' : `${recortados} ventas de un periodo empiezan`} el ${fechaTexto(hastaBase)} o antes: se ${recortados === 1 ? 'contó' : 'contaron'} solo los días después de su archivo, en proporción.`);
  }
  const negativos = existencias.filter((e) => e.existencias < 0);
  if (negativos.length) {
    avisos.push(`${negativos.length === 1 ? '1 producto quedó' : `${negativos.length} productos quedaron`} con existencias negativas (por ejemplo ${negativos[0].codigo}: ${negativos[0].existencias}). Casi siempre falta registrar una entrada o un conteo.`);
  }
  return { ventas, existencias, hasta, avisos, usados: usados.length, ignorados: ignorados.length, negativos: negativos.map((e) => e.codigo), deConteos: deConteos.length };
}

/**
 * El historial de un producto con su saldo después de cada movimiento.
 * inicial: { dia, existencias } del archivo base, o null.
 */
function kardex({ inicial = null, movimientos }) {
  let saldo = inicial ? inicial.existencias : 0;
  const filas = [];
  for (const m of ordenar(movimientos)) {
    const cuenta = !m.anulado && !(inicial && diaDeFecha(m.fecha) <= inicial.dia);
    const cantidad = Number(recortarAlArchivo(m, inicial ? inicial.dia : null).cantidad);
    if (cuenta) saldo = redondear(m.tipo === 'conteo' ? cantidad : saldo + SIGNO[m.tipo] * cantidad);
    filas.push({ ...m, cuenta, saldo: cuenta ? saldo : null });
  }
  return { filas, saldo };
}

module.exports = { TIPOS, saldos, ventasDeMovimientos, ventasDeConteos, ventasDeExport, combinar, kardex, diaDeFecha };
