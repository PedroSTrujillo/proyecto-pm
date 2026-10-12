'use strict';

// Plantillas descargables, con un ejemplo lleno. Los nombres y el orden de las
// columnas salen de formatos.js (PLANTILLA_EXPORT y PLANTILLA_LISTA).

const XLSX = require('xlsx');
const { PLANTILLA_EXPORT, PLANTILLA_LISTA, PLANTILLA_INVENTARIO } = require('./formatos');
const { EXCEL_EPOCA, MS_DIA } = require('./valores');

// Productos de ejemplo (una distribuidora de ferretería).
const PRODUCTOS_EJEMPLO = [
  { codigo: 'CIN-0003', costo: 3200, nombre: 'Cinta aislante negra 18 mm x 10 m', porSemana: 25, existencias: 0, proveedor: 'Eléctricos del Valle', minimo: 40, maximo: 120 },
  { codigo: 'TOR-0610', costo: 9800, nombre: 'Tornillo drywall 6 x 1" (caja x100)', porSemana: 12, existencias: 18, proveedor: 'Tornillería Central', minimo: 30, maximo: 90 },
  { codigo: 'LIJ-0120', costo: 1400, nombre: 'Lija de agua #120', porSemana: 30, existencias: 150, proveedor: 'Abrasivos Andinos', minimo: 100, maximo: 300 },
  { codigo: 'PVC-0250', costo: 38000, nombre: 'Soldadura PVC 1/4 galón', porSemana: 6, existencias: 40, proveedor: 'Plásticos y Tubos', minimo: 15, maximo: 50 },
  { codigo: 'BRO-0002', costo: 4500, nombre: 'Brocha 2" mango plástico', porSemana: 4, existencias: 30, proveedor: 'Pinturas La Paleta', minimo: 12, maximo: 40 },
  { codigo: 'CAN-0040', costo: 21000, nombre: 'Candado de bronce 40 mm', porSemana: 2, existencias: 20, proveedor: 'Seguridad Total', minimo: 6, maximo: 24 },
  { codigo: 'MAN-1215', costo: 27000, nombre: 'Manguera de jardín 1/2" x 15 m', porSemana: 1, existencias: 45, proveedor: 'Plásticos y Tubos', minimo: 5, maximo: 20 },
  { codigo: 'GUA-0007', costo: 6800, nombre: 'Guantes de carnaza (par)', porSemana: 0, existencias: 60, proveedor: 'Seguridad Total', minimo: 10, maximo: 30 },
];

