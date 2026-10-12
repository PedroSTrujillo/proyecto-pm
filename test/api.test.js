'use strict';

// Prueba de punta a punta del servidor con una base de datos en memoria.

process.env.DATA_DIR = 'memory://';
process.env.TEAM_EMAILS = 'equipo@prueba.co';
process.env.SIN_LIMITES = '1'; // las pruebas crean muchas cuentas desde la misma dirección

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../server/db');
const { crearApp } = require('../server/app');
const { plantillaExport } = require('../server/plantillas');
const { evaluarUsuario } = require('../server/equipo');

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

// Cliente con su propia cookie de sesión.
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
    cookie: () => cookie,
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

async function nuevoUsuario(nombre, email) {
  const c = cliente();
  const r = await c.post('/api/cuenta/crear', { nombre, email, clave: 'clave-segura' });
  assert.equal(r.estado, 201, r.error);
  return c;
}

const INICIAL = [
  { codigo: 'TOR-0610', cantidad: '60' },
  { codigo: 'CIN-0003', cantidad: '100' },
  { codigo: 'MAN-1215', cantidad: '10' },
  { codigo: 'LIJ-0120', cantidad: '100' },
];

test('flujo completo con las reglas del documento', async () => {
  const ana = await nuevoUsuario('Ana', 'ana@prueba.co');
  const { pedido } = await ana.post('/api/pedidos');
  const id = pedido.id;
  assert.equal(pedido.paso, 1);

  // Sin lista inicial: no hay export ni reporte.
  assert.equal((await ana.get(`/api/pedidos/${id}/reporte`)).estado, 403);
  assert.equal((await ana.subir(`/api/pedidos/${id}/export`, [['export.xlsx', plantillaExport()]])).estado, 403);

  // Borrador y validación
  assert.equal((await ana.put(`/api/pedidos/${id}/lista-inicial`, { lineas: INICIAL, tipo: 'real' })).estado, 200);
  const sinTipo = await ana.post(`/api/pedidos/${id}/lista-inicial`, { lineas: INICIAL });
  assert.equal(sinTipo.estado, 400);
  assert.match(sinTipo.error, /real o simulado/);

  const guardada = await ana.post(`/api/pedidos/${id}/lista-inicial`, { lineas: INICIAL, tipo: 'real' });
  assert.equal(guardada.estado, 200);
  assert.equal(guardada.pedido.paso, 2);

  // La lista inicial queda fija
  assert.equal((await ana.put(`/api/pedidos/${id}/lista-inicial`, { lineas: [] })).estado, 409);
  assert.equal((await ana.post(`/api/pedidos/${id}/lista-inicial`, { lineas: INICIAL, tipo: 'simulado' })).estado, 409);

  // Export y reporte
  const exp = await ana.subir(`/api/pedidos/${id}/export`, [['Export año 2026.xlsx', plantillaExport()]]);
  assert.equal(exp.ok, true, JSON.stringify(exp.errores));
  const { reporte } = await ana.get(`/api/pedidos/${id}/reporte`);
  assert.equal(reporte.filas[0].codigo, 'CIN-0003', 'lo que se agota primero va arriba');
  assert.deepEqual(reporte.archivos, ['Export año 2026.xlsx']);

  // Lista final: arranca como copia de la inicial
  const tras = await ana.get(`/api/pedidos/${id}`);
  assert.equal(tras.pedido.paso, 4);
  assert.deepEqual(tras.pedido.listaFinal.map((l) => l.codigo), INICIAL.map((l) => l.codigo));
  assert.equal((await ana.post(`/api/pedidos/${id}/por-que`, { respuesta: 'x' })).estado, 409);

  const final = [
    { codigo: 'TOR-0610', cantidad: '80' }, // cambiada
    { codigo: 'CIN-0003', cantidad: '100' }, // igual
    { codigo: 'LIJ-0120', cantidad: '60' }, // cambiada
    { codigo: 'CAN-0040', cantidad: '6' }, // agregada
    // MAN-1215 quitada
  ];
  const f = await ana.post(`/api/pedidos/${id}/lista-final`, { lineas: final });
  assert.deepEqual(f.pedido.comparacion.conteo, { agregadas: 1, quitadas: 1, cambiadas: 2, total: 4 });

  assert.equal((await ana.post(`/api/pedidos/${id}/por-que`, { respuesta: '   ' })).estado, 400);
  const fin = await ana.post(`/api/pedidos/${id}/por-que`, { respuesta: 'El tornillo se agota.' });
  assert.equal(fin.pedido.terminado, true);
  assert.equal((await ana.post(`/api/pedidos/${id}/lista-final`, { lineas: final })).estado, 409);

  // Todo queda registrado con fecha
  const eventos = await db.query('SELECT tipo FROM eventos WHERE usuario_id = (SELECT id FROM usuarios WHERE email = $1) ORDER BY id', ['ana@prueba.co']);
  const tipos = eventos.map((e) => e.tipo);
  for (const t of ['ingreso', 'archivo_subido', 'lista_inicial_guardada', 'reporte_visto', 'lista_final_guardada', 'pedido_terminado']) {
    assert.ok(tipos.includes(t), `falta el evento ${t}`);
  }
  const archivos = await db.query('SELECT nombre, subido_en FROM archivos');
  assert.equal(archivos[0].nombre, 'Export año 2026.xlsx');
  assert.ok(archivos[0].subido_en instanceof Date);
});

