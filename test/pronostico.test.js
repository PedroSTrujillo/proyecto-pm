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
});

test('demo: los cinco negocios se generan igual cada vez y tienen de todo un poco', () => {
  const lista = sectores();
  assert.equal(lista.length, 5);
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
