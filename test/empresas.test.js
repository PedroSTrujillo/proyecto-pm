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
const { conCodigo } = require('./codigo');
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
  const r = await c.post('/api/cuenta/crear', await conCodigo({ nombre, email, clave: 'clave-segura', ...extra }));
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
  const sin = await cliente().post('/api/cuenta/crear', await conCodigo({ nombre: 'Sin', email: 'sin@prueba.co', clave: 'clave-segura' }));
  assert.equal(sin.estado, 400);
  assert.match(sin.error, /nombre de su empresa/);

  const { c: ana, usuario } = await cuenta('Ana', 'ana@prueba.co', { empresa: 'Ferretería Ana', boletin: true });
  assert.deepEqual({ ...usuario.empresa, id: undefined }, { id: undefined, nombre: 'Ferretería Ana', vacia: false, admin: true });
  assert.equal(usuario.rolEmpresa, 'gerente', 'quien funda la empresa es su gerente');
  assert.equal(usuario.aprueba, true);
  assert.equal(usuario.boletin, true);

  const inv = await ana.post('/api/empresa/invitaciones', { email: 'carla@prueba.co', rol: 'administrador' });
  assert.equal(inv.estado, 201);
  assert.equal(inv.enviado, true, 'con correo configurado, la invitación sale por correo');
  const token = new URL(inv.enlace).searchParams.get('invitacion');
  assert.equal((await cliente().get(`/api/empresa/invitaciones/${token}`)).empresa, 'Ferretería Ana');

  const otroCorreo = await cliente().post('/api/cuenta/crear', await conCodigo({ nombre: 'Intrusa', email: 'otra@prueba.co', clave: 'clave-segura', invitacion: token }));
  assert.equal(otroCorreo.estado, 400);
  const { usuario: carla } = await cuenta('Carla', 'carla@prueba.co', { invitacion: token });
  assert.equal(carla.empresa.id, usuario.empresa.id);
  assert.equal(carla.empresa.admin, false);
  assert.equal(carla.rolEmpresa, 'administrador', 'toma el rol de la invitación, no uno que mande el formulario');
  const otraVez = await cliente().post('/api/cuenta/crear', await conCodigo({ nombre: 'Carla 2', email: 'carla2@prueba.co', clave: 'clave-segura', invitacion: token }));
  assert.equal(otraVez.estado, 400, 'una invitación sirve una sola vez');

  const { empresa } = await ana.get('/api/empresa');
  assert.deepEqual(empresa.miembros.map((m) => m.nombre), ['Ana', 'Carla']);
});

test('el inventario es de la empresa; los pedidos siguen siendo de cada persona', async () => {
  const ana = cliente();
  await ana.post('/api/cuenta/entrar', { email: 'ana@prueba.co', clave: 'clave-segura' });
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
  const completo = (await ana.get('/api/inventario')).inventario;
  assert.equal(completo.vista, 'analista');
  assert.ok(completo.productos.some((p) => p.pronostico));
  assert.ok(completo.grafico);

  // El rol ya no se cambia con un clic: la ruta de perfil no existe y el operador lo es por su invitación.
  assert.equal((await ana.put('/api/cuenta/perfil', { perfil: 'operador' })).estado, 404);
  const inv = await ana.post('/api/empresa/invitaciones', { email: 'dani@prueba.co', rol: 'operador' });
  const { c: dani, usuario } = await cuenta('Dani', 'dani@prueba.co', { invitacion: new URL(inv.enlace).searchParams.get('invitacion') });
  assert.equal(usuario.rolEmpresa, 'operador');
  const r = await dani.get('/api/inventario');
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
});

