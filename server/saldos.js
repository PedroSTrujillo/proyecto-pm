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

// Las ventas con la forma de leerExport: la devolución va en negativo (series.js la descuenta).
function ventasDeMovimientos(movimientos) {
  return movimientos
    .filter((m) => m.tipo === 'venta' || m.tipo === 'devolucion')
    .map((m) => ({ codigo: m.codigo, nombre: m.nombre || '', dia: diaDeFecha(m.fecha), cantidad: (m.tipo === 'venta' ? 1 : -1) * Number(m.cantidad) }));
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
    for (const [k, s] of Object.entries(series.porProducto || {})) {
      const f = porClave.get(k) || { codigo: k, nombre: '' };
      s.forEach((x, i) => {
        if (x) ventas.push({ codigo: f.codigo, nombre: f.nombre, dia: hasta - (n - i) * 7 + 1, cantidad: x });
      });
    }
  } else {
    const desde = diaDeFecha(reporte.periodo.desde);
    hasta = diaDeFecha(reporte.periodo.hasta);
    const semanas = Math.max(1, Math.floor((hasta - desde + 1) / 7));
    for (const f of filas) {
      if (!(f.vendido > 0)) continue;
      for (let i = 0; i < semanas; i++) ventas.push({ codigo: f.codigo, nombre: f.nombre, dia: hasta - (semanas - i) * 7 + 1, cantidad: f.vendido / semanas });
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
  for (const m of movimientos) (hastaBase !== null && diaDeFecha(m.fecha) <= hastaBase ? ignorados : usados).push(m);

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
  const ventas = (base ? base.ventas : []).concat(ventasDeMovimientos(usados));
  let hasta = hastaBase;
  for (const m of usados) hasta = hasta === null ? diaDeFecha(m.fecha) : Math.max(hasta, diaDeFecha(m.fecha));

  const avisos = [];
  if (base && usados.length) avisos.push(`Este inventario combina tu archivo con ventas hasta el ${fechaTexto(hastaBase)} y ${usados.length === 1 ? '1 movimiento registrado' : `${usados.length} movimientos registrados`} hasta el ${fechaTexto(hasta)}.`);
  if (!base && usados.length) avisos.push(`Este inventario sale solo de los movimientos registrados hasta el ${fechaTexto(hasta)}.`);
  if (ignorados.length) {
    avisos.push(`${ignorados.length === 1 ? 'Hay 1 movimiento' : `Hay ${ignorados.length} movimientos`} del ${fechaTexto(hastaBase)} o antes: ese día ya está en tu archivo, así que no se ${ignorados.length === 1 ? 'sumó' : 'sumaron'}.`);
  }
  const negativos = existencias.filter((e) => e.existencias < 0);
  if (negativos.length) {
    avisos.push(`${negativos.length === 1 ? '1 producto quedó' : `${negativos.length} productos quedaron`} con existencias negativas (por ejemplo ${negativos[0].codigo}: ${negativos[0].existencias}). Casi siempre falta registrar una entrada o un conteo.`);
  }
  return { ventas, existencias, hasta, avisos, usados: usados.length, ignorados: ignorados.length, negativos: negativos.map((e) => e.codigo) };
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
    if (cuenta) saldo = redondear(m.tipo === 'conteo' ? Number(m.cantidad) : saldo + SIGNO[m.tipo] * Number(m.cantidad));
    filas.push({ ...m, cuenta, saldo: cuenta ? saldo : null });
  }
  return { filas, saldo };
}

module.exports = { TIPOS, saldos, ventasDeMovimientos, ventasDeExport, combinar, kardex, diaDeFecha };
