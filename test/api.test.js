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
const { evaluarUsuario, resumirPrueba, resultados, clasificar, enlaceRestablecer, marcarEquipo, anular, reactivar } = require('../server/equipo');

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
    del: (ruta) => pedir('DELETE', ruta),
    subir: (ruta, archivos) => {
      const fd = new FormData();
      for (const [nombre, buf] of archivos) fd.append('archivos', new Blob([buf]), nombre);
      return pedir('POST', ruta, undefined, fd);
    },
  };
}

async function nuevoUsuario(nombre, email) {
  const c = cliente();
  const r = await c.post('/api/cuenta/crear', { nombre, email, clave: 'clave-segura', empresa: `Empresa de ${nombre}` });
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
  assert.equal((await ana.subir(`/api/pedidos/${id}/export`, [['export.xlsx', (await plantillaExport())]])).estado, 403);

  // Borrador y validación
  assert.equal((await ana.put(`/api/pedidos/${id}/lista-inicial`, { lineas: INICIAL })).estado, 200);

  // "Real o simulado" ya no se pregunta (desde el 2026-10-29): si no viene, es real.
  const guardada = await ana.post(`/api/pedidos/${id}/lista-inicial`, { lineas: INICIAL });
  assert.equal(guardada.estado, 200);
  assert.equal(guardada.pedido.paso, 2);
  assert.equal(guardada.pedido.tipo, 'real');

  // La lista inicial queda fija
  assert.equal((await ana.put(`/api/pedidos/${id}/lista-inicial`, { lineas: [] })).estado, 409);
  assert.equal((await ana.post(`/api/pedidos/${id}/lista-inicial`, { lineas: INICIAL, tipo: 'simulado' })).estado, 409);

  // Export y reporte
  const exp = await ana.subir(`/api/pedidos/${id}/export`, [['Export año 2026.xlsx', (await plantillaExport())]]);
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

test('cada usuario ve solo lo suyo y la API no expone resultados de otras cuentas', async () => {
  const beto = await nuevoUsuario('Beto', 'beto@prueba.co');
  const caro = await nuevoUsuario('Caro', 'caro@prueba.co');
  const { pedido } = await beto.post('/api/pedidos');
  await beto.post(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: INICIAL, tipo: 'simulado' });
  assert.equal((await caro.get(`/api/pedidos/${pedido.id}`)).estado, 404);
  assert.equal((await caro.get(`/api/pedidos/${pedido.id}/reporte`)).estado, 404);
  assert.equal((await caro.put(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: [] })).estado, 404);
  assert.equal((await caro.get('/api/pedidos')).pedidos.length, 0);
  assert.equal((await caro.get('/api/equipo/resultados')).estado, 404, 'los resultados se leen con npm run resultados');
  assert.equal((await caro.get('/api/errores')).estado, 404);
  assert.equal((await cliente().get('/api/pedidos')).estado, 401);
});

