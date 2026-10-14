'use strict';

// Pronóstico Gamma-Poisson, ventas por semana y el inventario que ve el panel.

const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../server/pronostico');
const { seriesSemanales } = require('../server/series');
const { calcularRotacion } = require('../server/rotacion');
const { construirInventario, leerAjustes, recortarPico } = require('../server/inventario');
const { inventarioDemo, sectores } = require('../server/demo');
const { diaDe } = require('../server/valores');

const cerca = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('binomial negativa: media, cuantiles y cola coinciden con la teoría', () => {
  // r = 4, p = 0,5 → media 4, varianza 8
  const bn = P.binomialNegativa(4, 0.5);
  assert.equal(bn.media, 4);
  assert.equal(bn.varianza, 8);
  // P(N = 0) = 0,5⁴ = 0,0625 → el cuantil 5 % es 0 y el 10 % ya es 1
  assert.equal(bn.cuantil(0.05), 0);
  assert.equal(bn.cuantil(0.1), 1);
  cerca(bn.colaSobre(0), 1 - 0.0625, 1e-9, 'P(N > 0)');
  // Con medias enormes se usa la normal sin trabarse.
  const grande = P.binomialNegativa(5000, 0.5);
  cerca(grande.cuantil(0.5), 5000, 2, 'mediana aproximada');
});

test('predictiva: la media es la tasa por las semanas y el rango crece con la dispersión', () => {
  const quieto = P.ajustarProducto({ tasa: 10, semanas: 52, serie: new Array(52).fill(10), referencia: { tasa: 10, phi: 1 } });
  const saltón = P.ajustarProducto({ tasa: 10, semanas: 52, serie: Array.from({ length: 52 }, (_, i) => (i % 4 === 0 ? 40 : 0)), referencia: { tasa: 10, phi: 1 } });
  const a = P.predictiva(quieto, 4);
  const b = P.predictiva(saltón, 4);
  cerca(a.media, 40, 1, 'media en 4 semanas');
  cerca(b.media, 40, 1, 'misma media');
  assert.ok(b.cuantil(0.9) - b.cuantil(0.1) > a.cuantil(0.9) - a.cuantil(0.1), 'quien vende en paquetes tiene un rango más ancho');
  assert.ok(saltón.phi > 1);
});

test('probabilidad de agotarse: alta si lo que hay alcanza menos que la entrega, baja si sobra', () => {
  const aj = P.ajustarProducto({ tasa: 10, semanas: 52, serie: null, referencia: { tasa: 10, phi: 1 } });
  assert.ok(P.predictiva(aj, 4).probMayorQue(20) > 0.95, '20 unidades no alcanzan 4 semanas de 10');
  assert.ok(P.predictiva(aj, 4).probMayorQue(80) < 0.01, '80 unidades alcanzan de sobra');
});

test('series semanales: la última semana termina el último día y las ventas por mes se reparten', () => {
  const d = (m, dia) => diaDe(2026, m, dia);
  const s = seriesSemanales([
    { codigo: 'A', dia: d(1, 5), cantidad: 3 },
    { codigo: 'A', dia: d(3, 31), cantidad: 7 },
    { codigo: 'b', dia: d(3, 30), cantidad: 1 },
  ]);
  assert.equal(s.hasta, '2026-03-31');
  assert.equal(s.porProducto.A[s.semanas - 1], 7);
  assert.equal(s.porProducto.B[s.semanas - 1], 1, 'la clave del producto es la misma del reporte');
  const m = seriesSemanales([{ codigo: 'X', dia: d(1, 1), cantidad: 31 }, { codigo: 'X', dia: d(2, 1), cantidad: 28 }], { mensual: true });
  const total = m.porProducto.X.reduce((a, b) => a + b, 0);
  assert.ok(total <= 59 && total > 50, 'se reparte por días (una semana incompleta al inicio se descarta)');
  assert.equal(seriesSemanales([{ codigo: 'X', dia: d(1, 1), cantidad: 5 }], { totales: true }), null);
});

test('temporada: se detecta con 18 meses o más y no con menos', () => {
  // 104 semanas con diciembre al doble
  const hasta = '2026-09-30';
  const semanas = 104;
  const totales = Array.from({ length: semanas }, (_, i) => {
    const mes = new Date(Date.UTC(2026, 8, 30) - (semanas - i) * 7 * 86400000 + 4 * 86400000).getUTCMonth();
    return mes === 11 ? 200 : 100;
  });
  const idx = P.indiceTemporada(totales, hasta);
  assert.ok(idx[11] > 1.3, `diciembre sube: ${idx[11]}`);
  assert.ok(idx[5] < 1, 'junio queda por debajo');
  assert.equal(P.indiceTemporada(totales.slice(-52), hasta), null, 'un año no alcanza');
});