test('cada usuario ve solo lo suyo y la vista del equipo es solo para el equipo', async () => {
  const beto = await nuevoUsuario('Beto', 'beto@prueba.co');
  const caro = await nuevoUsuario('Caro', 'caro@prueba.co');
  const { pedido } = await beto.post('/api/pedidos');
  await beto.post(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: INICIAL, tipo: 'simulado' });
  assert.equal((await caro.get(`/api/pedidos/${pedido.id}`)).estado, 404);
  assert.equal((await caro.get(`/api/pedidos/${pedido.id}/reporte`)).estado, 404);
  assert.equal((await caro.put(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: [] })).estado, 404);
  assert.equal((await caro.get('/api/pedidos')).pedidos.length, 0);
  assert.equal((await caro.get('/api/equipo/resultados')).estado, 403);
  assert.equal((await cliente().get('/api/pedidos')).estado, 401);
});

test('resultados del equipo salen de los datos guardados', async () => {
  const equipo = await nuevoUsuario('Equipo', 'equipo@prueba.co');
  const r = await equipo.get('/api/equipo/resultados');
  assert.equal(r.estado, 200);
  const ana = r.usuarios.find((u) => u.email === 'ana@prueba.co');
  assert.equal(ana.pedidos[0].conteo.total, 4);
  assert.equal(ana.pedidos[0].tipo, 'real');
  assert.equal(ana.pedidos[0].porQue, 'El tornillo se agota.');
  assert.equal(ana.archivosExport, 1);
  assert.ok(ana.ingresos >= 1);
  assert.equal(ana.evaluacion.categoria, 'intermedio');
  assert.ok(!r.usuarios.some((u) => u.email === 'equipo@prueba.co'), 'el equipo no cuenta como usuario de prueba');
  assert.equal(r.resumen.usuarios, 3);
});

test('meta y pivote', () => {
  const dia = 86400000;
  const t0 = Date.parse('2026-10-01T12:00:00Z');
  const ped = (total, finalEn, tipo = 'real') => ({ id: Math.random(), tipo, inicialGuardadaEn: new Date(t0), finalGuardadaEn: new Date(finalEn), conteo: { total } });
  assert.equal(evaluarUsuario([ped(5, t0 + dia)]).categoria, 'cumple');
  assert.equal(evaluarUsuario([ped(1, t0 + dia)]).categoria, 'no_cambia');
  assert.equal(evaluarUsuario([ped(0, t0 + dia)]).categoria, 'no_cambia');
  assert.equal(evaluarUsuario([ped(3, t0 + dia)]).categoria, 'intermedio');
  assert.equal(evaluarUsuario([ped(9, t0 + 20 * dia)]).categoria, 'sin_pedido', 'fuera de los 14 días no cuenta');
  assert.equal(evaluarUsuario([ped(1, t0 + dia), ped(6, t0 + 5 * dia, 'simulado')]).mejor.total, 6);
});

