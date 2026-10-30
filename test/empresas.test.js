'use strict';

// Alpha 0.2 de punta a punta (docs/PLAN_EMPRESAS_INVENTARIO.md): empresas e invitaciones,
// perfiles, horizonte, movimientos del día y boletín diario. Base de datos en memoria.

process.env.DATA_DIR = 'memory://';
process.env.TEAM_EMAILS = 'equipo@prueba.co';
process.env.SIN_LIMITES = '1';
process.env.BREVO_API_KEY = 'clave-de-prueba';
process.env.CORREO_REMITENTE = 'avisos@prueba.co';
process.env.CRON_SECRET = 'secreto-cron';
process.env.BOLETIN_SECRETO = 'secreto-boletin';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../server/db');
const { crearApp } = require('../server/app');
const { plantillaExport } = require('../server/plantillas');
const { hashClave } = require('../server/cuentas');
const { fechaBogota } = require('../server/recordatorios');

// Los correos a Brevo no salen: se guardan aquí. Lo demás (las llamadas a la app) va normal.
const correos = [];
const fetchReal = global.fetch;
global.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.brevo.com')) {
    correos.push(JSON.parse(init.body));
    return new Response('{}', { status: 201 });
  }
  return fetchReal(url, init);
};

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
  async function pedir(metodo, ruta, cuerpo, formulario, headers = {}) {
    const h = { ...headers, ...(cookie ? { Cookie: cookie } : {}) };
    let body;
    if (formulario) body = formulario;
    else if (cuerpo !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(cuerpo); }
    const r = await fetchReal(base + ruta, { method: metodo, headers: h, body });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const datos = await r.json().catch(() => ({}));
    return { estado: r.status, ...datos };
  }
  return {
    get: (ruta, headers) => pedir('GET', ruta, undefined, undefined, headers),
    post: (ruta, cuerpo) => pedir('POST', ruta, cuerpo ?? {}),
    put: (ruta, cuerpo) => pedir('PUT', ruta, cuerpo),
    del: (ruta) => pedir('DELETE', ruta),
    subir: (ruta, archivos) => {
      const fd = new FormData();
      for (const [nombre, buf] of archivos) fd.append('archivos', new Blob([buf]), nombre);
      return pedir('POST', ruta, undefined, fd);
    },
  };
}

async function cuenta(nombre, email, extra = {}) {
  const c = cliente();
  const r = await c.post('/api/cuenta/crear', { nombre, email, clave: 'clave-segura', ...extra });
  assert.equal(r.estado, 201, r.error);
  return { c, usuario: r.usuario };
}

// Un probador solo sube su inventario después de su primera lista inicial (regla de la prueba).
async function conInventario(c) {
  const { pedido } = await c.post('/api/pedidos');
  const r = await c.post(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: [{ codigo: 'TOR-0610', cantidad: '60' }], tipo: 'real' });
  assert.equal(r.estado, 200, r.error);
  const exp = await c.subir(`/api/pedidos/${pedido.id}/export`, [['export.xlsx', await plantillaExport()]]);
  assert.equal(exp.ok, true, JSON.stringify(exp.errores));
  return pedido.id;
}

const hoy = fechaBogota();

test('los usuarios de antes de las empresas quedan cada uno con su empresa vacía, una sola vez', async () => {
  const u = await db.uno("INSERT INTO usuarios (email, nombre, clave_hash, inventario) VALUES ('viejo@prueba.co', 'Viejo', $1, '{\"cadaCuanto\": 3}'::jsonb) RETURNING id", [hashClave('clave-segura')]);
  const x = await db.uno("INSERT INTO exports (usuario_id, estado) VALUES ($1, 'error') RETURNING id", [u.id]);
  for (let vuelta = 0; vuelta < 2; vuelta++) for (const sql of db.ESQUEMA) await db.query(sql);
  const empresas = await db.query('SELECT * FROM empresas WHERE fundador_id = $1', [u.id]);
  assert.equal(empresas.length, 1);
  assert.equal(empresas[0].vacia, true);
  assert.equal(empresas[0].inventario.cadaCuanto, 3, 'los ajustes pasan a la empresa');
  const yo = await db.uno('SELECT empresa_id, admin_empresa FROM usuarios WHERE id = $1', [u.id]);
  assert.equal(yo.empresa_id, empresas[0].id);
  assert.equal(yo.admin_empresa, true);
  assert.equal((await db.uno('SELECT empresa_id FROM exports WHERE id = $1', [x.id])).empresa_id, empresas[0].id);

  // Con la empresa vacía entra igual, pero no puede invitar hasta ponerle nombre.
  const c = cliente();
  const r = await c.post('/api/cuenta/entrar', { email: 'viejo@prueba.co', clave: 'clave-segura' });
  assert.equal(r.usuario.empresa.vacia, true);
  assert.equal(r.usuario.perfil, 'analista', 'los usuarios de antes ven lo mismo que veían');
  assert.equal((await c.post('/api/empresa/invitaciones', {})).estado, 400);
  assert.equal((await c.put('/api/empresa', { nombre: 'Ferretería Vieja' })).empresa.vacia, false);
  assert.equal((await c.post('/api/empresa/invitaciones', {})).estado, 201);
});

