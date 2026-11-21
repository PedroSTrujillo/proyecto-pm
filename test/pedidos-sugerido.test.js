'use strict';

// El pedido desde lo sugerido (SP2 de docs/PLAN_ALPHA_02.md, D9): nace con todas las líneas
// sugeridas, las reglas de los 5 pasos no le aplican, la aceptación se guarda sin mostrarse (D16) y
// se descarga en PDF y Excel por proveedor. Base de datos en memoria.

process.env.DATA_DIR = 'memory://';
process.env.SIN_LIMITES = '1';

const test = require('node:test');
const { conCodigo } = require('./codigo');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const ExcelJS = require('exceljs');
const db = require('../server/db');
const { crearApp } = require('../server/app');
const { plantillaExport } = require('../server/plantillas');
const { claveCodigo } = require('../server/valores');

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
    if (!/json/.test(r.headers.get('content-type') || '')) return { estado: r.status, tipo: r.headers.get('content-type'), archivo: Buffer.from(await r.arrayBuffer()) };
    return { estado: r.status, ...(await r.json()) };
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

async function cuenta(nombre, email, empresa) {
  const c = cliente();
  const r = await c.post('/api/cuenta/crear', await conCodigo({ nombre, email, clave: 'clave-segura', empresa }));
  assert.equal(r.estado, 201, r.error);
  return c;
}

// El texto de un PDF de pdfkit: descomprime cada contenido y une las cadenas en hexadecimal.
function textoDePdf(buf) {
  const s = buf.toString('latin1');
  let texto = '';
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = re.exec(s))) {
    let contenido;
    try {
      contenido = zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    for (const h of contenido.matchAll(/<([0-9a-fA-F]+)>/g)) texto += Buffer.from(h[1], 'hex').toString('latin1');
    texto += '\n';
  }
  return texto;
}

let ana;
let pedido;

test('sin inventario no se puede preparar un pedido desde lo sugerido', async () => {
  ana = await cuenta('Ana Prepara', 'ana.sugerido@prueba.co', 'Ferretería La Prueba');
  const r = await ana.post('/api/pedidos', { modo: 'sugerido' });
  assert.equal(r.estado, 403);
  assert.match(r.error, /Datos/);
});

test('el pedido nace con todas las líneas sugeridas, agrupables por proveedor', async () => {
  assert.equal((await ana.subir('/api/inventario/export', [['inventario.xlsx', await plantillaExport()]])).ok, true);
  // Dos proveedores, para probar el PDF de uno solo.
  await ana.put('/api/inventario/ajustes', { asignaciones: { [claveCodigo('TOR-0610')]: 'Tornillería Andina' }, prefijos: [{ prefijo: 'CIN', proveedor: 'Cintas del Valle' }] });
  const inv = (await ana.get('/api/inventario')).inventario;
  const esperados = inv.productos.filter((p) => p.sugerido > 0 && ['agota', 'pide', 'normal'].includes(p.estado));
  assert.ok(esperados.length >= 3, 'la plantilla trae varios productos para pedir');

  const r = await ana.post('/api/pedidos', { modo: 'sugerido' });
  assert.equal(r.estado, 201, r.error);
  pedido = r.pedido;
  assert.equal(pedido.modo, 'sugerido');
  assert.equal(pedido.paso, 4, 'se está preparando');
  assert.equal(pedido.tipo, 'real');
  assert.equal(pedido.sugerido.length, esperados.length);
  assert.deepEqual(pedido.listaFinal.map((l) => [l.codigo, l.cantidad]), pedido.sugerido.map((l) => [l.codigo, l.cantidad]), 'la lista arranca igual a lo sugerido');
  assert.ok(pedido.sugerido.every((l) => l.cantidad > 0 && l.proveedor && l.rango && l.cubre > 0));
  assert.ok(pedido.sugerido.some((l) => l.proveedor === 'Tornillería Andina'));
  assert.equal(pedido.comparacion, null);
});