test('recortar el pico de un proyecto: el exceso sale de la semana del pico, no del mes entero', () => {
  // 20 semanas de 10; la semana que empieza el 12 de mayo vende 110 (un proyecto).
  const hasta = '2026-07-27';
  const n = 20;
  const serie = new Array(n).fill(10);
  const idxPico = n - 1 - Math.floor((diaDe(2026, 7, 27) - diaDe(2026, 5, 12)) / 7);
  serie[idxPico] = 110;
  const { recortada, semanasPico } = recortarPico(serie, hasta, { mes: '2026-05', vendido: 140, contado: 60 });
  assert.deepEqual(semanasPico, [idxPico]);
  cerca(serie.reduce((a, b) => a + b, 0) - recortada.reduce((a, b) => a + b, 0), 80, 0.01, 'se quita el exceso completo');
});

test('inventario: no cambia el número del reporte y agrega riesgo, sugerido y dinero', () => {
  const ventas = [];
  for (let s = 0; s < 60; s++) {
    ventas.push({ codigo: 'RAP', nombre: 'Rápido', dia: diaDe(2025, 6, 2) + s * 7, cantidad: 20 });
    if (s % 6 === 0) ventas.push({ codigo: 'LEN', nombre: 'Lento', dia: diaDe(2025, 6, 3) + s * 7, cantidad: 2 });
  }
  const existencias = [{ codigo: 'RAP', existencias: 30 }, { codigo: 'LEN', existencias: 100 }];
  const rotacion = calcularRotacion({ ventas, existencias });
  const series = seriesSemanales(ventas);
  const catalogo = { RAP: { costo: 1000, proveedor: 'Importado' }, LEN: { costo: 5000 } };
  const inv = construirInventario({ reporte: rotacion, series, catalogo, ajustes: { entregas: { Importado: 6 } } });
  const rap = inv.productos.find((p) => p.codigo === 'RAP');
  const len = inv.productos.find((p) => p.codigo === 'LEN');
  const filaRap = rotacion.filas.find((f) => f.codigo === 'RAP');
  assert.equal(rap.semanas, filaRap.semanasInventario, 'las semanas son las mismas del reporte de la prueba');
  assert.equal(rap.estado, 'agota');
  assert.ok(rap.riesgo > 0.9, 'con 1,5 semanas y 6 de entrega, casi seguro se agota');
  assert.ok(rap.sugerido >= 20 * 10 - 30, 'el sugerido cubre la entrega y 4 semanas más');
  assert.equal(len.estado, 'sobra');
  assert.ok(len.quieto > 0 && inv.resumen.dineroQuieto === len.quieto);
  assert.equal(inv.resumen.valorInventario, 30 * 1000 + 100 * 5000);
  assert.equal(len.proveedor, 'Sin proveedor');
  // Durante la prueba, sin cantidad sugerida.
  const prueba = construirInventario({ reporte: rotacion, series, catalogo, ajustes: {}, sugerencias: false });
  assert.ok(prueba.productos.every((p) => p.sugerido === null));
});

test('ajustes: solo se guardan tiempos razonables', () => {
  const a = leerAjustes({ entregas: { Bueno: 3, Malo: -2, Raro: 'x' }, cadaCuanto: 100, entregaPorDefecto: 2 });
  assert.deepEqual(a.entregas, { Bueno: 3 });
  assert.equal(a.cadaCuanto, 4, 'fuera de rango vuelve al valor por defecto');
  assert.equal(a.entregaPorDefecto, 2);
  assert.equal(a.semanasAgota, 2, 'sin elegir umbral de "se agota", 2 semanas');
  for (const malo of [0, 12, 2.5, 'x', null]) assert.equal(leerAjustes({ semanasAgota: malo }).semanasAgota, 2, `${malo} no es un umbral válido`);
  assert.equal(leerAjustes({ semanasAgota: 6 }).semanasAgota, 6);
});

test('inventario: el umbral de "se agota" del usuario se aplica en el panel aunque el reporte sea de antes', () => {
  const ventas = [];
  for (let s = 0; s < 30; s++) ventas.push({ codigo: 'P', nombre: 'P', dia: diaDe(2025, 6, 2) + s * 7, cantidad: 10 });
  const rotacion = calcularRotacion({ ventas, existencias: [{ codigo: 'P', existencias: 40 }] }); // 4 semanas
  assert.equal(rotacion.filas[0].estado, 'normal');
  const inv = construirInventario({ reporte: rotacion, series: null, catalogo: null, ajustes: { semanasAgota: 6 }, alcance: 'prueba' });
  assert.equal(inv.productos[0].estado, 'agota');
  assert.equal(inv.resumen.seAgotan, 1);
  assert.equal(inv.umbrales.seAgota, 6);
  assert.equal(rotacion.filas[0].estado, 'normal', 'el reporte guardado no cambia');
});

