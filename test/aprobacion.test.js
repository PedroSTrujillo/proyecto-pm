'use strict';

// Aprobación, trazabilidad y PDF de la empresa (SP6 de docs/PLAN_ALPHA_02.md, D11): quién aprueba,
// enviar, devolver y aprobar; la traza de cambios por línea; el logo y el cargo en el PDF.
// Base de datos en memoria.

process.env.DATA_DIR = 'memory://';
process.env.SIN_LIMITES = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const db = require('../server/db');
const { crearApp } = require('../server/app');
const { plantillaExport } = require('../server/plantillas');
const { diferencias } = require('../server/trazas');
const LOGO = require('../server/logo');

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
    del: (ruta) => pedir('DELETE', ruta),
    subir: (ruta, archivos) => {
      const fd = new FormData();
      for (const [nombre, buf] of archivos) fd.append('archivos', new Blob([buf]), nombre);
      return pedir('POST', ruta, undefined, fd);
    },
  };
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

let gerente; // administra y aprueba
let carlos; // administrador: prepara, no aprueba
let lucia; // administradora de la misma empresa, no aprueba
let ids = {};
let pedido;

// Quien prepara y consulta pedidos es administrador; un operador no los abre (T4).
async function invitado(nombre, email, cargo, rol = 'administrador') {
  const { enlace } = await gerente.post('/api/empresa/invitaciones', { rol });
  const token = new URL(enlace).searchParams.get('invitacion');
  const c = cliente();
  const r = await c.post('/api/cuenta/crear', { nombre, email, clave: 'clave-segura', invitacion: token, cargo });
  assert.equal(r.estado, 201, r.error);
  return { c, id: r.usuario.id, usuario: r.usuario };
}

test('el administrador marca quién aprueba y el cargo de cada persona', async () => {
  gerente = cliente();
  const r = await gerente.post('/api/cuenta/crear', { nombre: 'Gloria Gerente', email: 'gloria@aprueba.co', clave: 'clave-segura', empresa: 'Distribuidora Aprueba', cargo: 'Gerente general' });
  assert.equal(r.estado, 201, r.error);
  assert.equal(r.usuario.cargo, 'Gerente general');
  assert.equal(r.usuario.aprueba, true, 'quien funda la empresa es su gerente y aprueba');
  ids.gerente = r.usuario.id;
  const c = await invitado('Carlos Compras', 'carlos@aprueba.co', 'Auxiliar de compras');
  carlos = c.c;
  ids.carlos = c.id;
  assert.equal(c.usuario.cargo, 'Auxiliar de compras');
  const l = await invitado('Lucía Bodega', 'lucia@aprueba.co');
  lucia = l.c;
  ids.lucia = l.id;

  // Solo quien administra cambia esto.
  assert.equal((await carlos.put(`/api/empresa/miembros/${ids.carlos}`, { aprueba: true })).estado, 403);
  const cargo = await gerente.put(`/api/empresa/miembros/${ids.lucia}`, { cargo: '  Jefe de   bodega ' });
  assert.equal(cargo.empresa.miembros.find((m) => m.id === ids.lucia).cargo, 'Jefe de bodega');
  // Cada quien también cambia el suyo en Mi cuenta.
  assert.equal((await carlos.put('/api/cuenta/datos', { cargo: 'Analista de compras' })).usuario.cargo, 'Analista de compras');
  assert.equal((await gerente.get('/api/cuenta/yo')).usuario.aprueba, true);
});

test('con alguien que aprueba, quien prepara no lo puede cerrar solo: lo envía', async () => {
  assert.equal((await gerente.subir('/api/inventario/export', [['inventario.xlsx', await plantillaExport()]])).ok, true);
  const r = await carlos.post('/api/pedidos', { modo: 'sugerido' });
  assert.equal(r.estado, 201, r.error);
  pedido = r.pedido;
  assert.ok(pedido.sugerido.length >= 3);
  assert.equal(pedido.aprobacion.estado, 'preparando');
  assert.equal(pedido.aprobacion.puedoCerrar, false);
  assert.equal(pedido.aprobacion.puedoEnviar, true);
  assert.deepEqual(pedido.aprobacion.aprobadores, ['Gloria Gerente']);

  // Quita la primera línea y deja el resto tal cual.
  const [, ...resto] = pedido.sugerido;
  const lista = resto.map(({ codigo, nombre, cantidad, proveedor }) => ({ codigo, nombre, cantidad, proveedor }));
  assert.equal((await carlos.post(`/api/pedidos/${pedido.id}/lista-final`, { lineas: lista })).estado, 200);
  const solo = await carlos.post(`/api/pedidos/${pedido.id}/por-que`, {});
  assert.equal(solo.estado, 403);
  assert.match(solo.error, /Gloria Gerente/);

  const enviado = await carlos.post(`/api/pedidos/${pedido.id}/enviar`, { respuesta: 'Lo de siempre' });
  assert.equal(enviado.estado, 200, enviado.error);
  assert.equal(enviado.pedido.aprobacion.estado, 'por_aprobar');
  assert.equal(enviado.pedido.terminado, false);
  // La aceptación quedó medida con la decisión de quien prepara (y no se le muestra).
  const { comparacion } = await db.uno('SELECT comparacion FROM pedidos WHERE id = $1', [pedido.id]);
  assert.equal(comparacion.aceptacion.quitadas, 1);
  assert.equal(enviado.pedido.comparacion, null);
  // Enviado, ya no lo cambia quien lo preparó.
  assert.equal((await carlos.put(`/api/pedidos/${pedido.id}/lista-final`, { lineas: lista })).estado, 409);
  assert.equal((await carlos.post(`/api/pedidos/${pedido.id}/enviar`)).estado, 409);
});