test('una cuenta nueva siempre entra a una empresa: la que crea o la de su invitación', async () => {
  const sin = await cliente().post('/api/cuenta/crear', { nombre: 'Sin', email: 'sin@prueba.co', clave: 'clave-segura' });
  assert.equal(sin.estado, 400);
  assert.match(sin.error, /nombre de su empresa/);

  const { c: ana, usuario } = await cuenta('Ana', 'ana@prueba.co', { empresa: 'Ferretería Ana', perfil: 'operador', boletin: true });
  assert.deepEqual({ ...usuario.empresa, id: undefined }, { id: undefined, nombre: 'Ferretería Ana', vacia: false, admin: true });
  assert.equal(usuario.perfil, 'operador');
  assert.equal(usuario.boletin, true);

  const inv = await ana.post('/api/empresa/invitaciones', { email: 'carla@prueba.co' });
  assert.equal(inv.estado, 201);
  assert.equal(inv.enviado, true, 'con correo configurado, la invitación sale por correo');
  const token = new URL(inv.enlace).searchParams.get('invitacion');
  assert.equal((await cliente().get(`/api/empresa/invitaciones/${token}`)).empresa, 'Ferretería Ana');

  const otroCorreo = await cliente().post('/api/cuenta/crear', { nombre: 'Intrusa', email: 'otra@prueba.co', clave: 'clave-segura', invitacion: token });
  assert.equal(otroCorreo.estado, 400);
  const { usuario: carla } = await cuenta('Carla', 'carla@prueba.co', { invitacion: token });
  assert.equal(carla.empresa.id, usuario.empresa.id);
  assert.equal(carla.empresa.admin, false);
  const otraVez = await cliente().post('/api/cuenta/crear', { nombre: 'Carla 2', email: 'carla2@prueba.co', clave: 'clave-segura', invitacion: token });
  assert.equal(otraVez.estado, 400, 'una invitación sirve una sola vez');

  const { empresa } = await ana.get('/api/empresa');
  assert.deepEqual(empresa.miembros.map((m) => m.nombre), ['Ana', 'Carla']);
});

test('el inventario es de la empresa; los pedidos siguen siendo de cada persona', async () => {
  const ana = cliente();
  await ana.post('/api/cuenta/entrar', { email: 'ana@prueba.co', clave: 'clave-segura' });
  await ana.put('/api/cuenta/perfil', { perfil: 'analista' });
  await conInventario(ana);
  const carla = cliente();
  await carla.post('/api/cuenta/entrar', { email: 'carla@prueba.co', clave: 'clave-segura' });
  const deAna = await ana.get('/api/inventario');
  const deCarla = await carla.get('/api/inventario');
  assert.ok(deAna.inventario);
  assert.equal(deCarla.inventario.fuente.exportId, deAna.inventario.fuente.exportId);
  assert.equal((await carla.get('/api/pedidos')).pedidos.length, 0);
  assert.equal((await carla.get('/api/inventario/cargas')).cargas[0].subidoPor, 'Ana');

  // Los ajustes también son de la empresa.
  await carla.put('/api/inventario/ajustes', { cadaCuanto: 6 });
  assert.equal((await ana.get('/api/inventario')).inventario.ajustes.cadaCuanto, 6);

  // Otra empresa no ve nada.
  const { c: bob } = await cuenta('Bob', 'bob@prueba.co', { empresa: 'Bob y Cía' });
  assert.equal((await bob.get('/api/inventario')).inventario, null);
  assert.equal((await bob.get('/api/inventario/cargas')).cargas.length, 0);
});

