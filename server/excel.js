'use strict';

// Archivos de Excel con el diseño de SINESC: el monograma, los colores de la aplicación
// (verde azulado #0F766E) y tablas con encabezado, filas alternas y formato de números.
// Lo usan el pedido, los mínimos y máximos y las plantillas. Los archivos que imitan el export
// de otro programa (demo.js, generar-ejemplos.js) siguen con SheetJS, sin marca.

const ExcelJS = require('exceljs');
const LOGO = require('./logo');

const C = {
  primario: 'FF0F766E',
  primarioOscuro: 'FF0B5D57',
  claro: 'FFE7F3F1',
  alterna: 'FFF6F7F5',
  texto: 'FF111827',
  gris: 'FF4B5563',
  borde: 'FFE5E7EB',
  blanco: 'FFFFFFFF',
};
const FUENTE = 'Calibri';

const FORMATO = {
  entero: '#,##0',
  decimal: '#,##0.0',
  plata: '"$"#,##0',
  fecha: 'dd/mm/yyyy',
};

function nuevoLibro() {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'SINESC';
  libro.created = new Date();
  return libro;
}

/**
 * Hoja con la franja de marca arriba: monograma, título y subtítulo. Devuelve la hoja y la fila
 * donde empieza la tabla. anchos: el ancho de cada columna (en caracteres).
 */
function hojaConMarca(libro, nombre, { titulo, subtitulo, anchos }) {
  const hoja = libro.addWorksheet(nombre, { views: [{ showGridLines: false }] });
  hoja.columns = anchos.map((width) => ({ width }));
  hoja.getRow(1).height = 26;
  hoja.getRow(2).height = 18;
  const logo = libro.addImage({ buffer: LOGO, extension: 'png' });
  hoja.addImage(logo, { tl: { col: 0.15, row: 0.2 }, ext: { width: 38, height: 38 }, editAs: 'absolute' });
  const t = hoja.getCell('B1');
  t.value = titulo;
  t.font = { name: FUENTE, size: 15, bold: true, color: { argb: C.primarioOscuro } };
  t.alignment = { vertical: 'middle' };
  const s = hoja.getCell('B2');
  s.value = subtitulo;
  s.font = { name: FUENTE, size: 10, color: { argb: C.gris } };
  // Una línea de color bajo la franja.
  for (let c = 1; c <= anchos.length; c++) hoja.getCell(3, c).border = { bottom: { style: 'medium', color: { argb: C.primario } } };
  return { hoja, inicio: 5 };
}

function estiloEncabezado(fila) {
  fila.height = 22;
  fila.eachCell((celda) => {
    celda.font = { name: FUENTE, size: 11, bold: true, color: { argb: C.blanco } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.primario } };
    celda.alignment = { vertical: 'middle', wrapText: true };
    celda.border = { bottom: { style: 'thin', color: { argb: C.primarioOscuro } } };
  });
}

/**
 * Escribe una tabla desde la fila `inicio`: encabezados, filas (arreglos) y formato por columna
 * ('entero', 'decimal', 'plata', 'fecha' o nada). Fija el encabezado al desplazarse y le pone filtro.
 */
function tabla(hoja, inicio, encabezados, filas, formatos = []) {
  const enc = hoja.getRow(inicio);
  enc.values = encabezados;
  estiloEncabezado(enc);
  filas.forEach((valores, k) => {
    const fila = hoja.getRow(inicio + 1 + k);
    fila.values = valores;
    for (let c = 1; c <= encabezados.length; c++) {
      const celda = fila.getCell(c);
      celda.font = { name: FUENTE, size: 11, color: { argb: C.texto } };
      celda.border = { bottom: { style: 'thin', color: { argb: C.borde } } };
      if (k % 2 === 1) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.alterna } };
      const f = FORMATO[formatos[c - 1]];
      if (f) {
        celda.numFmt = f;
        celda.alignment = { horizontal: 'right' };
      }
    }
  });
  hoja.views = [{ state: 'frozen', ySplit: inicio, showGridLines: false }];
  if (filas.length) hoja.autoFilter = { from: { row: inicio, column: 1 }, to: { row: inicio + filas.length, column: encabezados.length } };
  return inicio + filas.length;
}

// Fila de totales en negrilla, con fondo claro.
function filaTotal(hoja, numero, valores, formatos = []) {
  const fila = hoja.getRow(numero);
  fila.values = valores;
  fila.eachCell({ includeEmpty: true }, (celda, c) => {
    celda.font = { name: FUENTE, size: 11, bold: true, color: { argb: C.primarioOscuro } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.claro } };
    const f = FORMATO[formatos[c - 1]];
    if (f) celda.numFmt = f;
  });
}

// Texto suelto (notas, instrucciones) con la fuente de la marca.
function parrafos(hoja, inicio, lineas, { negrilla = [] } = {}) {
  lineas.forEach((texto, k) => {
    const celda = hoja.getCell(inicio + k, 1);
    celda.value = texto;
    celda.font = { name: FUENTE, size: 11, bold: negrilla.includes(k), color: { argb: negrilla.includes(k) ? C.primarioOscuro : C.texto } };
    celda.alignment = { wrapText: false, vertical: 'top' };
  });
}

// Plantillas para llenar: el encabezado va en la fila 1 (así las lee el lector), con el estilo
// de la marca, fijo al desplazarse y con anchos cómodos.
function hojaPlantilla(libro, nombre, encabezados, filas, anchos, formatos = []) {
  const hoja = libro.addWorksheet(nombre);
  hoja.columns = anchos.map((width) => ({ width }));
  tabla(hoja, 1, encabezados, filas, formatos);
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  hoja.properties.tabColor = { argb: C.primario };
  return hoja;
}

async function aBuffer(libro) {
  return Buffer.from(await libro.xlsx.writeBuffer());
}

function fechaHoy() {
  return new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric' });
}

module.exports = { nuevoLibro, hojaConMarca, tabla, filaTotal, parrafos, hojaPlantilla, aBuffer, fechaHoy, COLORES: C };