test('resultados del equipo salen de los datos guardados', async () => {
  const equipo = await nuevoUsuario('Equipo', 'equipo@prueba.co');
  assert.equal((await equipo.get('/api/equipo/resultados')).estado, 404, 'ni siquiera el equipo los ve en la aplicación');
  const r = await resultados();
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
  // Con los 5 terminados el veredicto se da el mismo día, sin esperar los 14 días.
  const u = (total) => ({ evaluacion: evaluarUsuario([ped(total, t0 + dia)]) });
  assert.equal(resumirPrueba([u(6), u(5), u(7), u(2), u(0)]).veredicto, 'meta_cumplida');
  assert.equal(resumirPrueba([u(0), u(1), u(1), u(8), u(9)]).veredicto, 'pivotar');
  assert.equal(resumirPrueba([u(6), u(5), u(3), u(2), u(1)]).veredicto, 'meta_no_cumplida', 'ni meta ni pivote con los 5 terminados');
  assert.equal(resumirPrueba([u(6), u(3)]).veredicto, 'en_curso', 'faltan probadores');
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
  await eli.subir(`/api/pedidos/${pedido.id}/export`, [['export.xlsx', (await plantillaExport())]]);
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
  await fer.subir(`/api/pedidos/${pedido.id}/export`, [['export.xlsx', (await plantillaExport())]]);
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

  const res = await resultados();
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

test('cuenta: programa contable, cambiar contraseña y restablecerla con el enlace que genera el equipo (npm run resultados)', async () => {
  const hugo = await nuevoUsuario('Hugo', 'hugo@prueba.co');
  const d = await hugo.put('/api/cuenta/datos', { sistema: 'alegra' });
  assert.equal(d.usuario.sistema, 'alegra');
  assert.equal((await hugo.put('/api/cuenta/datos', { sistema: '<script>' })).estado, 400);

  assert.equal((await hugo.put('/api/cuenta/clave', { actual: 'mala', nueva: 'otra-clave-1' })).estado, 400);
  assert.equal((await hugo.put('/api/cuenta/clave', { actual: 'clave-segura', nueva: 'otra-clave-1' })).ok, true);

  assert.deepEqual(await cliente().post('/api/cuenta/olvide', { email: 'hugo@prueba.co' }), { estado: 200, correo: false }, 'sin correo configurado, se avisa');

  const [{ id }] = await db.query("SELECT id FROM usuarios WHERE email = 'hugo@prueba.co'");
  assert.equal((await hugo.post(`/api/equipo/usuarios/${id}/restablecer`)).estado, 404, 'el enlace lo genera el equipo desde la terminal');
  const { enlace } = await enlaceRestablecer('HUGO@prueba.co', 'http://localhost:3000');
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
  assert.equal(lista.sectores.length, 6);
  const inv = await c.get('/api/demo/ferreteria');
  assert.equal(inv.estado, 200);
  assert.ok(inv.inventario.productos.length > 20);
  assert.equal(inv.inventario.sugerencias, true, 'en la demo se ve la cantidad sugerida');
  const ajustes = encodeURIComponent(JSON.stringify({ entregas: { 'Importadora Herramientas del Pacífico': 1 } }));
  const corto = await c.get(`/api/demo/ferreteria?ajustes=${ajustes}`);
  assert.ok(corto.inventario.resumen.pideYa < inv.inventario.resumen.pideYa);
  assert.equal((await c.get('/api/demo/no-existe')).estado, 404);
});

test('inventario guardado: se sube desde el comienzo, con sugerido desde el primer día y se reusa en otro pedido', async () => {
  const beto = await nuevoUsuario('Beto', 'beto.inventario@prueba.co');
  const antes = await beto.get('/api/inventario');
  // Desde el 2026-10-29 (D9 y D10) se sube sin la lista inicial de un pedido de 5 pasos.
  assert.deepEqual([antes.inventario, antes.puedeSubir], [null, true]);

  const { pedido } = await beto.post('/api/pedidos');
  await beto.post(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: INICIAL, tipo: 'simulado' });
  assert.equal((await beto.subir(`/api/pedidos/${pedido.id}/export`, [['e.xlsx', (await plantillaExport())]])).ok, true);

  const inv = await beto.get('/api/inventario');
  assert.equal(inv.puedeSubir, true);
  assert.equal(inv.sugerencias, true, 'desde el 2026-10-14 el probador ve la cantidad sugerida desde el primer día');
  assert.ok(inv.inventario.productos.some((p) => p.sugerido > 0));
  assert.equal(inv.inventario.resumen.tieneCostos, false, 'la plantilla de export no trae costos: el dinero quieto se cuenta en productos');

  const guardados = await beto.put('/api/inventario/ajustes', { entregaPorDefecto: 3, cadaCuanto: 2 });
  assert.deepEqual([guardados.ajustes.entregaPorDefecto, guardados.ajustes.cadaCuanto], [3, 2]);
  assert.equal((await beto.get('/api/inventario')).inventario.ajustes.entregaPorDefecto, 3);

  // Ya puede subir desde Datos, y un pedido nuevo puede usar lo que ya subió.
  assert.equal((await beto.subir('/api/inventario/export', [['nuevo.xlsx', (await plantillaExport())]])).ok, true);
  const otro = (await beto.post('/api/pedidos')).pedido;
  assert.equal((await beto.post(`/api/pedidos/${otro.id}/export/usar-ultimo`)).estado, 403, 'primero la lista inicial');
  await beto.post(`/api/pedidos/${otro.id}/lista-inicial`, { lineas: INICIAL, tipo: 'real' });
  assert.equal((await beto.post(`/api/pedidos/${otro.id}/export/usar-ultimo`)).ok, true);
  const { reporte } = await beto.get(`/api/pedidos/${otro.id}/reporte`);
  assert.equal(reporte.archivos[0], 'nuevo.xlsx');
  const { cargas } = await beto.get('/api/inventario/cargas');
  assert.equal(cargas.length, 2);
  assert.equal((await beto.subir('/api/inventario/export', [['primero.xlsx', (await plantillaExport())]])).ok, true, 'sin lista inicial también');
  assert.equal(cargas[0].pedidoId, null, 'la de Datos no es de ningún pedido');

  // El equipo sí ve el sugerido.
  const eq = cliente();
  const ya = await eq.post('/api/cuenta/entrar', { email: 'equipo@prueba.co', clave: 'clave-segura' });
  if (ya.estado !== 200) assert.equal((await eq.post('/api/cuenta/crear', { nombre: 'Equipo', email: 'equipo@prueba.co', clave: 'clave-segura', empresa: 'SINESC' })).estado, 201);
  const { pedido: p2 } = await eq.post('/api/pedidos');
  await eq.post(`/api/pedidos/${p2.id}/lista-inicial`, { lineas: INICIAL, tipo: 'real' });
  await eq.subir(`/api/pedidos/${p2.id}/export`, [['e.xlsx', (await plantillaExport())]]);
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
  const filas = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { header: 1, blankrows: false }).filter((f) => f.length);
  assert.deepEqual(filas.find((f) => f[0] === 'A1'), ['A1', 'Uno', 'P', 3, 5, 12, 2.5]);
});

