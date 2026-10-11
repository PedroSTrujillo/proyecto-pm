'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularRotacion } = require('../server/rotacion');
const { diaDe } = require('../server/valores');

const d = (s) => diaDe(...s.split('-').map(Number));

// Histórico de exactamente 10 semanas: del 2026-01-01 al 2026-03-11 (70 días).
const base = [
  { codigo: 'A', nombre: 'Producto A', dia: d('2026-01-01'), cantidad: 50 },
  { codigo: 'A', nombre: 'Producto A', dia: d('2026-03-11'), cantidad: 50 },
];

test('ventas promedio por semana = total ÷ semanas del histórico; semanas = existencias ÷ promedio', () => {
  const r = calcularRotacion({ ventas: base, existencias: [{ codigo: 'A', nombre: 'Producto A', existencias: 25 }] });
  assert.equal(r.periodo.dias, 70);
  assert.equal(r.periodo.semanas, 10);
  const a = r.filas[0];
  assert.equal(a.vendido, 100);
  assert.equal(a.promedioSemanal, 10); // 100 ÷ 10
  assert.equal(a.semanasInventario, 2.5); // 25 ÷ 10
  assert.equal(a.estado, 'normal');
});

test('con un histórico de menos de 13 semanas, todos los productos usan el histórico completo', () => {
  const ventas = [...base, { codigo: 'B', nombre: 'B', dia: d('2026-03-10'), cantidad: 10 }];
  const r = calcularRotacion({ ventas, existencias: [{ codigo: 'B', existencias: 10 }] });
  const b = r.filas.find((f) => f.codigo === 'B');
  assert.equal(b.promedioSemanal, 1); // 10 ÷ 10 semanas, aunque solo vendió al final
  assert.equal(b.semanasInventario, 10);
});

test('producto sin ventas: no divide por cero y se muestra como "sin ventas en el periodo"', () => {
  const r = calcularRotacion({ ventas: base, existencias: [{ codigo: 'A', existencias: 5 }, { codigo: 'Z', nombre: 'Quieto', existencias: 40 }] });
  const z = r.filas.find((f) => f.codigo === 'Z');
  assert.equal(z.estado, 'sin_ventas');
  assert.equal(z.semanasInventario, null);
  assert.equal(z.promedioSemanal, 0);
  assert.ok(z.sobra, 'con existencias y sin ventas, sobra');
  assert.ok(z.senales.includes('no_en_ventas'));
  assert.equal(r.filas[r.filas.length - 1].codigo, 'Z', 'los productos sin ventas van al final');
});

test('producto con ventas y sin existencias: 0 semanas y aparece de primero', () => {
  const ventas = [...base, { codigo: 'C', nombre: 'C', dia: d('2026-02-01'), cantidad: 5 }];
  const r = calcularRotacion({ ventas, existencias: [{ codigo: 'A', existencias: 1 }, { codigo: 'C', existencias: 0 }] });
  assert.equal(r.filas[0].codigo, 'C');
  assert.equal(r.filas[0].semanasInventario, 0);
  assert.equal(r.filas[0].estado, 'se_agota');
});

test('producto en ventas pero no en existencias: se incluye con 0 y se señala', () => {
  const ventas = [...base, { codigo: 'D', nombre: 'D', dia: d('2026-02-01'), cantidad: 5 }];
  const r = calcularRotacion({ ventas, existencias: [{ codigo: 'A', existencias: 30 }] });
  const fila = r.filas.find((f) => f.codigo === 'D');
  assert.equal(fila.existencias, 0);
  assert.equal(fila.semanasInventario, 0);
  assert.ok(fila.senales.includes('no_en_existencias'));
  assert.ok(r.avisos.some((a) => a.includes('no en las existencias')));
});