test('las reglas de los 5 pasos no aplican desde lo sugerido y siguen en el modo lista', async () => {
  const id = pedido.id;
  assert.equal((await ana.put(`/api/pedidos/${id}/lista-inicial`, { lineas: [] })).estado, 409);
  assert.equal((await ana.post(`/api/pedidos/${id}/lista-inicial`, { lineas: [{ codigo: 'A', cantidad: 1 }] })).estado, 409);
  assert.equal((await ana.subir(`/api/pedidos/${id}/export`, [['e.xlsx', await plantillaExport()]])).estado, 409);
  assert.equal((await ana.post(`/api/pedidos/${id}/export/usar-ultimo`)).estado, 409);
  // Sin reporte visto: el sugerido y la lista final ya se pueden usar.
  assert.equal((await ana.get(`/api/pedidos/${id}/sugerido`)).estado, 200);
  assert.equal((await ana.put(`/api/pedidos/${id}/lista-final`, { lineas: pedido.listaFinal })).estado, 200);

  // El modo lista sigue igual: sin lista inicial no hay archivo ni reporte.
  const lista = (await ana.post('/api/pedidos')).pedido;
  assert.equal(lista.modo, 'lista');
  assert.equal(lista.paso, 1);
  assert.equal((await ana.subir(`/api/pedidos/${lista.id}/export`, [['e.xlsx', await plantillaExport()]])).estado, 403);
  assert.equal((await ana.put(`/api/pedidos/${lista.id}/lista-final`, { lineas: [] })).estado, 403);
});

test('"Agregar al pedido" va al pedido abierto', async () => {
  const b = await ana.get('/api/pedidos/borrador');
  assert.equal(b.pedido.id, pedido.id);
  const r = await ana.post('/api/pedidos/borrador/linea', { codigo: 'GUA-0007', cantidad: 3, nombre: 'Guantes' });
  assert.equal(r.pedido.id, pedido.id);
  assert.equal(r.pedido.lineas.find((l) => l.codigo === 'GUA-0007').cantidad, 3);
  const quitada = await ana.post('/api/pedidos/borrador/linea', { codigo: 'gua-0007', cantidad: 0 });
  assert.ok(!quitada.pedido.lineas.some((l) => claveCodigo(l.codigo) === claveCodigo('GUA-0007')), 'cantidad 0 la quita (el código se compara igual que en el reporte)');
});

test('al cerrarlo se guarda la aceptación, y no se le devuelve al usuario', async () => {
  const [primera, segunda, ...resto] = pedido.sugerido;
  const agregado = { codigo: 'MAN-1215', nombre: 'Manguera', cantidad: 2, proveedor: 'Sin proveedor', nota: 'Para la obra de la 80' };
  const final = [
    { codigo: segunda.codigo, nombre: segunda.nombre, cantidad: segunda.cantidad + 5, proveedor: segunda.proveedor, nota: 'Llega en caja de 10' },
    ...resto.map(({ codigo, nombre, cantidad, proveedor }) => ({ codigo, nombre, cantidad, proveedor })),
    agregado,
  ];
  assert.ok(!pedido.sugerido.some((l) => l.codigo === agregado.codigo), 'el agregado no estaba en lo sugerido');
  const r = await ana.post(`/api/pedidos/${pedido.id}/lista-final`, { lineas: final, observaciones: 'Entregar en la bodega de la 13' });
  assert.equal(r.estado, 200, r.error);
  assert.equal(r.pedido.comparacion, null, 'la aceptación no se muestra (D16)');
  assert.equal(r.pedido.observaciones, 'Entregar en la bodega de la 13');
  assert.equal(r.pedido.listaFinal.find((l) => l.codigo === segunda.codigo).nota, 'Llega en caja de 10');

  const { comparacion } = await db.uno('SELECT comparacion FROM pedidos WHERE id = $1', [pedido.id]);
  const a = comparacion.aceptacion;
  assert.deepEqual([a.sugeridas, a.sinCambio, a.ajustadas, a.quitadas, a.agregadas], [pedido.sugerido.length, pedido.sugerido.length - 2, 1, 1, 1]);
  assert.equal(a.cambios.quitadas[0].codigo, primera.codigo);
  assert.equal(comparacion.conteo, undefined, 'no es la métrica de la lista inicial');

  const cerrado = await ana.post(`/api/pedidos/${pedido.id}/por-que`, { respuesta: '' });
  assert.equal(cerrado.pedido.paso, 6);
  assert.equal(cerrado.pedido.terminado, true);
  assert.equal((await ana.put(`/api/pedidos/${pedido.id}/lista-final`, { lineas: [] })).estado, 409, 'cerrado no se edita');
  assert.equal((await ana.get('/api/pedidos/borrador')).pedido, null, 'ya no hay pedido abierto');
  const { pedidos } = await ana.get('/api/pedidos');
  const enLista = pedidos.find((p) => p.id === pedido.id);
  assert.equal(enLista.modo, 'sugerido');
  assert.equal(enLista.lineas, final.length);
  assert.equal(enLista.conteo, undefined);
});