test('un probador ve todo desde el primer día y el paso 4 trae la cantidad sugerida de cada producto', async () => {
  const pepa = await nuevoUsuario('Pepa', 'pepa.alcance@prueba.co');
  const { pedido } = await pepa.post('/api/pedidos');
  await pepa.post(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: INICIAL, tipo: 'real' });
  await pepa.subir(`/api/pedidos/${pedido.id}/export`, [['e.xlsx', (await plantillaExport())]]);
  assert.equal((await pepa.get(`/api/pedidos/${pedido.id}/sugerido`)).estado, 409, 'antes de ver el reporte no hay sugerido');
  const r = await pepa.get('/api/inventario');
  assert.equal(r.alcance, 'completo');
  assert.ok(r.finPrueba, 'la ventana de 14 días sigue contando');
  const inv = r.inventario;
  assert.ok(inv.productos.some((p) => p.sugerido > 0 && p.pronostico), 'con pronóstico y sugerido');
  // Las semanas son las mismas del reporte que mide la prueba.
  const { reporte } = await pepa.get(`/api/pedidos/${pedido.id}/reporte`);
  for (const f of reporte.filas) assert.equal(inv.productos.find((p) => p.codigo === f.codigo).semanas, f.semanasInventario);
  const sug = await pepa.get(`/api/pedidos/${pedido.id}/sugerido`);
  assert.equal(sug.estado, 200);
  assert.ok(sug.entrega >= 0 && sug.cadaCuanto >= 1);
  assert.equal(sug.productos.length, reporte.filas.length);
  assert.ok(sug.productos.some((p) => p.sugerido > 0), 'algún producto trae cantidad sugerida');
  // Con más tiempo de entrega se sugiere más.
  const antes = sug.productos.reduce((t, p) => t + (p.sugerido || 0), 0);
  await pepa.put('/api/inventario/ajustes', { entregaPorDefecto: 6 });
  const mas = await pepa.get(`/api/pedidos/${pedido.id}/sugerido`);
  assert.ok(mas.productos.reduce((t, p) => t + (p.sugerido || 0), 0) > antes);
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

  // Desde la terminal (npm run resultados), y solo pedidos con respuesta.
  const [{ id }] = await db.query('SELECT id FROM pedidos WHERE por_que IS NOT NULL ORDER BY id LIMIT 1');
  assert.deepEqual(await clasificar(id, 'probar'), { id, valor: 'probar' });
  await assert.rejects(clasificar(id, 'otra'), { estado: 400 });
  const [{ id: sinRespuesta }] = await db.query('SELECT id FROM pedidos WHERE por_que IS NULL ORDER BY id LIMIT 1');
  await assert.rejects(clasificar(sinRespuesta, 'dato'), { estado: 404 });
  const res = await resultados();
  const conPedido = res.usuarios.find((x) => x.pedidos.some((p) => p.id === id));
  assert.equal(conPedido.pedidos.find((p) => p.id === id).clasificacion, 'probar');
  assert.ok(conPedido.inventario && conPedido.inventario.productos > 0, 'cuánto le cuesta equivocarse, con su último archivo');
  const ana = cliente();
  await ana.post('/api/cuenta/entrar', { email: 'ana@prueba.co', clave: 'clave-segura' });
  assert.equal((await ana.post(`/api/equipo/pedidos/${id}/clasificacion`, { valor: 'dato' })).estado, 404);
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
  await z.subir(`/api/pedidos/${pedido.id}/export`, [['e.xlsx', (await plantillaExport())]]);
  const antes = await borrarDatos({ email: 'zoe.borrar@prueba.co' });
  assert.deepEqual([antes.usuarios, antes.pedidos, antes.archivos, antes.borrado], [['zoe.borrar@prueba.co'], 1, 1, false]);
  const r = await borrarDatos({ email: 'zoe.borrar@prueba.co', confirmar: true });
  assert.equal(r.borrado, true);
  assert.equal((await db.uno("SELECT count(*)::int AS n FROM pedidos WHERE id = $1", [pedido.id])).n, 0);
  assert.equal((await db.uno("SELECT count(*)::int AS n FROM archivos WHERE pedido_id = $1", [pedido.id])).n, 0);
  const equipo = await borrarDatos({ email: 'equipo@prueba.co', confirmar: true });
  assert.equal(equipo.usuarios.length, 0, 'las cuentas del equipo no se borran');
});