test('orden de menos a más semanas; menos de 2 se agota y más de 12 sobra', () => {
  const ventas = ['P1', 'P2', 'P3'].flatMap((c) => [
    { codigo: c, dia: d('2026-01-01'), cantidad: 50 },
    { codigo: c, dia: d('2026-03-11'), cantidad: 50 },
  ]);
  const r = calcularRotacion({
    ventas,
    existencias: [{ codigo: 'P1', existencias: 200 }, { codigo: 'P2', existencias: 15 }, { codigo: 'P3', existencias: 130 }],
  });
  assert.deepEqual(r.filas.map((f) => f.codigo), ['P2', 'P3', 'P1']);
  assert.deepEqual(r.filas.map((f) => f.estado), ['se_agota', 'sobra', 'sobra']);
  assert.equal(r.resumen.seAgotan, 1);
  assert.equal(r.resumen.sobran, 2);
});

test('existencias en varias filas (bodegas) se suman; códigos 00123 y 123 son el mismo', () => {
  const ventas = [{ codigo: '00123', dia: d('2026-01-01'), cantidad: 35 }, { codigo: '00123', dia: d('2026-03-11'), cantidad: 35 }];
  const r = calcularRotacion({ ventas, existencias: [{ codigo: 123, existencias: 10 }, { codigo: '123', existencias: 4 }] });
  assert.equal(r.filas.length, 1);
  assert.equal(r.filas[0].existencias, 14);
  assert.equal(r.filas[0].semanasInventario, 2); // 14 ÷ (70 ÷ 10)
});

test('ventas agrupadas por mes: el último mes cuenta completo', () => {
  const ventas = [
    { codigo: 'M', dia: d('2025-10-01'), cantidad: 30 },
    { codigo: 'M', dia: d('2026-09-01'), cantidad: 30 },
  ];
  const r = calcularRotacion({ ventas, existencias: [{ codigo: 'M', existencias: 1 }], mensual: true });
  assert.equal(r.periodo.hasta, '2026-09-30');
  assert.equal(r.periodo.dias, 365);
});

test('devoluciones que igualan las ventas: sin ventas, sin dividir por cero', () => {
  const ventas = [...base, { codigo: 'R', dia: d('2026-01-05'), cantidad: 4 }, { codigo: 'R', dia: d('2026-01-09'), cantidad: -4 }];
  const r = calcularRotacion({ ventas, existencias: [{ codigo: 'R', existencias: 3 }] });
  const fila = r.filas.find((f) => f.codigo === 'R');
  assert.equal(fila.estado, 'sin_ventas');
  assert.ok(fila.senales.includes('devoluciones'));
});

test('el ejemplo de la explicación sale del propio archivo', () => {
  const r = calcularRotacion({ ventas: base, existencias: [{ codigo: 'A', nombre: 'Producto A', existencias: 15 }] });
  assert.deepEqual(
    { codigo: r.ejemplo.codigo, vendido: r.ejemplo.vendido, semanas: r.ejemplo.semanasHistorico, promedio: r.ejemplo.promedioSemanal, existencias: r.ejemplo.existencias, resultado: r.ejemplo.semanasInventario },
    { codigo: 'A', vendido: 100, semanas: 10, promedio: 10, existencias: 15, resultado: 1.5 },
  );
});

// --- Ajustes del promedio ------------------------------------------------------------

// Un año exacto (364 días = 52 semanas) con una venta por semana, más una fila en cero que
// marca el último día del histórico.
function semanal(codigo, cantidadDeLaSemana) {
  const inicio = d('2025-01-01');
  const filas = [];
  for (let k = 0; k < 52; k++) filas.push({ codigo, dia: inicio + 7 * k, cantidad: cantidadDeLaSemana(k) });
  filas.push({ codigo: 'FIN', dia: inicio + 363, cantidad: 0 });
  return filas;
}

test('lo vendido en las últimas 13 semanas cuenta doble', () => {
  // 1 por semana durante 39 semanas y 3 por semana en las últimas 13.
  const r = calcularRotacion({ ventas: semanal('A', (k) => (k >= 39 ? 3 : 1)), existencias: [{ codigo: 'A', existencias: 3 }] });
  assert.equal(r.periodo.semanas, 52);
  assert.equal(r.periodo.semanasRecientes, 13);
  const a = r.filas.find((f) => f.codigo === 'A');
  assert.equal(a.vendido, 78);
  assert.equal(a.vendidoReciente, 39);
  assert.equal(a.promedioSimple, 1.5); // 78 ÷ 52, el modelo anterior
  assert.equal(a.promedioSemanal, 1.8); // (78 + 39) ÷ (52 + 13)
  assert.equal(a.estado, 'se_agota', 'con el promedio simple serían 2 semanas justas; con lo reciente, 1,7');
  assert.equal(a.pico, null, 'una subida sostenida no es un pico: no se recorta');
});

