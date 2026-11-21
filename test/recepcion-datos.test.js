'use strict';

// SP5 de docs/PLAN_ALPHA_02.md: lo pedido que cuenta "en camino" hasta que entra (T5), ventas de un periodo,
// importar movimientos de un archivo, códigos que no coinciden entre ventas y existencias y las
// columnas recordadas por empresa. Base de datos en memoria.

process.env.DATA_DIR = 'memory://';
process.env.SIN_LIMITES = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../server/db');
const { crearApp } = require('../server/app');
const { plantillaExport } = require('../server/plantillas');
const { claveCodigo } = require('../server/valores');
const { calcularRotacion, revisarCodigos } = require('../server/rotacion');
const { fechaBogota } = require('../server/recordatorios');
const S = require('../server/saldos');

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
    const h = cookie ? { Cookie: cookie } : {};
    let body;
    if (formulario) body = formulario;
    else if (cuerpo !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(cuerpo); }
    const r = await fetch(base + ruta, { method: metodo, headers: h, body });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { estado: r.status, ...(await r.json()) };
  }
  return {
    get: (ruta) => pedir('GET', ruta),
    post: (ruta, cuerpo) => pedir('POST', ruta, cuerpo ?? {}),
    put: (ruta, cuerpo) => pedir('PUT', ruta, cuerpo),
    subir: (ruta, archivos, campo = 'archivos') => {
      const fd = new FormData();
      for (const [nombre, buf] of archivos) fd.append(campo, new Blob([buf]), nombre);
      return pedir('POST', ruta, undefined, fd);
    },
  };
}

async function cuenta(nombre, email, extra) {
  const c = cliente();
  const r = await c.post('/api/cuenta/crear', { nombre, email, clave: 'clave-segura', ...extra });
  assert.equal(r.estado, 201, r.error);
  return c;
}

const hoy = () => fechaBogota();
const porCodigo = (inv, codigo) => inv.productos.find((p) => claveCodigo(p.codigo) === claveCodigo(codigo));
const mov = (id, codigo, tipo, cantidad, fecha, extra = {}) => ({ id, codigo, nombre: '', tipo, cantidad, fecha, ...extra });

// --- Lo pedido y todavía en camino ---------------------------------------------------------------------------

let ana;
let carla;
let pedido;
let antes;

test('al cerrar un pedido, lo pedido cuenta en camino y el sugerido lo descuenta', async () => {
  ana = await cuenta('Ana Recibe', 'ana.recibe@prueba.co', { empresa: 'Ferretería Llegadas' });
  assert.equal((await ana.subir('/api/inventario/export', [['inventario.xlsx', await plantillaExport()]])).ok, true);
  antes = (await ana.get('/api/inventario')).inventario;
  pedido = (await ana.post('/api/pedidos', { modo: 'sugerido' })).pedido;
  assert.ok(pedido.sugerido.length >= 3, 'la plantilla trae varios productos para pedir');
  assert.equal((await ana.post(`/api/pedidos/${pedido.id}/lista-final`, { lineas: pedido.listaFinal })).estado, 200);
  assert.equal((await ana.post(`/api/pedidos/${pedido.id}/por-que`, { respuesta: '' })).estado, 200);

  const inv = (await ana.get('/api/inventario')).inventario;
  assert.equal(inv.resumen.enCamino, pedido.listaFinal.length);
  for (const l of pedido.listaFinal) {
    const p = porCodigo(inv, l.codigo);
    assert.equal(p.enCamino.cantidad, l.cantidad, `${l.codigo} en camino`);
    assert.equal(p.detalleSugerido.enCamino, l.cantidad);
    // Lo pedido cubría lo que faltaba: ya no se sugiere pedirlo otra vez.
    assert.ok(p.sugerido < porCodigo(antes, l.codigo).sugerido, `${l.codigo}: ${p.sugerido} < ${porCodigo(antes, l.codigo).sugerido}`);
    assert.notEqual(p.estado, 'pide', 'lo ya pedido no sale como "pedir ya"');
  }
});