test('demo: los seis negocios se generan igual cada vez y tienen de todo un poco', () => {
  const lista = sectores();
  assert.equal(lista.length, 6);
  for (const s of lista) {
    const inv = inventarioDemo(s.id);
    assert.equal(inv.fuente.empresa, s.empresa);
    assert.ok(inv.resumen.seAgotan >= 1, `${s.id} tiene algo que se agota`);
    assert.ok(inv.resumen.sobran >= 1, `${s.id} tiene algo que sobra`);
    assert.ok(inv.resumen.pideYa >= 1, `${s.id} tiene algo para pedir ya`);
    assert.ok(inv.grafico.semanas.length === 52 && inv.grafico.pronostico.length === 8);
    assert.deepEqual(inventarioDemo(s.id).productos.map((p) => p.existencias), inv.productos.map((p) => p.existencias), 'misma semilla, mismos datos');
  }
  const corto = inventarioDemo('refrigeracion', { entregas: { 'Polar Importaciones': 2 } });
  assert.ok(corto.resumen.pideYa < inventarioDemo('refrigeracion').resumen.pideYa, 'con una entrega más corta hay menos que pedir ya');
  assert.equal(inventarioDemo('no-existe'), null);
});

test('proveedor de cada producto: lo asignado manda, después el archivo y después el comienzo del código', () => {
  const { proveedorDe } = require('../server/inventario');
  const aj = leerAjustes({ asignaciones: { 'tor-1': 'Manual' }, prefijos: [{ prefijo: 'tor', proveedor: 'Tornillería' }, { prefijo: 'TOR-9', proveedor: 'Especial' }] });
  assert.deepEqual(proveedorDe('TOR-1', { proveedor: 'Del archivo' }, aj), { proveedor: 'Manual', origen: 'producto' });
  assert.deepEqual(proveedorDe('TOR-2', { proveedor: 'Del archivo' }, aj), { proveedor: 'Del archivo', origen: 'archivo' });
  assert.deepEqual(proveedorDe('TOR-2', {}, aj), { proveedor: 'Tornillería', origen: 'prefijo' });
  assert.deepEqual(proveedorDe('TOR-95', {}, aj), { proveedor: 'Especial', origen: 'prefijo' }, 'gana el comienzo más largo');
  assert.equal(proveedorDe('CIN-1', {}, aj).proveedor, 'Sin proveedor');
});

test('mínimo y máximo: el mínimo cubre la entrega y el máximo llega hasta el siguiente pedido', () => {
  const inv = inventarioDemo('refrigeracion');
  for (const p of inv.productos.filter((x) => x.ventasSemana > 1)) {
    assert.ok(p.minimo >= p.ventasSemana * Math.max(p.entrega, 0.5) * 0.8, `${p.codigo}: mínimo ${p.minimo}`);
    assert.ok(p.maximo >= p.minimo);
    // Sin paquete, sugerido = máximo − existencias; con paquete, eso redondeado a paquetes completos.
    const falta = Math.max(0, p.maximo - Math.max(p.existencias, 0));
    if (p.lote > 1) {
      assert.equal(p.sugerido % p.lote, 0, `${p.codigo}: en paquetes de ${p.lote}`);
      assert.ok(p.sugerido >= falta - p.lote && p.sugerido <= falta + p.lote, `${p.codigo}: sugerido cerca de máximo − existencias`);
    } else assert.equal(p.sugerido, falta, `${p.codigo}: sugerido = máximo − existencias`);
  }
  // Asignar un producto a un proveedor con otra entrega cambia su estado.
  const nacional = inventarioDemo('refrigeracion', { asignaciones: { 'COM-12K': 'Compresores Nacionales' }, entregas: { 'Compresores Nacionales': 1 } });
  const com = nacional.productos.find((p) => p.codigo === 'COM-12K');
  assert.equal(com.proveedor, 'Compresores Nacionales');
  assert.equal(com.estado, 'normal', 'si llega en una semana, 3,5 semanas alcanzan');
  assert.ok(nacional.resumen.avisos.productos >= 1);
});

test('paquete: si siempre se vende de a varios, lo sugerido va en paquetes completos', () => {
  const { loteDe, aLote } = require('../server/pronostico');
  const deDiez = [10, 20, 0, 30, 10, 40, 20, 10, 0, 30, 20, 10, 50, 10];
  assert.equal(loteDe(deDiez), 10);
  assert.equal(loteDe([...deDiez, 7]), 1, 'una sola venta suelta y ya no hay paquete');
  assert.equal(loteDe([10, 20, 30]), 1, 'con pocas semanas no se adivina');
  assert.equal(loteDe(deDiez.map((x) => x / 3)), 1, 'con decimales (ventas mensuales repartidas) no hay paquete');
  assert.equal(aLote(37, 10), 40);
  assert.equal(aLote(0, 10), 0);
  assert.equal(aLote(37, 1), 37);
});

test('una devolución en una semana sin ventas se descuenta de las semanas anteriores', () => {
  const ventas = [
    { codigo: 'A', dia: 20454, cantidad: 5 }, // semana 1
    { codigo: 'A', dia: 20461, cantidad: 2 }, // semana 2
    { codigo: 'A', dia: 20475, cantidad: -4 }, // semana 4: devolvieron 4
    { codigo: 'A', dia: 20481, cantidad: 1 },
  ];
  const s = seriesSemanales(ventas).porProducto.A;
  assert.ok(s.every((x) => x >= 0), 'ninguna semana negativa: ' + s.join(','));
  assert.equal(s.reduce((a, b) => a + b, 0), 4, 'el total neto se conserva (5 + 2 - 4 + 1)');
});
