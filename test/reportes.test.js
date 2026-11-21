'use strict';

// Reportes por rango de fechas (T7 de docs/PLAN_CAMBIOS_SINESC.md): los más y menos vendidos, los de
// proyectos, los de venta única y los pedidos cerrados; en JSON y en Excel. Base de datos en memoria.

process.env.DATA_DIR = 'memory://';
process.env.SIN_LIMITES = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const db = require('../server/db');
const { crearApp } = require('../server/app');
const { plantillaExport } = require('../server/plantillas');
const { ventasEnRango } = require('../server/series');
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
    const h = cookie ? { Cookie: cookie } : {};
    let body;
    if (formulario) body = formulario;
    else if (cuerpo !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(cuerpo); }
    const r = await fetch(base + ruta, { method: metodo, headers: h, body });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    if (!/json/.test(r.headers.get('content-type') || '')) return { estado: r.status, disposicion: r.headers.get('content-disposition'), archivo: Buffer.from(await r.arrayBuffer()) };
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

test('ventasEnRango suma la parte de cada semana que cae dentro del rango', () => {
  // 3 semanas que terminan el 2026-03-22: 03-02 al 03-08, 03-09 al 03-15 y 03-16 al 03-22.
  const series = { hasta: '2026-03-22', semanas: 3, porProducto: { A: [7, 14, 21], B: [0, 0, 0] }, proyecto: { A: [0, 7, 0], P: [0, 0, 70] } };
  assert.deepEqual(ventasEnRango(series, '2026-03-09', '2026-03-15').A, { vendido: 14, proyecto: 7 }, 'una semana exacta');
  assert.deepEqual(ventasEnRango(series, '2026-03-02', '2026-03-22').A, { vendido: 42, proyecto: 7 }, 'todas');
  assert.equal(ventasEnRango(series, '2026-03-13', '2026-03-17').A.vendido, 6 + 6, 'semana parcial: 3 de 7 días de 14 y 2 de 7 días de 21');
  assert.deepEqual(ventasEnRango(series, '2026-03-16', '2026-03-22').P, { vendido: 0, proyecto: 70 }, 'solo proyecto');
  assert.deepEqual(ventasEnRango(series, '2025-01-01', '2025-01-31'), { A: { vendido: 0, proyecto: 0 }, B: { vendido: 0, proyecto: 0 }, P: { vendido: 0, proyecto: 0 } }, 'rango antes de la serie');
  assert.deepEqual(ventasEnRango(null, '2026-03-01', '2026-03-31'), {}, 'archivo con total de periodo');
});

let ana;
let operador;

async function libro(r) {
  const l = new ExcelJS.Workbook();
  await l.xlsx.load(r.archivo);
  const hoja = l.worksheets[0];
  const filas = [];
  hoja.eachRow((fila, n) => { if (n >= 5) filas.push(fila.values.slice(1)); });
  return filas; // la primera es el encabezado
}

test('sin inventario los de ventas piden subirlo, y fuera de gerente y administrador no se abren', async () => {
  ana = cliente();
  const r = await ana.post('/api/cuenta/crear', { nombre: 'Ana', email: 'ana-rep@ejemplo.co', clave: 'clave-segura', empresa: 'Reportes SAS' });
  assert.equal(r.estado, 201, r.error);
  assert.equal((await ana.get('/api/reportes/mas-vendidos')).estado, 409);
  assert.equal((await ana.get('/api/reportes/pedidos')).estado, 200, 'los pedidos no necesitan inventario');

  const { enlace } = await ana.post('/api/empresa/invitaciones', { rol: 'operador' });
  operador = cliente();
  const o = await operador.post('/api/cuenta/crear', { nombre: 'Omar', email: 'omar-rep@ejemplo.co', clave: 'clave-segura', invitacion: new URL(enlace).searchParams.get('invitacion') });
  assert.equal(o.estado, 201, o.error);
  assert.equal((await operador.get('/api/reportes/mas-vendidos')).estado, 403);
  assert.equal((await operador.get('/api/reportes/mas-vendidos.xlsx')).estado, 403);
  assert.equal((await cliente().get('/api/reportes/pedidos')).estado, 401);
});

