'use strict';

// SP4 de docs/PLAN_ALPHA_02.md: catálogo y motor de reabastecimiento. Múltiplo y mínimo en el
// sugerido, tiempo de entrega en días hábiles (con los ajustes de antes), ventas de proyecto fuera
// del promedio (por documento, por columna y por movimiento), la clasificación de cada producto y
// la etiqueta de "pedido reciente". Las de la API usan la base en memoria.

process.env.DATA_DIR = 'memory://';
process.env.SIN_LIMITES = '1';

const test = require('node:test');
const { conCodigo } = require('./codigo');
const assert = require('node:assert/strict');
const db = require('../server/db');
const { crearApp } = require('../server/app');
const { plantillaExport } = require('../server/plantillas');
const { leerExport } = require('../server/lector');
const { calcularRotacion } = require('../server/rotacion');
const { seriesSemanales } = require('../server/series');
const { ventasDeMovimientos, ventasDeExport } = require('../server/saldos');
const { construirInventario, leerAjustes, clasificar } = require('../server/inventario');
const { claveCodigo, diaDe } = require('../server/valores');

const d = (s) => diaDe(...s.split('-').map(Number));
const csv = (texto, nombre = 'export.csv') => ({ nombre, buffer: Buffer.from(texto, 'utf8') });

// 52 semanas: A vende 10 cada semana; B, 3 cada dos semanas. Existencias bajas para que se sugiera.
function negocio({ existenciasA = 5, proyecto = [] } = {}) {
  const ventas = [];
  const inicio = d('2025-09-01');
  for (let s = 0; s < 52; s++) {
    ventas.push({ codigo: 'A', nombre: 'Tornillo', dia: inicio + s * 7, cantidad: 10 });
    if (s % 2 === 0) ventas.push({ codigo: 'B', nombre: 'Chazo', dia: inicio + s * 7 + 2, cantidad: 3 });
  }
  ventas.push(...proyecto);
  const existencias = [{ codigo: 'A', nombre: 'Tornillo', existencias: existenciasA }, { codigo: 'B', nombre: 'Chazo', existencias: 1 }];
  const reporte = calcularRotacion({ ventas, existencias });
  return { reporte, series: seriesSemanales(ventas), ventas };
}

// --- Puras --------------------------------------------------------------------------------

test('días hábiles: se convierten a semanas (÷ 5) y los ajustes guardados en semanas siguen sirviendo', () => {
  const viejo = leerAjustes({ entregas: { Andina: 2 }, entregaPorDefecto: 1.5 });
  assert.equal(viejo.entregas.Andina, 2);
  assert.equal(viejo.entregaPorDefecto, 1.5);
  assert.deepEqual(viejo.entregasDias, {});
  assert.equal(viejo.entregaPorDefectoDias, null);

  const nuevo = leerAjustes({ entregas: { Andina: 2, Valle: 1 }, entregasDias: { Andina: 3, Costa: 8 }, entregaPorDefectoDias: 2 });
  assert.equal(nuevo.entregas.Andina, 0.6, 'los días mandan sobre las semanas guardadas');
  assert.equal(nuevo.entregas.Valle, 1, 'sin días, quedan las semanas');
  assert.equal(nuevo.entregas.Costa, 1.6);
  assert.equal(nuevo.entregaPorDefecto, 0.4);
  assert.deepEqual(nuevo.entregasDias, { Andina: 3, Costa: 8 });
});

test('la unidad del tiempo de entrega de cada proveedor se guarda y lo desconocido se descarta', () => {
  const a = leerAjustes({ unidades: { Andina: 'semanas', Valle: 'calendario', Costa: 'habiles', Raro: 'meses', Otro: 5, Nulo: null } });
  assert.deepEqual(a.unidades, { Andina: 'semanas', Valle: 'calendario', Costa: 'habiles' });
  assert.deepEqual(leerAjustes({}).unidades, {});
  assert.deepEqual(leerAjustes({ unidades: 'semanas' }).unidades, {});
});

