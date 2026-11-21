'use strict';

// Cuentas para el equipo (server/cuentas-equipo.js): quién ve la pantalla, qué muestra y cómo se
// borra una cuenta con sus confirmaciones.

process.env.DATA_DIR = 'memory://';
process.env.TEAM_EMAILS = 'equipo@prueba.co,otra.equipo@prueba.co';
process.env.SIN_LIMITES = '1';

const test = require('node:test');
const { conCodigo } = require('./codigo');
const assert = require('node:assert/strict');
const db = require('../server/db');
const { crearApp } = require('../server/app');
const { plantillaExport } = require('../server/plantillas');
const { estadoCuenta, enmascarar, crearCodigos } = require('../server/cuentas-equipo');

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
    subir: (ruta, archivos) => {
      const fd = new FormData();
      for (const [nombre, buf] of archivos) fd.append('archivos', new Blob([buf]), nombre);
      return pedir('POST', ruta, undefined, fd);
    },
  };
}

async function cuenta(nombre, email, extra = {}) {
  const c = cliente();
  const r = await c.post('/api/cuenta/crear', await conCodigo({ nombre, email, clave: 'clave-segura', empresa: `Empresa de ${nombre}`, ...extra }));
  assert.equal(r.estado, 201, r.error);
  return { c, usuario: r.usuario };
}

async function conInventario(c) {
  const { pedido } = await c.post('/api/pedidos');
  await c.post(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: [{ codigo: 'TOR-0610', cantidad: '60' }], tipo: 'real' });
  const exp = await c.subir(`/api/pedidos/${pedido.id}/export`, [['export.xlsx', await plantillaExport()]]);
  assert.equal(exp.ok, true, JSON.stringify(exp.errores));
}

test('estado de una cuenta: sin datos, activa, en riesgo, inactiva y equipo', () => {
  const ahora = Date.parse('2026-11-03T12:00:00Z');
  const hace = (dias) => new Date(ahora - dias * 86400000).toISOString();
  const con = { archivos: 1, pedidos: 0, movimientos: 0 };
  assert.equal(estadoCuenta({ rol: 'usuario', ultimaActividad: hace(1), archivos: 0, pedidos: 0, movimientos: 0 }, ahora), 'sin_datos');
  assert.equal(estadoCuenta({ rol: 'usuario', ultimaActividad: hace(3), ...con }, ahora), 'activa');
  assert.equal(estadoCuenta({ rol: 'usuario', ultimaActividad: hace(12), ...con }, ahora), 'en_riesgo');
  assert.equal(estadoCuenta({ rol: 'usuario', ultimaActividad: hace(45), ...con }, ahora), 'inactiva');
  assert.equal(estadoCuenta({ rol: 'equipo', ultimaActividad: null, archivos: 0, pedidos: 0, movimientos: 0 }, ahora), 'equipo');
  assert.equal(enmascarar('cmueces81@gmail.com'), 'cmu•••@gmail.com');
});

test('solo el equipo ve las cuentas; muestra actividad y conteos, no el inventario de nadie', async () => {
  const { c: probador } = await cuenta('Pía', 'pia@prueba.co');
  await conInventario(probador);
  assert.equal((await probador.get('/api/equipo/cuentas')).estado, 403);
  assert.equal((await cliente().get('/api/equipo/cuentas')).estado, 401);

  const { c: eq } = await cuenta('Equipo', 'equipo@prueba.co');
  const { usuario: nueva } = await cuenta('Nueva', 'nueva@prueba.co');
  const r = await eq.get('/api/equipo/cuentas');
  assert.equal(r.estado, 200);
  const pia = r.cuentas.find((x) => x.email === 'pia@prueba.co');
  assert.equal(pia.estado, 'activa');
  assert.equal(pia.archivos, 1);
  assert.equal(pia.pedidos, 1);
  assert.equal(pia.empresa.nombre, 'Empresa de Pía');
  assert.equal(r.cuentas.find((x) => x.id === nueva.id).estado, 'sin_datos');
  assert.equal(r.cuentas.find((x) => x.email === 'equipo@prueba.co').estado, 'equipo');
  assert.equal(r.resumen.equipo, 1);

  const d = await eq.get(`/api/equipo/cuentas/${pia.id}`);
  assert.equal(d.pedidos.length, 1);
  assert.equal(d.pedidos[0].numero, 1);
  assert.ok(d.actividad.some((e) => e.tipo === 'archivo_subido'));
  const texto = JSON.stringify(d);
  assert.ok(!/TOR-0610|aceptacion|lista_final|reporte/.test(texto), 'no trae productos, listas ni la aceptación');
  assert.equal((await eq.get('/api/equipo/cuentas/999999')).estado, 404);
  assert.equal((await eq.get('/api/equipo/cuentas/abc')).estado, 404);
});