// T1 (docs/PLAN_CAMBIOS_SINESC.md): solo se actúa sobre rango menor al propio.
test('los roles se hacen cumplir: nadie invita, cambia ni saca a alguien de su rango o mayor', async () => {
  const ana = cliente();
  await ana.post('/api/cuenta/entrar', { email: 'ana@prueba.co', clave: 'clave-segura' });
  const carla = cliente();
  await carla.post('/api/cuenta/entrar', { email: 'carla@prueba.co', clave: 'clave-segura' });
  const dani = cliente();
  await dani.post('/api/cuenta/entrar', { email: 'dani@prueba.co', clave: 'clave-segura' });
  const { empresa } = await ana.get('/api/empresa');
  const id = (nombre) => empresa.miembros.find((m) => m.nombre === nombre).id;

  // El operador no invita; el administrador solo invita operadores.
  assert.equal((await dani.post('/api/empresa/invitaciones', {})).estado, 403);
  assert.equal((await carla.post('/api/empresa/invitaciones', { rol: 'administrador' })).estado, 403);
  assert.equal((await carla.post('/api/empresa/invitaciones', { rol: 'jefe' })).estado, 400);
  assert.equal((await carla.post('/api/empresa/invitaciones', {})).estado, 201, 'sin rol, entra como operador');

  // Nadie toca al gerente, ni siquiera él mismo; el administrador tampoco se toca a sí mismo.
  assert.equal((await ana.put(`/api/empresa/miembros/${id('Ana')}`, { aprueba: false })).estado, 403);
  assert.equal((await carla.put(`/api/empresa/miembros/${id('Ana')}`, { cargo: 'Jefa' })).estado, 403);
  assert.equal((await carla.put(`/api/empresa/miembros/${id('Carla')}`, { rol: 'operador' })).estado, 403);
  assert.equal((await carla.del(`/api/empresa/miembros/${id('Ana')}`)).estado, 403);

  // El administrador sí maneja a un operador, pero no le da su propio rango.
  assert.equal((await carla.put(`/api/empresa/miembros/${id('Dani')}`, { rol: 'administrador' })).estado, 403);
  assert.equal((await carla.put(`/api/empresa/miembros/${id('Dani')}`, { cargo: 'Bodega' })).estado, 200);
  // El gerente asciende y baja de rol.
  const sube = await ana.put(`/api/empresa/miembros/${id('Dani')}`, { rol: 'administrador' });
  assert.equal(sube.empresa.miembros.find((m) => m.nombre === 'Dani').rol, 'administrador');
  assert.equal((await ana.put(`/api/empresa/miembros/${id('Dani')}`, { rol: 'operador' })).estado, 200);
  assert.equal((await dani.get('/api/cuenta/yo')).usuario.rolEmpresa, 'operador');
});