test('cada cuánto pide se guarda con decimales: viene de días o meses', () => {
  assert.equal(leerAjustes({ cadaCuanto: 10 / 7 }).cadaCuanto, 1.429);
  assert.equal(leerAjustes({ cadaCuanto: 0.2 }).cadaCuanto, 4, 'menos de una semana no se acepta');
});

test('múltiplo de empaque y mínimo de pedido cambian el sugerido, y el desglose lo dice', () => {
  const { reporte, series } = negocio();
  const sin = construirInventario({ reporte, series, catalogo: {}, ajustes: {} }).productos.find((p) => p.codigo === 'A');
  assert.ok(sin.sugerido > 0 && sin.sugerido % 80 !== 0, `sugerido sin catálogo: ${sin.sugerido}`);
  assert.equal(sin.detalleSugerido.loteOrigen, 'ventas', 'A siempre se vende de a 10');

  const caja = construirInventario({ reporte, series, catalogo: { A: { multiplo: 80 } }, ajustes: {} }).productos.find((p) => p.codigo === 'A');
  assert.equal(caja.sugerido % 80, 0);
  assert.ok(caja.sugerido >= sin.sugerido && caja.sugerido - sin.sugerido < 80);
  assert.equal(caja.multiplo, 80);
  assert.equal(caja.detalleSugerido.loteOrigen, 'catalogo');
  assert.equal(caja.maximo % 80, 0, 'el máximo también va en cajas');

  const minimo = construirInventario({ reporte, series, catalogo: { A: { minimoPedido: 500 } }, ajustes: {} }).productos.find((p) => p.codigo === 'A');
  assert.equal(minimo.sugerido, 500, 'lo que queda entre 0 y el mínimo sube al mínimo');
  assert.equal(minimo.detalleSugerido.minimoPedido, 500);

  const ambos = construirInventario({ reporte, series, catalogo: { A: { minimoPedido: 500, multiplo: 80 } }, ajustes: {} }).productos.find((p) => p.codigo === 'A');
  assert.equal(ambos.sugerido, 560, 'el mínimo redondeado a la caja');

  const lleno = negocio({ existenciasA: 5000 });
  const nada = construirInventario({ reporte: lleno.reporte, series: lleno.series, catalogo: { A: { minimoPedido: 500 } }, ajustes: {} }).productos.find((p) => p.codigo === 'A');
  assert.equal(nada.sugerido, 0, 'si no hace falta pedir, el mínimo no lo obliga');
});

test('el mínimo del envío de cada proveedor se guarda; el paquete y el mínimo por producto no son del proveedor', () => {
  const sucio = leerAjustes({ condiciones: { Andina: { minimoEnvio: 200, multiplo: 10, minimoProducto: 30 }, Valle: { minimoEnvio: 'x' }, Costa: { minimoEnvio: 0 }, Raro: 7 } });
  assert.deepEqual(sucio.condiciones, { Andina: { minimoEnvio: 200 } });
  assert.deepEqual(leerAjustes({}).condiciones, {});
  assert.deepEqual(leerAjustes({ condiciones: 'x' }).condiciones, {});

  const { reporte, series } = negocio();
  const sin = construirInventario({ reporte, series, catalogo: { A: { proveedor: 'Andina' } }, ajustes: {} }).productos.find((p) => p.codigo === 'A');
  const con = construirInventario({ reporte, series, catalogo: { A: { proveedor: 'Andina' } }, ajustes: { condiciones: { Andina: { multiplo: 80, minimoProducto: 500, minimoEnvio: 900 } } } }).productos.find((p) => p.codigo === 'A');
  assert.equal(con.sugerido, sin.sugerido, 'lo del proveedor no cambia las cantidades');
});

