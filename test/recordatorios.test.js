'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { planearAvisos, lotePorEnviar, textoCorreo, fechaBogota } = require('../server/recordatorios');

const filas = [
  { codigo: 'SEIS', nombre: 'Seis semanas', semanasInventario: 6 },
  { codigo: 'CUATRO', nombre: 'Justo cuatro', semanasInventario: 4 },
  { codigo: 'MEDIA', nombre: 'Cuatro y media', semanasInventario: 4.5 },
  { codigo: 'UNA', nombre: 'Se agota', semanasInventario: 1 },
  { codigo: 'QUIETO', nombre: 'Sin ventas', semanasInventario: null },
];

test('fecha del aviso: reporte + 7·(S − 2) días, menos 3; solo productos con más de 4 semanas', () => {
  const plan = planearAvisos(filas, '2026-10-01');
  assert.deepEqual(plan.map((a) => [a.codigo, a.fechaUmbral, a.fechaAviso]), [
    ['MEDIA', '2026-10-18', '2026-10-15'], // 7 · 2,5 = 17,5 → 17 días (hacia abajo: mejor avisar antes)
    ['SEIS', '2026-10-29', '2026-10-26'], // 7 · 4 = 28 días
  ]);
});

test('un correo junta lo que llega en la misma semana y no sale antes de tiempo', () => {
  const pendientes = [{ fechaAviso: '2026-10-15' }, { fechaAviso: '2026-10-20' }, { fechaAviso: '2026-10-26' }];
  assert.deepEqual(lotePorEnviar(pendientes, '2026-10-14'), []);
  assert.deepEqual(lotePorEnviar(pendientes, '2026-10-15').map((a) => a.fechaAviso), ['2026-10-15', '2026-10-20']);
  assert.deepEqual(lotePorEnviar(pendientes.slice(2), '2026-10-30').map((a) => a.fechaAviso), ['2026-10-26'], 'si el servidor estuvo dormido, sale al despertar');
});

test('el correo dice qué productos, cuándo, de qué reporte y con el enlace para volver', () => {
  const avisos = planearAvisos(filas, '2026-10-01');
  const { asunto, texto } = textoCorreo({ nombre: 'Ana', fechaReporte: '2026-10-01', avisos, url: 'https://ejemplo.co/#/' });
  assert.equal(asunto, '2 productos llegan a 2 semanas de inventario');
  assert.match(texto, /reporte del 1 de octubre de 2026/);
  assert.match(texto, /- MEDIA \(Cuatro y media\): hacia el 18 de octubre de 2026/);
  assert.match(texto, /https:\/\/ejemplo\.co\/#\//);
});

test('la fecha es la de Colombia, no la del servidor', () => {
  assert.equal(fechaBogota('2026-10-02T03:00:00Z'), '2026-10-01'); // 10 p. m. del 1 de octubre en Bogotá
});
