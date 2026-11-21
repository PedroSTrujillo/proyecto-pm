'use strict';

// La medición del piloto de Alpha 0.2 y la encuesta en la app (SP3 de docs/PLAN_ALPHA_02.md).
// Base de datos en memoria.

process.env.DATA_DIR = 'memory://';
process.env.SIN_LIMITES = '1';

const test = require('node:test');
const { conCodigo } = require('./codigo');
const assert = require('node:assert/strict');
const db = require('../server/db');
const { crearApp } = require('../server/app');
const { plantillaExport } = require('../server/plantillas');
const { debeMostrarse } = require('../server/encuesta');
const E = require('../server/equipo');

const DIA = 86400000;
const dia = (texto) => Math.floor(Date.parse(texto) / DIA);
// Mediodía en Bogotá de ese día, para que diaDe no cambie de fecha.
const en = (texto) => new Date(`${texto}T17:00:00Z`);
const cerrado = (creado, terminado, sugeridas, sinCambio, extra = {}) => ({
  modo: 'sugerido', creadoEn: en(creado), terminadoEn: terminado ? en(terminado) : null, anulado: false, borrado: false,
  aceptacion: terminado ? { sugeridas, sinCambio } : null, ...extra,
});

test('días hábiles: de lunes a viernes, sin descontar festivos', () => {
  assert.equal(E.diasHabiles(dia('2026-11-02'), dia('2026-11-08')), 5, 'una semana de lunes a domingo');
  assert.equal(E.diasHabiles(dia('2026-11-07'), dia('2026-11-08')), 0, 'un fin de semana');
});

test('aceptación: líneas sugeridas sin cambio sobre líneas sugeridas, en los pedidos cerrados de su ventana', () => {
  const p = E.evaluarPiloto({
    pedidos: [
      cerrado('2026-11-02', '2026-11-03', 10, 8),
      cerrado('2026-11-09', '2026-11-10', 10, 6),
      cerrado('2026-11-12', '2026-11-12', 10, 0, { anulado: true }), // anulado: no cuenta
      cerrado('2026-11-20', null, 0, 0), // abierto: no cuenta
      cerrado('2026-11-25', '2026-12-05', 10, 0), // cerrado después de sus 30 días
    ],
    encuestas: [{ puntaje: 4, respondidaEn: en('2026-11-20') }],
    diasConMovimientos: [dia('2026-11-02'), dia('2026-11-03'), dia('2026-11-07'), dia('2026-11-07')], // el 7 es sábado
    hoy: dia('2026-11-08'),
  });
  assert.equal(p.pedidos, 2);
  assert.deepEqual([p.sugeridas, p.sinCambio], [20, 14]);
  assert.equal(p.aceptacion, 0.7);
  assert.equal(p.satisfaccion, 4);
  assert.equal(p.diasHabiles, 5, 'del lunes 2 al domingo 8');
  assert.equal(p.diasConMovimientos, 2, 'el sábado no suma');
  assert.equal(p.uso, 0.4);
  assert.equal(p.categoria, 'cumple', '4 de satisfacción y 70 % de aceptación llegan a la meta');
  assert.equal(p.terminoVentana, false);
});

test('categorías y veredicto del piloto', () => {
  const hoy = dia('2026-12-30');
  const u = (sinCambio, puntaje) => ({
    piloto: E.evaluarPiloto({
      pedidos: [cerrado('2026-11-02', '2026-11-03', 10, sinCambio)],
      encuestas: puntaje ? [{ puntaje, respondidaEn: en('2026-11-20') }] : [],
      hoy,
    }),
  });
  assert.equal(u(9, 3).piloto.categoria, 'no_cumple', 'satisfacción baja');
  assert.equal(u(5, 5).piloto.categoria, 'no_cumple', 'aceptación baja');
  assert.equal(u(9, null).piloto.categoria, 'incompleto', 'sin encuesta');
  assert.equal(E.evaluarPiloto({ pedidos: [], hoy }).categoria, 'sin_pedido');
  assert.equal(E.resumirPiloto([u(9, 5), u(8, 4), u(7, 4), u(1, 2), u(1, 1)]).veredicto, 'meta_cumplida');
  assert.equal(E.resumirPiloto([u(9, 5), u(8, 4), u(1, 4), u(1, 2), u(1, 1)]).veredicto, 'meta_no_cumplida', 'los 5 cerraron su ventana');
  const abierto = { piloto: E.evaluarPiloto({ pedidos: [cerrado('2026-12-20', null, 0, 0)], hoy }) };
  assert.equal(E.resumirPiloto([u(9, 5), abierto]).veredicto, 'en_curso');
  assert.equal(E.resumirPiloto([u(9, 5), u(5, 5)]).aceptacion, 0.7, 'la aceptación de todas las líneas juntas');
});