test('importadores: la extensión está apagada salvo que se encienda, y los contenedores se leen limpios', () => {
  assert.equal(leerAjustes({}).importaciones, false);
  assert.equal(leerAjustes({ importaciones: 'si' }).importaciones, false, 'solo un verdadero la enciende');
  assert.equal(leerAjustes({ importaciones: true }).importaciones, true);
  const c = leerAjustes({ condiciones: { Asia: { contenedores: 2.4, tipoContenedor: '20' }, Chile: { contenedores: 3, tipoContenedor: 'raro', minimoEnvio: 50 }, Cero: { contenedores: 0 }, Muchos: { contenedores: 99 } } }).condiciones;
  assert.deepEqual(c, { Asia: { contenedores: 2, tipoContenedor: '20' }, Chile: { minimoEnvio: 50, contenedores: 3, tipoContenedor: '40' } });
});

test('cada cuánto se pide puede ser de cada proveedor; sin valor propio vale el general', () => {
  const sucio = leerAjustes({ cadaCuantoProv: { Andina: 8, Valle: 0.5, Costa: 'x', Sur: 30, Raro: null } });
  assert.deepEqual(sucio.cadaCuantoProv, { Andina: 8 });
  assert.deepEqual(leerAjustes({}).cadaCuantoProv, {});

  const { reporte, series } = negocio();
  const de = (ajustes, proveedor = 'Andina') => construirInventario({ reporte, series, catalogo: { A: { proveedor } }, ajustes }).productos.find((p) => p.codigo === 'A');
  const general = de({ cadaCuanto: 4 });
  const propio = de({ cadaCuanto: 4, cadaCuantoProv: { Andina: 8 } });
  assert.equal(general.cadaCuanto, 4);
  assert.equal(propio.cadaCuanto, 8);
  assert.ok(propio.sugerido > general.sugerido, 'pedir cada 8 semanas necesita más que cada 4');
  assert.equal(propio.detalleSugerido.semanasCubrir, general.detalleSugerido.semanasCubrir + 4);
  const otro = de({ cadaCuanto: 4, cadaCuantoProv: { Andina: 8 } }, 'Valle');
  assert.equal(otro.cadaCuanto, 4, 'otro proveedor sigue con el general');
  assert.equal(otro.sugerido, general.sugerido);
});

test('clasificación: frecuente, esporádico, de proyecto y venta única', () => {
  assert.equal(clasificar({ serie: [1, 2, 0, 3, 1, 0, 2, 4], semanasProducto: 8, vendido: 13 }), 'frecuente');
  assert.equal(clasificar({ serie: [0, 0, 5, 0, 0, 0, 2, 0], semanasProducto: 8, vendido: 7 }), 'esporadico');
  assert.equal(clasificar({ serie: [0, 0, 5, 0, 0, 0, 2, 0], semanasProducto: 8, vendido: 7, vendidoProyecto: 40 }), 'proyecto');
  assert.equal(clasificar({ serie: [0, 0, 5, 0], semanasProducto: 4, vendido: 5, unica: { vendido: 5 } }), 'unica');
  assert.equal(clasificar({ serie: null, semanasProducto: 8, vendido: 7 }), null, 'sin ventas por semana no se clasifica');
  assert.equal(clasificar({ serie: [0, 0, 0, 0, 0, 0, 2, 2], semanasProducto: 2, vendido: 4 }), 'frecuente', 'solo cuentan sus semanas (producto nuevo)');

  const { reporte, series } = negocio();
  const inv = construirInventario({ reporte, series, catalogo: {}, ajustes: {} });
  const [a, b] = ['A', 'B'].map((c) => inv.productos.find((p) => p.codigo === c));
  assert.equal(a.clase, 'frecuente');
  assert.equal(b.clase, 'frecuente', 'vende la mitad de las semanas');
  assert.equal(a.ventaAlta, true, 'el 20 % que más vende');
  assert.equal(b.ventaAlta, false);
});

