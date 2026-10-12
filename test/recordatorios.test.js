'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { planearAvisos, agruparPorSemana, calendarioIcs, fechaBogota } = require('../server/recordatorios');

const filas = [
  { codigo: 'SEIS', nombre: 'Seis semanas', semanasInventario: 6 },
  { codigo: 'CUATRO', nombre: 'Justo cuatro', semanasInventario: 4 },
  { codigo: 'MEDIA', nombre: 'Cuatro y media', semanasInventario: 4.5 },
  { codigo: 'UNA', nombre: 'Se agota', semanasInventario: 1 },
  { codigo: 'QUIETO', nombre: 'Sin ventas', semanasInventario: null },
  { codigo: 'LEJOS', nombre: 'Veinte semanas', semanasInventario: 20 },
];

test('fecha del recordatorio: reporte + 7·(S − 2) días, menos 3; solo más de 4 semanas y dentro de 3 meses', () => {
  const plan = planearAvisos(filas, '2026-10-01');
  assert.deepEqual(plan.map((a) => [a.codigo, a.fechaUmbral, a.fechaAviso]), [
    ['MEDIA', '2026-10-18', '2026-10-15'], // 7 · 2,5 = 17,5 → 17 días (hacia abajo: mejor avisar antes)
    ['SEIS', '2026-10-29', '2026-10-26'], // 7 · 4 = 28 días
  ]); // LEJOS llega en 126 días: después de 3 meses, no se programa
});

test('un recordatorio por semana: junta lo que llega en los 7 días siguientes al primero', () => {
  const g = agruparPorSemana([{ fechaAviso: '2026-10-15' }, { fechaAviso: '2026-10-21' }, { fechaAviso: '2026-10-22' }, { fechaAviso: '2026-10-28' }]); // el 28 está a 6 días del 22: misma semana
  assert.deepEqual(g.map((x) => [x.fecha, x.productos.length]), [['2026-10-15', 2], ['2026-10-22', 2]]);
});

test('el archivo de calendario trae un evento por semana, a las 8 a. m. de Colombia, con productos y enlace', () => {
  const avisos = planearAvisos(filas, '2026-10-01');
  const ics = calendarioIcs({ avisos, fechaReporte: '2026-10-01', url: 'https://ejemplo.co/#/', idBase: '1-2', ahora: new Date('2026-10-01T15:00:00Z') });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.ok(ics.includes('DTSTART:20261015T130000Z'));
  assert.ok(ics.includes('SUMMARY:Revisar inventario: MEDIA llega a 2 semanas'));
  const desplegado = ics.split('\r\n ').join('');
  assert.ok(desplegado.includes('MEDIA (Cuatro y media): hacia el 18 de octubre de 2026'));
  assert.ok(desplegado.includes('https://ejemplo.co/#/'));
  for (const linea of ics.split('\r\n')) assert.ok(Buffer.byteLength(linea) <= 75, 'líneas de máximo 75 bytes');
});

test('la fecha es la de Colombia, no la del servidor', () => {
  assert.equal(fechaBogota('2026-10-02T03:00:00Z'), '2026-10-01'); // 10 p. m. del 1 de octubre en Bogotá
});
