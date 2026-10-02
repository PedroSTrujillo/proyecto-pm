'use strict';

// Prueba de punta a punta del servidor con una base de datos en memoria.

process.env.DATA_DIR = 'memory://';
process.env.TEAM_EMAILS = 'equipo@prueba.co';

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