test('lo pedido deja de contar en camino al registrar su entrada, y vence con la ventana', async () => {
  const inv = await ana.post('/api/empresa/invitaciones', { email: 'carla.recibe@prueba.co', rol: 'administrador' });
  carla = await cuenta('Carla Bodega', 'carla.recibe@prueba.co', { invitacion: new URL(inv.enlace).searchParams.get('invitacion') });
  const [primera, segunda, tercera] = pedido.listaFinal;
  const enCamino = async (codigo) => porCodigo((await ana.get('/api/inventario')).inventario, codigo).enCamino;
  // El pedido solo suma "en camino": las existencias no cambian por pedir.
  const existencias = async (codigo) => (await ana.get('/api/existencias')).productos.find((p) => claveCodigo(p.codigo) === claveCodigo(codigo)).existencias;
  const antes0 = await existencias(primera.codigo);

  // Una entrada parcial de la primera, registrada en Movimientos, descuenta lo que llegó.
  const parcial = Math.min(1, primera.cantidad - 0.5);
  const r1 = await ana.post('/api/movimientos', { movimientos: [{ codigo: primera.codigo, tipo: 'entrada', cantidad: String(parcial), fecha: hoy() }] });
  assert.equal(r1.estado, 201, r1.error);
  assert.equal((await enCamino(primera.codigo)).cantidad, primera.cantidad - parcial);
  // Completa: ya no cuenta.
  const r2 = await ana.post('/api/movimientos', { movimientos: [{ codigo: primera.codigo, tipo: 'entrada', cantidad: String(primera.cantidad - parcial), fecha: hoy() }] });
  assert.equal(r2.estado, 201, r2.error);
  assert.equal(await enCamino(primera.codigo), null);
  assert.equal((await enCamino(tercera.codigo)).cantidad, tercera.cantidad, 'lo que no ha entrado sigue contando');
  assert.equal(await existencias(primera.codigo), antes0 + primera.cantidad, 'las existencias solo suben con lo registrado');

  // Si se anula la entrada, vuelve a estar en camino.
  const entradas = (await ana.get('/api/movimientos')).movimientos.filter((m) => claveCodigo(m.codigo) === claveCodigo(primera.codigo) && m.tipo === 'entrada');
  assert.equal((await ana.post(`/api/movimientos/${entradas[0].id}/anular`)).estado, 200);
  assert.ok((await enCamino(primera.codigo)).cantidad > 0);

  // Pasada la ventana (14 días o lo que tarda el proveedor) el pedido ya no cuenta, aunque nada haya entrado.
  await db.query("UPDATE pedidos SET terminado_en = now() - interval '15 days' WHERE id = $1", [pedido.id]);
  assert.equal(await enCamino(segunda.codigo), null);
  assert.equal(porCodigo((await ana.get('/api/inventario')).inventario, segunda.codigo).pedidoReciente, null);
  // Con un proveedor que tarda 6 semanas (42 días), a los 15 sigue contando.
  assert.equal((await ana.put('/api/inventario/ajustes', { entregaPorDefecto: 6 })).estado, 200);
  assert.ok((await enCamino(segunda.codigo)).cantidad > 0, 'la ventana crece con el tiempo de entrega');
  assert.equal(porCodigo((await ana.get('/api/inventario')).inventario, segunda.codigo).pedidoReciente.cantidad, segunda.cantidad);
  // Un pedido simulado no cuenta.
  await db.query("UPDATE pedidos SET tipo = 'simulado' WHERE id = $1", [pedido.id]);
  assert.equal(await enCamino(segunda.codigo), null);
  await db.query("UPDATE pedidos SET tipo = 'real' WHERE id = $1", [pedido.id]);
});

// --- Ventas de un periodo ------------------------------------------------------------------------

test('una venta de un periodo se reparte por partes iguales entre sus días', () => {
  const v = S.ventasDeMovimientos([mov(1, 'A', 'venta', 30, '2026-09-30', { desde: '2026-09-01' }), mov(2, 'A', 'venta', 2, '2026-09-30')]);
  assert.equal(v.length, 31);
  const delPeriodo = v.slice(0, 30);
  assert.ok(delPeriodo.every((x) => Math.abs(x.cantidad - 1) < 1e-9));
  assert.equal(delPeriodo[0].dia, S.diaDeFecha('2026-09-01'));
  assert.equal(delPeriodo[29].dia, S.diaDeFecha('2026-09-30'));
  // Las existencias bajan el último día, completas.
  assert.equal(S.saldos({ base: { A: 50 }, movimientos: [mov(1, 'A', 'venta', 30, '2026-09-30', { desde: '2026-09-01' })] }).get('A'), 20);
});

