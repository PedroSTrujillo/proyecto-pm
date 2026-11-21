'use strict';

// Alertas configurables (SP7 de docs/PLAN_ALPHA_02.md): la tabla de Mi cuenta, desde cuántas semanas
// sobra cada producto y el boletín de punta a punta (qué secciones salen según el día, el perfil,
// quién aprueba y quién administra). Base de datos en memoria; los correos a Brevo no salen.

process.env.DATA_DIR = 'memory://';
process.env.SIN_LIMITES = '1';
process.env.BREVO_API_KEY = 'clave-de-prueba';
process.env.CORREO_REMITENTE = 'avisos@prueba.co';
process.env.BOLETIN_SECRETO = 'secreto-boletin';

const test = require('node:test');
const { conCodigo } = require('./codigo');
const assert = require('node:assert/strict');
const db = require('../server/db');
const { crearApp } = require('../server/app');
const { plantillaExport } = require('../server/plantillas');
const { enviarBoletines } = require('../server/boletin');
const { fechaBogota } = require('../server/recordatorios');

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
  async function pedir(metodo, ruta, cuerpo, formulario) {
    const h = cookie ? { Cookie: cookie } : {};
    let body;
    if (formulario) body = formulario;
    else if (cuerpo !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(cuerpo); }
    const r = await fetchReal(base + ruta, { method: metodo, headers: h, body });
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

async function cuenta(nombre, email, extra) {
  const c = cliente();
  const r = await c.post('/api/cuenta/crear', await conCodigo({ nombre, email, clave: 'clave-segura', boletin: true, ...extra }));
  assert.equal(r.estado, 201, r.error);
  return { c, usuario: r.usuario };
}

// El próximo lunes (o hoy, si es lunes) y el martes que le sigue, en Bogotá.
function proximoLunes() {
  const hoy = fechaBogota();
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}
const diaDespues = (dia) => new Date(Date.parse(`${dia}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);

let ana;
let carla;

test('Mi cuenta: la tabla de alertas sigue el perfil y guarda solo lo que la persona cambia', async () => {
  ({ c: ana } = await cuenta('Ana Alertas', 'ana.alertas@prueba.co', { empresa: 'Ferretería Alertas' }));
  let u = (await ana.get('/api/cuenta/yo')).usuario;
  assert.equal(u.preferencias.alertas.sobran, 'mensual', 'analista por defecto');
  assert.equal(u.preferencias.alertasPropias, false);

  assert.equal((await ana.put('/api/cuenta/preferencias', { alertas: { sobran: 'cada hora' } })).estado, 400);
  assert.equal((await ana.put('/api/cuenta/preferencias', { alertas: { otraCosa: 'diario' } })).estado, 400);
  u = (await ana.put('/api/cuenta/preferencias', { alertas: { sobran: 'semanal' } })).usuario;
  assert.equal(u.preferencias.alertas.sobran, 'semanal');
  assert.equal(u.preferencias.alertasPropias, true);

  // Al pasar a operador cambia lo que no tocó. Sobrestock y dinero quieto salen en 'nunca' aunque los
  // haya pedido: el operador no recibe dinero (T4), pero lo que eligió queda guardado.
  await db.query("UPDATE usuarios SET perfil = 'operador' WHERE id = $1", [u.id]); // el perfil ya no se cambia por la API
  u = (await ana.get('/api/cuenta/yo')).usuario;
  assert.equal(u.preferencias.alertas.sobran, 'nunca');
  assert.equal(u.preferencias.alertas.dineroQuieto, 'nunca');
  assert.equal(u.preferencias.alertas.enCero, 'diario');
  assert.equal((await ana.put('/api/cuenta/preferencias', { alertas: { dineroQuieto: 'diario' } })).usuario.preferencias.alertas.dineroQuieto, 'nunca');
  // Cambiar la unidad no borra las alertas.
  u = (await ana.put('/api/cuenta/preferencias', { unidad: 'dias' })).usuario;
  assert.equal(u.preferencias.alertasPropias, true);
  u = (await ana.put('/api/cuenta/preferencias', { alertas: null })).usuario;
  assert.equal(u.preferencias.alertas.sobran, 'nunca', 'vuelve a lo del perfil (operador)');
  assert.equal(u.preferencias.alertasPropias, false);
  await db.query("UPDATE usuarios SET perfil = 'analista' WHERE id = $1", [u.id]);
});

test('desde cuántas semanas sobra cada producto: en la ficha, por lote y en el inventario', async () => {
  assert.equal((await ana.subir('/api/inventario/export', [['inventario.xlsx', await plantillaExport()]])).ok, true);
  const inv = (await ana.get('/api/inventario')).inventario;
  const normal = inv.productos.find((p) => p.estado === 'normal' && p.semanas >= 3);
  const sobra = inv.productos.find((p) => p.estado === 'sobra' && p.semanas < 100);
  assert.ok(normal && sobra, 'la plantilla trae productos que están bien y productos que sobran');

  const malo = await ana.post('/api/catalogo/lote', { filas: [{ codigo: normal.codigo, sobra: '0' }] });
  assert.equal(malo.estado, 400);
  assert.match(malo.errores[0], /Fila 1: Las semanas para que sobre/);
  const umbral = Math.floor(normal.semanas) - 1;
  assert.equal((await ana.post('/api/catalogo/lote', { filas: [{ codigo: normal.codigo, sobra: String(umbral) }, { codigo: sobra.codigo, sobra: String(Math.ceil(sobra.semanas) + 5) }] })).guardados, 2);

  const despues = (await ana.get('/api/inventario')).inventario;
  const a = despues.productos.find((p) => p.codigo === normal.codigo);
  const b = despues.productos.find((p) => p.codigo === sobra.codigo);
  assert.equal(a.estado, 'sobra', `con ${a.semanas} semanas y el umbral en ${umbral}, sobra`);
  assert.equal(a.sobraSemanas, umbral);
  assert.equal(a.sugerido, 0, 'lo que sobra no se sugiere pedir');
  assert.notEqual(b.estado, 'sobra', 'con un umbral más alto ya no sobra');
  assert.equal(despues.umbrales.sobra, 12, 'el umbral general sigue en 12');
  assert.equal(despues.resumen.sobran, inv.resumen.sobran, 'uno entra y otro sale');

  // En la ficha (PUT del catálogo) y borrándolo con la celda vacía.
  const { productos } = await ana.get(`/api/catalogo?q=${encodeURIComponent(normal.codigo)}`);
  assert.equal(productos[0].sobraSemanas, umbral);
  assert.equal((await ana.put(`/api/catalogo/${productos[0].id}`, { sobraSemanas: '' })).producto.sobraSemanas, null);
  assert.equal((await ana.get('/api/inventario')).inventario.productos.find((p) => p.codigo === normal.codigo).estado, 'normal');
});

test('boletín de un lunes: cada quien recibe sus secciones, y nunca dos veces el mismo día', async () => {
  // Un pedido de Carla esperando a Ana.
  const inv = await ana.post('/api/empresa/invitaciones', { email: 'carla.alertas@prueba.co', rol: 'operador' });
  ({ c: carla } = await cuenta('Carla Bodega', 'carla.alertas@prueba.co', { invitacion: new URL(inv.enlace).searchParams.get('invitacion') }));
  const { id: anaId } = await db.uno("SELECT id FROM usuarios WHERE email = 'ana.alertas@prueba.co'");
  await db.query('UPDATE usuarios SET aprueba = true WHERE id = $1', [anaId]);
  // Un operador no abre los pedidos (T4): Carla prepara este como administradora y vuelve a ser operadora.
  await db.query("UPDATE usuarios SET perfil = 'analista' WHERE email = 'carla.alertas@prueba.co'");
  const p2 = (await carla.post('/api/pedidos', { modo: 'sugerido' })).pedido;
  await carla.post(`/api/pedidos/${p2.id}/lista-final`, { lineas: p2.listaFinal });
  assert.equal((await carla.post(`/api/pedidos/${p2.id}/enviar`, {})).estado, 200);
  await db.query("UPDATE usuarios SET perfil = 'operador' WHERE email = 'carla.alertas@prueba.co'");

  // Nadie ha registrado nada en 15 días.
  await db.query("UPDATE exports SET subido_en = now() - interval '15 days' WHERE empresa_id = (SELECT empresa_id FROM usuarios WHERE id = $1)", [anaId]);

  const lunes = proximoLunes();
  correos.length = 0;
  const r = await enviarBoletines({ hoy: lunes, limiteMs: Infinity });
  assert.equal(r.enviados, 2, JSON.stringify(r));
  const de = (email) => correos.find((c) => c.to[0].email === email);
  const paraAna = de('ana.alertas@prueba.co');
  const paraCarla = de('carla.alertas@prueba.co');

  assert.match(paraAna.htmlContent, /Pedidos por aprobar \(1\)/, 'Ana aprueba');
  assert.match(paraAna.textContent, /de Carla Bodega/);
  assert.match(paraAna.htmlContent, /Datos sin actualizar/, 'Ana administra la empresa');
  assert.match(paraAna.htmlContent, /Ver el panel/);

  assert.doesNotMatch(paraCarla.htmlContent, /por aprobar/i, 'Carla no aprueba');
  assert.doesNotMatch(paraCarla.htmlContent, /Dinero quieto|Sugerido/, 'el operador no recibe dinero ni sugeridos');
  assert.match(paraCarla.htmlContent, /Datos sin actualizar/, 'los operadores sí lo reciben');
  assert.match(paraCarla.textContent, /Hace \d+ días hábiles que no se registran movimientos ni archivos/);

  const otra = await enviarBoletines({ hoy: lunes, limiteMs: Infinity });
  assert.equal(otra.enviados, 0, 'la misma tarea el mismo día no manda otro');
  assert.equal(correos.length, 2);
  const filas = await db.query('SELECT usuario_id, fecha FROM boletines WHERE fecha = $1', [lunes]);
  assert.equal(filas.length, 2);
});

test('con todo en "nunca" no sale nada, pero la persona sigue activada', async () => {
  const nunca = { pideYa: 'nunca', seAgota: 'nunca', enCero: 'nunca', porAprobar: 'nunca', dineroQuieto: 'nunca', sobran: 'nunca', sinDatos: 'nunca' };
  assert.equal((await carla.put('/api/cuenta/preferencias', { alertas: nunca })).estado, 200);
  const martes = diaDespues(proximoLunes());
  correos.length = 0;
  const r = await enviarBoletines({ hoy: martes, limiteMs: Infinity });
  assert.equal(r.sinNovedad, 1);
  assert.equal(correos.filter((c) => c.to[0].email === 'carla.alertas@prueba.co').length, 0);
  const fila = await db.uno("SELECT b.estado, u.boletin FROM boletines b JOIN usuarios u ON u.id = b.usuario_id WHERE u.email = 'carla.alertas@prueba.co' AND b.fecha = $1", [martes]);
  assert.deepEqual(fila, { estado: 'sin_novedad', boletin: true });

  // El martes, Ana (analista) solo recibe lo diario: no los datos sin actualizar (semanal).
  const paraAna = correos.find((c) => c.to[0].email === 'ana.alertas@prueba.co');
  assert.ok(paraAna);
  assert.doesNotMatch(paraAna.htmlContent, /Datos sin actualizar/);
  assert.match(paraAna.htmlContent, /Pedidos por aprobar/, 'porAprobar es diario');
});

test('el enlace de baja apaga el interruptor sin borrar la tabla de alertas', async () => {
  await ana.put('/api/cuenta/preferencias', { alertas: { sobran: 'diario' } });
  const c = correos.find((x) => x.to[0].email === 'ana.alertas@prueba.co');
  const baja = new URL(c.headers['List-Unsubscribe'].slice(1, -1));
  assert.equal((await fetchReal(`${base}${baja.pathname}${baja.search}`)).status, 200);
  const u = (await ana.get('/api/cuenta/yo')).usuario;
  assert.equal(u.boletin, false);
  assert.equal(u.preferencias.alertas.sobran, 'diario');
  assert.equal(u.preferencias.alertasPropias, true);
});