test('un mes que vende más de 3 veces lo normal se cuenta como 3 veces lo normal', () => {
  const mes = (m, cantidad) => ({ codigo: 'P', dia: d(`2025-${String(m).padStart(2, '0')}-01`), cantidad });
  const ventas = Array.from({ length: 12 }, (_, i) => mes(i + 1, i + 1 === 3 ? 100 : 10));
  const r = calcularRotacion({ ventas, existencias: [{ codigo: 'P', existencias: 26 }], mensual: true });
  const p = r.filas[0];
  assert.deepEqual(p.pico, { mes: '2025-03', vendido: 100, contado: 30 });
  assert.equal(p.vendidoAjustado, 140); // 210 − 70 de exceso
  assert.equal(p.vendidoReciente, 30); // octubre a diciembre
  // T = 365 días y lo reciente = 92 días (1 oct – 31 dic): (140 + 30) ÷ ((365 + 92) ÷ 7)
  assert.ok(Math.abs(p.promedioSemanal - (170 * 7) / 457) < 1e-9);
  assert.ok(p.senales.includes('pico_recortado'));
  assert.ok(r.avisos.some((a) => a.includes('más de 3 veces lo normal')));
});

test('el pico no se recorta con menos de 6 meses con venta ni si dos meses empatan', () => {
  const mes = (m, cantidad) => ({ codigo: 'P', dia: d(`2025-${String(m).padStart(2, '0')}-01`), cantidad });
  const pocos = calcularRotacion({ ventas: [10, 10, 100, 10, 10].map((c, i) => mes(i + 1, c)), existencias: [], mensual: true });
  assert.equal(pocos.filas[0].pico, null);
  const empate = calcularRotacion({ ventas: [10, 100, 10, 100, 10, 10, 10].map((c, i) => mes(i + 1, c)), existencias: [], mensual: true });
  assert.equal(empate.filas[0].pico, null);
});

test('un producto que empezó a venderse hace poco se promedia desde su primera venta (mínimo 13 semanas)', () => {
  const ventas = [...semanal('A', () => 1), { codigo: 'N', dia: d('2025-01-01') + 363 - 27, cantidad: 26 }];
  const r = calcularRotacion({ ventas, existencias: [{ codigo: 'N', existencias: 4 }] });
  const n = r.filas.find((f) => f.codigo === 'N');
  assert.equal(n.semanasProducto, 13, 'empezó hace 4 semanas: cuentan 13, no 4 ni 52');
  assert.equal(n.promedioSemanal, 2); // (26 + 26) ÷ (13 + 13)
  assert.equal(n.promedioSimple, 0.5); // 26 ÷ 52, el modelo anterior
  assert.equal(n.semanasInventario, 2);
  assert.ok(n.senales.includes('producto_nuevo'));
  assert.equal(r.filas.find((f) => f.codigo === 'A').semanasProducto, 52);
});

test('un producto que se vende de vez en cuando no se toma por nuevo aunque aparezca tarde', () => {
  // Vende en las semanas 20 y 40: tardó 20 semanas en aparecer, pero suele tardar 16 entre ventas.
  const ventas = [...semanal('A', () => 1), ...semanal('I', (k) => (k === 20 || k === 40 ? 5 : 0)).filter((v) => v.cantidad > 0)];
  const r = calcularRotacion({ ventas, existencias: [] });
  const i = r.filas.find((f) => f.codigo === 'I');
  assert.equal(i.semanasProducto, 52);
  assert.ok(!i.senales.includes('producto_nuevo'));
  assert.equal(r.resumen.productosNuevos, 0);
});
