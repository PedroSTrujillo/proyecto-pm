'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { armarBoletin, resumenDelDia, cambiosDesde, alcance } = require('../server/boletin-correo');

const producto = (codigo, estado, existencias, semanas, sugerido = null) => ({ codigo, nombre: `Producto ${codigo}`, estado, existencias, semanas, sugerido });

function inventario() {
  const productos = [producto('A', 'agota', 0, 0, 30), producto('B', 'agota', 2, 1.5, 12), producto('C', 'pide', 8, 3, 20), producto('D', 'normal', 50, 6), producto('E', 'sobra', 400, 40)];
  return {
    fuente: { hasta: '2026-10-27' },
    resumen: { productos: 5, seAgotan: 2, enCero: 1, pideYa: 1, sobran: 1, dineroQuieto: 2500000 },
    proveedores: [{ nombre: 'Tornillería Central', entrega: 2, pideYa: 1, productos: 3 }],
    productos,
  };
}

const base = { empresa: 'Ferretería Ana', hoy: '2026-10-28', url: 'https://app.sinesc.co', baja: 'https://app.sinesc.co/api/boletin/baja?u=1&f=x' };

test('alcance: el mismo número dicho en días, semanas o meses', () => {
  assert.equal(alcance(2, 'dias'), '14 días');
  assert.equal(alcance(2, 'semanas'), '2 semanas');
  assert.equal(alcance(13, 'meses'), '3 meses');
  assert.equal(alcance(1, 'meses'), 'menos de medio mes');
  assert.equal(alcance(0.3, 'semanas'), '2 días', 'menos de una semana siempre se dice en días');
  assert.equal(alcance(0, 'semanas'), '0 días');
});

test('el analista recibe el detalle: sugeridos, proveedores y dinero quieto', () => {
  const c = armarBoletin({ ...base, usuario: { nombre: 'Ana', perfil: 'analista', unidad: 'semanas' }, inv: inventario() });
  assert.match(c.asunto, /Ferretería Ana: 1 en cero y 1 por agotarse/);
  assert.match(c.texto, /Sugerido: 30/);
  assert.match(c.texto, /Tornillería Central: 1 producto/);
  assert.match(c.texto, /Dinero quieto/);
  assert.match(c.texto, /\/panel\?desde=boletin/);
  assert.match(c.html, /Dejar de recibirlo/);
});

test('el operador recibe las métricas gruesas, en su unidad, y el aviso si ayer no registró nada', () => {
  const c = armarBoletin({ ...base, usuario: { nombre: 'Carla', perfil: 'operador', unidad: 'dias' }, inv: inventario(), movimientos: { ayer: 0, usaMovimientos: true } });
  assert.doesNotMatch(c.texto, /Sugerido/);
  assert.doesNotMatch(c.texto, /Dinero quieto/);
  assert.doesNotMatch(c.html, /Sugerido/);
  assert.match(c.texto, /alcanza para 11 días/);
  assert.match(c.texto, /Ayer no se registraron movimientos/);
  assert.match(c.texto, /\/movimientos\?desde=boletin/);
});

test('qué cambió desde ayer: lo que quedó en cero y lo que empezó a agotarse', () => {
  const hoy = resumenDelDia(inventario());
  assert.deepEqual(hoy.agotados, ['A']);
  assert.deepEqual(hoy.porAgotarse, ['A', 'B', 'C']);
  assert.equal(cambiosDesde(null, hoy), null);
  const c = cambiosDesde({ agotados: [], porAgotarse: ['A', 'C'] }, hoy);
  assert.deepEqual(c, { nuevosEnCero: ['A'], nuevosPorAgotarse: ['B'] });
});

test('el HTML escapa lo que viene de los datos', () => {
  const inv = inventario();
  inv.productos[0].nombre = '<script>alert(1)</script>';
  const c = armarBoletin({ ...base, usuario: { nombre: 'Ana <b>', perfil: 'analista' }, inv });
  assert.doesNotMatch(c.html, /<script>/);
  assert.match(c.html, /Ana &lt;b&gt;/);
});