test('ejemplos del equipo: un probador no los ve; el equipo carga un negocio y un archivo como su inventario', async () => {
  const probador = await nuevoUsuario('Probador Ejemplos', 'probador.ejemplos@prueba.co');
  assert.equal((await probador.get('/api/equipo/ejemplos')).estado, 403);
  assert.equal((await probador.post('/api/equipo/ejemplos/negocios/ferreteria/cargar')).estado, 403);

  const eq = cliente();
  const ya = await eq.post('/api/cuenta/entrar', { email: 'equipo@prueba.co', clave: 'clave-segura' });
  if (ya.estado !== 200) assert.equal((await eq.post('/api/cuenta/crear', { nombre: 'Equipo', email: 'equipo@prueba.co', clave: 'clave-segura', empresa: 'SINESC' })).estado, 201);
  const lista = await eq.get('/api/equipo/ejemplos');
  assert.equal(lista.negocios.length, 6);
  assert.ok(lista.archivos.every((a) => a.disponible), 'los archivos de ejemplos/ están en el repo');

  // El archivo del negocio pasa por el lector y da lo mismo que la demo.
  const r = await eq.post('/api/equipo/ejemplos/negocios/ferreteria/cargar');
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  const demo = await eq.get('/api/demo/ferreteria');
  const { inventario } = await eq.get('/api/inventario');
  assert.equal(inventario.productos.length, demo.inventario.productos.length);
  const semanasDemo = new Map(demo.inventario.productos.map((p) => [p.codigo, p.semanas]));
  for (const p of inventario.productos) assert.equal(p.semanas, semanasDemo.get(p.codigo), p.codigo);
  assert.ok(inventario.productos.some((p) => p.proveedor === 'Importadora Herramientas del Pacífico' && p.entrega === 10), 'trae proveedor y tiempo de entrega');

  // El listado de inventario con salidas del periodo (sin fecha por venta) trae su periodo y se lee solo.
  const listado = await eq.post('/api/equipo/ejemplos/negocios/distribuidora/cargar?formato=listado');
  assert.equal(listado.ok, true, JSON.stringify(listado.errores));
  const conListado = await eq.get('/api/inventario');
  assert.equal(conListado.inventario.productos.length, 30);
  assert.equal(conListado.inventario.ajustes.cadaCuanto, 1, 'la distribuidora pide cada semana');
  assert.equal((await eq.post('/api/equipo/ejemplos/negocios/ferreteria/cargar?formato=listado')).estado, 404, 'solo los negocios que trabajan con listado');

  const siigo = await eq.post('/api/equipo/ejemplos/archivos/siigo/cargar');
  assert.equal(siigo.ok, true, JSON.stringify(siigo.errores));
  assert.equal((await eq.post('/api/equipo/ejemplos/archivos/lista/cargar')).estado, 400, 'la lista se importa en un pedido');
  const descarga = await fetch(`${base}/api/equipo/ejemplos/archivos/sap/sap-ventas-y-stock.xlsx`, { headers: { Cookie: eq.cookie() } });
  assert.equal(descarga.status, 200);
  assert.equal((await fetch(`${base}/api/equipo/ejemplos/archivos/sap/..%2Fpackage.json`, { headers: { Cookie: eq.cookie() } })).status, 404);
});

test('archivos comprimidos (.gz, como los manda el navegador para Vercel) se guardan y se leen como el original', async () => {
  const zlib = require('zlib');
  const gz = await nuevoUsuario('Gael', 'gael.gz@prueba.co');
  const { pedido } = await gz.post('/api/pedidos');
  await gz.post(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: INICIAL, tipo: 'simulado' });
  const original = await plantillaExport();
  const r = await gz.subir(`/api/pedidos/${pedido.id}/export`, [['ventas y existencias.xlsx.gz', zlib.gzipSync(original)]]);
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  const guardado = await db.uno("SELECT nombre, tamano FROM archivos WHERE pedido_id = $1 AND tipo = 'export'", [pedido.id]);
  assert.equal(guardado.nombre, 'ventas y existencias.xlsx');
  assert.equal(guardado.tamano, original.length);
  const roto = await gz.subir(`/api/pedidos/${pedido.id}/export`, [['malo.csv.gz', Buffer.from('no es gzip')]]);
  assert.equal(roto.estado, 400);
  assert.equal((await gz.get('/api/salud')).ok, true, 'la API también responde /api/salud');
  const plantilla = await fetch(`${base}/api/plantillas/export.xlsx`);
  assert.equal(plantilla.status, 200);
});