test('quien no aprueba recibe 403 y alguien de otra empresa 404', async () => {
  assert.equal((await lucia.post(`/api/pedidos/${pedido.id}/aprobar`)).estado, 403);
  assert.equal((await carlos.post(`/api/pedidos/${pedido.id}/aprobar`)).estado, 403, 'quien lo preparó tampoco, si no aprueba');
  assert.equal((await lucia.post(`/api/pedidos/${pedido.id}/devolver`, { motivo: 'no' })).estado, 403);
  assert.equal((await lucia.get(`/api/pedidos/${pedido.id}`)).estado, 404, 'no es suyo y no aprueba');
  assert.deepEqual((await lucia.get('/api/pedidos/por-aprobar')).pedidos, []);

  const otra = cliente();
  await otra.post('/api/cuenta/crear', { nombre: 'Otro Jefe', email: 'otro@aprueba-otra.co', clave: 'clave-segura', empresa: 'Otra Empresa' });
  assert.equal((await otra.post(`/api/pedidos/${pedido.id}/aprobar`)).estado, 404);
  assert.equal((await otra.get(`/api/pedidos/${pedido.id}`)).estado, 404);
  assert.equal((await otra.put(`/api/pedidos/${pedido.id}/lista-final`, { lineas: [] })).estado, 404);
  assert.equal((await otra.get(`/api/pedidos/${pedido.id}/pedido.pdf`)).estado, 404);
  assert.deepEqual((await otra.get('/api/pedidos/por-aprobar')).pedidos, []);
});

test('quien aprueba lo ve en "Por aprobar", ajusta una línea y lo devuelve; queda editable', async () => {
  const { pedidos } = await gerente.get('/api/pedidos/por-aprobar');
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].id, pedido.id);
  assert.equal(pedidos[0].preparadoPor, 'Carlos Compras');

  const visto = await gerente.get(`/api/pedidos/${pedido.id}`);
  assert.equal(visto.estado, 200);
  assert.equal(visto.pedido.aprobacion.puedoAprobar, true);
  assert.equal(visto.pedido.aprobacion.esMio, false);
  const lista = visto.pedido.listaFinal.map((l) => ({ ...l }));
  lista[0].cantidad = Number(lista[0].cantidad) + 10;
  assert.equal((await gerente.put(`/api/pedidos/${pedido.id}/lista-final`, { lineas: lista })).estado, 200);

  assert.equal((await gerente.post(`/api/pedidos/${pedido.id}/devolver`, { motivo: '' })).estado, 400, 'el motivo es obligatorio');
  const devuelto = await gerente.post(`/api/pedidos/${pedido.id}/devolver`, { motivo: 'Falta lo de la obra de la 80' });
  assert.equal(devuelto.estado, 200, devuelto.error);
  assert.equal(devuelto.pedido.aprobacion.estado, 'devuelto');

  const deCarlos = (await carlos.get(`/api/pedidos/${pedido.id}`)).pedido;
  assert.equal(deCarlos.aprobacion.devuelto.motivo, 'Falta lo de la obra de la 80');
  assert.equal(deCarlos.listaFinal[0].cantidad, lista[0].cantidad, 'lo que ajustó quien aprueba se queda');
  assert.equal((await carlos.put(`/api/pedidos/${pedido.id}/lista-final`, { lineas: lista })).estado, 200, 'devuelto, se puede editar');
  assert.equal((await gerente.post(`/api/pedidos/${pedido.id}/aprobar`)).estado, 409, 'devuelto no se aprueba');
  assert.ok(deCarlos.historial.some((h) => h.tipo === 'estado' && h.texto === 'Lo devolvió' && h.quien === 'Gloria Gerente' && h.motivo === 'Falta lo de la obra de la 80'));
});

