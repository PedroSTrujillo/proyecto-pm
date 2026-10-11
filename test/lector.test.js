'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { leerExport, leerLista } = require('../server/lector');
const { leerFecha, textoDia, diaDe } = require('../server/valores');
const { plantillaExport, plantillaLista } = require('../server/plantillas');

const csv = (texto, nombre = 'export.csv', codificacion = 'utf8') => ({ nombre, buffer: Buffer.from(texto, codificacion) });

function xlsx(hojas) {
  const libro = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), nombre);
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
}

test('la plantilla descargable se lee sin errores', () => {
  const r = leerExport([{ nombre: 'plantilla.xlsx', buffer: plantillaExport() }]);
  assert.equal(r.ok, true);
  assert.equal(r.existencias.length, 8);
  assert.ok(r.ventas.length > 100);
  const l = leerLista(plantillaLista(), 'lista.xlsx');
  assert.equal(l.ok, true);
  assert.equal(l.lineas.length, 5);
});

test('CSV estilo Siigo: punto y coma, ANSI, títulos arriba, fechas día/mes/año y fila de total', () => {
  const ventas = [
    'EMPRESA S.A.S.',
    'Informe de ventas',
    '',
    'Código producto;Nombre producto;Fecha elaboración;Cantidad;Valor',
    'A-1;Tornillo;15/01/2026;10;1.500,00',
    'A-1;Tornillo;20/03/2026;6;900,00',
    'B-2;Tuerca;03/02/2026;2,5;100,00',
    ';Total general;;18,5;',
  ].join('\r\n');
  const existencias = 'Código;Nombre;Bodega;Saldo cantidad\nA-1;Tornillo;Principal;4\nA-1;Tornillo;Norte;2\nB-2;Tuerca;Principal;0';
  const r = leerExport([csv(ventas, 'ventas.csv', 'latin1'), csv(existencias, 'saldos.csv', 'latin1')]);
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.equal(r.ventas.length, 3);
  assert.equal(r.ventas[0].codigo, 'A-1');
  assert.equal(textoDia(r.ventas[0].dia), '2026-01-15');
  assert.equal(r.ventas[2].cantidad, 2.5);
  assert.equal(r.existencias.length, 3);
  assert.ok(r.avisos.some((a) => /fila de totales/.test(a)));
});

test('dos hojas con nombres de columna de SAP (Material, Libre utilización)', () => {
  const buf = xlsx({
    Ventas: [['Material', 'Texto breve de material', 'Fecha contabilización', 'Cantidad'], ['400100', 'Brocha', '2026-01-10', 4], ['400100', 'Brocha', '2026-02-10', '1-']],
    Stock: [['Material', 'Centro', 'Libre utilización'], [400100, '1000', 9]],
  });
  const r = leerExport([{ nombre: 'sap.xlsx', buffer: buf }]);
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.deepEqual(r.ventas.map((v) => v.cantidad), [4, -1]);
  assert.equal(r.existencias[0].existencias, 9);
});

test('informe con una columna por mes', () => {
  const buf = xlsx({
    'Ventas por mes': [['Referencia', 'Descripción', 'Ene-2026', 'Feb-2026', 'Mar-2026', 'Total'], ['R1', 'Cinta', 10, 0, 20, 30]],
    Inventario: [['Referencia', 'Existencia actual'], ['R1', 5]],
  });
  const r = leerExport([{ nombre: 'mes.xlsx', buffer: buf }]);
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.equal(r.mensual, true);
  assert.deepEqual(r.ventas.map((v) => [textoDia(v.dia), v.cantidad]), [['2026-01-01', 10], ['2026-03-01', 20]]);
});

test('una sola tabla con ventas y existencias en cada fila', () => {
  const r = leerExport([csv('codigo,fecha,cantidad,existencias\nX,2026-01-01,3,7\nX,2026-02-01,2,5\n')]);
  assert.equal(r.ok, true);
  assert.equal(r.existencias[0].existencias, 5, 'se usa la fila más reciente');
});