test('cada reporte de ventas responde en JSON y en Excel con las mismas filas', async () => {
  assert.equal((await ana.subir('/api/inventario/export', [['inventario.xlsx', await plantillaExport()]])).ok, true);
  const hasta = fechaBogota();
  const rango = `desde=2000-01-01&hasta=${hasta}`;

  const mas = await ana.get(`/api/reportes/mas-vendidos?${rango}`);
  assert.equal(mas.estado, 200, mas.error);
  assert.deepEqual(mas.columnas.slice(0, 5), ['Código', 'Producto', 'Unidades vendidas', 'Existencias', 'Pedido']);
  assert.ok(mas.filas.length > 0 && mas.filas.length <= 50);
  assert.ok(mas.filas.every((f, i) => i === 0 || mas.filas[i - 1][2] >= f[2]), 'de más a menos');
  assert.ok(mas.filas[0][2] > 0);

  const menos = await ana.get(`/api/reportes/menos-vendidos?${rango}`);
  assert.ok(menos.filas.every((f, i) => i === 0 || menos.filas[i - 1][2] <= f[2]), 'de menos a más');

  for (const tipo of ['mas-vendidos', 'menos-vendidos', 'proyectos', 'venta-unica']) {
    const json = await ana.get(`/api/reportes/${tipo}?${rango}`);
    const xlsx = await ana.get(`/api/reportes/${tipo}.xlsx?${rango}`);
    assert.equal(json.estado, 200, tipo);
    assert.equal(xlsx.estado, 200, tipo);
    assert.match(xlsx.disposicion, new RegExp(`${tipo}-2000-01-01-${hasta}\\.xlsx`));
    const filas = await libro(xlsx);
    assert.deepEqual(filas[0], json.columnas, tipo);
    assert.equal(filas.length - 1, json.filas.length, tipo);
  }

  // Un rango en el futuro no tiene ventas: ningún producto vendió.
  const vacio = await ana.get('/api/reportes/mas-vendidos?desde=2999-01-01&hasta=2999-01-31');
  assert.ok(vacio.filas.every((f) => f[2] === 0));
});

test('los pedidos cerrados salen por fecha y se ignoran los simulados', async () => {
  const { pedido } = await ana.post('/api/pedidos', { modo: 'sugerido' });
  const lineas = pedido.listaFinal.slice(0, 2).map(({ codigo, nombre, cantidad, proveedor }) => ({ codigo, nombre, cantidad, proveedor }));
  assert.equal((await ana.post(`/api/pedidos/${pedido.id}/lista-final`, { lineas })).estado, 200);
  assert.equal((await ana.post(`/api/pedidos/${pedido.id}/por-que`, { respuesta: '' })).pedido.terminado, true);

  const hoy = fechaBogota();
  const r = await ana.get(`/api/reportes/pedidos?desde=${hoy}&hasta=${hoy}`);
  assert.equal(r.estado, 200, r.error);
  assert.deepEqual(r.columnas, ['Fecha', 'Pedido', 'Preparó', 'Código', 'Producto', 'Proveedor', 'Cantidad']);
  assert.deepEqual(r.filas.map((f) => f[3]), lineas.map((l) => l.codigo));
  assert.ok(r.filas.every((f) => f[0] === hoy && f[2] === 'Ana'));
  assert.equal((await libro(await ana.get(`/api/reportes/pedidos.xlsx?desde=${hoy}&hasta=${hoy}`))).length, 3);

  // Sin fechas son los últimos 30 días; fuera del rango no aparece.
  assert.equal((await ana.get('/api/reportes/pedidos')).filas.length, 2);
  assert.equal((await ana.get('/api/reportes/pedidos?desde=2000-01-01&hasta=2000-01-31')).filas.length, 0);

  await db.query("UPDATE pedidos SET tipo = 'simulado' WHERE id = $1", [pedido.id]);
  assert.equal((await ana.get('/api/reportes/pedidos')).filas.length, 0, 'un simulado no cuenta');
});

test('un reporte que no existe da 404 y las fechas malas 400', async () => {
  assert.equal((await ana.get('/api/reportes/inventado')).estado, 404);
  assert.equal((await ana.get('/api/reportes/constructor')).estado, 404);
  assert.equal((await ana.get('/api/reportes/pedidos?desde=ayer')).estado, 400);
  assert.equal((await ana.get('/api/reportes/pedidos?desde=2026-02-31&hasta=2026-03-01')).estado, 400);
  assert.equal((await ana.get('/api/reportes/pedidos?desde=2026-03-05&hasta=2026-03-01')).estado, 400);
});
