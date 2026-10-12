'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { revisarLista, compararListas, coherenciaConReporte } = require('../server/listas');
const { leerNumero } = require('../server/valores');

test('la comparación da el mismo número que un conteo a mano (ejemplo conocido)', () => {
  // Conteo a mano:
  //   inicial: A 10, B 5, C 8, D 3, E 1
  //   final:   A 10, B 7, C 8, E 2, F 4, G 6
  //   agregadas: F, G          -> 2
  //   quitadas:  D             -> 1
  //   cambiadas: B (5→7), E (1→2) -> 2
  //   total = 5
  const inicial = revisarLista([
    { codigo: 'A', cantidad: '10' }, { codigo: 'B', cantidad: '5' }, { codigo: 'C', cantidad: '8' },
    { codigo: 'D', cantidad: '3' }, { codigo: 'E', cantidad: '1' },
  ]).lineas;
  const final = revisarLista([
    { codigo: 'A', cantidad: '10' }, { codigo: 'B', cantidad: '7' }, { codigo: 'C', cantidad: '8' },
    { codigo: 'E', cantidad: '2' }, { codigo: 'F', cantidad: '4' }, { codigo: 'G', cantidad: '6' },
  ]).lineas;
  const c = compararListas(inicial, final);
  assert.deepEqual(c.conteo, { agregadas: 2, quitadas: 1, cambiadas: 2, total: 5 });
  assert.deepEqual(c.agregadas.map((x) => x.codigo).sort(), ['F', 'G']);
  assert.deepEqual(c.quitadas.map((x) => x.codigo), ['D']);
  assert.deepEqual(c.cambiadas.map((x) => [x.codigo, x.antes, x.despues]), [['B', 5, 7], ['E', 1, 2]]);
  assert.equal(c.iguales, 2);
});

test('la comparación es por código: mayúsculas, espacios y ceros a la izquierda no cuentan como cambio', () => {
  const c = compararListas(
    [{ codigo: 'abc-1', cantidad: 5 }, { codigo: '00123', cantidad: 2 }],
    [{ codigo: ' ABC-1 ', cantidad: 5 }, { codigo: '123', cantidad: 2 }],
  );
  assert.equal(c.conteo.total, 0);
});

test('listas idénticas: cero cambios; lista final vacía: todas quitadas', () => {
  const l = [{ codigo: 'A', cantidad: 1 }, { codigo: 'B', cantidad: 2 }];
  assert.equal(compararListas(l, l).conteo.total, 0);
  assert.deepEqual(compararListas(l, []).conteo, { agregadas: 0, quitadas: 2, cambiadas: 0, total: 2 });
});

test('revisar lista: errores en lenguaje sencillo con número de fila', () => {
  const r = revisarLista([
    { codigo: 'A', cantidad: '3' },
    { codigo: '', cantidad: '5' },
    { codigo: 'B', cantidad: '' },
    { codigo: 'C', cantidad: 'diez' },
    { codigo: 'D', cantidad: '-2' },
    { codigo: '', nombre: '', cantidad: '' },
  ]);
  assert.deepEqual(r.errores.map((e) => e.fila), [2, 3, 4, 5]);
  assert.match(r.errores[0].mensaje, /fila 2 no tiene código de producto/);
  assert.match(r.errores[1].mensaje, /no tiene cantidad/);
  assert.match(r.errores[2].mensaje, /no es un número/);
});

test('revisar lista: códigos repetidos se suman y cantidad 0 no cuenta, con aviso', () => {
  const r = revisarLista([
    { codigo: 'A', cantidad: '3' },
    { codigo: 'a', cantidad: '2' },
    { codigo: 'B', cantidad: '0' },
  ]);
  assert.deepEqual(r.lineas, [{ codigo: 'A', nombre: '', cantidad: 5 }]);
  assert.equal(r.avisos.length, 2);
  assert.match(r.avisos[0], /filas 1 y 2/);
});

test('cantidades como las escribe la gente en Colombia', () => {
  const r = revisarLista([
    { codigo: 'A', cantidad: '1.000' },
    { codigo: 'B', cantidad: '2,5' },
    { codigo: 'C', cantidad: '1.234,5' },
    { codigo: 'D', cantidad: 12 },
  ]);
  assert.deepEqual(r.lineas.map((l) => l.cantidad), [1000, 2.5, 1234.5, 12]);
});

test('leer números: separadores, negativos de SAP y paréntesis', () => {
  assert.equal(leerNumero('1.234,56'), 1234.56);
  assert.equal(leerNumero('1,234.56'), 1234.56);
  assert.equal(leerNumero('2.5'), 2.5);
  assert.equal(leerNumero('2,5'), 2.5);
  assert.equal(leerNumero('1.000'), 1000);
  assert.equal(leerNumero('1,000', 'punto'), 1000);
  assert.equal(leerNumero('5-'), -5);
  assert.equal(leerNumero('(3)'), -3);
  assert.equal(leerNumero('$ 1.200'), 1200);
  assert.equal(leerNumero('abc'), null);
  assert.equal(leerNumero(''), null);
});

// Mismo ejemplo contado a mano de arriba (M = 5), con un reporte inventado.
const INICIAL_EJEMPLO = [{ codigo: 'A', cantidad: 10 }, { codigo: 'B', cantidad: 5 }, { codigo: 'C', cantidad: 8 }, { codigo: 'D', cantidad: 3 }, { codigo: 'E', cantidad: 1 }];
const FINAL_EJEMPLO = [{ codigo: 'A', cantidad: 10 }, { codigo: 'B', cantidad: 7 }, { codigo: 'C', cantidad: 8 }, { codigo: 'E', cantidad: 2 }, { codigo: 'F', cantidad: 4 }, { codigo: 'G', cantidad: 6 }];

test('magnitud: unidades movidas sobre las unidades de la lista inicial', () => {
  // F 4 + G 6 (agregadas) + D 3 (quitada) + B 2 + E 1 (cambiadas) = 16 de 27
  const { magnitud } = compararListas(INICIAL_EJEMPLO, FINAL_EJEMPLO);
  assert.deepEqual({ ...magnitud, porcentaje: Math.round(magnitud.porcentaje * 1000) / 1000 }, { unidadesMovidas: 16, unidadesIniciales: 27, porcentaje: 0.593 });
});

test('coherencia: cuántos cambios van en la dirección que indica el reporte', () => {
  const reporte = [
    { codigo: 'F', estado: 'se_agota', sobra: false }, // agregada y se agota: coherente
    { codigo: 'G', estado: 'sobra', sobra: true }, // agregada y sobra: contraria
    { codigo: 'D', estado: 'sin_ventas', sobra: true }, // quitada y sobra: coherente
    { codigo: 'B', estado: 'normal', sobra: false }, // subió y está normal: neutra
    // E no aparece en el reporte: neutra
  ];
  const c = coherenciaConReporte(compararListas(INICIAL_EJEMPLO, FINAL_EJEMPLO), reporte);
  assert.deepEqual({ coherentes: c.coherentes, contrarias: c.contrarias, neutras: c.neutras, total: c.total, porcentaje: c.porcentaje }, { coherentes: 2, contrarias: 1, neutras: 2, total: 5, porcentaje: 0.4 });
  assert.deepEqual(c.detalle.find((x) => x.codigo === 'E'), { codigo: 'E', direccion: 'sube', estado: 'fuera_del_reporte', clase: 'neutra' });
  assert.equal(coherenciaConReporte(compararListas(INICIAL_EJEMPLO, INICIAL_EJEMPLO), reporte).porcentaje, null, 'sin cambios no hay porcentaje');
});