test('si falta la columna de existencias lo dice en palabras sencillas', () => {
  const r = leerExport([csv('Código;Fecha;Cantidad\nA;01/01/2026;3\n')]);
  assert.equal(r.ok, false);
  assert.match(r.errores.join(' '), /Falta la columna de existencias/);
  assert.equal(r.hojas.length, 1, 'devuelve los encabezados para elegir columnas');
});

test('si faltan columnas de ventas dice cuáles', () => {
  const r = leerExport([csv('Código;Descripción;Existencias\nA;Algo;3\n')]);
  assert.equal(r.ok, false);
  assert.match(r.errores[0], /ventas/);
});

test('filas con problemas: dice la fila; muchas filas malas detienen la lectura', () => {
  const filas = ['Código;Fecha;Cantidad;Existencias', ';01/01/2026;3;1'];
  for (let i = 0; i < 30; i++) filas.push(`A${i};01/0${(i % 9) + 1}/2026;2;1`);
  const r = leerExport([csv(filas.join('\n'))]);
  assert.equal(r.ok, true);
  assert.ok(r.avisos.some((a) => /La fila 2 no tiene código de producto/.test(a)));

  const malas = ['Código;Fecha;Cantidad;Existencias'];
  for (let i = 0; i < 30; i++) malas.push(`A${i};no es fecha;2;1`);
  const r2 = leerExport([csv(malas.join('\n'))]);
  assert.equal(r2.ok, false);
  assert.match(r2.errores.join(' '), /fila 2 tiene una fecha que no entendemos/);
});

test('el usuario puede indicar las columnas cuando no las reconocemos', () => {
  const archivo = csv('Ref Art;Desc;Dia;Uds;Stock hoy\nA1;Tuerca;15/01/2026;5;10\nA2;Arandela;20/02/2026;3;0\n');
  const r = leerExport([archivo]);
  assert.equal(r.ok, false);
  const mapeo = { porClave: { [r.hojas[0].clave]: { codigo: 0, nombre: 1, fecha: 2, cantidad: 3, existencias: 4 } } };
  const r2 = leerExport([archivo], mapeo);
  assert.equal(r2.ok, true, JSON.stringify(r2.errores));
  assert.equal(r2.ventas.length, 2);
  // Recordado por la forma de los encabezados:
  const r3 = leerExport([archivo], { porFirma: { [r2.hojasUsadas[0].firma]: mapeo.porClave[r.hojas[0].clave] } });
  assert.equal(r3.ok, true);
});

test('no se aceptan imágenes ni fotos', () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const r = leerExport([{ nombre: 'foto.png', buffer: png }]);
  assert.equal(r.ok, false);
  assert.match(r.errores[0], /imagen/);
  const l = leerLista(Buffer.from('ffd8ffe000104a464946', 'hex'), 'lista.jpg');
  assert.equal(l.ok, false);
});

test('lista de pedido tipo informe de mínimos: lee código y cantidad a pedir, ignora filas sin cantidad', () => {
  const buf = xlsx({ Mínimos: [['INFORME DE MÍNIMOS'], [], ['Cód.', 'Descripción', 'Existencia', 'Mínimo', 'Cant. a pedir'], ['A', 'Uno', 3, 10, 7], ['B', 'Dos', 20, 10, null], ['C', 'Tres', 0, 5, '5']] });
  const r = leerLista(buf, 'minimos.xlsx');
  assert.equal(r.ok, true);
  assert.deepEqual(r.lineas.map((l) => [l.codigo, l.cantidad]), [['A', 7], ['C', '5']]);
  assert.equal(r.omitidas, 1);
});