test('el operador ve las métricas gruesas; el analista, el detalle', async () => {
  const ana = cliente();
  await ana.post('/api/cuenta/entrar', { email: 'ana@prueba.co', clave: 'clave-segura' });
  await ana.put('/api/cuenta/perfil', { perfil: 'analista' });
  const completo = (await ana.get('/api/inventario')).inventario;
  assert.equal(completo.vista, 'analista');
  assert.ok(completo.productos.some((p) => p.pronostico));
  assert.ok(completo.grafico);

  assert.equal((await ana.put('/api/cuenta/perfil', { perfil: 'jefe' })).estado, 400);
  assert.equal((await ana.put('/api/cuenta/perfil', { perfil: 'operador' })).usuario.perfil, 'operador');
  const r = await ana.get('/api/inventario');
  assert.equal(r.perfil, 'operador');
  const op = r.inventario;
  assert.equal(op.vista, 'operador');
  assert.equal(op.grafico, null);
  assert.equal(op.resumen.dineroQuieto, null);
  assert.equal(op.resumen.acierto, null);
  assert.equal(op.resumen.seAgotan, completo.resumen.seAgotan, 'los conteos son los mismos');
  for (const p of op.productos) {
    for (const campo of ['riesgo', 'sugerido', 'detalleSugerido', 'minimo', 'maximo', 'pronostico', 'serie', 'ventaHorizonte', 'quieto']) assert.equal(p[campo], null, `${p.codigo}.${campo}`);
  }
  assert.deepEqual(op.productos.map((p) => [p.codigo, p.existencias, p.estado]), completo.productos.map((p) => [p.codigo, p.existencias, p.estado]));
  await ana.put('/api/cuenta/perfil', { perfil: 'analista' });
});

test('el horizonte y la unidad de tiempo se eligen; el cálculo sigue en semanas', async () => {
  const ana = cliente();
  await ana.post('/api/cuenta/entrar', { email: 'ana@prueba.co', clave: 'clave-segura' });
  assert.equal((await ana.put('/api/cuenta/preferencias', { unidad: 'años' })).estado, 400);
  assert.equal((await ana.put('/api/cuenta/preferencias', { horizonte: 40 })).estado, 400);
  const r = await ana.put('/api/cuenta/preferencias', { unidad: 'dias', horizonte: 2 });
  assert.equal(r.usuario.preferencias.unidad, 'dias');
  assert.equal(r.usuario.preferencias.horizonte, 2);

  const corto = (await ana.get('/api/inventario')).inventario;
  const largo = (await ana.get('/api/inventario?horizonte=12')).inventario;
  assert.equal(corto.horizonte, 2);
  assert.equal(largo.horizonte, 12);
  assert.equal(largo.grafico.pronostico.length, 12, 'el gráfico se alarga con el horizonte');
  assert.equal(corto.grafico.pronostico.length, 8, 'y nunca baja de 8 semanas');
  const p = corto.productos.find((x) => x.ventaHorizonte && x.ventaHorizonte.media > 1);
  const q = largo.productos.find((x) => x.codigo === p.codigo);
  const veces = q.ventaHorizonte.media / p.ventaHorizonte.media;
  assert.ok(veces > 4 && veces < 8, `12 semanas venden cerca de 6 veces lo de 2 (salió ${veces})`);
  assert.deepEqual(corto.productos.map((x) => x.semanas), largo.productos.map((x) => x.semanas), 'las semanas de inventario no cambian');
  await ana.put('/api/cuenta/preferencias', { unidad: 'semanas', horizonte: 4 });
});