// T4: lo que el operador no ve ni escribe lo cierra el servidor, no solo la pantalla. Va en una empresa
// aparte para no cambiar el catálogo ni los movimientos de las otras pruebas.
test('el operador no abre pedidos, ajustes ni catálogo, no recibe dinero y subir datos pide permiso', async () => {
  const { c: gina } = await cuenta('Gina', 'gina@prueba.co', { empresa: 'Gina y Cía' });
  const inv = await gina.post('/api/empresa/invitaciones', { email: 'hugo@prueba.co', rol: 'operador' });
  const { c: hugo, usuario: u } = await cuenta('Hugo', 'hugo@prueba.co', { invitacion: new URL(inv.enlace).searchParams.get('invitacion') });
  assert.equal(u.rolEmpresa, 'operador');

  // El costo es dinero: quien administra lo ve y el operador no.
  const creado = await gina.post('/api/catalogo', { codigo: 'T4-COSTO', nombre: 'Producto con costo', costo: 1500 });
  assert.equal(creado.estado, 201);
  assert.equal((await gina.get('/api/catalogo?q=T4-COSTO')).productos[0].costo, 1500);
  const deHugo = (await hugo.get('/api/catalogo?q=T4-COSTO')).productos[0];
  assert.equal(deHugo.costo, null);

  // No abre pedidos, no cambia ajustes ni escribe el catálogo; el gerente sí.
  for (const ruta of ['/api/pedidos', '/api/pedidos/por-aprobar', '/api/pedidos/borrador']) assert.equal((await hugo.get(ruta)).estado, 403, ruta);
  assert.equal((await hugo.post('/api/pedidos', { modo: 'sugerido' })).estado, 403);
  assert.equal((await hugo.put('/api/inventario/ajustes', { cadaCuanto: 3 })).estado, 403);
  assert.equal((await hugo.put(`/api/catalogo/${deHugo.id}`, { nombre: 'Otro' })).estado, 403);
  assert.equal((await hugo.post('/api/catalogo/lote', { filas: [{ codigo: 'T4-COSTO', familia: 'X' }] })).estado, 403);
  assert.equal((await hugo.post('/api/catalogo', { codigo: 'T4-OTRO', nombre: 'Otro' })).estado, 403);
  assert.equal((await gina.put('/api/inventario/ajustes', { cadaCuanto: 6 })).estado, 200);
  assert.equal((await gina.put(`/api/catalogo/${deHugo.id}`, { nombre: 'Producto con costo' })).estado, 200);

  // Lo del día sigue abierto para el operador.
  assert.equal((await hugo.get('/api/empresa')).estado, 200);
  // Registrar movimientos y hacer conteos también piden permiso (T18); con él, una fila mala llega a la validación (400).
  assert.equal((await hugo.post('/api/movimientos', { movimientos: [{ tipo: 'venta', codigo: 'T4-COSTO', cantidad: 'diez' }] })).estado, 403);
  assert.equal((await gina.put(`/api/empresa/miembros/${u.id}`, { registraMovimientos: true })).estado, 200);
  assert.equal((await hugo.post('/api/movimientos', { movimientos: [{ tipo: 'venta', codigo: 'T4-COSTO', cantidad: 'diez' }] })).estado, 400);

  // Subir el archivo de inventario pide que quien administra se lo marque.
  assert.equal((await hugo.subir('/api/inventario/export', [['inventario.xlsx', await plantillaExport()]])).estado, 403);
  assert.equal((await hugo.get('/api/cuenta/yo')).usuario.subeDatos, false);
  assert.equal((await gina.put(`/api/empresa/miembros/${u.id}`, { subeDatos: true })).empresa.miembros.find((m) => m.id === u.id).subeDatos, true);
  assert.equal((await hugo.get('/api/cuenta/yo')).usuario.subeDatos, true);
  assert.equal((await hugo.subir('/api/inventario/export', [['inventario.xlsx', await plantillaExport()]])).ok, true);
  // Con el archivo ya subido, el operador recibe el inventario sin costos.
  for (const p of (await hugo.get('/api/inventario')).inventario.productos) assert.equal(p.costo, null, `${p.codigo}.costo`);

  // Un operador no aprueba pedidos, aunque se lo marquen.
  const marcado = await gina.put(`/api/empresa/miembros/${u.id}`, { aprueba: true });
  assert.equal(marcado.empresa.miembros.find((m) => m.id === u.id).aprueba, false);
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
  assert.deepEqual(malos.errores.map((e) => e.split(':')[0]), ['Fila 3', 'Fila 4'], 'un código que no está en el catálogo ya no es un error');
  assert.equal((await db.uno('SELECT count(*)::int AS n FROM movimientos')).n, 0, 'con una fila mala no se guarda ninguna');
  assert.equal((await db.uno("SELECT count(*)::int AS n FROM productos WHERE clave = 'NUEVO-1'")).n, 0, 'ni se crea el producto nuevo');

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

test('código que no está en el catálogo: si se parece a uno, se pregunta; si no, se crea y se avisa', async () => {
  const ana = cliente();
  await ana.post('/api/cuenta/entrar', { email: 'ana@prueba.co', clave: 'clave-segura' });
  const movimientos = () => db.uno('SELECT count(*)::int AS n FROM movimientos').then((r) => r.n);
  const antes = await movimientos();
  const lote = [
    { codigo: 'TOR 0610', tipo: 'venta', cantidad: '2', fecha: hoy },
    { codigo: 'ZZ-900', nombre: 'Silicona transparente', tipo: 'entrada', cantidad: '6', fecha: hoy },
  ];

  const pregunta = await ana.post('/api/movimientos', { movimientos: lote });
  assert.equal(pregunta.estado, 409);
  assert.deepEqual(pregunta.parecidos.map((d) => d.codigo), ['TOR 0610']);
  assert.equal(pregunta.parecidos[0].opciones[0].codigo, 'TOR-0610', 'el más parecido va primero');
  assert.deepEqual(pregunta.nuevos.map((d) => d.codigo), ['ZZ-900'], 'avisa cuál se va a crear');
  assert.equal(await movimientos(), antes, 'mientras pregunta no guarda nada');
  assert.equal((await db.uno("SELECT count(*)::int AS n FROM productos WHERE clave = 'ZZ-900'")).n, 0);

  assert.equal((await ana.post('/api/movimientos', { movimientos: lote, resolver: { 'TOR 0610': 'NO-EXISTE' } })).estado, 400, 'lo elegido tiene que estar en el catálogo');
  const ok = await ana.post('/api/movimientos', { movimientos: lote, resolver: { 'tor 0610': 'TOR-0610' } });
  assert.equal(ok.estado, 201, ok.error);
  assert.deepEqual(ok.creados, ['ZZ-900']);
  assert.match(ok.avisos[0], /ZZ-900 no estaba en su catálogo: se creó como producto nuevo/);
  assert.equal(await movimientos(), antes + 2);
  const creado = await db.uno("SELECT nombre FROM productos WHERE clave = 'ZZ-900'");
  assert.equal(creado.nombre, 'Silicona transparente', 'con el nombre que venía en la fila');
  const venta = await db.uno("SELECT p.codigo FROM movimientos m JOIN productos p ON p.id = m.producto_id WHERE m.tipo = 'venta' ORDER BY m.id DESC LIMIT 1");
  assert.equal(venta.codigo, 'TOR-0610', 'la venta quedó en el producto elegido');

  const nuevo = await ana.post('/api/movimientos', { movimientos: [{ codigo: 'TOR-0611', tipo: 'entrada', cantidad: '1', fecha: hoy }], resolver: { 'TOR-0611': 'nuevo' } });
  assert.equal(nuevo.estado, 201, nuevo.error);
  assert.deepEqual(nuevo.creados, ['TOR-0611'], 'si dice que es nuevo, se crea aunque se parezca');
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

// --- T17: pasar la gerencia y borrar la propia cuenta ---------------------------------------------

async function conMiembro(prefijo, rol) {
  const { c: gerente, usuario: g } = await cuenta(`Gerente ${prefijo}`, `${prefijo}-g@prueba.co`, { empresa: `Empresa ${prefijo}` });
  const inv = await gerente.post('/api/empresa/invitaciones', { email: `${prefijo}-m@prueba.co`, rol });
  const token = new URL(inv.enlace).searchParams.get('invitacion');
  const { c: miembro, usuario: m } = await cuenta(`Miembro ${prefijo}`, `${prefijo}-m@prueba.co`, { invitacion: token });
  return { gerente, g, miembro, m };
}

const borrar = (c, email, clave = 'clave-segura') => c.post('/api/cuenta/borrar', { confirmacion: email, clave });

test('borrar la cuenta: pide el correo y la clave, y el gerente con miembros no puede', async () => {
  const { gerente, g, m } = await conMiembro('b1', 'administrador');
  const mala = await borrar(gerente, g.email, 'otra-clave');
  assert.equal(mala.estado, 403);
  assert.equal((await borrar(gerente, 'otro@prueba.co')).estado, 400);
  const con = await borrar(gerente, g.email);
  assert.equal(con.estado, 409);
  assert.match(con.error, /pase la gerencia/);
  assert.ok(await db.uno('SELECT 1 AS x FROM usuarios WHERE id = $1', [g.id]), 'no se borró nada');

  // Solo el gerente pasa la gerencia, y solo a alguien de su empresa.
  const { c: ajena } = await cuenta('Ajena', 'ajena-b1@prueba.co', { empresa: 'Otra SAS' });
  assert.equal((await gerente.put('/api/empresa/gerente', { usuarioId: g.id })).estado, 400, 'a sí mismo');
  assert.equal((await gerente.put('/api/empresa/gerente', { usuarioId: (await db.uno("SELECT id FROM usuarios WHERE email = 'ajena-b1@prueba.co'")).id })).estado, 404, 'a otra empresa');
  assert.equal((await ajena.put('/api/empresa/gerente', { usuarioId: m.id })).estado, 404);
});

test('pasar la gerencia: el otro queda gerente, quien la pasa administrador y ya puede borrarse', async () => {
  const { gerente, g, miembro, m } = await conMiembro('b2', 'administrador');
  assert.equal((await miembro.put('/api/empresa/gerente', { usuarioId: g.id })).estado, 403, 'un administrador no la pasa');
  const r = await gerente.put('/api/empresa/gerente', { usuarioId: m.id });
  assert.equal(r.estado, 200, r.error);
  assert.equal((await gerente.get('/api/cuenta/yo')).usuario.rolEmpresa, 'administrador');
  assert.equal((await miembro.get('/api/cuenta/yo')).usuario.rolEmpresa, 'gerente');
  assert.equal((await borrar(gerente, g.email)).estado, 200);
  assert.equal((await gerente.get('/api/cuenta/yo')).usuario, null, 'la sesión se cerró');
  assert.equal(await db.uno('SELECT 1 AS x FROM usuarios WHERE id = $1', [g.id]), null);
  assert.ok(await db.uno('SELECT 1 AS x FROM empresas WHERE id = $1', [m.empresa.id]), 'la empresa sigue');
});

test('un operador se borra y sus archivos pasan al gerente; el gerente único se lleva la empresa', async () => {
  const { gerente, g, miembro, m } = await conMiembro('b3', 'operador');
  await db.query("INSERT INTO archivos (usuario_id, tipo, nombre, tamano, contenido) VALUES ($1, 'export', 'inventario-b3.xlsx', 1, 'x')", [m.id]);
  assert.equal((await borrar(miembro, m.email)).estado, 200);
  assert.equal((await db.uno('SELECT usuario_id FROM archivos WHERE nombre = $1', ['inventario-b3.xlsx'])).usuario_id, g.id);
  assert.equal((await borrar(gerente, g.email)).estado, 200);
  assert.equal(await db.uno('SELECT 1 AS x FROM empresas WHERE id = $1', [g.empresa.id]), null, 'sin nadie, la empresa se borra');
});

test('las cuentas del equipo no se borran solas, y una cuenta sin activar sí', async () => {
  const { c: eq, usuario } = await cuenta('Equipo T17', 'equipo-t17@prueba.co', { empresa: 'Equipo SAS' });
  await db.query("UPDATE usuarios SET rol = 'equipo', es_equipo = true WHERE id = $1", [usuario.id]);
  assert.equal((await borrar(eq, usuario.email)).estado, 403);
  const c = cliente();
  const r = await c.post('/api/cuenta/crear', { nombre: 'Sin activar', email: 'sin-activar@prueba.co', clave: 'clave-segura', empresa: 'Sin SAS' });
  assert.equal(r.usuario.pendienteCodigo, true);
  assert.equal((await borrar(c, 'sin-activar@prueba.co')).estado, 200);
});

// --- T18: registrar movimientos y hacer conteos se marcan por aparte ------------------------------

test('un operador registra y cuenta solo con el permiso de cada cosa', async () => {
  const { gerente, miembro, m } = await conMiembro('t18', 'operador');
  const hoyT18 = fechaBogota();
  const venta = { codigo: 'T18-A', nombre: 'Producto T18', tipo: 'venta', cantidad: 1, fecha: hoyT18 };
  const conteo = { codigo: 'T18-A', tipo: 'conteo', cantidad: 5, fecha: hoyT18 };
  const marcar = (cambio) => gerente.put(`/api/empresa/miembros/${m.id}`, cambio);

  // El gerente registra una entrada y una venta que el operador intentará anular.
  assert.equal((await gerente.post('/api/movimientos', { movimientos: [{ ...venta, tipo: 'entrada', cantidad: 20 }, venta, conteo] })).estado, 201);
  const lista = (await gerente.get(`/api/movimientos?desde=${hoyT18}&hasta=${hoyT18}&codigo=T18-A`)).movimientos;
  const idVenta = lista.find((x) => x.tipo === 'venta').id;
  const idConteo = lista.find((x) => x.tipo === 'conteo').id;

  // Sin permisos: nada de lo que escribe pasa, ni anular, ni importar.
  assert.equal((await miembro.post('/api/movimientos', { movimientos: [venta] })).estado, 403);
  assert.equal((await miembro.post('/api/movimientos', { movimientos: [conteo] })).estado, 403);
  assert.equal((await miembro.post(`/api/movimientos/${idVenta}/anular`)).estado, 403);
  assert.equal((await miembro.post('/api/movimientos/importar')).estado, 403);
  assert.deepEqual([(await miembro.get('/api/cuenta/yo')).usuario.registraMovimientos, (await miembro.get('/api/cuenta/yo')).usuario.haceConteos], [false, false]);

  // Solo conteos: el conteo y anular un conteo pasan; la venta y anular una venta, no.
  const solo = await marcar({ haceConteos: true });
  assert.equal(solo.empresa.miembros.find((x) => x.id === m.id).haceConteos, true);
  assert.equal((await miembro.post('/api/movimientos', { movimientos: [conteo] })).estado, 201);
  assert.equal((await miembro.post('/api/movimientos', { movimientos: [venta] })).estado, 403);
  assert.equal((await miembro.post('/api/movimientos', { movimientos: [conteo, venta] })).estado, 403, 'una venta mezclada también se rechaza');
  assert.equal((await miembro.post(`/api/movimientos/${idVenta}/anular`)).estado, 403);
  assert.equal((await miembro.post(`/api/movimientos/${idConteo}/anular`)).estado, 200);

  // Con los dos permisos, todo.
  assert.equal((await marcar({ registraMovimientos: true })).estado, 200);
  assert.equal((await miembro.post('/api/movimientos', { movimientos: [venta, conteo] })).estado, 201);
  assert.equal((await miembro.post(`/api/movimientos/${idVenta}/anular`)).estado, 200);
});

// --- T20: actividad del equipo, solo para el gerente ----------------------------------------------

test('el gerente ve los archivos y pedidos de su equipo con nombre; los demás no', async () => {
  const { registrarEvento } = require('../server/cuentas');
  const { gerente, miembro, m } = await conMiembro('t20', 'operador');
  const otra = await conMiembro('t20b', 'administrador');
  await registrarEvento(m.id, 'archivo_subido', { detalle: { tipo: 'export', archivos: ['ventas-octubre.xlsx', 'saldos.csv'] } });
  await registrarEvento(m.id, 'movimientos_registrados', { detalle: { cantidad: 4, tipos: { venta: 4 } } });
  await registrarEvento(m.id, 'login_raro', { detalle: {} });
  const pedido = await db.uno("INSERT INTO pedidos (usuario_id, empresa_id, modo, tipo) VALUES ($1, $2, 'sugerido', 'real') RETURNING id", [m.id, m.empresa.id]);
  await registrarEvento(m.id, 'pedido_enviado', { pedidoId: pedido.id, detalle: { lineas: 7 } });
  await registrarEvento(otra.m.id, 'archivo_subido', { detalle: { tipo: 'export', archivos: ['de-otra-empresa.xlsx'] } });
  await db.query("INSERT INTO eventos (usuario_id, tipo, detalle, creado_en) VALUES ($1, 'archivo_subido', '{\"archivos\":[\"viejo.xlsx\"]}'::jsonb, now() - interval '40 days')", [m.id]);
  await gerente.put(`/api/empresa/miembros/${m.id}`, { cargo: 'Bodeguero' });

  const r = await gerente.get('/api/empresa/actividad');
  assert.equal(r.estado, 200);
  const archivo = r.eventos.find((e) => e.tipo === 'archivo_subido');
  assert.equal(archivo.archivo, 'ventas-octubre.xlsx, saldos.csv');
  assert.equal(archivo.quien, m.nombre);
  assert.equal(archivo.cargo, 'Bodeguero');
  assert.equal(r.eventos.find((e) => e.tipo === 'movimientos_registrados').cantidad, 4);
  const enviado = r.eventos.find((e) => e.tipo === 'pedido_enviado');
  assert.deepEqual([enviado.pedido, enviado.cantidad], [1, 7]);
  assert.ok(!r.eventos.some((e) => e.tipo === 'login_raro'), 'solo los tipos de la lista');
  assert.ok(!r.eventos.some((e) => e.archivo === 'de-otra-empresa.xlsx'), 'nada de otra empresa');
  assert.ok(!r.eventos.some((e) => e.archivo === 'viejo.xlsx'), 'a 30 días no sale lo de 40');
  assert.ok((await gerente.get('/api/empresa/actividad?dias=90')).eventos.some((e) => e.archivo === 'viejo.xlsx'));
  assert.equal((await gerente.get('/api/empresa/actividad?dias=9999')).dias, 30, 'un periodo fuera de rango vuelve a 30');

  // Quien no es gerente no la ve, tampoco un administrador.
  assert.equal((await miembro.get('/api/empresa/actividad')).estado, 403);
  assert.equal((await otra.miembro.get('/api/empresa/actividad')).estado, 403);
  // El gerente de la otra empresa solo ve lo suyo.
  const suyas = await otra.gerente.get('/api/empresa/actividad');
  assert.deepEqual(suyas.eventos.map((e) => e.archivo), ['de-otra-empresa.xlsx']);
});