// Generador pseudoaleatorio con semilla: la plantilla sale igual cada vez.
function aleatorio(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hoyDia() {
  return Math.floor(Date.now() / MS_DIA);
}

// Ventas de ejemplo: el último año, con 1 a 3 facturas por semana por producto.
function ventasEjemplo(semanas = 52) {
  const azar = aleatorio(20261001);
  const fin = hoyDia() - 1;
  const inicio = fin - semanas * 7 + 1;
  const filas = [];
  for (let s = 0; s < semanas; s++) {
    for (const p of PRODUCTOS_EJEMPLO) {
      if (!p.porSemana) continue;
      let restante = Math.max(0, Math.round(p.porSemana * (0.6 + azar() * 0.8)));
      const facturas = 1 + Math.floor(azar() * 3);
      for (let f = 0; f < facturas && restante > 0; f++) {
        const cantidad = f === facturas - 1 ? restante : Math.max(1, Math.round(restante * azar()));
        restante -= cantidad;
        filas.push({ codigo: p.codigo, nombre: p.nombre, dia: inicio + s * 7 + Math.floor(azar() * 7), cantidad });
      }
    }
  }
  filas.sort((a, b) => a.dia - b.dia || a.codigo.localeCompare(b.codigo));
  return filas;
}

function celdaFecha(dia) {
  return { t: 'n', v: dia + EXCEL_EPOCA, z: 'dd/mm/yyyy' };
}

function hojaDesdeFilas(encabezados, filas, anchos) {
  const ws = XLSX.utils.aoa_to_sheet([encabezados, ...filas]);
  ws['!cols'] = anchos.map((wch) => ({ wch }));
  return ws;
}

function plantillaExport() {
  const libro = XLSX.utils.book_new();
  const cv = PLANTILLA_EXPORT.ventas.columnas;
  const ventas = ventasEjemplo().map((v) => cv.map((_, i) => [v.codigo, v.nombre, celdaFecha(v.dia), v.cantidad][i]));
  XLSX.utils.book_append_sheet(libro, hojaDesdeFilas(cv, ventas, [12, 38, 12, 10]), PLANTILLA_EXPORT.ventas.hoja);
  const ce = PLANTILLA_EXPORT.existencias.columnas;
  const existencias = PRODUCTOS_EJEMPLO.map((p) => [p.codigo, p.nombre, p.existencias]);
  XLSX.utils.book_append_sheet(libro, hojaDesdeFilas(ce, existencias, [12, 38, 12]), PLANTILLA_EXPORT.existencias.hoja);
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
}

function plantillaLista() {
  const libro = XLSX.utils.book_new();
  const pedir = { 'CIN-0003': 100, 'TOR-0610': 60, 'LIJ-0120': 100, 'PVC-0250': 12, 'MAN-1215': 10 };
  const filas = PRODUCTOS_EJEMPLO.map((p) => [p.codigo, p.nombre, p.proveedor, p.existencias, p.minimo, p.maximo, pedir[p.codigo] ?? null]);
  XLSX.utils.book_append_sheet(libro, hojaDesdeFilas(PLANTILLA_LISTA.columnas, filas, [12, 38, 22, 11, 9, 9, 16]), PLANTILLA_LISTA.hoja);
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Los 12 meses completos anteriores a hoy, como "Oct-2025".
function ultimosDoceMeses(hoy = new Date()) {
  const meses = [];
  for (let i = 12; i >= 1; i--) {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
    meses.push(`${MESES[d.getUTCMonth()]}-${d.getUTCFullYear()}`);
  }
  return meses;
}

/**
 * Para quien lleva el inventario en Excel o a mano. Tres hojas: "Productos" para llenar,
 * "Ejemplo" ya lleno e "Instrucciones". El lector ignora las hojas Ejemplo e Instrucciones.
 */
function plantillaInventario() {
  const libro = XLSX.utils.book_new();
  const meses = ultimosDoceMeses();
  const encabezados = [...PLANTILLA_INVENTARIO.columnas, ...meses];
  const anchos = [12, 34, 22, 14, 15, ...meses.map(() => 9)];
  XLSX.utils.book_append_sheet(libro, hojaDesdeFilas(encabezados, [], anchos), PLANTILLA_INVENTARIO.hoja);
  const azar = aleatorio(20261011);
  const ejemplo = PRODUCTOS_EJEMPLO.slice(0, 4).map((p) => [
    p.codigo, p.nombre, p.proveedor, p.costo, p.existencias,
    ...meses.map(() => (p.porSemana ? Math.round(p.porSemana * 4.3 * (0.7 + azar() * 0.6)) : null)),
  ]);
  XLSX.utils.book_append_sheet(libro, hojaDesdeFilas(encabezados, ejemplo, anchos), 'Ejemplo');
  const instrucciones = [
    ['Cómo llenar esta plantilla'],
    [''],
    ['1. En la hoja "Productos", escribe una fila por producto: código, nombre y cuántas unidades tienes hoy.'],
    ['   Proveedor y costo unitario son opcionales: con ellos ves cuánto dinero tienes en cada producto y el pedido sale por proveedor.'],
    ['2. En cada mes, escribe las unidades que vendiste. Si no vendiste nada, déjalo en blanco.'],
    ['3. Si no usas códigos, copia el nombre del producto en la columna Código.'],
    ['4. Guarda el archivo y súbelo en el paso 2 de SINESC.'],
    [''],
    ['La hoja "Ejemplo" muestra cómo se ve llena. No hace falta borrarla: no se tiene en cuenta.'],
  ];
  const wi = XLSX.utils.aoa_to_sheet(instrucciones);
  wi['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(libro, wi, 'Instrucciones');
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { plantillaExport, plantillaLista, plantillaInventario, ultimosDoceMeses, ventasEjemplo, PRODUCTOS_EJEMPLO };