test('mapeo de columnas: se elige una vez y la próxima vez se lee solo', async () => {
  const dani = await nuevoUsuario('Dani', 'dani@prueba.co');
  const archivo = Buffer.from('Ref Art;Desc;Dia;Uds;Stock hoy\nA1;Tuerca;15/01/2026;5;10\nA2;Arandela;20/02/2026;3;0\n');
  const crear = async () => {
    const { pedido } = await dani.post('/api/pedidos');
    await dani.post(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: [{ codigo: 'A1', cantidad: '1' }], tipo: 'real' });
    return pedido.id;
  };
  const id = await crear();
  const r = await dani.subir(`/api/pedidos/${id}/export`, [['raro.csv', archivo]]);
  assert.equal(r.ok, false);
  const mapeo = { [r.hojas[0].clave]: { codigo: 0, nombre: 1, fecha: 2, cantidad: 3, existencias: 4 } };
  const r2 = await dani.post(`/api/pedidos/${id}/export/${r.exportId}/columnas`, { mapeo });
  assert.equal(r2.ok, true, JSON.stringify(r2.errores));
  const id2 = await crear();
  const r3 = await dani.subir(`/api/pedidos/${id2}/export`, [['raro otra vez.csv', archivo]]);
  assert.equal(r3.ok, true, 'reconoce el mismo formato sin preguntar');
});

test('la coherencia con el reporte se guarda para el equipo y no se le muestra al usuario', async () => {
  const eli = await nuevoUsuario('Eli', 'eli@prueba.co');
  const { pedido } = await eli.post('/api/pedidos');
  await eli.post(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: INICIAL, tipo: 'real' });
  await eli.subir(`/api/pedidos/${pedido.id}/export`, [['export.xlsx', plantillaExport()]]);
  await eli.get(`/api/pedidos/${pedido.id}/reporte`);
  const f = await eli.post(`/api/pedidos/${pedido.id}/lista-final`, { lineas: [...INICIAL, { codigo: 'CAN-0040', cantidad: '6' }] });
  assert.equal(f.pedido.comparacion.conteo.total, 1);
  assert.equal(f.pedido.comparacion.coherencia, undefined, 'el usuario no ve la coherencia antes de decir por qué cambió');
  const [guardado] = await db.query("SELECT comparacion->'coherencia' AS c FROM pedidos WHERE id = $1", [pedido.id]);
  assert.equal(guardado.c.total, 1);
  assert.equal(guardado.c.detalle[0].codigo, 'CAN-0040');
});

test('recordatorio: se ofrece después del reporte, se descarga como calendario y se puede apagar', async () => {
  const fer = await nuevoUsuario('Fer', 'fer@prueba.co');
  const { pedido } = await fer.post('/api/pedidos');
  await fer.post(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: INICIAL, tipo: 'real' });
  await fer.subir(`/api/pedidos/${pedido.id}/export`, [['export.xlsx', plantillaExport()]]);
  assert.equal((await fer.get(`/api/pedidos/${pedido.id}/recordatorio`)).estado, 409, 'antes de ver el reporte no se ofrece');
  await fer.get(`/api/pedidos/${pedido.id}/reporte`);

  const oferta = await fer.get(`/api/pedidos/${pedido.id}/recordatorio`);
  assert.equal(oferta.respuesta, null);
  assert.ok(oferta.plan.productos > 0, 'la plantilla trae productos que llegan a 2 semanas en 3 meses');
  assert.equal(oferta.plan.correo, false, 'en pruebas no hay correo configurado');
  const si = await fer.post(`/api/pedidos/${pedido.id}/recordatorio`, { activo: true });
  assert.equal(si.respuesta.activo, true);
  assert.equal(si.respuesta.primerAviso, si.plan.primero.fechaAviso);
  assert.equal(si.correo, 'no_configurado');

  const r = await fetch(`${base}/api/pedidos/${pedido.id}/recordatorio.ics`, { headers: { Cookie: fer.cookie() } });
  assert.equal(r.status, 200);
  assert.ok(r.headers.get('content-type').startsWith('text/calendar'));
  assert.ok((await r.text()).includes('SUMMARY:Revisar inventario:'));

  const no = await fer.post(`/api/pedidos/${pedido.id}/recordatorio`, { activo: false });
  assert.equal(no.respuesta.activo, false);
  assert.equal(no.respuesta.primerAviso, null);

  const equipo = cliente();
  await equipo.post('/api/cuenta/entrar', { email: 'equipo@prueba.co', clave: 'clave-segura' });
  const res = await equipo.get('/api/equipo/resultados');
  const suyo = res.usuarios.find((u) => u.email === 'fer@prueba.co').recordatorio;
  assert.deepEqual({ activo: suyo.activo, descargo: suyo.descargoCalendario }, { activo: false, descargo: true });
});

