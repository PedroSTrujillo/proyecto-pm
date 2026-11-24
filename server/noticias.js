'use strict';

// Noticias para el gerente (T21 de docs/PLAN_CORRECCIONES_SINESC.md): la TRM del dólar, el euro y el
// yuan, y titulares de aranceles e importaciones y de la regulación de su sector. Todo viene de
// fuentes públicas por fetch, sin llaves ni dependencias; cada fuente falla por separado y la
// pantalla dice cuál. No se guarda nada en la base (solo el sector de la empresa).
//
// El RSS no es de fiar: de él solo sale texto plano y enlaces https.

const express = require('express');
const db = require('./db');
const { requiereUsuario, requiereRol } = require('./cuentas');

const MIN = 60 * 1000;
const HORAS_TITULARES = 6;
const ESPERA_MS = 5000;
const MAX_TITULARES = 5;
// Las noticias más viejas que esto ya no sirven para decidir (Correcciones finales: había titulares de
// años atrás). 6 meses es provisional: el plazo lo confirma Santiago con el equipo.
const MESES_NOTICIAS = 6;
const DIAS_NOTICIAS = Math.round(MESES_NOTICIAS * 30.44);

const SIC = { texto: 'SIC: reglamentos técnicos', url: 'https://www.sic.gov.co/reglamentos-tecnicos' };
const MINCIT = { texto: 'MinCIT', url: 'https://www.mincit.gov.co/' };
const VUCE = { texto: 'VUCE: trámites de comercio exterior', url: 'https://www.vuce.gov.co/' };
const INVIMA = { texto: 'INVIMA', url: 'https://www.invima.gov.co/' };

// Cada sector tiene una búsqueda de regulación y unos enlaces fijos (que no cambian con las noticias).
const SECTORES = {
  alimentos: { etiqueta: 'Alimentos y bebidas', busqueda: 'regulación INVIMA alimentos Colombia', enlaces: [INVIMA, SIC, MINCIT] },
  salud: { etiqueta: 'Salud y cosméticos', busqueda: 'regulación INVIMA cosméticos medicamentos Colombia', enlaces: [INVIMA, SIC, MINCIT] },
  construccion: { etiqueta: 'Construcción y ferretería', busqueda: 'reglamentos técnicos construcción ferretería Colombia', enlaces: [SIC, MINCIT, VUCE] },
  hogar: { etiqueta: 'Muebles y hogar', busqueda: 'reglamentos técnicos muebles hogar Colombia', enlaces: [SIC, MINCIT, VUCE] },
  textil: { etiqueta: 'Textil y confección', busqueda: 'reglamento técnico etiquetado textil confecciones Colombia', enlaces: [SIC, MINCIT, VUCE] },
  tecnologia: { etiqueta: 'Tecnología y electrónicos', busqueda: 'regulación importación electrónicos tecnología Colombia', enlaces: [SIC, MINCIT, VUCE] },
  otro: { etiqueta: 'Otro', busqueda: 'regulación comercio importaciones Colombia', enlaces: [MINCIT, VUCE, SIC] },
};

const TEMAS = [
  { id: 'china', titulo: 'Aranceles e importaciones con China', consulta: 'aranceles importaciones Colombia China' },
  { id: 'eeuu', titulo: 'Aranceles e importaciones con Estados Unidos', consulta: 'aranceles importaciones Colombia Estados Unidos' },
  { id: 'ue', titulo: 'Aranceles e importaciones con la Unión Europea', consulta: 'aranceles importaciones Colombia Unión Europea' },
];

// --- RSS ---------------------------------------------------------------------------------------

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodificar(t) {
  return String(t)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

const etiqueta = (xml, nombre) => {
  const m = new RegExp(`<${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</${nombre}>`).exec(xml);
  return m ? decodificar(m[1]) : '';
};

/**
 * Los primeros titulares de un RSS: [{ titulo, enlace, fuente, fecha }]. Solo texto y enlaces https,
 * y nada publicado hace más de MESES_NOTICIAS (los que no traen fecha ya vienen filtrados por la búsqueda).
 */
function leerRss(xml, ahora = Date.now()) {
  const limite = ahora - DIAS_NOTICIAS * 24 * 60 * MIN;
  const out = [];
  for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1];
    const enlace = etiqueta(item, 'link');
    if (!/^https:\/\//i.test(enlace)) continue;
    const fuente = etiqueta(item, 'source');
    let titulo = etiqueta(item, 'title');
    // Google agrega " - Fuente" al final del título: la fuente va aparte.
    if (fuente && titulo.endsWith(` - ${fuente}`)) titulo = titulo.slice(0, -(fuente.length + 3));
    if (!titulo) continue;
    const t = new Date(etiqueta(item, 'pubDate'));
    if (t.getTime() < limite) continue;
    out.push({ titulo: titulo.slice(0, 300), enlace, fuente: fuente.slice(0, 80), fecha: Number.isNaN(t.getTime()) ? null : t.toISOString() });
    if (out.length >= MAX_TITULARES) break;
  }
  return out;
}