test('borrar una cuenta: pide el correo exacto y la contraseña de quien borra; nunca al equipo ni a sí mismo', async () => {
  const { c: eq, usuario: yo } = await cuenta('Otra del equipo', 'otra.equipo@prueba.co');
  const { usuario: zoe, c: z } = await cuenta('Zoe', 'zoe@prueba.co');
  await conInventario(z);

  const previa = await eq.get(`/api/equipo/cuentas/${zoe.id}/borrar`);
  assert.equal(previa.estado, 200);
  assert.deepEqual([previa.pedidos, previa.archivos, previa.impedimento], [1, 1, null]);
  assert.equal(previa.empresa.sigue, false);
  assert.ok(previa.empresa.productos > 0, 'avisa que la empresa se va con su catálogo');

  const malCorreo = await eq.post(`/api/equipo/cuentas/${zoe.id}/borrar`, { confirmacion: 'zoe@otro.co', clave: 'clave-segura' });
  assert.equal(malCorreo.estado, 400);
  const malaClave = await eq.post(`/api/equipo/cuentas/${zoe.id}/borrar`, { confirmacion: 'zoe@prueba.co', clave: 'otra-clave' });
  assert.equal(malaClave.estado, 400);
  assert.match(malaClave.error, /contraseña/);
  assert.ok(await db.uno('SELECT id FROM usuarios WHERE id = $1', [zoe.id]), 'sin las dos confirmaciones no se borra nada');

  const equipo = await db.uno("SELECT id FROM usuarios WHERE email = 'equipo@prueba.co'");
  assert.equal((await eq.post(`/api/equipo/cuentas/${equipo.id}/borrar`, { confirmacion: 'equipo@prueba.co', clave: 'clave-segura' })).estado, 403);
  assert.equal((await eq.post(`/api/equipo/cuentas/${yo.id}/borrar`, { confirmacion: 'otra.equipo@prueba.co', clave: 'clave-segura' })).estado, 403);
  assert.ok((await eq.get(`/api/equipo/cuentas/${yo.id}/borrar`)).impedimento);

  const r = await eq.post(`/api/equipo/cuentas/${zoe.id}/borrar`, { confirmacion: '  ZOE@prueba.co ', clave: 'clave-segura' });
  assert.equal(r.estado, 200, r.error);
  assert.equal(r.borrada, 'zoe•••@prueba.co');
  assert.equal(await db.uno('SELECT id FROM usuarios WHERE id = $1', [zoe.id]), null);
  assert.equal(await db.uno('SELECT id FROM empresas WHERE id = $1', [zoe.empresa.id]), null);
  const registro = await db.uno("SELECT detalle FROM eventos WHERE usuario_id = $1 AND tipo = 'cuenta_borrada'", [yo.id]);
  assert.equal(registro.detalle.cuenta, 'zoe•••@prueba.co', 'queda quién borró qué, sin el correo completo');
  assert.equal((await eq.post(`/api/equipo/cuentas/${zoe.id}/borrar`, { confirmacion: 'zoe@prueba.co', clave: 'clave-segura' })).estado, 404);
});