test('ventas de proyecto: bajan existencias pero no cuentan en el promedio ni en la serie', () => {
  const normal = negocio();
  const conProyecto = negocio({ proyecto: [{ codigo: 'A', nombre: 'Tornillo', dia: d('2026-03-02'), cantidad: 900, proyecto: true }] });
  const [fa, fb] = [normal, conProyecto].map((x) => x.reporte.filas.find((f) => f.codigo === 'A'));
  assert.equal(fb.promedioSemanal, fa.promedioSemanal);
  assert.equal(fb.vendido, fa.vendido);
  assert.equal(fb.vendidoProyecto, 900);
  assert.ok(fb.senales.includes('proyecto'));
  assert.equal(fb.pico, null, 'no se toma como un mes pico');
  assert.deepEqual(conProyecto.series.porProducto.A, normal.series.porProducto.A);
  assert.equal(conProyecto.series.proyecto.A.reduce((s, x) => s + x, 0), 900);

  const inv = construirInventario({ reporte: conProyecto.reporte, series: conProyecto.series, catalogo: {}, ajustes: {} });
  const total = (g) => g.semanas.reduce((s, x) => s + x.proyectos, 0);
  assert.equal(total(inv.grafico) - total(construirInventario({ reporte: normal.reporte, series: normal.series, catalogo: {}, ajustes: {} }).grafico), 900, 'el gráfico lo muestra como proyecto');

  // Al rearmar las ventas desde lo guardado (para sumar movimientos), la marca se conserva.
  const rearmadas = ventasDeExport(conProyecto);
  assert.equal(rearmadas.ventas.filter((v) => v.proyecto).reduce((s, v) => s + v.cantidad, 0), 900);
});

test('ventas de proyecto desde Movimientos: la casilla marca solo ventas', () => {
  const v = ventasDeMovimientos([
    { codigo: 'A', tipo: 'venta', cantidad: 4, fecha: '2026-09-01', proyecto: true },
    { codigo: 'A', tipo: 'venta', cantidad: 2, fecha: '2026-09-01' },
    { codigo: 'A', tipo: 'devolucion', cantidad: 1, fecha: '2026-09-02', proyecto: true },
  ]);
  assert.deepEqual(v.map((x) => [x.cantidad, Boolean(x.proyecto)]), [[4, true], [2, false], [-1, false]]);
});

test('lector: un tipo de documento marcado como proyecto', () => {
  const texto = ['Codigo;Nombre;Fecha;Tipo documento;Cantidad;Existencias',
    'A1;Tubo;02/03/2026;FV 10;5;40', 'A1;Tubo;09/03/2026;FV 11;4;36', 'A1;Tubo;10/03/2026;PRY 1;30;6', 'A1;Tubo;11/03/2026;FC 9;50;56'].join('\n');
  const pregunta = leerExport([csv(texto)]);
  assert.equal(pregunta.necesitaDocumentos, true);
  const r = leerExport([csv(texto)], {}, { documentos: { ventas: ['FV'], proyectos: ['PRY'] } });
  assert.equal(r.ok, true, r.errores && r.errores.join(' '));
  assert.deepEqual(r.ventas.map((v) => [v.cantidad, Boolean(v.proyecto)]), [[5, false], [4, false], [30, true]]);
  assert.deepEqual(Object.values(r.documentos)[0].proyectos, ['PRY'], 'se recuerda');
  assert.ok(r.avisos.some((a) => /proyecto/.test(a)));
});