test('export con el total vendido de un periodo: la app pregunta el periodo y con eso calcula', async () => {
  const gabi = await nuevoUsuario('Gabi', 'gabi@prueba.co');
  const { pedido } = await gabi.post('/api/pedidos');
  await gabi.post(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: [{ codigo: 'AB-1', cantidad: '10' }], tipo: 'real' });
  const listado = Buffer.from('Referencia;Descripción;Salidas;Saldo\nAB-1;Tornillo;520;30\nAB-2;Tuerca;0;12\n');
  const r = await gabi.subir(`/api/pedidos/${pedido.id}/export`, [['listado.csv', listado]]);
  assert.equal(r.ok, false);
  assert.equal(r.necesitaPeriodo, true);
  assert.equal((await gabi.post(`/api/pedidos/${pedido.id}/export/${r.exportId}/periodo`, { desde: '2026-03-01', hasta: '2026-02-01' })).estado, 400, 'la fecha final no puede ir antes');
  const ok = await gabi.post(`/api/pedidos/${pedido.id}/export/${r.exportId}/periodo`, { desde: '2025-07-01', hasta: '2026-06-29' }); // 364 días = 52 semanas
  assert.equal(ok.ok, true, JSON.stringify(ok.errores));
  const { reporte } = await gabi.get(`/api/pedidos/${pedido.id}/reporte`);
  assert.equal(reporte.periodo.totales, true);
  const ab1 = reporte.filas.find((f) => f.codigo === 'AB-1');
  assert.equal(ab1.promedioSemanal, 10); // 520 ÷ 52
  assert.equal(ab1.semanasInventario, 3);
});

test('cuenta: programa contable, cambiar contraseña y restablecerla con el enlace que genera el equipo', async () => {
  const hugo = await nuevoUsuario('Hugo', 'hugo@prueba.co');
  const d = await hugo.put('/api/cuenta/datos', { sistema: 'alegra' });
  assert.equal(d.usuario.sistema, 'alegra');
  assert.equal((await hugo.put('/api/cuenta/datos', { sistema: '<script>' })).estado, 400);

  assert.equal((await hugo.put('/api/cuenta/clave', { actual: 'mala', nueva: 'otra-clave-1' })).estado, 400);
  assert.equal((await hugo.put('/api/cuenta/clave', { actual: 'clave-segura', nueva: 'otra-clave-1' })).ok, true);

  assert.deepEqual(await cliente().post('/api/cuenta/olvide', { email: 'hugo@prueba.co' }), { estado: 200, correo: false }, 'sin correo configurado, se avisa');

  const equipo = cliente();
  await equipo.post('/api/cuenta/entrar', { email: 'equipo@prueba.co', clave: 'clave-segura' });
  const [{ id }] = await db.query("SELECT id FROM usuarios WHERE email = 'hugo@prueba.co'");
  assert.equal((await hugo.post(`/api/equipo/usuarios/${id}/restablecer`)).estado, 403, 'solo el equipo genera enlaces');
  const { enlace } = await equipo.post(`/api/equipo/usuarios/${id}/restablecer`);
  const token = enlace.split('/restablecer/')[1];
  assert.ok(token);

  const otro = cliente();
  assert.equal((await otro.post('/api/cuenta/restablecer', { token, clave: 'corta' })).estado, 400);
  const r = await otro.post('/api/cuenta/restablecer', { token, clave: 'clave-nueva-2' });
  assert.equal(r.usuario.email, 'hugo@prueba.co');
  assert.equal((await otro.post('/api/cuenta/restablecer', { token, clave: 'clave-nueva-3' })).estado, 400, 'el enlace sirve una sola vez');
  assert.equal((await hugo.get('/api/pedidos')).estado, 401, 'las sesiones anteriores se cierran');
  assert.equal((await cliente().post('/api/cuenta/entrar', { email: 'hugo@prueba.co', clave: 'clave-nueva-2' })).estado, 200);
});

