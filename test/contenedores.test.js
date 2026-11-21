'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ajustarAContenedores, capacidadDe, volumenDe } = require('../server/contenedores');

const linea = (codigo, cantidad, volumenPaquete, semanas, lote = 10) => ({ codigo, cantidad, lote, volumenPaquete, semanas });

test('la capacidad sale de los contenedores y su tipo; sin contenedores no hay', () => {
  assert.equal(capacidadDe({ contenedores: 2, tipoContenedor: '40' }), 113.9);
  assert.equal(capacidadDe({ contenedores: 1, tipoContenedor: '20' }), 28.05);
  assert.equal(capacidadDe({ contenedores: 1 }), 56.95, 'sin tipo se asume de 40');
  assert.equal(capacidadDe({}), null);
  assert.equal(capacidadDe(undefined), null);
});

test('el volumen de una línea son sus paquetes por el volumen de cada uno; sin medidas no cuenta', () => {
  assert.equal(volumenDe(linea('A', 50, 2, 3)), 10);
  assert.equal(volumenDe(linea('B', 50, null, 3)), 0);
});

test('si cabe, no se toca nada', () => {
  const r = ajustarAContenedores([linea('A', 50, 2, 3), linea('B', 20, 1, 5)], 100);
  assert.equal(r.quitados, 0);
  assert.deepEqual(r.lineas.map((l) => l.cantidad), [50, 20]);
});

test('si no cabe, quita primero de la línea con más semanas de inventario y para en cuanto cabe', () => {
  // A: 10 paquetes de 2 m³ = 20; B: 10 paquetes de 2 m³ = 20. Capacidad 30: sobran 10 m³ = 5 paquetes.
  const r = ajustarAContenedores([linea('A', 100, 2, 3), linea('B', 100, 2, 9)], 30);
  assert.equal(r.quitados, 5);
  const [a, b] = r.lineas;
  assert.equal(a.cantidad, 100, 'la urgente (3 semanas) se queda');
  assert.equal(b.cantidad, 50, 'la de 9 semanas pierde los 5 paquetes');
  assert.ok(r.lineas.reduce((s, l) => s + volumenDe(l), 0) <= 30);
});

test('si una línea no alcanza para quitar todo, sigue con la siguiente; una que queda en 0 sale', () => {
  const r = ajustarAContenedores([linea('A', 100, 2, 3), linea('B', 20, 2, 9)], 10);
  assert.deepEqual(r.lineas.map((l) => l.codigo), ['A'], 'B se quita entera');
  assert.equal(r.lineas[0].cantidad, 50);
  assert.ok(r.lineas.reduce((s, l) => s + volumenDe(l), 0) <= 10);
});

test('las líneas sin medidas no cuentan ni se recortan, y sin capacidad no se hace nada', () => {
  const r = ajustarAContenedores([linea('A', 100, 2, 3), linea('S', 500, null, 20)], 10);
  assert.equal(r.lineas.find((l) => l.codigo === 'S').cantidad, 500);
  assert.equal(r.lineas.find((l) => l.codigo === 'A').cantidad, 50);
  assert.equal(ajustarAContenedores([linea('A', 100, 2, 3)], null).quitados, 0);
});