test('lector: una columna de canal con pocos valores se pregunta; con muchos, no', () => {
  const texto = ['Codigo;Nombre;Fecha;Cantidad;Existencias;Centro de costo;Familia',
    'A1;Tubo;02/03/2026;5;40;Mostrador;Plomería', 'A1;Tubo;09/03/2026;4;36;Mostrador;Plomería', 'A1;Tubo;10/03/2026;30;6;Obra Calle 80;Plomería', 'B2;Codo;10/03/2026;2;9;Mostrador;1'].join('\n');
  const pregunta = leerExport([csv(texto)]);
  assert.equal(pregunta.ok, false);
  assert.equal(pregunta.necesitaCanal, true);
  assert.deepEqual(pregunta.canal.valores.map((v) => [v.valor, v.filas]), [['MOSTRADOR', 3], ['OBRA CALLE 80', 1]]);
  assert.match(pregunta.canal.columna, /Centro de costo/);

  const r = leerExport([csv(texto)], {}, { canales: { proyectos: ['obra calle 80'] } });
  assert.equal(r.ok, true, r.errores && r.errores.join(' '));
  assert.deepEqual(r.ventas.filter((v) => v.proyecto).map((v) => v.cantidad), [30]);
  assert.equal(r.catalogo[claveCodigo('A1')].familia, 'Plomería');
  assert.equal(r.catalogo[claveCodigo('B2')], undefined, 'una "familia" sin letras no cuenta');
  const firma = Object.keys(r.canales)[0];
  assert.ok(leerExport([csv(texto)], {}, { canalesPorFirma: { [firma]: { proyectos: ['OBRA CALLE 80'] } } }).ok, 'recordada por formato');

  const muchos = ['Codigo;Nombre;Fecha;Cantidad;Existencias;Cliente'];
  for (let i = 0; i < 60; i++) muchos.push(`A1;Tubo;${String((i % 28) + 1).padStart(2, '0')}/02/2026;1;10;Cliente ${i}`);
  const sinPregunta = leerExport([csv(muchos.join('\n'))]);
  assert.equal(sinPregunta.ok, true, 'con más de 50 valores no se pregunta');
  assert.ok(!sinPregunta.ventas.some((v) => v.proyecto));
});

// --- API ----------------------------------------------------------------------------------

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

let ana;
const producto = async (c, codigo) => (await c.get('/api/inventario')).inventario.productos.find((p) => claveCodigo(p.codigo) === claveCodigo(codigo));

test('catálogo: familia, múltiplo y mínimo pegados en lote entran al sugerido (todo o nada)', async () => {
  ana = await cuenta('Ana Catálogo', 'ana.catalogo@prueba.co', 'Ferretería Catálogo');
  assert.equal((await ana.subir('/api/inventario/export', [['inventario.xlsx', await plantillaExport()]])).ok, true);
  const inv = (await ana.get('/api/inventario')).inventario;
  const con = inv.productos.find((p) => p.sugerido > 0);
  assert.ok(con, 'la plantilla trae algo para pedir');

  const malo = await ana.post('/api/catalogo/lote', { filas: [{ codigo: con.codigo, multiplo: 'caja' }, { codigo: 'NO-EXISTE', familia: 'X' }] });
  assert.equal(malo.estado, 400);
  assert.equal(malo.errores.length, 2);
  assert.match(malo.errores[0], /Fila 1/);
  assert.deepEqual(malo.faltan, ['NO-EXISTE']);
  assert.equal((await producto(ana, con.codigo)).multiplo, null, 'no se guardó nada');

  const multiplo = con.sugerido + 7;
  const r = await ana.post('/api/catalogo/lote', { filas: [{ codigo: con.codigo, familia: 'Tornillería', multiplo, minimo: '' }] });
  assert.equal(r.estado, 200, r.error);
  const p = await producto(ana, con.codigo);
  assert.equal(p.familia, 'Tornillería');
  assert.equal(p.multiplo, multiplo);
  assert.equal(p.sugerido, multiplo, 'redondeado a la caja');

  const { productos } = await ana.get(`/api/catalogo?q=${encodeURIComponent(con.codigo)}`);
  assert.equal(productos[0].familia, 'Tornillería');
  assert.equal(productos[0].multiplo, multiplo);
  assert.equal(productos[0].minimoPedido, null);

  // Una celda vacía borra; una columna que no viene no toca.
  await ana.post('/api/catalogo/lote', { filas: [{ codigo: con.codigo, multiplo: '' }] });
  const despues = await producto(ana, con.codigo);
  assert.equal(despues.multiplo, null);
  assert.equal(despues.familia, 'Tornillería');
});

