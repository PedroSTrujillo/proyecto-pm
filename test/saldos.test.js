'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../server/saldos');
const { calcularRotacion } = require('../server/rotacion');
const { seriesSemanales } = require('../server/series');

const mov = (id, codigo, tipo, cantidad, fecha) => ({ id, codigo, nombre: '', tipo, cantidad, fecha });

test('saldos: entradas y devoluciones suman; ventas y salidas restan', () => {
  const r = S.saldos({
    base: { A: 10 },
    movimientos: [mov(1, 'A', 'venta', 3, '2026-10-02'), mov(2, 'A', 'entrada', 20, '2026-10-03'), mov(3, 'A', 'devolucion', 1, '2026-10-04'), mov(4, 'A', 'salida', 2, '2026-10-05')],
  });
  assert.equal(r.get('A'), 26);
});

test('saldos: un conteo fija la cantidad de ese día y lo de después se suma encima', () => {
  const r = S.saldos({
    base: { A: 10 },
    movimientos: [mov(1, 'A', 'venta', 3, '2026-10-02'), mov(2, 'A', 'conteo', 4, '2026-10-03'), mov(3, 'A', 'venta', 1, '2026-10-04')],
  });
  assert.equal(r.get('A'), 3);
});

test('saldos: el mismo día manda el orden en que se registraron, aunque lleguen desordenados', () => {
  const r = S.saldos({ movimientos: [mov(2, 'A', 'venta', 1, '2026-10-03'), mov(1, 'A', 'conteo', 5, '2026-10-03')] });
  assert.equal(r.get('A'), 4);
});

test('saldos: el código se compara sin espacios, mayúsculas ni ceros a la izquierda', () => {
  const r = S.saldos({ base: { 123: 5 }, movimientos: [mov(1, '00123', 'venta', 2, '2026-10-02')] });
  assert.equal(r.get('123'), 3);
});

test('ventasDeConteos: sin ventas registradas, lo que baja entre dos conteos se cuenta como vendido en esos días', () => {
  const hastaBase = S.diaDeFecha('2026-10-01');
  const v = S.ventasDeConteos({
    inicial: { A: 100 },
    hastaBase,
    movimientos: [mov(1, 'A', 'conteo', 80, '2026-10-11'), mov(2, 'A', 'entrada', 50, '2026-10-12'), mov(3, 'A', 'conteo', 110, '2026-10-21')],
  });
  assert.deepEqual(v.map((x) => [x.cantidad, x.desde, x.fecha]), [[20, '2026-10-02', '2026-10-11'], [20, '2026-10-12', '2026-10-21']]);
  // Repartido por días, como una venta de un periodo: 2 por día durante los 10 días.
  const dias = S.ventasDeMovimientos(v.slice(0, 1));
  assert.equal(dias.length, 10);
  assert.equal(dias[0].cantidad, 2);
});

test('ventasDeConteos: no deduce si se registraron ventas, si el conteo sube o si no hay con qué comparar', () => {
  const hastaBase = S.diaDeFecha('2026-10-01');
  const conVentas = S.ventasDeConteos({ inicial: { A: 100 }, hastaBase, movimientos: [mov(1, 'A', 'venta', 15, '2026-10-05'), mov(2, 'A', 'conteo', 80, '2026-10-11')] });
  assert.deepEqual(conVentas, [], 'la diferencia que queda es merma o error: no es venta');
  assert.deepEqual(S.ventasDeConteos({ inicial: { A: 100 }, hastaBase, movimientos: [mov(1, 'A', 'conteo', 130, '2026-10-11')] }), []);
  assert.deepEqual(S.ventasDeConteos({ inicial: {}, hastaBase, movimientos: [mov(1, 'B', 'conteo', 30, '2026-10-11')] }), [], 'el primer conteo de un producto nuevo no tiene con qué compararse');
  // Una salida registrada (merma) también explica parte de lo que falta.
  const conSalida = S.ventasDeConteos({ inicial: { A: 100 }, hastaBase, movimientos: [mov(1, 'A', 'salida', 5, '2026-10-03'), mov(2, 'A', 'conteo', 80, '2026-10-11')] });
  assert.deepEqual(conSalida.map((x) => x.cantidad), [15]);
});

test('combinar: con solo conteos, las ventas siguen apareciendo y el aviso lo explica', () => {
  const base = { ventas: [{ codigo: 'A', dia: S.diaDeFecha('2026-09-20'), cantidad: 30 }], existencias: [{ codigo: 'A', existencias: 100 }], hasta: S.diaDeFecha('2026-10-01') };
  const r = S.combinar({ base, movimientos: [mov(1, 'A', 'conteo', 72, '2026-10-15')] });
  assert.equal(r.existencias[0].existencias, 72);
  const vendido = r.ventas.reduce((n, v) => n + v.cantidad, 0);
  assert.ok(Math.abs(vendido - 58) < 1e-9, `30 del archivo + 28 que bajó el conteo, y salió ${vendido}`);
  assert.equal(r.deConteos, 1);
  assert.ok(r.avisos.some((a) => /se contó como vendida/.test(a)));
});

test('ventasDeMovimientos: ventas en positivo, devoluciones en negativo, lo demás no cuenta', () => {
  const v = S.ventasDeMovimientos([mov(1, 'A', 'venta', 3, '2026-10-02'), mov(2, 'A', 'devolucion', 1, '2026-10-02'), mov(3, 'A', 'entrada', 9, '2026-10-02'), mov(4, 'A', 'salida', 9, '2026-10-02')]);
  assert.deepEqual(v.map((x) => x.cantidad), [3, -1]);
});

