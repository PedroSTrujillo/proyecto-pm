'use strict';

// El correo del boletín diario y las alertas por tipo (SP7 de docs/PLAN_ALPHA_02.md). Sin base de
// datos: server/boletin-correo.js, server/alertas.js y atrasadosDe de server/recepcion.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const { armarBoletin, seccionesDelDia, resumenDelDia, cambiosDesde, alcance } = require('../server/boletin-correo');
const A = require('../server/alertas');
const { atrasadosDe } = require('../server/recepcion');
const { leerAjustes } = require('../server/inventario');

const producto = (codigo, estado, existencias, semanas, extra = {}) => ({ codigo, nombre: `Producto ${codigo}`, estado, existencias, semanas, sugerido: null, quieto: null, unidadesQuietas: 0, ...extra });

function inventario() {
  const productos = [
    producto('A', 'agota', 0, 0, { sugerido: 30 }),
    producto('B', 'agota', 2, 1.5, { sugerido: 12 }),
    producto('C', 'pide', 8, 3, { sugerido: 20 }),
    producto('D', 'normal', 50, 6),
    producto('E', 'sobra', 400, 40, { quieto: 2500000, unidadesQuietas: 300 }),
  ];
  return {
    fuente: { hasta: '2026-10-27' },
    resumen: { productos: 5, seAgotan: 2, enCero: 1, pideYa: 1, sobran: 1, tieneCostos: true, dineroQuieto: 2500000 },
    proveedores: [{ nombre: 'Tornillería Central', entrega: 2, pideYa: 1, productos: 3 }],
    productos,
  };
}

const LUNES = '2026-11-02';
const MIERCOLES = '2026-10-28';
const PRIMER_HABIL = '2026-12-01'; // martes 1 de diciembre
const base = { empresa: 'Ferretería Ana', url: 'https://app.sinesc.co', baja: 'https://app.sinesc.co/api/boletin/baja?u=1&f=x' };
const analista = { nombre: 'Ana', perfil: 'analista', unidad: 'semanas' };
const operador = { nombre: 'Carla', perfil: 'operador', unidad: 'dias' };

function correo(usuario, tipos, { hoy = MIERCOLES, ctx = {}, previo = null, inv = inventario() } = {}) {
  const secciones = seccionesDelDia(tipos, { inv, ...ctx });
  return { secciones, ...(secciones.length ? armarBoletin({ ...base, usuario, inv, secciones, previo, hoy }) : {}) };
}

test('alcance: el mismo número dicho en días, semanas o meses', () => {
  assert.equal(alcance(2, 'dias'), '14 días');
  assert.equal(alcance(2, 'semanas'), '2 semanas');
  assert.equal(alcance(13, 'meses'), '3 meses');
  assert.equal(alcance(1, 'meses'), 'menos de medio mes');
  assert.equal(alcance(0.3, 'semanas'), '2 días', 'menos de una semana siempre se dice en días');
  assert.equal(alcance(0, 'semanas'), '0 días');
});

// --- Frecuencias y valores por defecto -----------------------------------------------------------

test('frecuencias: semanal los lunes, mensual el primer día hábil y sin festivos', () => {
  assert.equal(A.tocaHoy('diario', MIERCOLES), true);
  assert.equal(A.tocaHoy('semanal', LUNES), true);
  assert.equal(A.tocaHoy('semanal', MIERCOLES), false);
  assert.equal(A.primerHabilDelMes('2026-11-15'), '2026-11-02', 'el 1 de noviembre es domingo');
  assert.equal(A.primerHabilDelMes('2026-08-20'), '2026-08-03', 'el 1 de agosto es sábado');
  assert.equal(A.tocaHoy('mensual', PRIMER_HABIL), true);
  assert.equal(A.tocaHoy('mensual', '2026-12-02'), false);
  assert.equal(A.tocaHoy('nunca', LUNES), false);
  assert.equal(A.habilesEntre('2026-10-30', LUNES), 1, 'de viernes a lunes hay un día hábil');
  assert.equal(A.sumarHabiles('2026-10-29', 3), '2026-11-03', 'jueves + 3 hábiles = martes');
});