test('una venta de un periodo que empieza antes del archivo se cuenta en proporción', () => {
  const baseArchivo = { ventas: [{ codigo: 'A', nombre: '', dia: S.diaDeFecha('2026-09-10'), cantidad: 4 }], existencias: [{ codigo: 'A', nombre: '', existencias: 100 }], hasta: S.diaDeFecha('2026-09-10') };
  const c = S.combinar({ base: baseArchivo, movimientos: [mov(1, 'A', 'venta', 30, '2026-09-30', { desde: '2026-09-01' })] });
  // 30 días, 10 ya en el archivo: quedan 20.
  assert.equal(c.existencias[0].existencias, 80);
  const delPeriodo = c.ventas.slice(1);
  assert.equal(delPeriodo.length, 20);
  assert.equal(delPeriodo[0].dia, S.diaDeFecha('2026-09-11'));
  assert.ok(Math.abs(delPeriodo.reduce((s, x) => s + x.cantidad, 0) - 20) < 1e-9);
  assert.ok(c.avisos.some((a) => /en proporción/.test(a)));
  const k = S.kardex({ inicial: { dia: baseArchivo.hasta, existencias: 100 }, movimientos: [mov(1, 'A', 'venta', 30, '2026-09-30', { desde: '2026-09-01' })] });
  assert.equal(k.saldo, 80, 'el kardex cuenta lo mismo');
});

test('Movimientos registra ventas de un periodo y rechaza periodos mal escritos', async () => {
  const fin = hoy();
  const ini = new Date(Date.parse(`${fin}T12:00:00Z`) - 13 * 86400000).toISOString().slice(0, 10);
  const codigo = pedido.listaFinal[2].codigo;
  const r = await carla.post('/api/movimientos', { movimientos: [{ codigo, tipo: 'venta', cantidad: 14, desde: ini, fecha: fin }] });
  assert.equal(r.estado, 201, r.error);
  const m = (await carla.get('/api/movimientos')).movimientos.find((x) => x.desde === ini);
  assert.equal(m.fecha, fin);
  assert.equal(m.cantidad, 14);

  const malos = await carla.post('/api/movimientos', {
    movimientos: [
      { codigo, tipo: 'entrada', cantidad: 1, desde: ini, fecha: fin },
      { codigo, tipo: 'venta', cantidad: 1, desde: fin, fecha: ini },
      { codigo, tipo: 'venta', cantidad: 1, desde: '2020-01-01', fecha: fin },
    ],
  });
  assert.equal(malos.estado, 400);
  assert.match(malos.errores[0], /Fila 1: solo las ventas/);
  assert.match(malos.errores[1], /Fila 2: el periodo empieza después/);
  assert.match(malos.errores[2], /Fila 3/);
});

test('importar movimientos de un archivo devuelve las filas sin guardar nada', async () => {
  const csv = Buffer.from('Código;Descripción;Cantidad\nTOR-0610;Tornillo;12\nLIJ-0120;Lija;40\n', 'utf8');
  const cuantos = (await db.uno('SELECT count(*)::int AS n FROM movimientos')).n;
  const r = await carla.subir('/api/movimientos/importar', [['conteo.csv', csv]], 'archivo');
  assert.equal(r.estado, 200, r.error);
  assert.equal(r.ok, true);
  assert.deepEqual(r.lineas.map((l) => [l.codigo, Number(l.cantidad)]), [['TOR-0610', 12], ['LIJ-0120', 40]]);
  assert.equal((await db.uno('SELECT count(*)::int AS n FROM movimientos')).n, cuantos);
  const archivo = await db.uno("SELECT pedido_id, tipo FROM archivos WHERE id = $1", [r.archivoId]);
  assert.deepEqual(archivo, { pedido_id: null, tipo: 'lista' });
});

// --- Códigos que no coinciden ----------------------------------------------------------------------