test('informe con compras y ventas mezcladas: se pregunta una vez qué documentos son ventas y se recuerda', async () => {
  const iris = await nuevoUsuario('Iris', 'iris@prueba.co');
  const kardex = Buffer.from('Código;Fecha;Comprobante;Cantidad;Saldo\nAB-1;10/01/2026;FV-1-10;5;40\nAB-1;11/01/2026;FC-2-3;100;140\nAB-1;20/03/2026;FV-1-11;7;133\n');
  const crear = async () => {
    const { pedido } = await iris.post('/api/pedidos');
    await iris.post(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: [{ codigo: 'AB-1', cantidad: '10' }], tipo: 'real' });
    return pedido.id;
  };
  const id = await crear();
  const r = await iris.subir(`/api/pedidos/${id}/export`, [['kardex.csv', kardex]]);
  assert.equal(r.necesitaDocumentos, true);
  assert.deepEqual(r.documentos.map((x) => [x.prefijo, x.filas, x.sugerido]), [['FV', 2, true], ['FC', 1, false]]);
  assert.equal((await iris.post(`/api/pedidos/${id}/export/${r.exportId}/documentos`, { documentos: [] })).estado, 400);
  const ok = await iris.post(`/api/pedidos/${id}/export/${r.exportId}/documentos`, { documentos: ['FV'] });
  assert.equal(ok.ok, true, JSON.stringify(ok.errores));
  const { reporte } = await iris.get(`/api/pedidos/${id}/reporte`);
  assert.equal(reporte.filas[0].vendido, 12, 'solo las ventas: 5 + 7');

  const id2 = await crear();
  const otra = await iris.subir(`/api/pedidos/${id2}/export`, [['kardex.csv', kardex]]);
  assert.equal(otra.ok, true, 'la segunda vez el mismo informe se lee solo');
});

test('demo sin cuenta: lista de negocios y el inventario de ejemplo, con tiempos propios', async () => {
  const c = cliente();
  const lista = await c.get('/api/demo');
  assert.equal(lista.sectores.length, 5);
  const inv = await c.get('/api/demo/ferreteria');
  assert.equal(inv.estado, 200);
  assert.ok(inv.inventario.productos.length > 20);
  assert.equal(inv.inventario.sugerencias, true, 'en la demo se ve la cantidad sugerida');
  const ajustes = encodeURIComponent(JSON.stringify({ entregas: { 'Importadora Herramientas del Pacífico': 1 } }));
  const corto = await c.get(`/api/demo/ferreteria?ajustes=${ajustes}`);
  assert.ok(corto.inventario.resumen.pideYa < inv.inventario.resumen.pideYa);
  assert.equal((await c.get('/api/demo/no-existe')).estado, 404);
});