test('borrar a una persona de una empresa compartida no le quita el inventario a las demás', async () => {
  const { c: eq } = await cuenta('Equipo 3', 'equipo3@prueba.co');
  await db.query("UPDATE usuarios SET rol = 'equipo', es_equipo = true WHERE email = 'equipo3@prueba.co'");
  const { c: ana, usuario: anaU } = await cuenta('Ana', 'ana@prueba.co');
  await conInventario(ana);
  const inv = await ana.post('/api/empresa/invitaciones', { email: 'carla@prueba.co' });
  const token = new URL(inv.enlace).searchParams.get('invitacion');
  const { c: carla, usuario: carlaU } = await cuenta('Carla', 'carla@prueba.co', { invitacion: token, empresa: undefined });
  assert.equal(carlaU.empresa.admin, false);
  const antes = await carla.get('/api/inventario');
  assert.ok(antes.inventario || antes.productos || antes.resumen, 'Carla ve el inventario de la empresa');

  const lista = await eq.get('/api/equipo/cuentas');
  assert.deepEqual(lista.cuentas.find((x) => x.id === anaU.id).empresa.invitaciones, { creadas: 1, aceptadas: 1 });
  assert.ok(lista.resumen.loop.aceptadas >= 1, 'el loop cuenta la invitación aceptada');
  assert.ok(lista.resumen.loop.empresasQueInvitaron >= 1);

  const previa = await eq.get(`/api/equipo/cuentas/${anaU.id}/borrar`);
  assert.equal(previa.empresa.sigue, true);
  assert.equal(previa.empresa.recibe, 'Carla');
  assert.equal(previa.empresa.nuevoAdmin, true);
  assert.equal(previa.archivosQuedan, 1);
  assert.equal(previa.archivos, 0);

  const r = await eq.post(`/api/equipo/cuentas/${anaU.id}/borrar`, { confirmacion: 'ana@prueba.co', clave: 'clave-segura' });
  assert.equal(r.estado, 200, r.error);
  const c = await db.uno('SELECT admin_empresa, empresa_id, perfil, aprueba FROM usuarios WHERE id = $1', [carlaU.id]);
  assert.equal(c.admin_empresa, true, 'la empresa no queda sin quien la administre');
  assert.deepEqual([c.perfil, c.aprueba], ['analista', true], 'y el ascenso la deja como gerente');
  assert.equal(c.empresa_id, anaU.empresa.id);
  assert.equal((await db.uno('SELECT count(*)::int AS n FROM exports WHERE empresa_id = $1', [c.empresa_id])).n > 0, true, 'el archivo de la empresa se queda');
  assert.equal((await db.uno('SELECT count(*)::int AS n FROM archivos WHERE usuario_id = $1', [carlaU.id])).n, 1);
  const despues = await carla.get('/api/inventario');
  assert.equal(despues.estado, 200);
  assert.deepEqual(Object.keys(despues).sort(), Object.keys(antes).sort());
});

test('cerrar las sesiones de una cuenta la deja afuera', async () => {
  const { c: eq } = await cuenta('Equipo 4', 'equipo4@prueba.co');
  await db.query("UPDATE usuarios SET rol = 'equipo', es_equipo = true WHERE email = 'equipo4@prueba.co'");
  const { c: leo, usuario } = await cuenta('Leo', 'leo@prueba.co');
  assert.equal((await leo.get('/api/cuenta/yo')).usuario.email, 'leo@prueba.co');
  const r = await eq.post(`/api/equipo/cuentas/${usuario.id}/cerrar-sesiones`);
  assert.equal(r.cerradas, 1);
  assert.equal((await leo.get('/api/cuenta/yo')).usuario, null);
});

