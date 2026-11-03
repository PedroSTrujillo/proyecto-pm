'use strict';

// Revisa textos en español buscando marcas de texto escrito por IA ("AI slop").
// Reglas tomadas de stop-slop (https://github.com/hardikpandya/stop-slop), adaptadas al español:
// rayas, contrastes binarios, listas negativas, absolutos, adverbios de relleno, preguntas que
// anuncian, jerga y comentarios sobre el propio texto. Marca frases para revisar a mano: no todas
// están mal ("todas las bodegas" en una instrucción es literal).
// Uso: npm run texto -- archivo1 archivo2 ...  (sin archivos revisa la landing y la app)
const fs = require('fs');
const path = require('path');

const REGLAS = [
  ['raya (—)', /—/],
  ['contraste binario', /\bno (es|son|fue|era|se trata de)\b[^.]*\b(es|son|sino)\b|\bsino\b|, no (antes|después|al revés)\b|\bno [a-záéíóúñ]+, (sino|es)\b/i],
  ['lista negativa', /\bni\b[^.]*\bni\b/i],
  ['absoluto', /\b(siempre|nunca|nadie|todos|todas|cualquier|jamás|ningún|ninguna)\b/i],
  ['adverbio de relleno', /\b(realmente|simplemente|justo|literalmente|de verdad|verdaderamente|fundamentalmente|básicamente|totalmente|completamente|claramente|sin duda)\b/i],
  ['pregunta que anuncia', /¿(Y si|Por qué importa|Qué significa esto)/i],
  ['jerga', /\b(ecosistema|potenciar|sinergia|robusto|transformar|revolucion|clave para|game changer|de próxima generación|sin fricción|empoderar)\b/i],
  ['comentario meta', /\b(vale la pena (decir|notar)|en esta sección|como veremos|te contamos|aquí está (la clave|el truco))\b/i],
];

// La aplicación trata de "usted" (decisión D13 de docs/PLAN_ALPHA_02.md). Busca las formas de "tú"
// como palabras completas: pronombres, verbos en segunda persona e imperativos. El imperativo de "tú"
// se escribe igual que la tercera persona ("el panel ya usa", "no se guarda"), así que esos solo
// cuentan al comienzo de una frase o después de coma, "y" u "o"; los que llevan pronombre pegado
// ("súbelo") o son irregulares ("haz") cuentan en cualquier parte.
const TUTEO_SIEMPRE = [
  'tu', 'tus', 'te', 'ti', 'contigo', 'tuyo', 'tuya', 'tuyos', 'tuyas',
  'tienes', 'puedes', 'quieres', 'sabes', 'vendes', 'pides', 'subes', 'usas', 'necesitas', 'debes', 'estás',
  'eres', 'vas', 'llevas', 'haces', 'eliges', 'escribes', 'decides', 'das', 'vienes', 'sigues',
  'recibes', 'guardas', 'cambias', 'pones', 'prefieres', 'conoces', 'encuentras', 'preparas', 'manejas', 'ves',
  'corriges', 'vuelves', 'registras', 'cuentas con',
  'ibas', 'tenías', 'estabas', 'querías', 'podías', 'vendías', 'pedías', 'pensabas',
  'quieras', 'puedas', 'tengas', 'elijas', 'subas', 'necesites', 'olvides', 'vuelvas', 'hagas', 'pidas', 'veas',
  'podrías', 'deberías', 'tendrías',
  '\\p{L}+(?:aste|iste)(?<!existe|consiste|contraste|insiste|resiste|asiste|desiste|gaste|baste|triste)',
  '\\p{L}+rás(?<!atrás|detrás)',
  'súbelo', 'súbela', 'escríbelo', 'escríbela', 'elígelo', 'ábrelo', 'ábrela', 'pídelo', 'pídela', 'pídele',
  'ármalo', 'úsalo', 'úsala', 'guárdalo', 'descárgalo', 'descárgala', 'agrégalo', 'agrégala', 'cámbialo',
  'cámbiala', 'búscalo', 'márcalo', 'márcala', 'pégalo', 'pégala', 'bórralo', 'quítalo', 'revísalo', 'revísala',
  'mándalo', 'envíalo', 'anótalo', 'súmalo', 'súmala', 'hazlo', 'haz', 'pon', 'ponle', 'olvídate', 'fíjate',
  'asegúrate', 'cuéntanos', 'escríbenos', 'dinos', 'avísanos', 'ignora', 'inclúyelo', 'inclúyela', 'esperas',
  'expórtalo', 'expórtala', 'sácalo', 'sácala', 'créalos', 'pégalas', 'mándaselo', 'cópialo', 'ingrésalo', 'termínalo',
  'asígnale', 'desactívalo', 'actívalo', 'reactívalo', 'regístralas', 'regístralo', 'súbelas', 'súbelos', 'elígelas',
  'elígelos', 'llénala', 'guárdala', 'actualízalos', 'ignóralo', 'revísalas', 'impórtalo', 'escríbela', 'pídeselo',
];
const TUTEO_AL_COMIENZO = [
  'sube', 'escribe', 'elige', 'abre', 'pide', 'toca', 'arma', 'mira', 'usa', 'guarda', 'descarga', 'agrega',
  'cambia', 'busca', 'marca', 'pega', 'borra', 'vuelve', 'intenta', 'ingresa', 'crea', 'entra', 'sigue',
  'completa', 'confirma', 'cierra', 'anota', 'escoge', 'selecciona', 'llena', 'quita', 'revisa', 'suma',
  'registra', 'corrige', 'copia', 'invita', 'aprueba', 'prepara', 'carga', 'deja', 'espera', 'prueba', 'exporta',
  'saca', 'evalúa', 'ajusta', 'decide', 'termina', 'indica', 'únete', 'entra', 'inicia', 'desactiva', 'activa',
];
const LETRA = '\\p{L}';
const TUTEO = new RegExp(
  `(?<!${LETRA})(?:${TUTEO_SIEMPRE.join('|')})(?!${LETRA})` +
  `|(?:^|[.:;!?¡¿(,"“]\\s*|(?<!${LETRA})(?:y|o)\\s+)(?:${TUTEO_AL_COMIENZO.join('|')})(?!${LETRA})`,
  'iu',
);