test('revisarCodigos: avisa fuerte si casi no coinciden y sugiere parejas', () => {
  const dia = S.diaDeFecha('2026-09-01');
  const ventas = ['TOR-0610', 'TOR-0611', 'LIJ-0120', 'CIN-0048-UN', 'MAN-1215', 'GUA-0007'].map((codigo, i) => ({ codigo, nombre: '', dia: dia + i, cantidad: 5 }));
  const existencias = [
    { codigo: 'TOR0610', nombre: 'Tornillo', existencias: 10 },
    { codigo: 'TOR.0611', nombre: '', existencias: 4 },
    { codigo: 'CIN-0048', nombre: 'Cinta', existencias: 8 },
    { codigo: 'MAN-1215', nombre: 'Manguera', existencias: 3 },
    { codigo: 'XYZ-1', nombre: 'Otro', existencias: 1 },
  ];
  const rep = calcularRotacion({ ventas, existencias, hoy: dia + 10 });
  const c = rep.codigos;
  assert.equal(c.ventas, 6);
  assert.equal(c.coinciden, 1, 'solo MAN-1215 está igual en los dos');
  assert.equal(c.alerta, true);
  assert.match(rep.avisos[0], /Solo 1 de los 6 códigos/);
  assert.deepEqual(c.parejas.map((p) => [p.ventas, p.existencias]).sort(), [['CIN-0048-UN', 'CIN-0048'], ['TOR-0610', 'TOR0610'], ['TOR-0611', 'TOR.0611']]);
  assert.equal(c.totalSoloVentas, 5);
  assert.equal(c.totalSoloExistencias, 4);

  // Si casi todos coinciden, no hay alerta (pero sí la lista).
  const bien = revisarCodigos(calcularRotacion({ ventas, existencias: ventas.map((v) => ({ codigo: v.codigo, nombre: '', existencias: 1 })).slice(0, 5), hoy: dia + 10 }).filas);
  assert.equal(bien.alerta, false);
  assert.deepEqual(bien.soloVentas.map((f) => f.codigo), ['GUA-0007']);
});

test('al subir dos archivos con códigos distintos, la respuesta trae la alerta y la lista', async () => {
  const lucia = await cuenta('Lucía', 'lucia.codigos@prueba.co', { empresa: 'Códigos Cruzados' });
  const fechas = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'];
  const codigos = ['A-001', 'A-002', 'A-003', 'A-004', 'A-005', 'A-006'];
  const ventas = ['Código;Fecha;Cantidad', ...codigos.flatMap((c) => fechas.map((f) => `${c};${f};3`))].join('\n');
  const exist = ['Código;Existencias', ...codigos.map((c, i) => `${i === 0 ? c : c.replace('-', '')};20`)].join('\n');
  const r = await lucia.subir('/api/inventario/export', [['ventas.csv', Buffer.from(ventas)], ['existencias.csv', Buffer.from(exist)]]);
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.equal(r.codigos.alerta, true);
  assert.equal(r.codigos.parejas.length, 5);
  assert.match(r.avisos[0], /Solo 1 de los 6/);
});

// --- Columnas recordadas por empresa -----------------------------------------------------------

test('las columnas que eligió una persona le sirven a otra de la misma empresa', async () => {
  const raro = Buffer.from('Ref interna;Fecha;Movido;Hay\nZ-1;2026-08-03;2;10\nZ-1;2026-08-10;3;10\nZ-2;2026-08-03;1;5\nZ-2;2026-08-17;4;5\n', 'utf8');
  const primero = await ana.subir('/api/inventario/export', [['raro.csv', raro]]);
  assert.equal(primero.ok, false, 'las columnas no se reconocen solas');
  const hoja = primero.hojas[0];
  const mapeo = { [hoja.clave]: { codigo: 0, fecha: 1, cantidad: 2, existencias: 3 } };
  const elegido = await ana.post(`/api/inventario/export/${primero.exportId}/columnas`, { mapeo });
  assert.equal(elegido.ok, true, JSON.stringify(elegido.errores));
  const { mapeos } = await db.uno("SELECT e.mapeos FROM empresas e JOIN usuarios u ON u.empresa_id = e.id WHERE u.email = 'ana.recibe@prueba.co'");
  assert.ok(Object.keys(mapeos.export || {}).length, 'quedó en la empresa');

  // Carla sube el mismo informe y se lee solo.
  const segundo = await carla.subir('/api/inventario/export', [['raro.csv', raro]]);
  assert.equal(segundo.ok, true, JSON.stringify(segundo.errores));
});