test('sugerido contra decidido contra ocurrido: lo vendido en las semanas que cubría el pedido, frente al rango', () => {
  // Serie de 8 semanas que termina el domingo 29 de noviembre; la primera empieza el lunes 5 de octubre.
  const series = { hasta: '2026-11-29', semanas: 8, porProducto: { A: [9, 9, 9, 9, 10, 10, 1, 1], B: [0, 0, 0, 0, 30, 30, 0, 0], C: [5, 5, 5, 5, 5, 5, 5, 5] } };
  const foto = [
    { codigo: 'A', cantidad: 15, cubre: 2, rango: { bajo: 12, media: 20, alto: 30 } },
    { codigo: 'B', cantidad: 10, cubre: 2, rango: { bajo: 5, media: 10, alto: 20 } },
    { codigo: 'C', cantidad: 4, cubre: 6, rango: { bajo: 5, media: 10, alto: 15 } }, // su horizonte pasa del último día
  ];
  const r = E.compararConLoOcurrido({ foto, final: [{ codigo: 'A', cantidad: 20 }], terminadoEn: en('2026-11-02'), series });
  assert.equal(r.estado, 'medido');
  assert.deepEqual([r.productos, r.dentro, r.encima, r.pendientes], [2, 1, 1, 1]);
  const a = r.lineas.find((l) => l.codigo === 'A');
  assert.deepEqual([a.sugerido, a.decidido, a.vendido, a.clase], [15, 20, 20, 'dentro']);
  assert.equal(r.lineas.find((l) => l.codigo === 'B').decidido, 0, 'lo quitó');
  assert.equal(E.compararConLoOcurrido({ foto, final: [], terminadoEn: en('2026-11-25'), series }).estado, 'pendiente');
  assert.equal(E.compararConLoOcurrido({ foto, final: [], terminadoEn: en('2026-11-02'), series: null }).estado, 'sin_datos');
});

test('cuándo aparece la encuesta', () => {
  const ahora = new Date('2026-12-01T15:00:00Z');
  const hace = (dias) => new Date(ahora.getTime() - dias * DIA);
  assert.equal(debeMostrarse({ pedidaEn: null, primerCierre: null, ahora }), false);
  assert.equal(debeMostrarse({ pedidaEn: null, primerCierre: hace(20), ahora }), false, 'antes de 21 días');
  assert.equal(debeMostrarse({ pedidaEn: null, primerCierre: hace(21), ahora }), true);
  assert.equal(debeMostrarse({ pedidaEn: hace(0), primerCierre: null, ahora }), true, 'el equipo la abrió');
  assert.equal(debeMostrarse({ pedidaEn: hace(0), respuestas: [{ puntaje: 5, respondidaEn: hace(10) }], ahora }), false, 'respondida no vuelve');
  assert.equal(debeMostrarse({ pedidaEn: hace(9), respuestas: [{ puntaje: null, respondidaEn: hace(2) }], ahora }), false, '"Ahora no" hace 2 días');
  assert.equal(debeMostrarse({ pedidaEn: hace(9), respuestas: [{ puntaje: null, respondidaEn: hace(3) }], ahora }), true, 'a los 3 días vuelve');
  const tres = [hace(9), hace(6), hace(3)].map((t) => ({ puntaje: null, respondidaEn: t }));
  assert.equal(debeMostrarse({ pedidaEn: hace(12), respuestas: tres, ahora }), false, 'vuelve como máximo dos veces');
});

test('la encuesta en la app: aparece cuando el equipo la abre y no se repite después de responderla', async () => {
  await db.iniciar();
  const servidor = crearApp().listen(0);
  await new Promise((r) => servidor.once('listening', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  let cookie = '';
  const pedir = async (metodo, ruta, cuerpo, formulario) => {
    const h = { ...(cookie ? { Cookie: cookie } : {}), ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) };
    const r = await fetch(base + ruta, { method: metodo, headers: h, body: formulario || (cuerpo ? JSON.stringify(cuerpo) : undefined) });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { estado: r.status, ...(await r.json().catch(() => ({}))) };
  };
  try {
    assert.equal((await pedir('POST', '/api/cuenta/crear', await conCodigo({ nombre: 'Clara', email: 'clara.piloto@prueba.co', clave: 'clave-segura', empresa: 'Clara SAS' }))).estado, 201);
    assert.equal((await pedir('GET', '/api/encuesta')).mostrar, false);
    assert.equal((await pedir('POST', '/api/encuesta', { puntaje: 5 })).estado, 409, 'cerrada no se responde');

    await E.abrirEncuesta('clara.piloto@prueba.co');
    assert.equal((await pedir('GET', '/api/encuesta')).mostrar, true);
    assert.equal((await pedir('POST', '/api/encuesta', { puntaje: 7 })).estado, 400);
    assert.equal((await pedir('POST', '/api/encuesta', { puntaje: 4, comentario: 'Que traiga las familias.' })).estado, 200);
    assert.equal((await pedir('GET', '/api/encuesta')).mostrar, false, 'no se repite');
    assert.equal((await pedir('POST', '/api/encuesta', { puntaje: 5 })).estado, 409);

    // Con un pedido desde lo sugerido cerrado, el piloto la cuenta.
    const fd = new FormData();
    fd.append('archivos', new Blob([await plantillaExport()]), 'inventario.xlsx');
    assert.equal((await pedir('POST', '/api/inventario/export', undefined, fd)).ok, true);
    const { pedido } = await pedir('POST', '/api/pedidos', { modo: 'sugerido' });
    await pedir('POST', `/api/pedidos/${pedido.id}/lista-final`, { lineas: pedido.listaFinal });
    await pedir('POST', `/api/pedidos/${pedido.id}/por-que`, {});
    const { usuarios, resumen } = await E.piloto();
    const clara = usuarios.find((u) => u.email === 'clara.piloto@prueba.co');
    assert.equal(clara.piloto.satisfaccion, 4);
    assert.equal(clara.piloto.aceptacion, 1, 'cerró lo sugerido tal cual');
    assert.equal(clara.piloto.categoria, 'cumple');
    assert.equal(clara.comentarios[0].comentario, 'Que traiga las familias.');
    assert.equal(clara.pedidos[0].ocurrido.estado, 'pendiente', 'todavía no pasa el tiempo que cubre');
    assert.equal(resumen.cumplen, 1);
  } finally {
    servidor.close();
    await db.cerrar();
  }
});
