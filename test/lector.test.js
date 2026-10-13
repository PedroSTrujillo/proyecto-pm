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

test('la plantilla descargable se lee sin errores', async () => {
  const r = leerExport([{ nombre: 'plantilla.xlsx', buffer: (await plantillaExport()) }]);
  assert.equal(r.ok, true);
  assert.equal(r.existencias.length, 8);
  assert.ok(r.ventas.length > 100);
});

test('plantilla de lista: la hoja Pedido viene vacía y el ejemplo no se cuela', async () => {
  const vacia = leerLista((await plantillaLista()), 'lista.xlsx');
  assert.equal(vacia.ok, false, 'sin llenar no hay lista');
  assert.match(vacia.errores[0], /sin productos/);
  const libro = XLSX.read((await plantillaLista()), { type: 'buffer' });
  assert.ok(libro.SheetNames.includes('Ejemplo'));
  XLSX.utils.sheet_add_aoa(libro.Sheets.Pedido, [['AB-1', 'Tornillo', '', 4, 2, 10, 6], ['AB-2', 'Tuerca', '', 0, 2, 10, 12]], { origin: 'A2' });
  const l = leerLista(XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }), 'lista.xlsx');
  assert.equal(l.ok, true, JSON.stringify(l.errores));
  assert.deepEqual(l.lineas.map((x) => [x.codigo, x.cantidad]), [['AB-1', 6], ['AB-2', 12]]);
});