// Un archivo de 30 semanas de ventas, como el que guarda procesarExport.
function exportDePrueba() {
  const ventas = [];
  const inicio = S.diaDeFecha('2026-03-01');
  for (let s = 0; s < 30; s++) ventas.push({ codigo: 'A', nombre: 'Tornillo', dia: inicio + s * 7 + 2, cantidad: 10 });
  const existencias = [{ codigo: 'A', nombre: 'Tornillo', existencias: 40 }, { codigo: 'B', nombre: 'Lija', existencias: 5 }];
  const reporte = calcularRotacion({ ventas, existencias });
  return { reporte, series: seriesSemanales(ventas) };
}

test('ventasDeExport: rearma las ventas del archivo desde las series guardadas', () => {
  const e = exportDePrueba();
  const base = S.ventasDeExport(e);
  const total = base.ventas.reduce((s, v) => s + v.cantidad, 0);
  assert.equal(total, e.series.porProducto.A.reduce((s, x) => s + x, 0));
  assert.equal(base.hasta, S.diaDeFecha(e.series.hasta));
  assert.deepEqual(base.existencias.map((x) => [x.codigo, x.existencias]), [['A', 40], ['B', 5]]);
});

test('combinar: lo del día del archivo o antes se ignora con aviso; lo de después se suma', () => {
  const e = exportDePrueba();
  const base = S.ventasDeExport(e);
  const hasta = e.series.hasta;
  const despues = new Date(Date.parse(`${hasta}T12:00:00Z`) + 3 * 86400000).toISOString().slice(0, 10);
  const r = S.combinar({ base, movimientos: [mov(1, 'A', 'venta', 99, hasta), mov(2, 'A', 'venta', 4, despues), mov(3, 'C', 'entrada', 7, despues)] });
  assert.equal(r.usados, 2);
  assert.equal(r.ignorados, 1);
  assert.equal(r.existencias.find((x) => x.codigo === 'A').existencias, 36);
  assert.equal(r.existencias.find((x) => x.codigo === 'C').existencias, 7);
  assert.equal(r.hasta, S.diaDeFecha(despues));
  assert.ok(r.avisos.some((a) => a.includes('no se sumó')));
});

test('combinar + calcularRotacion: el periodo llega hasta el último movimiento aunque ese día no se venda', () => {
  const e = exportDePrueba();
  const base = S.ventasDeExport(e);
  const lejos = new Date(Date.parse(`${e.series.hasta}T12:00:00Z`) + 14 * 86400000).toISOString().slice(0, 10);
  const r = S.combinar({ base, movimientos: [mov(1, 'A', 'entrada', 100, lejos)] });
  const rot = calcularRotacion({ ventas: r.ventas, existencias: r.existencias, hastaDia: r.hasta });
  assert.equal(rot.periodo.hasta, lejos);
  assert.equal(rot.filas.find((f) => f.codigo === 'A').existencias, 140);
  const series = seriesSemanales(r.ventas, { hastaDia: r.hasta });
  assert.equal(series.hasta, lejos);
});

test('combinar: una venta al día siguiente del archivo no deja la última semana solo con los movimientos', () => {
  const e = exportDePrueba();
  const base = S.ventasDeExport(e);
  const manana = new Date(Date.parse(`${e.series.hasta}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const r = S.combinar({ base, movimientos: [mov(1, 'A', 'venta', 2, manana)] });
  const series = seriesSemanales(r.ventas, { hastaDia: r.hasta });
  const antes = e.series.porProducto.A;
  const despues = series.porProducto.A;
  // Antes de corregirlo, cada semana del archivo caía una semana antes y la última quedaba en 2.
  assert.equal(despues[despues.length - 1], antes[antes.length - 1] + 2);
  assert.equal(despues[despues.length - 2], antes[antes.length - 2]);
  // El periodo sigue empezando donde empieza el archivo: el promedio no cambia por rearmarlo.
  const rot = calcularRotacion({ ventas: r.ventas, existencias: r.existencias, hastaDia: r.hasta, desdeDia: r.desde });
  assert.equal(rot.periodo.desde, e.reporte.periodo.desde);
});

test('combinar: sin archivo, el inventario sale solo de los movimientos y avisa saldos negativos', () => {
  const r = S.combinar({ movimientos: [mov(1, 'A', 'venta', 3, '2026-10-02'), mov(2, 'B', 'entrada', 5, '2026-10-02')] });
  assert.equal(r.existencias.find((x) => x.codigo === 'A').existencias, -3);
  assert.deepEqual(r.negativos, ['A']);
  assert.ok(r.avisos.some((a) => a.includes('solo de los movimientos')));
  assert.ok(r.avisos.some((a) => a.includes('negativas')));
});

test('kardex: saldo después de cada movimiento; los anulados y los anteriores al archivo no cuentan', () => {
  const k = S.kardex({
    inicial: { dia: S.diaDeFecha('2026-10-01'), existencias: 10 },
    movimientos: [
      { ...mov(1, 'A', 'venta', 2, '2026-10-01') },
      { ...mov(2, 'A', 'venta', 3, '2026-10-02') },
      { ...mov(3, 'A', 'entrada', 50, '2026-10-02'), anulado: true },
      { ...mov(4, 'A', 'entrada', 5, '2026-10-03') },
    ],
  });
  assert.deepEqual(k.filas.map((f) => f.saldo), [null, 7, null, 12]);
  assert.equal(k.saldo, 12);
});