test('inventario guardado: no se ve antes de la lista inicial, sin sugerido en la prueba y se reusa en otro pedido', async () => {
  const beto = await nuevoUsuario('Beto', 'beto.inventario@prueba.co');
  const antes = await beto.get('/api/inventario');
  assert.deepEqual([antes.inventario, antes.puedeSubir, antes.sugerencias], [null, false, false]);
  assert.equal((await beto.subir('/api/inventario/export', [['e.xlsx', plantillaExport()]])).estado, 403, 'sin lista inicial no puede ver su inventario');

  const { pedido } = await beto.post('/api/pedidos');
  await beto.post(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: INICIAL, tipo: 'simulado' });
  assert.equal((await beto.subir(`/api/pedidos/${pedido.id}/export`, [['e.xlsx', plantillaExport()]])).ok, true);

  const inv = await beto.get('/api/inventario');
  assert.equal(inv.puedeSubir, true);
  assert.equal(inv.sugerencias, false, 'durante sus 14 días no ve cantidad sugerida');
  assert.ok(inv.inventario.productos.every((p) => p.sugerido === null));
  assert.equal(inv.inventario.resumen.tieneCostos, false, 'la plantilla de export no trae costos: el dinero quieto se cuenta en productos');

  const guardados = await beto.put('/api/inventario/ajustes', { entregaPorDefecto: 3, cadaCuanto: 2 });
  assert.deepEqual([guardados.ajustes.entregaPorDefecto, guardados.ajustes.cadaCuanto], [3, 2]);
  assert.equal((await beto.get('/api/inventario')).inventario.ajustes.entregaPorDefecto, 3);

  // Ya puede subir desde Datos, y un pedido nuevo puede usar lo que ya subió.
  assert.equal((await beto.subir('/api/inventario/export', [['nuevo.xlsx', plantillaExport()]])).ok, true);
  const otro = (await beto.post('/api/pedidos')).pedido;
  assert.equal((await beto.post(`/api/pedidos/${otro.id}/export/usar-ultimo`)).estado, 403, 'primero la lista inicial');
  await beto.post(`/api/pedidos/${otro.id}/lista-inicial`, { lineas: INICIAL, tipo: 'real' });
  assert.equal((await beto.post(`/api/pedidos/${otro.id}/export/usar-ultimo`)).ok, true);
  const { reporte } = await beto.get(`/api/pedidos/${otro.id}/reporte`);
  assert.equal(reporte.archivos[0], 'nuevo.xlsx');
  const { cargas } = await beto.get('/api/inventario/cargas');
  assert.equal(cargas.length, 2);
  assert.equal(cargas[0].pedidoId, null, 'la de Datos no es de ningún pedido');

  // El equipo sí ve el sugerido.
  const eq = cliente();
  const ya = await eq.post('/api/cuenta/entrar', { email: 'equipo@prueba.co', clave: 'clave-segura' });
  if (ya.estado !== 200) assert.equal((await eq.post('/api/cuenta/crear', { nombre: 'Equipo', email: 'equipo@prueba.co', clave: 'clave-segura' })).estado, 201);
  const { pedido: p2 } = await eq.post('/api/pedidos');
  await eq.post(`/api/pedidos/${p2.id}/lista-inicial`, { lineas: INICIAL, tipo: 'real' });
  await eq.subir(`/api/pedidos/${p2.id}/export`, [['e.xlsx', plantillaExport()]]);
  const invEq = await eq.get('/api/inventario');
  assert.equal(invEq.sugerencias, true);
  assert.ok(invEq.inventario.productos.some((p) => p.sugerido > 0));
});

test('exportar el pedido a Excel: una hoja por proveedor y un resumen', async () => {
  const XLSX = require('xlsx');
  const r = await fetch(`${base}/api/exportar/pedido.xlsx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ empresa: 'Prueba', lineas: [{ proveedor: 'A/B: [raro]', codigo: 'X1', nombre: 'Uno', cantidad: 3, costo: 100 }, { proveedor: 'Otro', codigo: 'X2', nombre: 'Dos', cantidad: 0 }] }),
  });
  assert.equal(r.status, 200);
  const libro = XLSX.read(Buffer.from(await r.arrayBuffer()), { type: 'buffer' });
  assert.deepEqual(libro.SheetNames, ['Resumen', 'A B   raro'], 'sin caracteres que Excel no acepta, y sin la línea en cero');
  const vacio = await fetch(`${base}/api/exportar/pedido.xlsx`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"lineas":[]}' });
  assert.equal(vacio.status, 400);
});

test('ajustes del inventario: guardar una parte no borra lo demás; Excel de mínimos y máximos', async () => {
  const c = await nuevoUsuario('Cami', 'cami.ajustes@prueba.co');
  await c.put('/api/inventario/ajustes', { entregas: { Lejano: 8 }, cadaCuanto: 3 });
  const r = await c.put('/api/inventario/ajustes', { prefijos: [{ prefijo: 'tor-', proveedor: 'Lejano' }] });
  assert.deepEqual(r.ajustes.entregas, { Lejano: 8 }, 'el tiempo de entrega sigue');
  assert.equal(r.ajustes.cadaCuanto, 3);
  assert.deepEqual(r.ajustes.prefijos, [{ prefijo: 'TOR-', proveedor: 'Lejano' }]);

  const XLSX = require('xlsx');
  const x = await fetch(`${base}/api/exportar/minimos.xlsx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productos: [{ codigo: 'A1', nombre: 'Uno', proveedor: 'P', existencias: 3, minimo: 5, maximo: 12, ventasSemana: 2.5 }] }),
  });
  assert.equal(x.status, 200);
  const libro = XLSX.read(Buffer.from(await x.arrayBuffer()), { type: 'buffer' });
  const filas = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { header: 1 });
  assert.deepEqual(filas[1], ['A1', 'Uno', 'P', 3, 5, 12, 2.5]);
});