test('la traza junta los cambios de una persona sobre un código y guarda el antes y el después', async () => {
  const actual = (await carlos.get(`/api/pedidos/${pedido.id}`)).pedido.listaFinal.map((l) => ({ ...l }));
  const original = Number(actual[1].cantidad);
  const codigo = actual[1].codigo;
  for (const n of ['1', '12', '120']) {
    actual[1].cantidad = n;
    await carlos.put(`/api/pedidos/${pedido.id}/lista-final`, { lineas: actual });
  }
  actual[1].nota = 'Pedir en caja';
  await carlos.put(`/api/pedidos/${pedido.id}/lista-final`, { lineas: actual });
  let filas = await db.query('SELECT * FROM pedido_cambios WHERE pedido_id = $1 AND usuario_id = $2 AND codigo = $3', [pedido.id, ids.carlos, codigo]);
  assert.equal(filas.length, 1, 'una sola fila');
  assert.equal(Number(filas[0].antes), original);
  assert.equal(Number(filas[0].despues), 120);
  assert.equal(filas[0].nota, 'Pedir en caja');

  // Agregar y quitar una línea: antes o después en NULL.
  const nueva = { codigo: 'NUEVO-1', nombre: 'Producto nuevo', cantidad: 4 };
  await carlos.put(`/api/pedidos/${pedido.id}/lista-final`, { lineas: [...actual, nueva] });
  const [agregada] = await db.query("SELECT * FROM pedido_cambios WHERE pedido_id = $1 AND codigo = 'NUEVO-1'", [pedido.id]);
  assert.equal(agregada.antes, null);
  assert.equal(Number(agregada.despues), 4);
  await carlos.put(`/api/pedidos/${pedido.id}/lista-final`, { lineas: actual });
  filas = await db.query("SELECT * FROM pedido_cambios WHERE pedido_id = $1 AND codigo = 'NUEVO-1'", [pedido.id]);
  assert.equal(filas.length, 0, 'agregar y quitar en seguida no deja rastro');

  // Lo de quien aprueba va en su propia fila, con su nombre.
  const { historial } = (await carlos.get(`/api/pedidos/${pedido.id}`)).pedido;
  const deGloria = historial.filter((h) => h.tipo === 'cambio' && h.quien === 'Gloria Gerente');
  assert.equal(deGloria.length, 1);
  assert.equal(deGloria[0].despues - deGloria[0].antes, 10);
  assert.ok(historial.some((h) => h.tipo === 'cambio' && h.quien === 'Carlos Compras' && h.codigo === codigo && h.antes === original && h.despues === 120));

  // Función pura: texto y número son lo mismo; lo que no se entiende todavía no se anota.
  assert.deepEqual(diferencias([{ codigo: 'a1', cantidad: 2 }], [{ codigo: 'A1', cantidad: '2' }]), []);
  assert.deepEqual(diferencias([{ codigo: 'a1', cantidad: 2 }], [{ codigo: 'a1', cantidad: '' }]), []);
});

test('reenviado y aprobado: lo de quien aprueba se mide aparte y el PDF lleva su nombre y cargo', async () => {
  const lista = (await carlos.get(`/api/pedidos/${pedido.id}`)).pedido.listaFinal;
  assert.equal((await carlos.post(`/api/pedidos/${pedido.id}/lista-final`, { lineas: lista })).estado, 200);
  assert.equal((await carlos.post(`/api/pedidos/${pedido.id}/enviar`)).estado, 200);

  const ajustada = lista.map((l) => ({ ...l }));
  ajustada.pop();
  assert.equal((await gerente.put(`/api/pedidos/${pedido.id}/lista-final`, { lineas: ajustada })).estado, 200);
  const r = await gerente.post(`/api/pedidos/${pedido.id}/aprobar`);
  assert.equal(r.estado, 200, r.error);
  assert.equal(r.pedido.terminado, true);
  assert.equal(r.pedido.aprobacion.estado, 'cerrado');
  assert.equal(r.pedido.aprobacion.aprobado.nombre, 'Gloria Gerente');
  assert.equal(r.pedido.aprobacion.aprobado.cargo, 'Gerente general');

  const p = await db.uno('SELECT comparacion, aprobado_por FROM pedidos WHERE id = $1', [pedido.id]);
  assert.equal(p.aprobado_por, ids.gerente);
  assert.equal(p.comparacion.aprobacion.quitadas, 1, 'quien aprueba quitó una línea');
  assert.equal(p.comparacion.aprobacion.por, ids.gerente);
  assert.ok(p.comparacion.aceptacion, 'la aceptación de quien preparó sigue ahí');
  assert.ok((await gerente.get('/api/inventario')).inventario.resumen.enCamino > 0, 'aprobado, queda en camino');
  assert.equal((await gerente.post(`/api/pedidos/${pedido.id}/aprobar`)).estado, 409);

  const pdf = await carlos.get(`/api/pedidos/${pedido.id}/pedido.pdf`);
  assert.equal(pdf.estado, 200);
  const texto = textoDePdf(pdf.archivo);
  assert.match(texto, /Pedido \d+ aprobado/);
  assert.match(texto, /Gloria Gerente · Gerente general/);
  assert.match(texto, /Carlos Compras · Analista de compras/);
  // Quien aprueba también lo descarga.
  assert.equal((await gerente.get(`/api/pedidos/${pedido.id}/pedido.xlsx`)).estado, 200);
  assert.deepEqual((await gerente.get('/api/pedidos/por-aprobar')).pedidos, []);
});