test('movimientos del día: catálogo, todo o nada, existencias, inventario al día y kardex', async () => {
  const ana = cliente();
  await ana.post('/api/cuenta/entrar', { email: 'ana@prueba.co', clave: 'clave-segura' });
  const cat = await ana.get('/api/catalogo');
  assert.equal(cat.total, 8, 'el catálogo se llena con el archivo de la empresa');
  assert.equal((await ana.get('/api/catalogo?q=tornillo')).productos[0].codigo, 'TOR-0610');

  const malos = await ana.post('/api/movimientos', {
    movimientos: [
      { codigo: 'TOR-0610', tipo: 'venta', cantidad: '5', fecha: hoy },
      { codigo: 'NUEVO-1', tipo: 'entrada', cantidad: '3' },
      { codigo: 'LIJ-0120', tipo: 'venta', cantidad: 'diez' },
      { codigo: 'LIJ-0120', tipo: 'venta', cantidad: '1', fecha: '2999-01-01' },
    ],
  });
  assert.equal(malos.estado, 400);
  assert.deepEqual(malos.errores.map((e) => e.split(':')[0]), ['Fila 2', 'Fila 3', 'Fila 4']);
  assert.deepEqual(malos.faltan, ['NUEVO-1']);
  assert.equal((await db.uno('SELECT count(*)::int AS n FROM movimientos')).n, 0, 'con una fila mala no se guarda ninguna');

  assert.equal((await ana.post('/api/catalogo', { codigo: 'NUEVO-1', nombre: 'Producto nuevo' })).estado, 201);
  assert.equal((await ana.post('/api/catalogo', { codigo: 'nuevo-1', nombre: 'Repetido' })).estado, 409);
  const ok = await ana.post('/api/movimientos', {
    movimientos: [
      { codigo: 'TOR-0610', tipo: 'venta', cantidad: '5', fecha: hoy },
      { codigo: 'LIJ-0120', tipo: 'entrada', cantidad: '10,5', fecha: hoy },
      { codigo: 'NUEVO-1', tipo: 'entrada', cantidad: 3, fecha: hoy },
    ],
  });
  assert.equal(ok.estado, 201, ok.error);
  assert.equal(ok.guardados, 3);

  const ex = await ana.get('/api/existencias');
  const de = (c) => ex.productos.find((p) => p.codigo === c).existencias;
  assert.equal(de('TOR-0610'), 13);
  assert.equal(de('LIJ-0120'), 160.5);
  assert.equal(de('NUEVO-1'), 3);
  assert.equal(ex.movimientos, 3);

  const inv = (await ana.get('/api/inventario')).inventario;
  assert.equal(inv.fuente.origen, 'movimientos');
  assert.equal(inv.fuente.movimientos, 3);
  assert.equal(inv.fuente.hasta, hoy);
  assert.equal(inv.productos.find((p) => p.codigo === 'TOR-0610').existencias, 13);
  await ana.get('/api/inventario');
  const calculados = async () => (await db.uno("SELECT count(*)::int AS n FROM exports WHERE origen = 'movimientos'")).n;
  assert.equal(await calculados(), 1, 'sin movimientos nuevos no se recalcula');

  // Un pedido toma el inventario al día: desde ahí ese reporte queda fijo.
  const { pedido } = await ana.post('/api/pedidos');
  await ana.post(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: [{ codigo: 'TOR-0610', cantidad: '10' }], tipo: 'simulado' });
  const usado = await ana.post(`/api/pedidos/${pedido.id}/export/usar-ultimo`);
  assert.equal(usado.exportId, inv.fuente.exportId);
  const antes = (await ana.get(`/api/pedidos/${pedido.id}/reporte`)).reporte.filas.find((f) => f.codigo === 'TOR-0610').existencias;
  await ana.post('/api/movimientos', { movimientos: [{ codigo: 'TOR-0610', tipo: 'venta', cantidad: 2 }] });
  assert.equal((await ana.get('/api/inventario')).inventario.productos.find((p) => p.codigo === 'TOR-0610').existencias, 11);
  assert.equal(await calculados(), 2, 'el inventario que usa un pedido no se reescribe');
  assert.equal((await ana.get(`/api/pedidos/${pedido.id}/reporte`)).reporte.filas.find((f) => f.codigo === 'TOR-0610').existencias, antes);

  // Kardex y anular.
  const k = await ana.get('/api/existencias/TOR-0610');
  assert.equal(k.inicial.existencias, 18);
  assert.equal(k.existencias, 11);
  assert.deepEqual(k.filas.map((f) => f.saldo), [11, 13]);
  const { movimientos } = await ana.get('/api/movimientos?codigo=TOR-0610');
  const { c: bob } = await cuenta('Bob 2', 'bob2@prueba.co', { empresa: 'Otra' });
  assert.equal((await bob.post(`/api/movimientos/${movimientos[0].id}/anular`)).estado, 404, 'otra empresa no toca estos movimientos');
  assert.equal((await bob.get('/api/existencias')).productos.length, 0);
  assert.equal((await ana.post(`/api/movimientos/${movimientos[0].id}/anular`)).estado, 200);
  assert.equal((await ana.get('/api/existencias/TOR-0610')).existencias, 13);
});