test('crear una cuenta pide un código de acceso de un solo uso, y el equipo los genera y los ve', async () => {
  const { c: eq } = await cuenta('Equipo 5', 'equipo5@prueba.co');
  await db.query("UPDATE usuarios SET rol = 'equipo', es_equipo = true WHERE email = 'equipo5@prueba.co'");
  const { c: normal } = await cuenta('Normal', 'normal-codigo@prueba.co');
  assert.equal((await normal.get('/api/equipo/cuentas/codigos')).estado, 403);

  const datos = { nombre: 'Rita', email: 'rita@prueba.co', clave: 'clave-segura', empresa: 'Rita SAS' };
  assert.equal((await cliente().post('/api/cuenta/crear', datos)).estado, 400, 'sin código');
  assert.equal((await cliente().post('/api/cuenta/crear', { ...datos, codigo: 'ZZZZ-ZZZZ' })).estado, 400, 'código inventado');

  const { nuevos } = await eq.post('/api/equipo/cuentas/codigos', { cantidad: 2, nota: 'Rita' });
  assert.equal(nuevos.length, 2);
  assert.match(nuevos[0], /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal((await eq.post('/api/equipo/cuentas/codigos', { cantidad: 99 })).estado, 400);

  const rita = await cliente().post('/api/cuenta/crear', { ...datos, codigo: nuevos[0].toLowerCase() });
  assert.equal(rita.estado, 201, 'se acepta en minúsculas');
  // Dictado por teléfono: sin guion o con un espacio también vale.
  const [otro] = await crearCodigos(1, 'dictado', null);
  const sinGuion = await cliente().post('/api/cuenta/crear', { ...datos, email: 'rita3@prueba.co', codigo: ` ${otro.replace('-', ' ').toLowerCase()} ` });
  assert.equal(sinGuion.estado, 201, 'con espacio en vez de guion');
  assert.equal((await cliente().post('/api/cuenta/crear', { ...datos, email: 'rita2@prueba.co', codigo: nuevos[0] })).estado, 400, 'ya se usó');
  assert.equal((await db.uno('SELECT 1 AS x FROM usuarios WHERE email = $1', ['rita2@prueba.co'])), null);

  // Un formulario que falla no gasta el código: el segundo sigue disponible tras una invitación vencida.
  const { codigos } = await eq.get('/api/equipo/cuentas/codigos');
  const usado = codigos.find((x) => x.codigo === nuevos[0]);
  assert.equal(usado.usadoPor.nombre, 'Rita');
  assert.equal(usado.usadoPor.email, 'rit•••@prueba.co');
  assert.equal(codigos.find((x) => x.codigo === nuevos[1]).usadoEn, null);
  const conInvitacionMala = await cliente().post('/api/cuenta/crear', { nombre: 'Ivo', email: 'ivo@prueba.co', clave: 'clave-segura', invitacion: 'no-existe', codigo: nuevos[1] });
  assert.equal(conInvitacionMala.estado, 400);
  assert.equal((await cliente().post('/api/cuenta/crear', { nombre: 'Ivo', email: 'ivo@prueba.co', clave: 'clave-segura', empresa: 'Ivo SAS', codigo: nuevos[1] })).estado, 201, 'el código no se perdió');
});

test('suspender una cuenta la deja afuera sin borrar nada, y al reactivarla vuelve', async () => {
  const { c: eq } = await cuenta('Equipo 6', 'equipo6@prueba.co');
  await db.query("UPDATE usuarios SET rol = 'equipo', es_equipo = true WHERE email = 'equipo6@prueba.co'");
  const { c: ana, usuario } = await cuenta('Ana Susp', 'ana-susp@prueba.co');
  await conInventario(ana);
  assert.equal((await ana.post(`/api/equipo/cuentas/${usuario.id}/suspender`)).estado, 403, 'una cuenta normal no suspende');
  const yo = (await eq.get('/api/cuenta/yo')).usuario;
  assert.equal((await eq.post(`/api/equipo/cuentas/${yo.id}/suspender`)).estado, 403, 'ni se suspende a sí mismo');

  assert.equal((await eq.post(`/api/equipo/cuentas/${usuario.id}/suspender`)).suspendida, true);
  assert.equal((await ana.get('/api/cuenta/yo')).usuario, null, 'la sesión abierta se cae');
  const entrar = await cliente().post('/api/cuenta/entrar', { email: 'ana-susp@prueba.co', clave: 'clave-segura' });
  assert.equal(entrar.estado, 403);
  assert.match(entrar.error, /suspendida/);
  assert.equal((await cliente().post('/api/cuenta/entrar', { email: 'ana-susp@prueba.co', clave: 'otra-clave' })).estado, 401, 'con la clave mala no se revela nada');
  const lista = await eq.get('/api/equipo/cuentas');
  assert.ok(lista.cuentas.find((x) => x.id === usuario.id).suspendidaEn);

  assert.equal((await eq.post(`/api/equipo/cuentas/${usuario.id}/reactivar`)).suspendida, false);
  const otra = cliente();
  assert.equal((await otra.post('/api/cuenta/entrar', { email: 'ana-susp@prueba.co', clave: 'clave-segura' })).estado, 200);
  assert.equal((await otra.get('/api/inventario')).estado, 200, 'sus datos siguen');
  const eventos = await db.query("SELECT tipo, detalle FROM eventos WHERE tipo IN ('cuenta_suspendida', 'cuenta_reactivada') ORDER BY id");
  assert.deepEqual(eventos.map((e) => e.tipo), ['cuenta_suspendida', 'cuenta_reactivada']);
  assert.equal(eventos[0].detalle.cuenta, 'ana•••@prueba.co');
});