test('tiempo de entrega en días hábiles por proveedor; el paso 4 en semanas lo sigue cambiando', async () => {
  const inv = (await ana.get('/api/inventario')).inventario;
  const prov = inv.productos.find((p) => p.proveedor !== 'Sin proveedor') || inv.productos[0];
  const r = await ana.put('/api/inventario/ajustes', { entregasDias: { [prov.proveedor]: 8 } });
  assert.equal(r.ajustes.entregas[prov.proveedor], 1.6);
  let p = await producto(ana, prov.codigo);
  assert.equal(p.entrega, 1.6);
  assert.equal(p.entregaDias, 8);

  // El paso 4 de "Comparar con mi propia lista" todavía manda semanas.
  await ana.put('/api/inventario/ajustes', { entregas: { [prov.proveedor]: 3 } });
  p = await producto(ana, prov.codigo);
  assert.equal(p.entregaDias, 15);
  assert.equal(p.entrega, 3);
});

test('una venta de proyecto registrada en Movimientos no sube el promedio', async () => {
  const antes = await producto(ana, 'TOR-0610');
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const r = await ana.post('/api/movimientos', { movimientos: [{ codigo: 'TOR-0610', tipo: 'venta', cantidad: 50, fecha: hoy, proyecto: true }, { codigo: 'TOR-0610', tipo: 'entrada', cantidad: 5, fecha: hoy, proyecto: true }] });
  assert.equal(r.estado, 201, r.error);
  const { movimientos } = await ana.get('/api/movimientos');
  assert.deepEqual(movimientos.map((m) => [m.tipo, m.proyecto]).sort(), [['entrada', false], ['venta', true]], 'solo una venta puede ser de proyecto');
  const despues = await producto(ana, 'TOR-0610');
  assert.equal(despues.existencias, antes.existencias - 50 + 5, 'baja las existencias');
  assert.equal(despues.explicacion.vendidoProyecto, 50);
  assert.ok(Math.abs(despues.ventasSemana - antes.ventasSemana) < antes.ventasSemana * 0.2, `el promedio casi no cambia (${antes.ventasSemana} → ${despues.ventasSemana}): solo pasa el tiempo`);
});

test('pedido reciente: lo cerrado en los últimos 14 días (o lo que tarda el proveedor) se marca en cada producto', async () => {
  const leo = await cuenta('Leo Otra', 'leo.catalogo@prueba.co', 'Otra Empresa');
  assert.equal((await leo.subir('/api/inventario/export', [['inventario.xlsx', await plantillaExport()]])).ok, true);

  const r = await ana.post('/api/pedidos', { modo: 'sugerido' });
  assert.equal(r.estado, 201, r.error);
  const linea = r.pedido.sugerido[0];
  assert.ok('familia' in linea && 'clase' in linea, 'la foto guarda familia y clase');
  await ana.post(`/api/pedidos/${r.pedido.id}/lista-final`, { lineas: r.pedido.listaFinal });
  await ana.post(`/api/pedidos/${r.pedido.id}/por-que`, { respuesta: '' });

  const p = await producto(ana, linea.codigo);
  assert.equal(p.pedidoReciente.numero, 1);
  assert.equal(p.pedidoReciente.cantidad, Number(linea.cantidad));
  assert.equal(p.pedidoReciente.por, 'Ana Catálogo');
  assert.equal((await producto(leo, linea.codigo)).pedidoReciente, null, 'otra empresa no lo ve');

  await db.query("UPDATE pedidos SET terminado_en = now() - interval '60 days' WHERE id = $1", [r.pedido.id]);
  assert.equal((await producto(ana, linea.codigo)).pedidoReciente, null, 'pasada la ventana (14 días o el tiempo de entrega) ya no es reciente');
});
