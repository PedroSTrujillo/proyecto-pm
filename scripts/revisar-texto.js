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
  'public/js/app.js', 'public/js/reporte.js', 'public/js/sistemas.js',
];
const archivos = process.argv.slice(2).length ? process.argv.slice(2) : PREDETERMINADOS;
for (const f of archivos) {
  for (const t of textos(fs.readFileSync(f, 'utf8'))) {
    const hits = REGLAS.filter(([, re]) => re.test(t)).map(([n]) => n);
    if (hits.length) { total++; console.log(`${path.basename(f)} · [${hits.join(', ')}] ${t.slice(0, 220)}`); }
  }
}
console.log(`\n${total} frases para revisar`);
