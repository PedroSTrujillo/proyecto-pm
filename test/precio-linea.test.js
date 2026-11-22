'use strict';

// T19: el precio unitario de cada línea del pedido se negocia al prepararlo. Vale solo para ese
// pedido: queda en la lista, en el PDF y el Excel y en el historial, y no toca el catálogo ni la
// aceptación (que solo mide cantidades). Base de datos en memoria.

process.env.DATA_DIR = 'memory://';
process.env.SIN_LIMITES = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { conCodigo } = require('./codigo');
const db = require('../server/db');
const { crearApp } = require('../server/app');
const { ultimosDoceMeses } = require('../server/plantillas');
const { diferencias } = require('../server/trazas');

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
    if (!/json/.test(r.headers.get('content-type') || '')) return { estado: r.status, archivo: Buffer.from(await r.arrayBuffer()) };
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

test('diferencias: el precio se anota aparte de la cantidad y solo si la línea estaba en las dos listas', () => {
  const a = [{ codigo: 'X', cantidad: 5, costo: 100 }, { codigo: 'Y', cantidad: 2 }];
  const d = [{ codigo: 'X', cantidad: 5, costo: 120 }, { codigo: 'Y', cantidad: 2, costo: 50 }, { codigo: 'Z', cantidad: 1, costo: 9 }];
  const cambios = diferencias(a, d);
  assert.deepEqual(cambios.map((c) => [c.codigo, c.campo, c.antes, c.despues]), [['X', 'costo', 100, 120], ['Y', 'costo', null, 50], ['Z', null, null, 1]]);
});

test('el precio editado llega al pedido, al PDF, al Excel y al historial sin tocar el catálogo ni la aceptación', async () => {
  const ana = cliente();
  assert.equal((await ana.post('/api/cuenta/crear', await conCodigo({ nombre: 'Ana Precio', email: 'ana.precio@prueba.co', clave: 'clave-segura', empresa: 'Precios SAS' }))).estado, 201);
  // Un inventario con costos (proveedor y costo unitario) y poco stock, para que SINESC sugiera pedir las tres.
  const meses = ultimosDoceMeses();
  const fila = (cod, nom, ventas, costo) => [cod, nom, 2, ...meses.map(() => ventas), 'Proveedor Uno', costo].join(';');
  const csv = [['Código', 'Producto', 'Existencias hoy', ...meses, 'Proveedor', 'Costo unitario'].join(';'), fila('PR-1', 'Producto uno', 40, 3200), fila('PR-2', 'Producto dos', 30, 9800), fila('PR-3', 'Producto tres', 50, 1400)].join('\n');
  assert.equal((await ana.subir('/api/inventario/export', [['inventario.csv', Buffer.from(csv, 'utf8')]])).ok, true);
  const { pedido } = await ana.post('/api/pedidos', { modo: 'sugerido' });
  const conPrecio = pedido.sugerido.filter((l) => l.costo > 0);
  assert.ok(conPrecio.length >= 2, 'la plantilla trae costos');
  assert.ok(pedido.listaFinal.find((l) => l.codigo === conPrecio[0].codigo).costo > 0, 'la lista arranca con el precio del catálogo');

  const [una, otra] = conPrecio;
  const costoCatalogo = (await ana.get(`/api/catalogo?q=${encodeURIComponent(una.codigo)}`)).productos[0].costo;
  const editar = (precio, extra = {}) => pedido.listaFinal.map((l) => (l.codigo === una.codigo ? { ...l, costo: precio, ...extra } : l));

  // El borrador conserva el precio; uno inválido o negativo se omite (vuelve al del catálogo).
  assert.equal((await ana.put(`/api/pedidos/${pedido.id}/lista-final`, { lineas: editar(1234) })).estado, 200);
  assert.equal((await ana.get(`/api/pedidos/${pedido.id}`)).pedido.listaFinal.find((l) => l.codigo === una.codigo).costo, 1234);
  await ana.put(`/api/pedidos/${pedido.id}/lista-final`, { lineas: editar(-5) });
  assert.equal((await ana.get(`/api/pedidos/${pedido.id}`)).pedido.listaFinal.find((l) => l.codigo === una.codigo).costo, undefined);
  await ana.put(`/api/pedidos/${pedido.id}/lista-final`, { lineas: editar('abc') });
  assert.equal((await ana.get(`/api/pedidos/${pedido.id}`)).pedido.listaFinal.find((l) => l.codigo === una.codigo).costo, undefined);
  await ana.put(`/api/pedidos/${pedido.id}/lista-final`, { lineas: editar(1234) });

  // Cerrar con el precio y la cantidad iguales a lo sugerido: la aceptación no se mueve.
  const cierre = await ana.post(`/api/pedidos/${pedido.id}/lista-final`, { lineas: editar(1234) });
  assert.equal(cierre.estado, 200, cierre.error);
  assert.equal(cierre.pedido.listaFinal.find((l) => l.codigo === una.codigo).costo, 1234);
  const { comparacion } = await db.uno('SELECT comparacion FROM pedidos WHERE id = $1', [pedido.id]);
  assert.equal(comparacion.aceptacion.sinCambio, pedido.sugerido.length);
  assert.equal(comparacion.aceptacion.ajustadas, 0);
  assert.equal(comparacion.aceptacion.porcentaje, 1);
  assert.equal((await ana.post(`/api/pedidos/${pedido.id}/por-que`, { respuesta: '' })).estado, 200);

  // El Excel y el PDF traen el precio editado, y el de las demás líneas sigue siendo el del catálogo.
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load((await ana.get(`/api/pedidos/${pedido.id}/pedido.xlsx`)).archivo);
  const numeros = [];
  libro.eachSheet((h) => h.eachRow((f) => f.eachCell((c) => { if (typeof c.value === 'number') numeros.push(c.value); })));
  assert.ok(numeros.includes(1234), 'el precio editado está en el Excel');
  assert.ok(numeros.includes(otra.costo), 'las otras líneas conservan su costo');
  assert.equal((await ana.get(`/api/pedidos/${pedido.id}/pedido.pdf`)).estado, 200);

  // El catálogo no cambió, y el historial lo dice como cambio de precio (no de cantidad).
  assert.equal((await ana.get(`/api/catalogo?q=${encodeURIComponent(una.codigo)}`)).productos[0].costo, costoCatalogo);
  const filas = await db.query('SELECT codigo, campo, antes, despues FROM pedido_cambios WHERE pedido_id = $1', [pedido.id]);
  const precio = filas.filter((f) => f.codigo === una.codigo && f.campo === 'costo');
  assert.equal(precio.length, 1, 'varios guardados seguidos son una fila');
  assert.equal(Number(precio[0].despues), 1234);
  assert.ok(!filas.some((f) => f.campo === null), 'editar solo el precio no crea una fila de cantidad');
  const historial = (await ana.get(`/api/pedidos/${pedido.id}`)).pedido.historial;
  assert.ok(historial.some((h) => h.tipo === 'cambio' && h.campo === 'costo' && h.codigo === una.codigo));
});