test('CSV estilo Siigo: punto y coma, ANSI, títulos arriba, fechas día/mes/año y fila de total', async () => {
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

test('dos hojas con nombres de columna de SAP (Material, Libre utilización)', async () => {
  const buf = xlsx({
    Ventas: [['Material', 'Texto breve de material', 'Fecha contabilización', 'Cantidad'], ['400100', 'Brocha', '2026-01-10', 4], ['400100', 'Brocha', '2026-02-10', '1-']],
    Stock: [['Material', 'Centro', 'Libre utilización'], [400100, '1000', 9]],
  });
  const r = leerExport([{ nombre: 'sap.xlsx', buffer: buf }]);
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.deepEqual(r.ventas.map((v) => v.cantidad), [4, -1]);
  assert.equal(r.existencias[0].existencias, 9);
});

test('informe con una columna por mes', async () => {
  const buf = xlsx({
    'Ventas por mes': [['Referencia', 'Descripción', 'Ene-2026', 'Feb-2026', 'Mar-2026', 'Total'], ['R1', 'Cinta', 10, 0, 20, 30]],
    Inventario: [['Referencia', 'Existencia actual'], ['R1', 5]],
  });
  const r = leerExport([{ nombre: 'mes.xlsx', buffer: buf }]);
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.equal(r.mensual, true);
  assert.deepEqual(r.ventas.map((v) => [textoDia(v.dia), v.cantidad]), [['2026-01-01', 10], ['2026-03-01', 20]]);
});

test('una sola tabla con ventas y existencias en cada fila', async () => {
  const r = leerExport([csv('codigo,fecha,cantidad,existencias\nX,2026-01-01,3,7\nX,2026-02-01,2,5\n')]);
  assert.equal(r.ok, true);
  assert.equal(r.existencias[0].existencias, 5, 'se usa la fila más reciente');
});

test('si falta la columna de existencias lo dice en palabras sencillas', async () => {
  const r = leerExport([csv('Código;Fecha;Cantidad\nA;01/01/2026;3\n')]);
  assert.equal(r.ok, false);
  assert.match(r.errores.join(' '), /Falta la columna de existencias/);
  assert.equal(r.hojas.length, 1, 'devuelve los encabezados para elegir columnas');
});

test('si faltan columnas de ventas dice cuáles', async () => {
  const r = leerExport([csv('Código;Descripción;Existencias\nA;Algo;3\n')]);
  assert.equal(r.ok, false);
  assert.match(r.errores[0], /ventas/);
});

test('filas con problemas: dice la fila; muchas filas malas detienen la lectura', async () => {
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

test('el usuario puede indicar las columnas cuando no las reconocemos', async () => {
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

test('no se aceptan imágenes ni fotos', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const r = leerExport([{ nombre: 'foto.png', buffer: png }]);
  assert.equal(r.ok, false);
  assert.match(r.errores[0], /imagen/);
  const l = leerLista(Buffer.from('ffd8ffe000104a464946', 'hex'), 'lista.jpg');
  assert.equal(l.ok, false);
});

test('lista de pedido tipo informe de mínimos: lee código y cantidad a pedir, ignora filas sin cantidad', async () => {
  const buf = xlsx({ Mínimos: [['INFORME DE MÍNIMOS'], [], ['Cód.', 'Descripción', 'Existencia', 'Mínimo', 'Cant. a pedir'], ['A', 'Uno', 3, 10, 7], ['B', 'Dos', 20, 10, null], ['C', 'Tres', 0, 5, '5']] });
  const r = leerLista(buf, 'minimos.xlsx');
  assert.equal(r.ok, true);
  assert.deepEqual(r.lineas.map((l) => [l.codigo, l.cantidad]), [['A', 7], ['C', '5']]);
  assert.equal(r.omitidas, 1);
});

test('fechas en los formatos de los exports', async () => {
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

test('detalle de facturas de Helisa: "Cantidad Disponible" es la venta neta de devoluciones, no existencias', async () => {
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

test('total vendido de un periodo (sin fecha por venta): se pide el periodo y luego se lee', async () => {
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

test('un archivo de existencias con columna "Cantidad" no se toma por ventas si vinieron ventas con fecha', async () => {
  const ventas = csv('Código;Fecha;Cantidad\nAB-1;15/01/2026;5\nAB-1;20/02/2026;7\n', 'ventas.csv');
  const stock = csv('Código;Saldo\nAB-1;9\n', 'stock.csv');
  const r = leerExport([ventas, stock]);
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.equal(r.periodo, null);
  assert.equal(r.ventas.length, 2);
});

// Informe "de impresora", como los de Helisa: títulos que no caen sobre sus columnas, encabezado
// repetido en cada página, filas de totales, código entre paréntesis, años cortados y compras
// mezcladas con ventas. Datos inventados con la misma forma.
function informeImpreso() {
  const titulo = [null, null, null, null, null, null, null, null, null, 'EMPRESA DE PRUEBA S.A.S.'];
  const encabezado = [null, null, 'FECHA', null, 'DOCUMENTO', null, 'BODEGA', null, null, null, 'CONCEPTO', null, 'CANTIDAD', null, 'VALOR NETO'];
  const fila = (fecha, doc, nombre, cant) => [fecha, null, null, doc, null, 'PRINCIPAL', null, nombre, null, null, null, null, null, String(cant), null, '1000'];
  return xlsx({ Hoja1: [
    titulo, [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'Página  1 de 2'],
    encabezado,
    fila('02/ENE/2026', 'FV 0001', 'TORNILLO HEX 1/4 (AB-100)', 10),
    fila('02/ENE/2026', 'FC 0007', 'TORNILLO HEX 1/4 (AB-100)', 500), // compra: no cuenta
    [null, null, null, null, null, null, null, null, null, null, null, 'TOTAL 02/ENE/2026'],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, '510', null, '2000'],
    titulo, [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'Página  2 de 2'],
    encabezado,
    fila('15/FEB/202', 'FV 0002', 'TUERCA 1/4 (AB-200)', 4), // año cortado por el ancho de la columna
    fila('03/MAR/2026', 'FV 0003', 'TORNILLO HEX 1/4 (AB-100)', 6),
  ] });
}

test('informe de impresora: columnas corridas, código entre paréntesis, años cortados y compras mezcladas', async () => {
  const stock = csv('Código;Saldo\nAB-100;20\nAB-200;3\n', 'saldos.csv');
  const primero = leerExport([{ nombre: 'movimiento.xls', buffer: informeImpreso() }, stock]);
  assert.equal(primero.ok, false);
  assert.equal(primero.necesitaDocumentos, true);
  assert.deepEqual(primero.documentos.map((x) => [x.prefijo, x.filas, x.sugerido]), [['FV', 3, true], ['FC', 1, false]]);

  const r = leerExport([{ nombre: 'movimiento.xls', buffer: informeImpreso() }, stock], {}, { documentos: ['FV'] });
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.deepEqual(r.ventas.map((v) => [v.codigo, v.nombre, v.cantidad, textoDia(v.dia)]), [
    ['AB-100', 'TORNILLO HEX 1/4', 10, '2026-01-02'],
    ['AB-200', 'TUERCA 1/4', 4, '2026-02-15'],
    ['AB-100', 'TORNILLO HEX 1/4', 6, '2026-03-03'],
  ]);
  assert.ok(r.avisos.some((a) => a.includes('año cortado')));
  assert.ok(r.avisos.some((a) => a.includes('paréntesis')));
  assert.deepEqual(Object.values(r.documentos), [['FV']], 'la elección se devuelve para recordarla');
});

test('ventas una columna por mes con existencias en la misma hoja (plantilla para llenar a mano)', async () => {
  const hoja = xlsx({ Productos: [
    ['Código', 'Producto', 'Existencias hoy', 'Ene-2026', 'Feb-2026', 'Mar-2026'],
    ['AB-1', 'Tornillo', 12, 30, 20, 25],
    ['AB-2', 'Tuerca', 0, 5, null, 8],
  ] });
  const r = leerExport([{ nombre: 'inventario.xlsx', buffer: hoja }]);
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.equal(r.ventas.length, 5);
  assert.deepEqual(r.existencias.map((e) => [e.codigo, e.existencias]), [['AB-1', 12], ['AB-2', 0]]);
});

test('columnas con títulos que no reconocemos: se sugieren por su contenido', async () => {
  const raro = csv('Ref;Texto;Día;Movidas;Stock\nA1;Tornillo de acero;15/01/2026;5;10\nA2;Arandela plana;20/02/2026;3;0\nA3;Tuerca hexagonal;21/02/2026;7;4\n', 'raro.csv');
  const r = leerExport([raro]);
  assert.equal(r.ok, false, 'sin la cantidad no se puede calcular solo: se pregunta');
  const h = r.hojas[0];
  assert.deepEqual(h.sugeridas, { nombre: 1, cantidad: 3 }, 'lo que no se reconoce por el título se sugiere por el contenido');
  assert.deepEqual([h.columnas.codigo, h.columnas.fecha, h.columnas.existencias], [0, 2, 4]);
});

test('plantilla para llenar a mano: se lee la hoja Productos y se ignoran Ejemplo e Instrucciones', async () => {
  const { plantillaInventario, ultimosDoceMeses } = require('../server/plantillas');
  const vacia = leerExport([{ nombre: 'plantilla.xlsx', buffer: (await plantillaInventario()) }]);
  assert.equal(vacia.ok, false, 'sin llenar no hay datos: el ejemplo no se cuela');
  assert.match(vacia.errores[0], /sin productos/, 'dice que es la plantilla sin llenar');
  assert.deepEqual(vacia.hojas, [], 'no pide elegir columnas');

  const libro = XLSX.read((await plantillaInventario()), { type: 'buffer' });
  const meses = ultimosDoceMeses();
  assert.equal(meses.length, 12);
  // Título y grupos arriba; los encabezados en la fila 4 y los datos desde la 5.
  XLSX.utils.sheet_add_aoa(libro.Sheets.Productos, [['AB-1', 'Tornillo', 6, ...meses.map(() => 13), 'Ferretera Uno', 1500]], { origin: 'A5' });
  const r = leerExport([{ nombre: 'llena.xlsx', buffer: XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) }]);
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.equal(r.ventas.length, 12);
  assert.deepEqual(r.existencias.map((e) => [e.codigo, e.existencias]), [['AB-1', 6]]);
  assert.equal(r.mensual, true);
  assert.deepEqual(r.catalogo, { 'AB-1': { costo: 1500, proveedor: 'Ferretera Uno' } }, 'proveedor y costo, si vienen, se guardan por producto');
});

test('kardex con saldo: el saldo de hoy es el del último movimiento, aunque sea una compra', async () => {
  const kardex = csv('Código;Fecha;Comprobante;Cantidad;Saldo\nAB-1;10/01/2026;FV-1;5;40\nAB-1;20/03/2026;FV-2;7;33\nAB-1;25/03/2026;FC-9;100;133\n', 'kardex.csv');
  const r = leerExport([kardex], {}, { documentos: ['FV'] });
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.deepEqual(r.ventas.map((v) => v.cantidad), [5, 7]);
  assert.deepEqual(r.existencias.map((e) => e.existencias), [133]);
});

test('formato World Office: títulos con "Detalle:" y "Encab:", y la columna Producto trae el código', async () => {
  // Mismas columnas que la plantilla oficial "Documentos Ventas Movimiento Inventario"; datos inventados.
  const ventas = xlsx({ 'Movimientos Inventarios': [
    ['Encab: Empresa', 'Encab: Tipo Documento', 'Encab: Prefijo', 'Encab: Documento Número', 'Detalle: Producto', 'Detalle: Bodega', 'Detalle: UnidadDeMedida', 'Detalle: Cantidad', 'Detalle: Valor Unitario'],
    ['EMPRESA DE PRUEBA', 'FV', null, '1', 'AB100', 'Principal', 'Und.', '10', '2000'],
    ['EMPRESA DE PRUEBA', 'FV', null, '1', 'AB200', 'Principal', 'Und.', '4', '2000'],
    ['EMPRESA DE PRUEBA', 'FV', null, '2', 'AB100', 'Principal', 'Und.', '6', '2000'],
  ] });
  const saldos = csv('Producto;Existencia\nAB100;8\nAB200;1\nAB300;5\n', 'saldos.csv');
  const r = leerExport([{ nombre: 'ventas.xls', buffer: ventas }, saldos], {}, { periodo: { desde: '2026-01-01', hasta: '2026-03-31' } });
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.deepEqual(r.ventas.map((v) => [v.codigo, v.cantidad]), [['AB100', 10], ['AB200', 4], ['AB100', 6]]);
  assert.deepEqual(r.existencias.map((e) => [e.codigo, e.existencias]), [['AB100', 8], ['AB200', 1], ['AB300', 5]]);
});

test('listado de inventario con salidas del periodo: se pregunta el periodo y se propone el del título', async () => {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
    ['EMPRESA DE PRUEBA'], ['LISTADO DE INVENTARIO'], ['Del 01/ENE/2026 al 30/SEP/2026'], [],
    ['Código', 'Descripción', 'Saldo Anterior', 'Entradas', 'Salidas', 'Saldo Actual'],
    ['AB-1', 'Tornillo', 100, 50, 120, 30],
    ['AB-2', 'Tuerca', 10, 0, 4, 6],
    ['', 'TOTAL GENERAL', 110, 50, 124, 36],
  ]), 'Hoja1');
  const buf = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
  const sin = leerExport([{ nombre: 'listado.xlsx', buffer: buf }]);
  assert.equal(sin.necesitaPeriodo, true);
  assert.deepEqual(sin.periodoSugerido, { desde: '2026-01-01', hasta: '2026-09-30' });
  const con = leerExport([{ nombre: 'listado.xlsx', buffer: buf }], {}, { periodo: sin.periodoSugerido });
  assert.equal(con.ok, true, JSON.stringify(con.errores));
  assert.deepEqual(con.ventas.map((v) => [v.codigo, v.cantidad]), [['AB-1', 120], ['AB-2', 4]], 'las salidas son las ventas');
  assert.deepEqual(con.existencias.map((e) => [e.codigo, e.existencias]), [['AB-1', 30], ['AB-2', 6]], 'el saldo actual son las existencias');
});

test('Balance de inventarios de Siigo Pyme: un solo archivo con salidas del periodo y nuevo saldo', () => {
  // Mismas columnas que describe la ayuda de Siigo Pyme; datos inventados.
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
    ['FERRETERIA DE PRUEBA S.A.S.'], ['BALANCE DE INVENTARIOS'], [],
    ['Código', 'Descripción', 'Saldo anterior', 'Entradas', 'Salidas', 'Nuevo saldo'],
    ['AB-1', 'Tornillo', 100, 50, 120, 30],
    ['AB-2', 'Tuerca', 10, 0, 4, 6],
  ]), 'Hoja1');
  const buf = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
  const sin = leerExport([{ nombre: 'balance.xlsx', buffer: buf }]);
  assert.equal(sin.necesitaPeriodo, true, 'sin fechas: se pregunta el periodo');
  const r = leerExport([{ nombre: 'balance.xlsx', buffer: buf }], {}, { periodo: { desde: '2025-10-01', hasta: '2026-09-30' } });
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.deepEqual(r.ventas.map((v) => [v.codigo, v.cantidad]), [['AB-1', 120], ['AB-2', 4]], 'las salidas son las ventas');
  assert.deepEqual(r.existencias.map((e) => [e.codigo, e.existencias]), [['AB-1', 30], ['AB-2', 6]], 'el nuevo saldo son las existencias');
});