test('valores por defecto de cada perfil: qué sale un día cualquiera, un lunes y el primer día hábil', () => {
  const ana = { perfil: 'analista', preferencias: {}, aprueba: false, admin: false };
  const carla = { perfil: 'operador', preferencias: {}, aprueba: false, admin: false };
  assert.deepEqual(A.tiposDeHoy(ana, MIERCOLES), ['pideYa', 'seAgota']);
  assert.deepEqual(A.tiposDeHoy(ana, LUNES), ['pideYa', 'seAgota', 'enCero', 'porRecibir', 'dineroQuieto', 'sobran'], 'el lunes 2 de noviembre también es el primer día hábil');
  assert.deepEqual(A.tiposDeHoy(ana, '2026-11-09'), ['pideYa', 'seAgota', 'enCero', 'porRecibir', 'dineroQuieto']);
  assert.deepEqual(A.tiposDeHoy(ana, PRIMER_HABIL), ['pideYa', 'seAgota', 'sobran']);
  assert.deepEqual(A.tiposDeHoy(carla, MIERCOLES), ['pideYa', 'seAgota', 'enCero', 'porRecibir', 'sinDatos']);
  assert.ok(!A.tiposDeHoy(carla, PRIMER_HABIL).includes('sobran'), 'el operador no recibe lo que sobra');
  assert.ok(!A.tiposDeHoy(carla, LUNES).includes('dineroQuieto'));
});

test('porAprobar solo a quien aprueba y sinDatos solo a quien administra o es operador', () => {
  const ana = { perfil: 'analista', preferencias: {}, aprueba: false, admin: false };
  assert.ok(!A.tiposDeHoy(ana, MIERCOLES).includes('porAprobar'));
  assert.ok(A.tiposDeHoy({ ...ana, aprueba: true }, MIERCOLES).includes('porAprobar'));
  assert.ok(!A.tiposDeHoy(ana, '2026-11-09').includes('sinDatos'), 'la analista que no administra no lo recibe');
  assert.ok(A.tiposDeHoy({ ...ana, admin: true }, '2026-11-09').includes('sinDatos'));
});

test('lo que la persona cambia manda sobre su perfil; con todo en nunca no sale nada', () => {
  const nunca = Object.fromEntries(A.TIPOS.map((t) => [t, 'nunca']));
  assert.deepEqual(A.tiposDeHoy({ perfil: 'operador', preferencias: { alertas: nunca }, aprueba: true, admin: true }, LUNES), []);
  const propias = { alertas: { sobran: 'diario', pideYa: 'cada hora' } };
  assert.equal(A.alertasDe(propias, 'operador').sobran, 'diario');
  assert.equal(A.alertasDe(propias, 'operador').pideYa, 'diario', 'una frecuencia que no existe se ignora');
  assert.equal(A.alertasDe(propias, 'analista').enCero, 'semanal', 'lo que no tocó sigue su perfil');
});

// --- El correo -----------------------------------------------------------------------------------

test('el analista recibe sugeridos, proveedores y dinero quieto; el asunto es lo más urgente', () => {
  const c = correo(analista, ['pideYa', 'seAgota', 'enCero', 'dineroQuieto', 'sobran'], { hoy: LUNES });
  assert.deepEqual(c.secciones.map((s) => s.tipo), ['enCero', 'pideYa', 'seAgota', 'sobran', 'dineroQuieto']);
  assert.equal(c.asunto, 'En cero: 1 producto y 4 avisos más · Ferretería Ana');
  assert.match(c.texto, /sugerido 30/);
  assert.match(c.texto, /Tornillería Central: 1 producto/);
  assert.match(c.texto, /En lo que sobra hay \$2,5 M quieto/);
  assert.match(c.texto, /\/productos\?estado=pide&desde=boletin/);
  assert.match(c.texto, /\/pedidos\/sugerido\?desde=boletin/);
  assert.match(c.texto, /\/panel\?desde=boletin/);
  assert.match(c.html, /Dejar de recibirlo/);
  assert.match(c.html, /Qué avisos le llegan y cada cuánto se elige en Mi cuenta/);
});

test('un día cualquiera solo van las secciones diarias; el asunto dice "Pedir ya"', () => {
  const inv = inventario();
  inv.productos = inv.productos.filter((p) => p.estado !== 'agota');
  const c = correo(analista, A.tiposDeHoy({ perfil: 'analista', preferencias: {} }, MIERCOLES), { inv });
  assert.equal(c.asunto, 'Pedir ya: 1 producto · Ferretería Ana');
  assert.doesNotMatch(c.texto, /Sobran|Dinero quieto/);
});

test('el operador recibe lo de la bodega, en su unidad, sin sugeridos ni dinero', () => {
  const c = correo(operador, ['pideYa', 'seAgota', 'enCero', 'sinDatos'], { ctx: { sinDatos: { dias: 5 } } });
  assert.doesNotMatch(c.texto, /Sugerido|sugerido \d/);
  assert.doesNotMatch(c.html, /Sugerido/);
  assert.doesNotMatch(c.texto, /Tornillería Central/);
  assert.match(c.texto, /alcanza para 11 días/);
  assert.match(c.texto, /Hace 5 días hábiles que no se registran movimientos ni archivos/);
  assert.match(c.texto, /\/movimientos\?desde=boletin/);
});