test('fechas en los formatos de los exports', () => {
  const t = (v, o) => { const f = leerFecha(v, o); return f && textoDia(f.dia); };
  assert.equal(t('15/01/2026'), '2026-01-15');
  assert.equal(t('01/15/2026', 'md'), '2026-01-15');
  assert.equal(t('2026-01-15 10:32:00'), '2026-01-15');
  assert.equal(t('15-ene-2026'), '2026-01-15');
  assert.equal(t('15.01.26'), '2026-01-15');
  assert.equal(t('20260115'), '2026-01-15');
  assert.equal(t(46037), '2026-01-15'); // número de serie de Excel
  assert.equal(t('Ene-2026'), '2026-01-01');
  assert.equal(leerFecha('2026-01').mensual, true);
  assert.equal(leerFecha('31/02/2026'), null);
  assert.equal(leerFecha('hola'), null);
  assert.equal(t(new Date(Date.UTC(2026, 0, 15))), '2026-01-15');
  assert.equal(diaDe(2026, 1, 15), leerFecha('15/01/2026').dia);
});

test('detalle de facturas de Helisa: "Cantidad Disponible" es la venta neta de devoluciones, no existencias', () => {
  // Mismas columnas que el informe real; los datos son inventados.
  const facturas = xlsx({ Facturas: [
    ['Tipo Doc.', 'Documento', 'Fecha', 'Beneficiario Nombre', 'Cantidad', 'Unidades Devueltas', 'Cantidad Disponible', 'Vr. Unitario', 'Bodega Nombre', 'Referencia'],
    ['FED', 'FED 1', '2026/08/05', 'CLIENTE UNO', '4.00', '0.00', '4.00', '2,500.00', 'PRINCIPAL', 'XY-100'],
    ['FED', 'FED 2', '2026/09/10', 'CLIENTE DOS', '10.00', '3.00', '7.00', '1,000.00', 'PRINCIPAL', 'XY-100'],
  ] });
  const soloFacturas = leerExport([{ nombre: 'facturas.xls', buffer: facturas }]);
  assert.equal(soloFacturas.ok, false, 'sin un archivo de existencias no se inventan');
  assert.match(soloFacturas.errores.join(' '), /existencias/);

  const saldos = csv('Referencia;Saldo\nXY-100;25\n', 'saldos.csv');
  const r = leerExport([{ nombre: 'facturas.xls', buffer: facturas }, saldos]);
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.deepEqual(r.ventas.map((v) => v.cantidad), [4, 7], 'se toma lo facturado menos lo devuelto');
  assert.deepEqual(r.existencias.map((e) => e.existencias), [25]);
});

test('total vendido de un periodo (sin fecha por venta): se pide el periodo y luego se lee', () => {
  // Como el listado de inventario con la casilla de salidas, o "Ventas por ítems": datos inventados.
  const listado = csv('Referencia;Descripción;Entradas;Salidas;Saldo\nAB-1;Tornillo;100;120;30\nAB-2;Tuerca;0;0;12\nAB-3;Arandela;10;8;0\n', 'listado.csv');
  const sinPeriodo = leerExport([listado]);
  assert.equal(sinPeriodo.ok, false);
  assert.equal(sinPeriodo.necesitaPeriodo, true);

  const r = leerExport([listado], {}, { periodo: { desde: '2026-01-01', hasta: '2026-03-31' } });
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.deepEqual(r.ventas.map((v) => [v.codigo, v.cantidad, v.dia]), [['AB-1', 120, diaDe(2026, 3, 31)], ['AB-3', 8, diaDe(2026, 3, 31)]]);
  assert.deepEqual(r.existencias.map((e) => [e.codigo, e.existencias]), [['AB-1', 30], ['AB-2', 12], ['AB-3', 0]]);
  assert.deepEqual(r.periodo, { desde: diaDe(2026, 1, 1), hasta: diaDe(2026, 3, 31) });
});

test('un archivo de existencias con columna "Cantidad" no se toma por ventas si vinieron ventas con fecha', () => {
  const ventas = csv('Código;Fecha;Cantidad\nAB-1;15/01/2026;5\nAB-1;20/02/2026;7\n', 'ventas.csv');
  const stock = csv('Código;Saldo\nAB-1;9\n', 'stock.csv');
  const r = leerExport([ventas, stock]);
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.equal(r.periodo, null);
  assert.equal(r.ventas.length, 2);
});