test('alcance del plan de prueba: un probador en sus 14 días ve solo el reporte de semanas', async () => {
  const pepa = await nuevoUsuario('Pepa', 'pepa.alcance@prueba.co');
  const { pedido } = await pepa.post('/api/pedidos');
  await pepa.post(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: INICIAL, tipo: 'real' });
  await pepa.subir(`/api/pedidos/${pedido.id}/export`, [['e.xlsx', plantillaExport()]]);
  const r = await pepa.get('/api/inventario');
  assert.equal(r.alcance, 'prueba');
  const inv = r.inventario;
  assert.equal(inv.alcance, 'prueba');
  assert.ok(inv.productos.every((p) => p.riesgo === null && p.pronostico === null && p.sugerido === null && p.minimo === null), 'sin pronóstico, riesgo ni sugerido');
  assert.ok(inv.productos.every((p) => p.estado !== 'pide'), 'sin tiempo de entrega no hay "pide ya"');
  assert.equal(inv.temporada, null);
  assert.deepEqual(inv.grafico ? inv.grafico.pronostico : [], []);
  // Las semanas son las mismas del reporte que mide la prueba.
  const { reporte } = await pepa.get(`/api/pedidos/${pedido.id}/reporte`);
  for (const f of reporte.filas) assert.equal(inv.productos.find((p) => p.codigo === f.codigo).semanas, f.semanasInventario);
});

test('foto de la lista inicial: solo antes de ver el reporte, la ve el dueño y el equipo', async () => {
  const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const lia = await nuevoUsuario('Lía', 'lia.foto@prueba.co');
  const { pedido } = await lia.post('/api/pedidos');
  const subir = (c, nombre, tipo, buf) => {
    const fd = new FormData();
    fd.append('imagen', new Blob([buf], { type: tipo }), nombre);
    return fetch(`${base}/api/pedidos/${pedido.id}/imagen`, { method: 'POST', headers: { Cookie: c.cookie() }, body: fd }).then(async (r) => ({ estado: r.status, ...(await r.json()) }));
  };
  assert.equal((await subir(lia, 'nota.txt', 'text/plain', Buffer.from('hola'))).estado, 400, 'solo fotos o PDF');
  const ok = await subir(lia, 'lista.png', 'image/png', PNG);
  assert.equal(ok.estado, 201);
  const vista = await lia.get(`/api/pedidos/${pedido.id}`);
  assert.equal(vista.pedido.imagenes.length, 1);
  const ver = await fetch(`${base}/api/pedidos/${pedido.id}/imagen/${ok.imagen.id}`, { headers: { Cookie: lia.cookie() } });
  assert.equal(ver.headers.get('content-type'), 'image/png');
  const otro = await nuevoUsuario('Otro', 'otro.foto@prueba.co');
  assert.equal((await fetch(`${base}/api/pedidos/${pedido.id}/imagen/${ok.imagen.id}`, { headers: { Cookie: otro.cookie() } })).status, 404, 'nadie más la ve');

  await lia.post(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: INICIAL, tipo: 'real' });
  await lia.subir(`/api/pedidos/${pedido.id}/export`, [['e.xlsx', plantillaExport()]]);
  await lia.get(`/api/pedidos/${pedido.id}/reporte`);
  assert.equal((await subir(lia, 'tarde.png', 'image/png', PNG)).estado, 409, 'después del reporte ya no');
});