test('sin nada que decir no hay secciones (sin_novedad); sinDatos solo después de 3 días hábiles', () => {
  const inv = inventario();
  inv.productos = [producto('D', 'normal', 50, 6)];
  inv.resumen = { ...inv.resumen, tieneCostos: false, dineroQuieto: null };
  assert.deepEqual(correo(analista, A.TIPOS, { inv, ctx: { porAprobar: [], porRecibir: [], sinDatos: { dias: 3 } } }).secciones, []);
  assert.equal(correo(analista, ['sinDatos'], { inv, ctx: { sinDatos: { dias: 4 } } }).secciones.length, 1);
});

test('qué cambió: cada sección se compara con la última vez que se revisó, no con ayer', () => {
  const inv = inventario();
  const tipos = ['seAgota', 'enCero'];
  // El lunes anterior: en cero nada; por agotarse, B.
  const lunes = resumenDelDia(tipos, seccionesDelDia(tipos, { inv: { ...inv, productos: [producto('B', 'agota', 2, 1.5)] } }), '2026-10-26');
  assert.deepEqual(lunes.tipos.enCero, { fecha: '2026-10-26', n: 0, claves: [] });
  // El miércoles solo se revisa seAgota: enCero sigue con la fecha del lunes.
  const miercoles = resumenDelDia(['seAgota'], seccionesDelDia(['seAgota'], { inv }), MIERCOLES, lunes);
  assert.equal(miercoles.tipos.enCero.fecha, '2026-10-26');
  assert.equal(miercoles.tipos.seAgota.fecha, MIERCOLES);
  const s = seccionesDelDia(['enCero'], { inv })[0];
  assert.deepEqual(cambiosDesde(miercoles, s), { desde: '2026-10-26', antes: 0, nuevos: ['A'] });
  const c = armarBoletin({ ...base, usuario: analista, inv, secciones: [s], previo: miercoles, hoy: LUNES });
  assert.match(c.texto, /Nuevo desde el lunes, 26 de octubre: A/);
  assert.equal(cambiosDesde(null, s), null, 'la primera vez no hay con qué comparar');
});

test('pedidos por aprobar y entregas atrasadas', () => {
  const c = correo(analista, ['porAprobar', 'porRecibir'], {
    ctx: {
      porAprobar: [{ id: 9, numero: 3, preparadoPor: 'Carlos', lineas: 12, enviadoDia: '2026-10-27' }],
      porRecibir: [{ pedidoId: 5, numero: 2, proveedor: 'Cementos', pedidoEl: '2026-10-01', esperado: '2026-10-15', diasTarde: 9, pendientes: 4 }],
    },
  });
  assert.equal(c.asunto, 'Por aprobar: 1 pedido y 1 aviso más · Ferretería Ana');
  assert.match(c.texto, /Pedido 3, de Carlos: 12 productos, enviado el 27 de octubre/);
  assert.match(c.texto, /Cementos, pedido 2 del 1 de octubre: debía llegar el 15 de octubre \(9 días hábiles de retraso\)\. Faltan 4 productos/);
});

test('atrasadosDe: un proveedor que ya pasó su tiempo de entrega, en días hábiles', () => {
  const ajustes = leerAjustes({ entregasDias: { Cementos: 5 }, entregas: { Pinturas: 4 } });
  const esperando = [{
    pedidoId: 1, numero: 1, por: 'Ana', terminadoEn: '2026-10-19T15:00:00Z',
    proveedores: [
      { proveedor: 'Cementos', lineas: [{ codigo: 'C1', recibido: null }, { codigo: 'C2', recibido: { cantidad: 3 } }] },
      { proveedor: 'Pinturas', lineas: [{ codigo: 'P1', recibido: null }] },
      { proveedor: 'Tornillos', lineas: [{ codigo: 'T1', recibido: { cantidad: 1 } }] },
    ],
  }];
  const fechaDe = (v) => String(v).slice(0, 10);
  const r = atrasadosDe(esperando, ajustes, MIERCOLES, fechaDe);
  // Cementos: 5 hábiles desde el lunes 19 = lunes 26; el miércoles 28 lleva 2 de retraso.
  // Pinturas: 4 semanas = 20 hábiles, todavía no. Tornillos: ya llegó todo.
  assert.deepEqual(r, [{ pedidoId: 1, numero: 1, por: 'Ana', proveedor: 'Cementos', pedidoEl: '2026-10-19', esperado: '2026-10-26', diasTarde: 2, pendientes: 1 }]);
});

test('el HTML escapa lo que viene de los datos', () => {
  const inv = inventario();
  inv.productos[0].nombre = '<script>alert(1)</script>';
  const c = correo({ nombre: 'Ana <b>', perfil: 'analista' }, ['enCero'], { inv });
  assert.doesNotMatch(c.html, /<script>/);
  assert.match(c.html, /Ana &lt;b&gt;/);
});