test('pedido en PDF tamaño carta, para que gerencia lo apruebe', async () => {
  const pdf = await nuevoUsuario('Paola', 'paola.pdf@prueba.co');
  const r = await fetch(`${base}/api/exportar/pedido.pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: pdf.cookie() },
    body: JSON.stringify({ empresa: 'Ferretería Prueba', cadaCuanto: '2 semanas', lineas: [
      { proveedor: 'Tornillería Central', codigo: 'TOR-1', nombre: 'Tornillo', cantidad: 40, costo: 900, semanas: 1.2 },
      { proveedor: 'Pinturas', codigo: 'PIN-1', nombre: 'Pintura blanca, galón', cantidad: 6, costo: 42000, semanas: null },
    ] }),
  });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  const buf = Buffer.from(await r.arrayBuffer());
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  assert.match(buf.toString('latin1'), /\/MediaBox \[0 0 612 792\]/, 'tamaño carta');
  const vacio = await fetch(`${base}/api/exportar/pedido.pdf`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: pdf.cookie() }, body: JSON.stringify({ lineas: [] }) });
  assert.equal(vacio.status, 400);
});

test('borrar un pedido sin terminar: desaparece para el usuario, la prueba no cambia de fecha y uno terminado no se borra', async () => {
  const bea = await nuevoUsuario('Bea', 'bea.borrar@prueba.co');
  const { pedido: a } = await bea.post('/api/pedidos');
  await bea.post(`/api/pedidos/${a.id}/lista-inicial`, { lineas: INICIAL, tipo: 'simulado' });
  const antes = await bea.get('/api/inventario');
  const { pedido: b } = await bea.post('/api/pedidos');
  assert.equal((await bea.get(`/api/pedidos/${b.id}`)).pedido.numero, 2);

  // El primero (con la lista inicial que empieza la prueba) se borra sin terminar.
  assert.equal((await bea.del(`/api/pedidos/${a.id}`)).ok, true);
  assert.equal((await bea.get(`/api/pedidos/${a.id}`)).estado, 404, 'para el usuario ya no existe');
  const { pedidos } = await bea.get('/api/pedidos');
  assert.deepEqual(pedidos.map((p) => p.id), [b.id]);
  assert.equal((await bea.get(`/api/pedidos/${b.id}`)).pedido.numero, 1, 'se renumera');
  const despues = await bea.get('/api/inventario');
  assert.equal(despues.puedeSubir, true, 'sigue pudiendo subir su inventario');
  assert.equal(String(despues.finPrueba), String(antes.finPrueba), 'los 14 días no se corren');

  // Un pedido terminado no se borra.
  await bea.post(`/api/pedidos/${b.id}/lista-inicial`, { lineas: INICIAL, tipo: 'real' });
  await bea.subir(`/api/pedidos/${b.id}/export`, [['e.xlsx', await plantillaExport()]]);
  await bea.get(`/api/pedidos/${b.id}/reporte`);
  await bea.post(`/api/pedidos/${b.id}/lista-final`, { lineas: INICIAL });
  assert.equal((await bea.del(`/api/pedidos/${b.id}`)).estado, 409, 'con la lista final guardada ya es un resultado');
  await bea.post(`/api/pedidos/${b.id}/por-que`, { respuesta: 'No cambié nada.' });
  assert.equal((await bea.del(`/api/pedidos/${b.id}`)).estado, 409);

  // Nadie más lo puede borrar, y el equipo lo ve como borrado.
  const otro = await nuevoUsuario('Otro Borrar', 'otro.borrar@prueba.co');
  assert.equal((await otro.del(`/api/pedidos/${b.id}`)).estado, 404);
  const eq = cliente();
  const ya = await eq.post('/api/cuenta/entrar', { email: 'equipo@prueba.co', clave: 'clave-segura' });
  if (ya.estado !== 200) await eq.post('/api/cuenta/crear', { nombre: 'Equipo', email: 'equipo@prueba.co', clave: 'clave-segura', empresa: 'SINESC' });
  const r = await resultados();
  const suyo = r.usuarios.find((u) => u.email === 'bea.borrar@prueba.co');
  assert.equal(suyo.pedidos.find((p) => p.id === a.id).borrado, true);
});

test('el archivo de un pedido borrado deja de ser el inventario (salvo que otro pedido lo use)', async () => {
  const ivo = await nuevoUsuario('Ivo', 'ivo.borrar@prueba.co');
  const { pedido: a } = await ivo.post('/api/pedidos');
  await ivo.post(`/api/pedidos/${a.id}/lista-inicial`, { lineas: INICIAL, tipo: 'simulado' });
  await ivo.subir(`/api/pedidos/${a.id}/export`, [['e.xlsx', await plantillaExport()]]);
  assert.ok((await ivo.get('/api/inventario')).inventario, 'con el archivo, hay inventario');

  // Otro pedido reutiliza ese archivo: al borrar el primero, el inventario sigue.
  const { pedido: b } = await ivo.post('/api/pedidos');
  await ivo.post(`/api/pedidos/${b.id}/lista-inicial`, { lineas: INICIAL, tipo: 'simulado' });
  assert.equal((await ivo.post(`/api/pedidos/${b.id}/export/usar-ultimo`)).ok, true);
  await ivo.del(`/api/pedidos/${a.id}`);
  assert.ok((await ivo.get('/api/inventario')).inventario, 'lo usa un pedido vivo');

  // Al borrar también el segundo, ya no hay inventario ni cargas, pero puede volver a subir.
  await ivo.del(`/api/pedidos/${b.id}`);
  const inv = await ivo.get('/api/inventario');
  assert.equal(inv.inventario, null);
  assert.equal(inv.puedeSubir, true);
  assert.equal((await ivo.get('/api/inventario/cargas')).cargas.length, 0);
});

test('cada tipo de usuario ve lo que le toca: visitante, probador nuevo, en prueba, después de la prueba y equipo', async () => {
  // Visitante: la demo sí; lo de una cuenta, no.
  const visita = cliente();
  assert.equal((await visita.get('/api/demo/ferreteria')).inventario.alcance, 'completo');
  for (const ruta of ['/api/inventario', '/api/pedidos', '/api/equipo/ejemplos']) {
    assert.equal((await visita.get(ruta)).estado, 401, ruta);
  }

  // Usuario nuevo: todavía sin inventario, pero lo puede subir desde el comienzo; nada del equipo.
  const tito = await nuevoUsuario('Tito', 'tito.tipos@prueba.co');
  const nuevo = await tito.get('/api/inventario');
  assert.equal(nuevo.inventario, null);
  assert.equal(nuevo.puedeSubir, true);
  assert.equal((await tito.get('/api/equipo/ejemplos')).estado, 403);

  // En prueba: ya ve todo (desde el 2026-10-14).
  const { pedido } = await tito.post('/api/pedidos');
  await tito.post(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: INICIAL, tipo: 'real' });
  await tito.subir(`/api/pedidos/${pedido.id}/export`, [['e.xlsx', await plantillaExport()]]);
  const enPrueba = await tito.get('/api/inventario');
  assert.equal(enPrueba.alcance, 'completo');
  assert.equal(enPrueba.sugerencias, true);

  // Después de sus 14 días: ve todo, con pronóstico y sugerido.
  await db.query("UPDATE pedidos SET inicial_guardada_en = now() - interval '15 days' WHERE id = $1", [pedido.id]);
  const despues = await tito.get('/api/inventario');
  assert.equal(despues.alcance, 'completo');
  assert.equal(despues.sugerencias, true);
  assert.ok(despues.inventario.productos.some((p) => p.pronostico && p.riesgo !== null), 'con pronóstico y riesgo');

  // Equipo: todo desde el primer día, y no cuenta como probador.
  const eq = cliente();
  const ya = await eq.post('/api/cuenta/entrar', { email: 'equipo@prueba.co', clave: 'clave-segura' });
  if (ya.estado !== 200) await eq.post('/api/cuenta/crear', { nombre: 'Equipo', email: 'equipo@prueba.co', clave: 'clave-segura', empresa: 'SINESC' });
  assert.equal((await eq.get('/api/inventario')).alcance, 'completo');
  const r = await resultados();
  assert.ok(r.usuarios.some((u) => u.email === 'tito.tipos@prueba.co'));
  assert.ok(!r.usuarios.some((u) => u.email === 'equipo@prueba.co'));
});

test('el equipo marca a un compañero como del equipo (npm run resultados) y deja de contar como probador', async () => {
  const jose = await nuevoUsuario('Jose', 'jose@otro.co');
  const antes = await resultados();
  const fila = antes.usuarios.find((u) => u.email === 'jose@otro.co');
  assert.ok(fila, 'empieza contando como probador');
  assert.equal((await jose.post(`/api/equipo/usuarios/${fila.id}/equipo`)).estado, 404, 'no hay ruta en la aplicación');
  await marcarEquipo('jose@otro.co');
  await assert.rejects(marcarEquipo('nadie@otro.co'), { estado: 404 });
  const despues = await resultados();
  assert.ok(!despues.usuarios.some((u) => u.email === 'jose@otro.co'), 'ya no cuenta');
  const otra = cliente();
  await otra.post('/api/cuenta/entrar', { email: 'jose@otro.co', clave: 'clave-segura' });
  assert.equal((await otra.get('/api/cuenta/yo')).usuario.rol, 'equipo', 'al volver a entrar sigue siendo del equipo aunque no esté en TEAM_EMAILS');
});

test('la lista de ejemplo de una plantilla vieja no se acepta como lista inicial', async () => {
  const XLSX = require('xlsx');
  const { PRODUCTOS_EJEMPLO } = require('../server/plantillas');
  const libro = XLSX.utils.book_new();
  const filas = [['Código', 'Descripción', 'Cantidad a pedir'], ...PRODUCTOS_EJEMPLO.slice(0, 5).map((p) => [p.codigo, p.nombre, 10])];
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), 'Pedido');
  const vieja = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
  const nico = await nuevoUsuario('Nico', 'nico@prueba.co');
  const { pedido } = await nico.post('/api/pedidos');
  const subirLista = (buf) => {
    const fd = new FormData();
    fd.append('archivo', new Blob([buf]), 'plantilla-lista-pedido.xlsx');
    return fetch(`${base}/api/pedidos/${pedido.id}/importar-lista`, { method: 'POST', headers: { Cookie: nico.cookie() }, body: fd }).then((r) => r.json());
  };
  const r = await subirLista(vieja);
  assert.equal(r.ok, false);
  assert.match(r.errores[0], /productos de ejemplo/);
  const propia = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(propia, XLSX.utils.aoa_to_sheet([['Código', 'Cantidad a pedir'], ['CIN-0003', 10], ['ZZ-9', 4]]), 'Pedido');
  assert.equal((await subirLista(XLSX.write(propia, { type: 'buffer', bookType: 'xlsx' }))).ok, true, 'con un producto propio sí se acepta');
});

test('umbral de "se agota" elegido en Datos: lo usan los reportes nuevos y los ya vistos se quedan como estaban', async () => {
  const gio = await nuevoUsuario('Gio', 'gio@prueba.co');
  const primero = (await gio.post('/api/pedidos')).pedido.id;
  await gio.post(`/api/pedidos/${primero}/lista-inicial`, { lineas: INICIAL, tipo: 'real' });
  await gio.subir(`/api/pedidos/${primero}/export`, [['export.xlsx', (await plantillaExport())]]);
  const antes = (await gio.get(`/api/pedidos/${primero}/reporte`)).reporte;
  assert.equal(antes.umbrales.seAgota, 2, 'sin elegir nada, 2 semanas');

  const r = await gio.put('/api/inventario/ajustes', { semanasAgota: 11 });
  assert.equal(r.ajustes.semanasAgota, 11);
  assert.equal((await gio.put('/api/inventario/ajustes', { cadaCuanto: 3 })).ajustes.semanasAgota, 11, 'cambiar otro ajuste no lo borra');
  const inv = (await gio.get('/api/inventario')).inventario;
  assert.equal(inv.umbrales.seAgota, 11);
  assert.ok(inv.resumen.seAgotan >= antes.resumen.seAgotan);

  const segundo = (await gio.post('/api/pedidos')).pedido.id;
  await gio.post(`/api/pedidos/${segundo}/lista-inicial`, { lineas: INICIAL, tipo: 'real' });
  await gio.subir(`/api/pedidos/${segundo}/export`, [['export.xlsx', (await plantillaExport())]]);
  const despues = (await gio.get(`/api/pedidos/${segundo}/reporte`)).reporte;
  assert.equal(despues.umbrales.seAgota, 11);
  assert.ok(despues.resumen.seAgotan > antes.resumen.seAgotan, 'con 11 semanas se agotan más productos');
  assert.equal((await gio.get(`/api/pedidos/${primero}/reporte`)).reporte.umbrales.seAgota, 2, 'el reporte anterior no cambia');
  assert.equal((await gio.get(`/api/pedidos/${segundo}/recordatorio`)).plan.semanasAgota, 11);

  const equipo = cliente();
  await equipo.post('/api/cuenta/entrar', { email: 'equipo@prueba.co', clave: 'clave-segura' });
  const suyo = (await resultados()).usuarios.find((u) => u.email === 'gio@prueba.co');
  assert.equal(suyo.semanasAgota, 11);
  assert.deepEqual(suyo.pedidos.map((p) => p.semanasAgota), [2, 11]);
});

test('umbral de "se agota" en el paso 2: sirve también al usar el inventario guardado y queda fijo al ver el reporte', async () => {
  const hel = await nuevoUsuario('Hel', 'hel@prueba.co');
  const uno = (await hel.post('/api/pedidos')).pedido.id;
  assert.equal((await hel.put(`/api/pedidos/${uno}/semanas-agota`, { semanas: 5 })).estado, 403, 'antes de la lista inicial no');
  await hel.post(`/api/pedidos/${uno}/lista-inicial`, { lineas: INICIAL, tipo: 'real' });
  assert.equal((await hel.get(`/api/pedidos/${uno}`)).pedido.semanasAgota, 2);
  await hel.subir(`/api/pedidos/${uno}/export`, [['export.xlsx', (await plantillaExport())]]);
  const con2 = (await hel.get(`/api/pedidos/${uno}/reporte`)).reporte;
  assert.equal(con2.umbrales.seAgota, 2);
  const tarde = await hel.put(`/api/pedidos/${uno}/semanas-agota`, { semanas: 5 });
  assert.equal(tarde.estado, 409, 'después de ver el reporte ya no cambia');

  const dos = (await hel.post('/api/pedidos')).pedido.id;
  await hel.post(`/api/pedidos/${dos}/lista-inicial`, { lineas: INICIAL, tipo: 'real' });
  assert.equal((await hel.put(`/api/pedidos/${dos}/semanas-agota`, { semanas: 0 })).estado, 400);
  assert.equal((await hel.put(`/api/pedidos/${dos}/semanas-agota`, { semanas: 12 })).estado, 400);
  const elegido = await hel.put(`/api/pedidos/${dos}/semanas-agota`, { semanas: 11 });
  assert.equal(elegido.pedido.semanasAgota, 11);
  assert.equal((await hel.post(`/api/pedidos/${dos}/export/usar-ultimo`)).ok, true);
  const con11 = (await hel.get(`/api/pedidos/${dos}/reporte`)).reporte;
  assert.equal(con11.umbrales.seAgota, 11, 'el archivo se subió con 2, pero este pedido usa 11');
  assert.ok(con11.resumen.seAgotan > con2.resumen.seAgotan);
  assert.equal((await hel.get(`/api/pedidos/${uno}/reporte`)).reporte.umbrales.seAgota, 2, 'el primer pedido no cambia');
  assert.equal((await hel.get('/api/inventario')).inventario.umbrales.seAgota, 11, 'queda también como el de Datos');

  // La coherencia del equipo usa las filas como las vio en ese pedido.
  const final = INICIAL.map((l) => ({ ...l }));
  final[0].cantidad = '999';
  assert.equal((await hel.post(`/api/pedidos/${dos}/lista-final`, { lineas: final })).estado, 200);
  const equipo = cliente();
  await equipo.post('/api/cuenta/entrar', { email: 'equipo@prueba.co', clave: 'clave-segura' });
  const suyo = (await resultados()).usuarios.find((u) => u.email === 'hel@prueba.co');
  assert.deepEqual(suyo.pedidos.map((p) => p.semanasAgota), [2, 11]);
  assert.ok(suyo.actividad.some((e) => e.tipo === 'umbral_elegido' && e.detalle.semanas === 11));
});

test('anular un pedido: sigue a la vista con su motivo, no se edita, no cuenta en el veredicto y se reactiva', async () => {
  const ana = await nuevoUsuario('Ana Anula', 'ana.anular@prueba.co');
  const { pedido: p } = await ana.post('/api/pedidos');
  await ana.post(`/api/pedidos/${p.id}/lista-inicial`, { lineas: INICIAL, tipo: 'real' });
  await ana.subir(`/api/pedidos/${p.id}/export`, [['e.xlsx', await plantillaExport()]]);
  await ana.get(`/api/pedidos/${p.id}/reporte`);
  await ana.post(`/api/pedidos/${p.id}/lista-final`, { lineas: INICIAL.slice(0, 1) });

  // Con la lista final guardada no se borra, pero sí se anula.
  const r = await ana.post(`/api/pedidos/${p.id}/anular`, { motivo: 'Al final no se hizo este pedido.' });
  assert.equal(r.pedido.anulado.motivo, 'Al final no se hizo este pedido.');
  assert.equal((await ana.post(`/api/pedidos/${p.id}/anular`)).estado, 409, 'ya estaba anulado');
  const { pedidos } = await ana.get('/api/pedidos');
  assert.ok(pedidos.find((x) => x.id === p.id).anulado, 'sigue en su lista, marcado');
  assert.equal((await ana.post(`/api/pedidos/${p.id}/por-que`, { respuesta: 'x' })).estado, 409, 'anulado no se edita');
  assert.equal((await ana.get(`/api/pedidos/${p.id}`)).pedido.paso, 5, 'se puede ver');

  // Nadie más lo anula; el equipo lo ve anulado y no cuenta para el veredicto.
  const otra = await nuevoUsuario('Otra Anula', 'otra.anular@prueba.co');
  assert.equal((await otra.post(`/api/pedidos/${p.id}/reactivar`)).estado, 404);
  const eq = cliente();
  const ya = await eq.post('/api/cuenta/entrar', { email: 'equipo@prueba.co', clave: 'clave-segura' });
  if (ya.estado !== 200) await eq.post('/api/cuenta/crear', { nombre: 'Equipo', email: 'equipo@prueba.co', clave: 'clave-segura', empresa: 'SINESC' });
  let suyo = (await resultados()).usuarios.find((u) => u.email === 'ana.anular@prueba.co');
  assert.equal(suyo.pedidos[0].anulado.motivo, 'Al final no se hizo este pedido.');
  assert.equal(suyo.evaluacion.mejor, null);

  // Reactivado vuelve a contar y se puede terminar.
  assert.ok((await ana.post(`/api/pedidos/${p.id}/reactivar`)).pedido);
  suyo = (await resultados()).usuarios.find((u) => u.email === 'ana.anular@prueba.co');
  assert.equal(suyo.evaluacion.mejor.id, p.id);
  assert.equal((await ana.post(`/api/pedidos/${p.id}/por-que`, { respuesta: 'Quité lo que sobraba.' })).estado, 200);

  // El equipo también puede anular y reactivar el pedido de un probador, desde la terminal.
  await anular(p.id, 'Pedido de ensayo');
  assert.equal((await ana.get(`/api/pedidos/${p.id}`)).pedido.anulado.motivo, 'Pedido de ensayo');
  await reactivar(p.id);
  await assert.rejects(reactivar(p.id), { estado: 404 }, 'ya no está anulado');
  assert.equal((await ana.post(`/api/equipo/pedidos/${p.id}/anular`)).estado, 404, 'no hay ruta en la aplicación');
});

test('el proveedor de la lista queda atado a cada producto, como en Datos', async () => {
  const pia = await nuevoUsuario('Pia Proveedor', 'pia.proveedor@prueba.co');
  const { pedido: p } = await pia.post('/api/pedidos');
  const lineas = INICIAL.map((l, i) => ({ ...l, proveedor: i < 2 ? 'Tornillería Central' : '' }));
  const r = await pia.post(`/api/pedidos/${p.id}/lista-inicial`, { lineas, tipo: 'real' });
  assert.equal(r.pedido.listaInicial[0].proveedor, 'Tornillería Central');
  assert.equal(r.pedido.listaInicial[2].proveedor, undefined);
  await pia.subir(`/api/pedidos/${p.id}/export`, [['e.xlsx', await plantillaExport()]]);
  const inv = await pia.get('/api/inventario');
  const tor = inv.inventario.productos.find((x) => x.codigo === 'TOR-0610');
  assert.equal(tor.proveedor, 'Tornillería Central');
  assert.equal(tor.origenProveedor, 'producto');
});

test('terminar el pedido sin contar qué tuvo en cuenta: la respuesta es opcional y queda vacía', async () => {
  const oto = await nuevoUsuario('Oto', 'oto.opcional@prueba.co');
  const { pedido } = await oto.post('/api/pedidos');
  await oto.post(`/api/pedidos/${pedido.id}/lista-inicial`, { lineas: INICIAL, tipo: 'real' });
  await oto.subir(`/api/pedidos/${pedido.id}/export`, [['e.xlsx', await plantillaExport()]]);
  await oto.get(`/api/pedidos/${pedido.id}/reporte`);
  await oto.post(`/api/pedidos/${pedido.id}/lista-final`, { lineas: INICIAL });
  const fin = await oto.post(`/api/pedidos/${pedido.id}/por-que`, { respuesta: '   ' });
  assert.equal(fin.pedido.terminado, true);
  assert.equal(fin.pedido.porQue, null);
  await assert.rejects(clasificar(pedido.id, 'dato'), { estado: 404 }, 'sin respuesta no hay nada que clasificar');
});