test('clasificar el "¿por qué?": cambiar por probar la herramienta cuenta para el pivote', async () => {
  const dia = 86400000;
  const t0 = Date.parse('2026-10-01T12:00:00Z');
  const ped = (total, clasificacion) => ({ id: Math.random(), tipo: 'real', inicialGuardadaEn: new Date(t0), finalGuardadaEn: new Date(t0 + dia), conteo: { total }, clasificacion });
  assert.equal(evaluarUsuario([ped(6, 'probar')]).categoria, 'por_probar');
  assert.equal(evaluarUsuario([ped(6, 'dato')]).categoria, 'cumple');
  assert.equal(evaluarUsuario([ped(1, 'probar')]).categoria, 'no_cambia');
  const { resumirPrueba } = require('../server/equipo');
  const u = (p) => ({ evaluacion: evaluarUsuario([p]), recordatorio: null });
  const r = resumirPrueba([u(ped(0)), u(ped(1)), u(ped(7, 'probar')), u(ped(6, 'dato')), u(ped(5))]);
  assert.equal(r.veredicto, 'pivotar', '2 no cambian + 1 por probar = 3');
  assert.equal(r.cumplenSinClasificar, 1);

  // Por la API: solo el equipo, y solo pedidos con respuesta.
  const eq = cliente();
  await eq.post('/api/cuenta/entrar', { email: 'equipo@prueba.co', clave: 'clave-segura' });
  const [{ id }] = await db.query('SELECT id FROM pedidos WHERE por_que IS NOT NULL ORDER BY id LIMIT 1');
  assert.equal((await eq.post(`/api/equipo/pedidos/${id}/clasificacion`, { valor: 'probar' })).ok, true);
  assert.equal((await eq.post(`/api/equipo/pedidos/${id}/clasificacion`, { valor: 'otra' })).estado, 400);
  const res = await eq.get('/api/equipo/resultados');
  const conPedido = res.usuarios.find((x) => x.pedidos.some((p) => p.id === id));
  assert.equal(conPedido.pedidos.find((p) => p.id === id).clasificacion, 'probar');
  assert.ok(conPedido.inventario && conPedido.inventario.productos > 0, 'cuánto le cuesta equivocarse, con su último archivo');
  const ana = cliente();
  await ana.post('/api/cuenta/entrar', { email: 'ana@prueba.co', clave: 'clave-segura' });
  assert.equal((await ana.post(`/api/equipo/pedidos/${id}/clasificacion`, { valor: 'dato' })).estado, 403);
});

test('límite de intentos: después de 8 intentos de entrar con el mismo correo, espera', () => {
  delete process.env.SIN_LIMITES;
  const { limitar } = require('../server/limites');
  const mw = limitar({ max: 8, minutos: 15, clave: (r) => r.body.email });
  const req = { ip: '1.2.3.4', body: { email: 'X@y.co' } };
  const resultados = [];
  for (let i = 0; i < 9; i++) mw(req, {}, (e) => resultados.push(e ? e.estado : 'ok'));
  assert.deepEqual(resultados.slice(0, 8), new Array(8).fill('ok'));
  assert.equal(resultados[8], 429);
  mw({ ip: '1.2.3.4', body: { email: 'otro@y.co' } }, {}, (e) => assert.equal(e, undefined, 'otro correo no se bloquea'));
  process.env.SIN_LIMITES = '1';
});

test('borrar datos: cuenta antes, borra en cascada al confirmar y nunca toca al equipo', async () => {
  const { borrarDatos } = require('../server/borrar');
  const z = await nuevoUsuario('Zoe', 'zoe.borrar@prueba.co');
  const { pedido } = await z.post('/api/pedidos');
  await z.post(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: INICIAL, tipo: 'real' });
  await z.subir(`/api/pedidos/${pedido.id}/export`, [['e.xlsx', plantillaExport()]]);
  const antes = await borrarDatos({ email: 'zoe.borrar@prueba.co' });
  assert.deepEqual([antes.usuarios, antes.pedidos, antes.archivos, antes.borrado], [['zoe.borrar@prueba.co'], 1, 1, false]);
  const r = await borrarDatos({ email: 'zoe.borrar@prueba.co', confirmar: true });
  assert.equal(r.borrado, true);
  assert.equal((await db.uno("SELECT count(*)::int AS n FROM pedidos WHERE id = $1", [pedido.id])).n, 0);
  assert.equal((await db.uno("SELECT count(*)::int AS n FROM archivos WHERE pedido_id = $1", [pedido.id])).n, 0);
  const equipo = await borrarDatos({ email: 'equipo@prueba.co', confirmar: true });
  assert.equal(equipo.usuarios.length, 0, 'las cuentas del equipo no se borran');
});