test('el PDF y el Excel de un proveedor traen solo sus líneas y el nombre de la empresa', async () => {
  const todo = await ana.get(`/api/pedidos/${pedido.id}/pedido.pdf`);
  assert.equal(todo.estado, 200);
  assert.equal(todo.tipo, 'application/pdf');
  const texto = textoDePdf(todo.archivo);
  assert.match(texto, /Ferretería La Prueba/);
  assert.match(texto, /Pedido \d+ aprobado/, 'quien funda la empresa aprueba su propio pedido');
  assert.match(texto, /Preparado por Ana Prepara/);
  assert.match(texto, /Entregar en la bodega de la 13/);
  assert.match(texto, /Nota: Llega en caja de 10/);

  const uno = await ana.get(`/api/pedidos/${pedido.id}/pedido.pdf?proveedor=${encodeURIComponent('Tornillería Andina')}`);
  assert.equal(uno.estado, 200);
  const soloUno = textoDePdf(uno.archivo);
  assert.match(soloUno, /TOR-0610/);
  assert.doesNotMatch(soloUno, /MAN-1215/, 'las líneas de otro proveedor no van');
  assert.match(soloUno, /Ferretería La Prueba/);

  const xlsx = await ana.get(`/api/pedidos/${pedido.id}/pedido.xlsx?proveedor=${encodeURIComponent('Tornillería Andina')}`);
  assert.equal(xlsx.estado, 200);
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(xlsx.archivo);
  assert.deepEqual(libro.worksheets.map((h) => h.name), ['Resumen', 'Tornillería Andina']);
  const titulos = [];
  libro.getWorksheet('Resumen').eachRow((f) => f.eachCell((c) => titulos.push(String(c.value))));
  assert.ok(titulos.some((t) => /Pedido \d+ de Ferretería La Prueba/.test(t)));

  assert.equal((await ana.get(`/api/pedidos/${pedido.id}/pedido.pdf?proveedor=Nadie`)).estado, 404);
});

test('alguien de otra empresa no ve el pedido ni sus archivos', async () => {
  const beto = await cuenta('Beto', 'beto.sugerido@prueba.co', 'Otra Empresa');
  assert.equal((await beto.get(`/api/pedidos/${pedido.id}`)).estado, 404);
  assert.equal((await beto.get(`/api/pedidos/${pedido.id}/pedido.pdf`)).estado, 404);
  assert.equal((await beto.put(`/api/pedidos/${pedido.id}/lista-final`, { lineas: [] })).estado, 404);
  assert.equal((await beto.post('/api/pedidos', { modo: 'sugerido' })).estado, 403, 'su empresa no tiene inventario');
});