// --- Caché -------------------------------------------------------------------------------------
// shortcut: caché por instancia de Vercel; cada función fría vuelve a pedir. Pasar a la base si las fuentes empiezan a limitar.
const cache = new Map();
async function conCache(clave, ttl, pedir) {
  const c = cache.get(clave);
  if (c && c.hasta > Date.now()) return c.valor;
  const valor = await pedir();
  cache.set(clave, { valor, hasta: Date.now() + ttl(valor) });
  return valor;
}

const json = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(ESPERA_MS), headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${new URL(url).host} respondió ${r.status}`);
  return r.json();
};

// Hasta la medianoche de Bogotá (UTC-5 todo el año).
const msHastaMedianoche = () => 86400000 - ((Date.now() - 5 * 60 * MIN) % 86400000);

// --- TRM ---------------------------------------------------------------------------------------

/** Pesos por divisa a partir de la TRM (pesos por dólar) y las divisas que da un dólar. Función pura. */
function convertir(trm, porDolar) {
  return Number.isFinite(porDolar) && porDolar > 0 ? Math.round((trm / porDolar) * 100) / 100 : null;
}

/** { fecha, usd, eur, cny }: el dólar es la TRM oficial; el euro y el yuan, la TRM por el cambio del día. */
async function trm() {
  return conCache('trm', (v) => (v.eur !== null && v.cny !== null ? msHastaMedianoche() : 10 * MIN), async () => {
    const url = new URL('https://www.datos.gov.co/resource/32sa-8pi3.json');
    url.searchParams.set('$order', 'vigenciadesde DESC');
    url.searchParams.set('$limit', '1');
    const filas = await json(url.toString());
    const usd = Number(filas && filas[0] && filas[0].valor);
    if (!Number.isFinite(usd) || usd <= 0) throw new Error('La TRM no vino con valor.');
    const fecha = String(filas[0].vigenciadesde || '').slice(0, 10) || null;
    // Si falla el cambio internacional, el dólar sigue y el euro y el yuan quedan sin dato.
    const cambio = await json('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,CNY').catch(() => null);
    return { fecha, usd, eur: convertir(usd, cambio && cambio.rates && cambio.rates.EUR), cny: convertir(usd, cambio && cambio.rates && cambio.rates.CNY) };
  });
}

// --- Titulares ---------------------------------------------------------------------------------

async function titulares(consulta) {
  return conCache(`rss:${consulta}`, () => HORAS_TITULARES * 60 * MIN, async () => {
    // when:Nd le pide a Google solo lo de los últimos N días; leerRss lo vuelve a revisar por la fecha.
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${consulta} when:${DIAS_NOTICIAS}d`)}&hl=es-419&gl=CO&ceid=CO:es-419`;
    const r = await fetch(url, { signal: AbortSignal.timeout(ESPERA_MS), headers: { Accept: 'application/rss+xml, application/xml', 'User-Agent': 'Mozilla/5.0 (compatible; SINESC)' } });
    if (!r.ok) throw new Error(`Google Noticias respondió ${r.status}`);
    return leerRss(await r.text());
  });
}

// --- Ruta --------------------------------------------------------------------------------------

const rutas = express.Router();
rutas.use(requiereUsuario, requiereRol('gerente'));

rutas.get('/', async (req, res) => {
  const fila = await db.uno('SELECT sector FROM empresas WHERE id = $1', [req.usuario.empresa_id]);
  const sector = fila && SECTORES[fila.sector] ? { id: fila.sector, ...SECTORES[fila.sector] } : null;
  const temas = [...TEMAS, ...(sector ? [{ id: 'sector', titulo: `Regulación: ${sector.etiqueta}`, consulta: sector.busqueda }] : [])];
  const [dinero, ...noticias] = await Promise.allSettled([trm(), ...temas.map((t) => titulares(t.consulta))]);
  res.json({
    trm: dinero.status === 'fulfilled' ? dinero.value : null,
    temas: temas.map((t, i) => ({ id: t.id, titulo: t.titulo, titulares: noticias[i].status === 'fulfilled' ? noticias[i].value : null })),
    sector: sector ? { id: sector.id, etiqueta: sector.etiqueta, enlaces: sector.enlaces } : null,
  });
});

/** Solo para las pruebas: vacía la caché. */
function vaciarCache() {
  cache.clear();
}

module.exports = { rutas, SECTORES, MESES_NOTICIAS, leerRss, convertir, trm, titulares, vaciarCache };
