'use strict';

// T16: la cuenta se crea sin código y queda esperándolo hasta /activar.

process.env.DATA_DIR = 'memory://';
process.env.TEAM_EMAILS = 'equipo@prueba.co';
process.env.SIN_LIMITES = '1';
process.env.BREVO_API_KEY = 'clave-de-prueba';
process.env.CORREO_REMITENTE = 'avisos@prueba.co';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../server/db');
const { crearApp } = require('../server/app');
const { crearCodigos, listarCuentas } = require('../server/cuentas-equipo');
const { enviarBoletines } = require('../server/boletin');

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
  async function pedir(metodo, ruta, cuerpo) {
    const h = { ...(cookie ? { Cookie: cookie } : {}), ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}) };
    const r = await fetch(base + ruta, { method: metodo, headers: h, body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { estado: r.status, ...(await r.json().catch(() => ({}))) };
  }
  return { get: (ruta) => pedir('GET', ruta), post: (ruta, cuerpo) => pedir('POST', ruta, cuerpo ?? {}) };
}

test('sin código la cuenta nace pendiente: solo ve /api/cuenta/*, no el inventario ni el boletín', async () => {
  const c = cliente();
  const r = await c.post('/api/cuenta/crear', { nombre: 'Ana', email: 'ana@prueba.co', clave: 'clave-segura', empresa: 'Ana SAS', boletin: true });
  assert.equal(r.estado, 201);
  assert.equal(r.usuario.pendienteCodigo, true);
  const inv = await c.get('/api/inventario');
  assert.equal(inv.estado, 403);
  assert.equal(inv.pendienteCodigo, true);
  assert.equal((await c.get('/api/cuenta/yo')).usuario.pendienteCodigo, true);
  const enviados = await enviarBoletines({ soloUsuario: r.usuario.id, forzar: true });
  // Con el correo configurado, una cuenta que espera su código no entra ni a "sin datos".
  assert.equal(enviados.motivo, undefined);
  assert.equal(enviados.enviados + enviados.sinDatos + enviados.sinNovedad, 0);
  const fila = (await listarCuentas()).cuentas.find((x) => x.email === 'ana@prueba.co');
  assert.equal(fila.estado, 'esperando_codigo');
});

test('/activar rechaza un código inválido o ya usado, y con uno bueno abre todo', async () => {
  const c = cliente();
  await c.post('/api/cuenta/crear', { nombre: 'Beto', email: 'beto@prueba.co', clave: 'clave-segura', empresa: 'Beto SAS' });
  assert.equal((await c.post('/api/cuenta/activar', { codigo: 'NOEXISTE' })).estado, 400);
  assert.equal((await c.post('/api/cuenta/activar', {})).estado, 400);
  const [codigo] = await crearCodigos(1, 'prueba', null);
  const ok = await c.post('/api/cuenta/activar', { codigo: codigo.toLowerCase() });
  assert.equal(ok.estado, 200);
  assert.equal(ok.usuario.pendienteCodigo, false);
  assert.equal((await c.get('/api/inventario')).estado, 200);
  const fila = await db.uno('SELECT usado_por FROM codigos_acceso WHERE codigo = $1', [codigo]);
  assert.ok(fila.usado_por);
  // Otra cuenta no puede reusar el mismo código.
  const d = cliente();
  await d.post('/api/cuenta/crear', { nombre: 'Cami', email: 'cami@prueba.co', clave: 'clave-segura', empresa: 'Cami SAS' });
  assert.equal((await d.post('/api/cuenta/activar', { codigo })).estado, 400);
  assert.equal((await d.get('/api/inventario')).estado, 403);
});

test('quien entra por invitación también queda pendiente', async () => {
  const gerente = cliente();
  const [cod] = await crearCodigos(1, 'prueba', null);
  await gerente.post('/api/cuenta/crear', { nombre: 'Gina', email: 'gina@prueba.co', clave: 'clave-segura', empresa: 'Gina SAS', codigo: cod });
  const inv = await gerente.post('/api/empresa/invitaciones', { email: 'op@prueba.co', rol: 'operador' });
  assert.equal(inv.estado, 201, JSON.stringify(inv));
  const token = new URL(inv.enlace, 'http://x').searchParams.get('invitacion');
  const op = cliente();
  const r = await op.post('/api/cuenta/crear', { nombre: 'Op', email: 'op@prueba.co', clave: 'clave-segura', invitacion: token });
  assert.equal(r.estado, 201);
  assert.equal((await op.get('/api/inventario')).estado, 403);
});
