'use strict';

// El panel tiene que mostrar lo último que se registró en Movimientos, con cualquier tipo de
// movimiento y por más veces que se guarde (Jose Manuel, 2026-11-03: después de varios conteos, el
// panel seguía con una fecha y unas existencias viejas mientras Existencias ya estaba al día).

process.env.DATA_DIR = 'memory://';
process.env.SIN_LIMITES = '1';

const test = require('node:test');
const { conCodigo } = require('./codigo');
const assert = require('node:assert/strict');
const db = require('../server/db');
const { crearApp } = require('../server/app');
const { plantillaExport } = require('../server/plantillas');
const { fechaBogota } = require('../server/recordatorios');

let servidor;
let base;

test.before(async () => {
  await db.iniciar();
  servidor = crearApp().listen(0);
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

test.after(async () => {
  servidor.close();
  await db.cerrar();
});

function cliente() {
  let cookie = '';
  async function pedir(metodo, ruta, cuerpo, formulario) {
    const headers = cookie ? { Cookie: cookie } : {};
    let body;
    if (formulario) body = formulario;
    else if (cuerpo !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(cuerpo); }
    const r = await fetch(base + ruta, { method: metodo, headers, body });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const datos = await r.json().catch(() => ({}));
    return { estado: r.status, ...datos };
  }
  return {
    get: (ruta) => pedir('GET', ruta),
    post: (ruta, cuerpo) => pedir('POST', ruta, cuerpo ?? {}),
    put: (ruta, cuerpo) => pedir('PUT', ruta, cuerpo),
    subir: (ruta, archivos) => {
      const fd = new FormData();
      for (const [nombre, buf] of archivos) fd.append('archivos', new Blob([buf]), nombre);
      return pedir('POST', ruta, undefined, fd);
    },
  };
}

const existenciasDe = (inv, codigo) => inv.inventario.productos.find((p) => p.codigo === codigo).existencias;
const productoDe = (inv, codigo) => inv.inventario.productos.find((p) => p.codigo === codigo);

test('una empresa que solo cuenta (sin registrar ventas): lo que baja el conteo cuenta como vendido y el panel lo explica', async () => {
  const leo = cliente();
  assert.equal((await leo.post('/api/cuenta/crear', await conCodigo({ nombre: 'Leo', email: 'leo.conteos@prueba.co', clave: 'clave-segura', empresa: 'Ferretería Conteos' }))).estado, 201);
  const { pedido } = await leo.post('/api/pedidos');
  await leo.post(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: [{ codigo: 'TOR-0610', cantidad: '60' }], tipo: 'real' });
  assert.equal((await leo.subir(`/api/pedidos/${pedido.id}/export`, [['export.xlsx', await plantillaExport()]])).ok, true);
  const antes = await leo.get('/api/inventario');
  assert.equal(productoDe(antes, 'TOR-0610').existencias, 18);

  // La plantilla termina ayer y no se aceptan fechas futuras: un conteo de hoy, sin ventas
  // registradas, que encuentra 6 menos. Lo de varias semanas lo cubre test/saldos.test.js.
  assert.equal((await leo.post('/api/movimientos', { movimientos: [{ codigo: 'TOR-0610', tipo: 'conteo', cantidad: 12, fecha: fechaBogota() }] })).estado, 201);
  const despues = await leo.get('/api/inventario');
  const p = productoDe(despues, 'TOR-0610');
  assert.equal(p.existencias, 12);
  assert.ok(despues.inventario.avisos.some((a) => /se contó como vendida/.test(a) && /6 unidades/.test(a)), 'los 6 que bajó el conteo cuentan como vendidos, y el panel lo explica');
});

test('cada movimiento que se guarda se ve en el panel, aunque el panel ya se haya calculado antes', async () => {
  const ana = cliente();
  const r = await ana.post('/api/cuenta/crear', await conCodigo({ nombre: 'Ana', email: 'ana.dia@prueba.co', clave: 'clave-segura', empresa: 'Ferretería Al Día' }));
  assert.equal(r.estado, 201, r.error);
  const { pedido } = await ana.post('/api/pedidos');
  await ana.post(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: [{ codigo: 'TOR-0610', cantidad: '60' }], tipo: 'real' });
  const exp = await ana.subir(`/api/pedidos/${pedido.id}/export`, [['export.xlsx', await plantillaExport()]]);
  assert.equal(exp.ok, true, JSON.stringify(exp.errores));
  const hoy = fechaBogota();
  assert.equal(existenciasDe(await ana.get('/api/inventario'), 'TOR-0610'), 18);

  // Tres guardados seguidos, con el panel abierto entre uno y otro: conteo, venta y otro conteo.
  const pasos = [
    [{ codigo: 'TOR-0610', tipo: 'conteo', cantidad: 72, fecha: hoy }, 72],
    [{ codigo: 'TOR-0610', tipo: 'venta', cantidad: 2, fecha: hoy }, 70],
    [{ codigo: 'TOR-0610', tipo: 'conteo', cantidad: 40, fecha: hoy }, 40],
  ];
  for (const [mov, esperado] of pasos) {
    const g = await ana.post('/api/movimientos', { movimientos: [mov] });
    assert.equal(g.estado, 201, g.error);
    const inv = await ana.get('/api/inventario');
    assert.equal(existenciasDe(inv, 'TOR-0610'), esperado, `después de ${mov.tipo} ${mov.cantidad}`);
    assert.equal(inv.inventario.fuente.hasta, hoy, 'el panel dice al día hasta el último movimiento');
    assert.equal((await ana.get('/api/existencias/TOR-0610')).existencias, esperado, 'Existencias y el panel dicen lo mismo');
  }

  // Quien entra después por invitación ve el mismo inventario, con lo ya registrado.
  const inv = await ana.post('/api/empresa/invitaciones', { email: 'carla.dia@prueba.co' });
  const token = new URL(inv.enlace).searchParams.get('invitacion');
  const carla = cliente();
  assert.equal((await carla.post('/api/cuenta/crear', await conCodigo({ nombre: 'Carla', email: 'carla.dia@prueba.co', clave: 'clave-segura', invitacion: token }))).estado, 201);
  assert.equal(existenciasDe(await carla.get('/api/inventario'), 'TOR-0610'), 40);
  // Y lo que ella registra lo ve Ana (un operador registra cuando quien administra se lo marca, T18).
  const idCarla = (await carla.get('/api/cuenta/yo')).usuario.id;
  assert.equal((await ana.put(`/api/empresa/miembros/${idCarla}`, { registraMovimientos: true })).estado, 200);
  await carla.post('/api/movimientos', { movimientos: [{ codigo: 'TOR-0610', tipo: 'entrada', cantidad: 10, fecha: hoy }] });
  assert.equal(existenciasDe(await ana.get('/api/inventario'), 'TOR-0610'), 50);
});