test('quien aprueba cierra su propio pedido sin enviarlo y queda como aprobado por él', async () => {
  const p = (await gerente.post('/api/pedidos', { modo: 'sugerido' })).pedido;
  assert.equal(p.aprobacion.puedoCerrar, true);
  assert.equal(p.aprobacion.puedoEnviar, false, 'no hay nadie más que apruebe');
  assert.equal((await gerente.post(`/api/pedidos/${p.id}/lista-final`, { lineas: p.listaFinal })).estado, 200);
  assert.equal((await gerente.post(`/api/pedidos/${p.id}/enviar`)).estado, 409);
  const r = await gerente.post(`/api/pedidos/${p.id}/por-que`, {});
  assert.equal(r.estado, 200, r.error);
  assert.equal(r.pedido.aprobacion.aprobado.nombre, 'Gloria Gerente');
});

test('el logo: PNG o JPG de hasta 300 KB, solo quien administra, y va en el PDF', async () => {
  const grande = Buffer.concat([LOGO, Buffer.alloc(301 * 1024)]);
  const r = await gerente.put('/api/empresa/logo', { datos: grande.toString('base64') });
  assert.equal(r.estado, 413);
  assert.match(r.error, /300 KB/);
  assert.equal((await gerente.put('/api/empresa/logo', { datos: Buffer.from('GIF89a…').toString('base64') })).estado, 400);
  assert.equal((await carlos.put('/api/empresa/logo', { datos: LOGO.toString('base64') })).estado, 200, 'un administrador también cambia el logo');
  const oscar = (await invitado('Óscar Operador', 'oscar@aprueba.co', undefined, 'operador')).c;
  assert.equal((await oscar.put('/api/empresa/logo', { datos: LOGO.toString('base64') })).estado, 403);
  assert.equal((await oscar.get('/api/pedidos')).estado, 403, 'un operador no abre los pedidos');

  const ok = await gerente.put('/api/empresa/logo', { datos: `data:image/png;base64,${LOGO.toString('base64')}` });
  assert.equal(ok.estado, 200, ok.error);
  assert.equal(ok.empresa.logo, true);
  const img = await carlos.get('/api/empresa/logo');
  assert.equal(img.tipo, 'image/png');
  assert.equal(img.archivo.length, LOGO.length);

  const pdf = await carlos.get(`/api/pedidos/${pedido.id}/pedido.pdf`);
  assert.equal(pdf.estado, 200);
  const imagenes = pdf.archivo.toString('latin1').match(/\/Subtype \/Image/g) || [];
  assert.ok(imagenes.length >= 2, 'el logo de la empresa y el de SINESC al pie');
  assert.match(textoDePdf(pdf.archivo), /Hecho con SINESC/);
  assert.equal((await gerente.get(`/api/pedidos/${pedido.id}/pedido.xlsx`)).estado, 200);

  assert.equal((await gerente.del('/api/empresa/logo')).empresa.logo, false);
  assert.equal((await carlos.get('/api/empresa/logo')).estado, 404);
});

test('sin nadie que apruebe, quien prepara lo cierra sin aprobación (como antes)', async () => {
  await db.query('UPDATE usuarios SET aprueba = false WHERE id = $1', [ids.gerente]); // al gerente nadie lo edita por la API
  const p = (await carlos.post('/api/pedidos', { modo: 'sugerido' })).pedido;
  assert.equal(p.aprobacion.puedoCerrar, true);
  assert.equal(p.aprobacion.puedoEnviar, false);
  // Lo sugerido ya va en camino (el pedido aprobado): se agrega una línea a mano.
  assert.equal((await carlos.post(`/api/pedidos/${p.id}/lista-final`, { lineas: [...p.listaFinal, { codigo: 'MAN-1', nombre: 'Manguera', cantidad: 2 }] })).estado, 200);
  const r = await carlos.post(`/api/pedidos/${p.id}/por-que`, {});
  assert.equal(r.estado, 200, r.error);
  assert.equal(r.pedido.aprobacion.aprobado, null, 'cerrado, pero nadie lo aprobó en la app');
  assert.match(textoDePdf((await carlos.get(`/api/pedidos/${p.id}/pedido.pdf`)).archivo), /para aprobar/);
});