// Fragmentos de texto para el tuteo: más amplio que textos(), porque una frase corta ("Pide ya") o
// partida por una variable ("Hoy tienes {x}") también la lee el usuario. Deja fuera los comentarios
// y las clases de CSS.
function fragmentos(fuente) {
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  const out = [];
  const re = /(?<!className=|class=|import [^'"]*from )(['"`])((?:(?!\1)[^\\\n]|\\.)*?)\1|>([^<>{}]+)[<{]|\}([^<>{}]+)</g;
  let m;
  while ((m = re.exec(sinComentarios))) {
    const t = (m[2] || m[3] || m[4] || '').replace(/\s+/g, ' ').trim();
    // Lo que parece código (flechas, operadores, llamadas a métodos) no es texto.
    if (/\p{L}{2,}/u.test(t) && !/^[\w.@/-]+$/.test(t) && !/=>|&&|\|\||\.\w+\(/.test(t)) out.push(t);
  }
  return out;
}

// Texto visible: cadenas entre comillas y texto entre etiquetas JSX.
function textos(fuente) {
  const out = [];
  const re = /'([^'\n]{12,})'|`([^`]{12,})`|>\s*([^<>{}]{12,})\s*</g;
  let m;
  while ((m = re.exec(fuente))) {
    const t = (m[1] || m[2] || m[3] || '').replace(/\s+/g, ' ').trim();
    if (/[a-záéíóúñ]{3,} [a-záéíóúñ]{3,}/i.test(t) && !/className|import |https?:|\$\{.*\}$/.test(t)) out.push(t);
  }
  return out;
}

let total = 0;
const PREDETERMINADOS = [
  ...fs.readdirSync('inventory-forecasting-landing-page/components/landing').map((f) => path.join('inventory-forecasting-landing-page/components/landing', f)),
  ...fs.readdirSync('inventory-forecasting-landing-page/components/app').map((f) => path.join('inventory-forecasting-landing-page/components/app', f)),
  'inventory-forecasting-landing-page/app/demo/page.tsx',
  'inventory-forecasting-landing-page/lib/sistemas.ts',
  ...fs.readdirSync('server').filter((f) => f.endsWith('.js')).map((f) => path.join('server', f)),
  'public/js/app.js', 'public/js/reporte.js', 'public/js/sistemas.js',
];
// La página principal (D13) y la interfaz antigua de public/ no pasan a "usted".
// La página principal también trata de "usted" desde el 2026-11-03 (tono formal, pedido del equipo).
const SIN_TUTEO = /public[/\\]js[/\\](app|reporte|hoja|util)\.js$/;
module.exports = { TUTEO, fragmentos };
if (require.main !== module) return;

const archivos = process.argv.slice(2).length ? process.argv.slice(2) : PREDETERMINADOS;
let tuteo = 0;
for (const f of archivos) {
  const fuente = fs.readFileSync(f, 'utf8');
  for (const t of textos(fuente)) {
    const hits = REGLAS.filter(([, re]) => re.test(t)).map(([n]) => n);
    if (hits.length) { total++; console.log(`${path.basename(f)} · [${hits.join(', ')}] ${t.slice(0, 220)}`); }
  }
  if (SIN_TUTEO.test(f)) continue;
  for (const t of fragmentos(fuente)) {
    const m = t.match(TUTEO);
    if (m) { tuteo++; console.log(`${path.basename(f)} · [tuteo: ${m[0]}] ${t.slice(0, 220)}`); }
  }
}
console.log(`\n${total} frases para revisar · ${tuteo} con tuteo`);