test('una empresa sin archivo lleva el inventario solo con movimientos', async () => {
  const { c } = await cuenta('Dora', 'dora@prueba.co', { empresa: 'Dora Ltda.' });
  await c.post('/api/catalogo', { codigo: 'X1', nombre: 'Equis' });
  const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const r = await c.post('/api/movimientos', { movimientos: [{ codigo: 'X1', tipo: 'conteo', cantidad: 20, fecha: ayer }, { codigo: 'X1', tipo: 'venta', cantidad: 25, fecha: hoy }] });
  assert.equal(r.estado, 201);
  assert.ok(r.avisos.some((a) => a.includes('quedó en -5')), 'avisa el saldo negativo pero lo guarda (D7)');
  const inv = (await c.get('/api/inventario')).inventario;
  assert.equal(inv.fuente.origen, 'movimientos');
  assert.ok(inv.avisos.some((a) => a.includes('solo de los movimientos')));
});

test('boletín diario: solo con CRON_SECRET, uno por persona y día, según el perfil, y baja de un clic', async () => {
  const anon = cliente();
  assert.equal((await anon.get('/api/tareas/boletin')).estado, 401);
  assert.equal((await anon.get('/api/tareas/boletin', { Authorization: 'Bearer otro' })).estado, 401);

  // Ana (con inventario) y Bob (sin inventario) lo activan; Carla no.
  const bob = cliente();
  await bob.post('/api/cuenta/entrar', { email: 'bob@prueba.co', clave: 'clave-segura' });
  await bob.put('/api/cuenta/boletin', { activo: true });
  correos.length = 0;
  const r = await anon.get('/api/tareas/boletin', { Authorization: 'Bearer secreto-cron' });
  assert.equal(r.enviados, 1);
  assert.equal(r.sinDatos, 1);
  assert.equal(correos.length, 1);
  const c = correos[0];
  assert.equal(c.to[0].email, 'ana@prueba.co');
  assert.match(c.subject, /· Ferretería Ana$/);
  assert.match(c.htmlContent, /Se van a agotar \(1\)/);
  assert.match(c.headers['List-Unsubscribe'], /\/api\/boletin\/baja\?u=\d+&f=/);
  assert.match(c.textContent, /Ver el panel/, 'Ana es analista');

  const otra = await anon.get('/api/tareas/boletin', { Authorization: 'Bearer secreto-cron' });
  assert.equal(otra.enviados, 0, 'la misma tarea el mismo día no manda otro');
  assert.equal(correos.length, 1);

  const baja = new URL(c.headers['List-Unsubscribe'].slice(1, -1));
  const mala = await fetchReal(`${base}/api/boletin/baja?u=${baja.searchParams.get('u')}&f=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`);
  assert.equal(mala.status, 400);
  const buena = await fetchReal(`${base}${baja.pathname}${baja.search}`);
  assert.equal(buena.status, 200);
  assert.equal((await db.uno("SELECT boletin FROM usuarios WHERE email = 'ana@prueba.co'")).boletin, false);
});

test('los resultados del equipo traen la empresa, el perfil y el boletín de cada probador', async () => {
  const r = await require('../server/equipo').resultados();
  const ana = r.usuarios.find((u) => u.email === 'ana@prueba.co');
  assert.equal(ana.empresa.nombre, 'Ferretería Ana');
  assert.equal(ana.boletin.enviados, 1);
  assert.ok(ana.movimientos >= 4);
  const carla = r.usuarios.find((u) => u.email === 'carla@prueba.co');
  assert.equal(carla.empresa.id, ana.empresa.id, 'dos probadores de la misma empresa se ven juntos');
});
