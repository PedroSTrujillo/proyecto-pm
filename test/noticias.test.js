'use strict';

// T21: la TRM, los titulares y el sector. Las fuentes externas se reemplazan con global.fetch.

process.env.DATA_DIR = 'memory://';
process.env.SIN_LIMITES = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { conCodigo } = require('./codigo');
const db = require('../server/db');
const { crearApp } = require('../server/app');
const N = require('../server/noticias');

const fetchReal = global.fetch;
let servidor;
let base;
let llamadas = [];
let fuentes = {};

// Cualquier llamada a una fuente externa pasa por aquí; lo demás (la app misma) va normal.
global.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith(base || 'http://127.0.0.1')) return fetchReal(url, init);
  llamadas.push(u);
  const f = Object.entries(fuentes).find(([host]) => u.includes(host));
  if (!f) throw new Error(`sin fuente para ${u}`);
  const r = await f[1](u);
  return r;
};
const ok = (cuerpo, tipo = 'application/json') => new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), { status: 200, headers: { 'content-type': tipo } });

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title>Aranceles &amp; más: la UE sube cuotas - El Espectador</title><link>https://news.google.com/rss/articles/a1?oc=5</link><pubDate>Mon, 26 Oct 2026 10:00:00 GMT</pubDate><source url="https://www.elespectador.com">El Espectador</source></item>
<item><title>Con http no sirve</title><link>http://inseguro.example/x</link></item>
<item><title>Con javascript tampoco</title><link>javascript:alert(1)</link></item>
<item><title><![CDATA[Hola &lt;script&gt;alert(1)&lt;/script&gt; l&#39;arancel]]></title><link>https://example.com/b</link><source url="https://x">Fuente B</source></item>
<item><title>Tres</title><link>https://example.com/3</link></item>
<item><title>Cuatro</title><link>https://example.com/4</link></item>
<item><title>Cinco</title><link>https://example.com/5</link></item>
<item><title>Seis</title><link>https://example.com/6</link></item>
<item><title>Siete</title><link>https://example.com/7</link></item>
</channel></rss>`;

function fuentesBuenas() {
  fuentes = {
    'datos.gov.co': () => ok([{ valor: '3461.92', unidad: 'COP', vigenciadesde: '2026-11-21T00:00:00.000' }]),
    'frankfurter': () => ok({ rates: { EUR: 0.90992, CNY: 6.6777 } }),
    'news.google.com': () => ok(RSS, 'application/rss+xml'),
  };
}

test.before(async () => {
  await db.iniciar();
  servidor = crearApp().listen(0);
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

test.after(async () => {
  servidor.close();
  await db.cerrar();
  global.fetch = fetchReal;
});

function cliente() {
  let cookie = '';
  async function pedir(metodo, ruta, cuerpo) {
    const h = { ...(cookie ? { Cookie: cookie } : {}), ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}) };
    const r = await fetchReal(base + ruta, { method: metodo, headers: h, body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { estado: r.status, ...(await r.json().catch(() => ({}))) };
  }
  return { get: (ruta) => pedir('GET', ruta), post: (ruta, cuerpo) => pedir('POST', ruta, cuerpo ?? {}), put: (ruta, cuerpo) => pedir('PUT', ruta, cuerpo) };
}

async function cuenta(nombre, email, extra = {}) {
  const c = cliente();
  const r = await c.post('/api/cuenta/crear', await conCodigo({ nombre, email, clave: 'clave-segura', ...extra }));
  assert.equal(r.estado, 201, r.error);
  return { c, usuario: r.usuario };
}

test('leerRss: solo texto y enlaces https, los 5 primeros, con las entidades decodificadas', () => {
  const t = N.leerRss(RSS);
  assert.equal(t.length, 5);
  assert.deepEqual(t[0], { titulo: 'Aranceles & más: la UE sube cuotas', enlace: 'https://news.google.com/rss/articles/a1?oc=5', fuente: 'El Espectador', fecha: '2026-10-26T10:00:00.000Z' });
  assert.ok(t.every((x) => x.enlace.startsWith('https://')), 'los http y javascript se descartan');
  assert.ok(!t.some((x) => /inseguro|javascript/i.test(x.titulo)));
  // El HTML dentro de un título se queda como texto: la web lo dibuja sin interpretarlo.
  assert.equal(t[1].titulo, "Hola <script>alert(1)</script> l'arancel");
  assert.equal(t[1].fuente, 'Fuente B');
  assert.equal(t[2].fecha, null);
});

test('convertir: el euro y el yuan salen de la TRM y del cambio del día', () => {
  assert.equal(N.convertir(3461.92, 0.90992), 3804.64);
  assert.equal(N.convertir(3461.92, 6.6777), 518.43);
  assert.equal(N.convertir(3461.92, undefined), null);
  assert.equal(N.convertir(3461.92, 0), null);
});

test('la TRM y los titulares se piden una vez y se guardan; si una fuente falla, las demás siguen', async () => {
  N.vaciarCache();
  fuentesBuenas();
  llamadas = [];
  const t = await N.trm();
  assert.deepEqual([t.usd, t.eur, t.cny, t.fecha], [3461.92, 3804.64, 518.43, '2026-11-21']);
  await N.trm();
  assert.equal(llamadas.length, 2, 'la segunda vez sale de la caché (datos.gov.co y el cambio, una vez)');

  // Sin el cambio internacional: queda el dólar, y solo se guarda 10 minutos (una TRM completa, hasta el cambio de día).
  N.vaciarCache();
  fuentes.frankfurter = () => new Response('', { status: 500 });
  const parcial = await N.trm();
  assert.deepEqual([parcial.usd, parcial.eur, parcial.cny], [3461.92, null, null]);
  llamadas = [];
  await N.trm();
  assert.equal(llamadas.length, 0, 'dentro de esos 10 minutos no se vuelve a pedir');

  // Sin la TRM oficial la función falla, pero los titulares siguen.
  N.vaciarCache();
  fuentes['datos.gov.co'] = () => new Response('', { status: 500 });
  await assert.rejects(N.trm());
  assert.equal((await N.titulares('aranceles')).length, 5);
});

test('GET /api/noticias: solo el gerente; trae la TRM, los temas y el sector', async () => {
  N.vaciarCache();
  fuentesBuenas();
  const { c: gerente } = await cuenta('Gina Noticias', 'gina.noticias@prueba.co', { empresa: 'Noticias SAS' });
  const inv = await gerente.post('/api/empresa/invitaciones', { email: 'admin.noticias@prueba.co', rol: 'administrador' });
  const { c: admin } = await cuenta('Admin', 'admin.noticias@prueba.co', { invitacion: new URL(inv.enlace).searchParams.get('invitacion') });
  assert.equal((await admin.get('/api/noticias')).estado, 403);
  assert.equal((await cliente().get('/api/noticias')).estado, 401);

  const sin = await gerente.get('/api/noticias');
  assert.equal(sin.estado, 200);
  assert.equal(sin.trm.usd, 3461.92);
  assert.equal(sin.sector, null);
  assert.deepEqual(sin.temas.map((t) => t.id), ['china', 'eeuu', 'ue'], 'sin sector no hay tema de regulación');
  assert.equal(sin.temas[0].titulares.length, 5);

  // El sector: se guarda, y uno inventado se rechaza.
  assert.equal((await gerente.put('/api/empresa', { nombre: 'Noticias SAS', sector: 'inventado' })).estado, 400);
  const guardado = await gerente.put('/api/empresa', { nombre: 'Noticias SAS', sector: 'alimentos' });
  assert.equal(guardado.empresa.sector, 'alimentos');
  assert.equal((await gerente.put('/api/empresa', { nombre: 'Noticias SAS' })).empresa.sector, 'alimentos', 'sin el campo, no se toca');
  const con = await gerente.get('/api/noticias');
  assert.deepEqual(con.temas.map((t) => t.id), ['china', 'eeuu', 'ue', 'sector']);
  assert.equal(con.sector.etiqueta, 'Alimentos y bebidas');
  assert.ok(con.sector.enlaces.every((e) => e.url.startsWith('https://')));

  // Si Google falla, esos temas dicen null y la TRM sigue.
  N.vaciarCache();
  fuentes['news.google.com'] = () => new Response('', { status: 503 });
  const caido = await gerente.get('/api/noticias');
  assert.equal(caido.trm.usd, 3461.92);
  assert.ok(caido.temas.every((t) => t.titulares === null));
  assert.equal((await gerente.put('/api/empresa', { nombre: 'Noticias SAS', sector: '' })).empresa.sector, null, 'vacío quita el sector');
});

test('los sectores de la web son los mismos del servidor', () => {
  const ts = fs.readFileSync(path.join(__dirname, '..', 'inventory-forecasting-landing-page', 'lib', 'sectores.ts'), 'utf8');
  const web = [...ts.matchAll(/id: '([a-z]+)', etiqueta: '([^']+)'/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(web, Object.entries(N.SECTORES).map(([id, s]) => [id, s.etiqueta]));
});
