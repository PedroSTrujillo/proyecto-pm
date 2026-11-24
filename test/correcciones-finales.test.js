'use strict';

// Correcciones finales (documento "Correcciones finales SINESC", 2026-11-24): la unidad de tiempo de
// cada área, el rol de quien funda la empresa, el administrador que invita a su gerente y el permiso del
// operador para Proveedores. Base de datos en memoria.

process.env.DATA_DIR = 'memory://';
process.env.SIN_LIMITES = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const { conCodigo } = require('./codigo');
const db = require('../server/db');
const { crearApp } = require('../server/app');
const { borrarDatos } = require('../server/borrar');

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
  async function pedir(metodo, ruta, cuerpo) {
    const h = cookie ? { Cookie: cookie } : {};
    if (cuerpo !== undefined) h['Content-Type'] = 'application/json';
    const r = await fetch(base + ruta, { method: metodo, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { estado: r.status, ...(await r.json().catch(() => ({}))) };
  }
  return { get: (r) => pedir('GET', r), post: (r, c) => pedir('POST', r, c ?? {}), put: (r, c) => pedir('PUT', r, c) };
}

async function cuenta(nombre, email, extra = {}) {
  const c = cliente();
  const r = await c.post('/api/cuenta/crear', await conCodigo({ nombre, email, clave: 'clave-segura', ...extra }));
  assert.equal(r.estado, 201, r.error);
  return { c, usuario: r.usuario };
}

const tokenDe = (inv) => new URL(inv.enlace).searchParams.get('invitacion');

test('cada área guarda su propia unidad de tiempo; la general de Mi cuenta vuelve a valer para todas', async () => {
  const { c } = await cuenta('Uma', 'uma@prueba.co', { empresa: 'Unidades SAS' });
  let u = (await c.put('/api/cuenta/preferencias', { area: 'productos', unidad: 'meses' })).usuario;
  assert.deepEqual(u.preferencias.unidades, { productos: 'meses' });
  assert.equal(u.preferencias.unidad, 'dias', 'la general no cambia (las cuentas nuevas empiezan en días)');
  u = (await c.put('/api/cuenta/preferencias', { area: 'datos', unidad: 'semanas' })).usuario;
  assert.deepEqual(u.preferencias.unidades, { productos: 'meses', datos: 'semanas' });

  assert.equal((await c.put('/api/cuenta/preferencias', { area: 'cocina', unidad: 'dias' })).estado, 400);
  assert.equal((await c.put('/api/cuenta/preferencias', { area: 'panel' })).estado, 400);
  assert.equal((await c.put('/api/cuenta/preferencias', { area: 'panel', unidad: 'años' })).estado, 400);

  // Desde Mi cuenta (sin área) cambia la general y se borran las de cada área.
  u = (await c.put('/api/cuenta/preferencias', { unidad: 'meses' })).usuario;
  assert.equal(u.preferencias.unidad, 'meses');
  assert.deepEqual(u.preferencias.unidades, {});
  // El horizonte sigue siendo uno solo y no toca las áreas.
  await c.put('/api/cuenta/preferencias', { area: 'panel', unidad: 'dias' });
  u = (await c.put('/api/cuenta/preferencias', { horizonte: 8 })).usuario;
  assert.deepEqual(u.preferencias.unidades, { panel: 'dias' });
  assert.equal(u.preferencias.horizonte, 8);
});

test('quien funda la empresa elige ser gerente o administrador; sin elección, gerente', async () => {
  const { usuario: gerente } = await cuenta('Gabo', 'gabo@prueba.co', { empresa: 'Gerencia SAS' });
  assert.equal(gerente.rolEmpresa, 'gerente');
  const { c, usuario: admin } = await cuenta('Alba', 'alba@prueba.co', { empresa: 'Administra SAS', rolFundador: 'administrador' });
  assert.equal(admin.rolEmpresa, 'administrador');
  assert.equal(admin.aprueba, true, 'quien funda aprueba sus pedidos');
  assert.equal((await c.get('/api/empresa')).empresa.tieneGerente, false);
  // Un rol inventado no da nada más que el de siempre.
  const { usuario: otro } = await cuenta('Otto', 'otto@prueba.co', { empresa: 'Otra SAS', rolFundador: 'dueño' });
  assert.equal(otro.rolEmpresa, 'gerente');
});

test('el administrador de una empresa sin gerente invita a uno, y solo puede haber uno', async () => {
  const { c: alma } = await cuenta('Alma', 'alma@prueba.co', { empresa: 'Sin Gerente SAS', rolFundador: 'administrador' });
  const inv = await alma.post('/api/empresa/invitaciones', { rol: 'gerente' });
  assert.equal(inv.estado, 201, inv.error);
  const otra = await alma.post('/api/empresa/invitaciones', { rol: 'gerente' });
  assert.equal(otra.estado, 201, 'mientras nadie la use, puede haber más de un enlace');

  const { c: gil, usuario: g } = await cuenta('Gil', 'gil@prueba.co', { invitacion: tokenDe(inv) });
  assert.equal(g.rolEmpresa, 'gerente');
  assert.equal(g.aprueba, true);
  assert.equal((await alma.get('/api/empresa')).empresa.tieneGerente, true);

  // El segundo enlace ya no sirve, y ya no se invitan más gerentes.
  const tarde = await cliente().post('/api/cuenta/crear', await conCodigo({ nombre: 'Tita', email: 'tita@prueba.co', clave: 'clave-segura', invitacion: tokenDe(otra) }));
  assert.equal(tarde.estado, 409);
  assert.match(tarde.error, /ya tiene gerente/);
  assert.equal((await alma.post('/api/empresa/invitaciones', { rol: 'gerente' })).estado, 409);
  // El gerente no invita a otro gerente: para eso está pasar la gerencia.
  assert.equal((await gil.post('/api/empresa/invitaciones', { rol: 'gerente' })).estado, 403);
  // Y un administrador de una empresa con gerente tampoco.
  const adm = await gil.post('/api/empresa/invitaciones', { rol: 'administrador' });
  const { c: ari } = await cuenta('Ari', 'ari@prueba.co', { invitacion: tokenDe(adm) });
  assert.equal((await ari.post('/api/empresa/invitaciones', { rol: 'gerente' })).estado, 409);
});

test('sin gerente, el último administrador no deja solos a los operadores, y borrar a alguien no nombra gerente', async () => {
  const { c: abel } = await cuenta('Abel', 'abel@prueba.co', { empresa: 'Solo Admin SAS', rolFundador: 'administrador' });
  const inv = await abel.post('/api/empresa/invitaciones', { rol: 'operador' });
  const { c: oto } = await cuenta('Oto', 'oto@prueba.co', { invitacion: tokenDe(inv) });
  const borrar = await abel.post('/api/cuenta/borrar', { confirmacion: 'abel@prueba.co', clave: 'clave-segura' });
  assert.equal(borrar.estado, 409);
  assert.match(borrar.error, /administrador|gerente/);

  // Si se va el operador (por ejemplo, desde la terminal del equipo), nadie pasa a ser gerente.
  await borrarDatos({ email: 'oto@prueba.co', confirmar: true });
  assert.equal((await oto.get('/api/cuenta/yo')).usuario, null);
  assert.equal((await abel.get('/api/cuenta/yo')).usuario.rolEmpresa, 'administrador');
  // Ya solo, sí puede borrar su cuenta.
  assert.equal((await abel.post('/api/cuenta/borrar', { confirmacion: 'abel@prueba.co', clave: 'clave-segura' })).estado, 200);
});

test('un operador maneja Proveedores con la marca de un superior: solo lo de proveedores', async () => {
  const { c: gema } = await cuenta('Gema', 'gema@prueba.co', { empresa: 'Proveedores SAS' });
  const adm = await gema.post('/api/empresa/invitaciones', { rol: 'administrador' });
  const { c: ada } = await cuenta('Ada', 'ada@prueba.co', { invitacion: tokenDe(adm) });
  const op = await gema.post('/api/empresa/invitaciones', { rol: 'operador' });
  const { c: omar, usuario: o } = await cuenta('Omar', 'omar@prueba.co', { invitacion: tokenDe(op) });
  assert.equal(o.manejaProveedores, false);
  assert.equal((await gema.get('/api/cuenta/yo')).usuario.manejaProveedores, true, 'el gerente siempre');
  assert.equal((await ada.get('/api/cuenta/yo')).usuario.manejaProveedores, true, 'el administrador siempre');

  await gema.post('/api/catalogo', { codigo: 'PRV-1', nombre: 'Tornillo' });
  assert.equal((await omar.put('/api/inventario/ajustes', { entregaPorDefectoDias: 9 })).estado, 403);
  assert.equal((await omar.post('/api/catalogo/lote', { filas: [{ codigo: 'PRV-1', multiplo: 12 }] })).estado, 403);

  // Basta con el permiso de uno: aquí lo da el administrador, no el gerente.
  const dado = await ada.put(`/api/empresa/miembros/${o.id}`, { manejaProveedores: true });
  assert.equal(dado.estado, 200, dado.error);
  assert.equal(dado.empresa.miembros.find((m) => m.id === o.id).manejaProveedores, true);
  assert.equal((await omar.get('/api/cuenta/yo')).usuario.manejaProveedores, true, 'se ve en la siguiente petición');

  // Cambia los tiempos y el paquete de los productos, pero no el umbral de "se agota" ni la familia.
  const r = await omar.put('/api/inventario/ajustes', { entregaPorDefectoDias: 9, asignaciones: { 'PRV-1': 'Ferretería' }, semanasAgota: 7 });
  assert.equal(r.estado, 200, r.error);
  assert.equal(r.ajustes.entregaPorDefectoDias, 9);
  assert.equal(r.ajustes.asignaciones['PRV-1'], 'Ferretería');
  assert.notEqual(r.ajustes.semanasAgota, 7, 'lo que no es de proveedores se deja como estaba');
  assert.equal((await omar.post('/api/catalogo/lote', { filas: [{ codigo: 'PRV-1', multiplo: 12, minimo: 24 }] })).estado, 200);
  assert.equal((await omar.post('/api/catalogo/lote', { filas: [{ codigo: 'PRV-1', familia: 'Otra' }] })).estado, 403);
  // Sigue sin abrir pedidos.
  assert.equal((await omar.get('/api/pedidos')).estado, 403);

  // Se quita igual de fácil, y desde ese momento el servidor ya no lo deja.
  await gema.put(`/api/empresa/miembros/${o.id}`, { manejaProveedores: false });
  assert.equal((await omar.put('/api/inventario/ajustes', { entregaPorDefectoDias: 4 })).estado, 403);
});
