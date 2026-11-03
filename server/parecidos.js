'use strict';

// Productos del catálogo que se parecen a un código que no está en él: un dígito cambiado, un
// guion de más o el nombre escrito en vez del código. Sirve para preguntarle a la persona si se
// refería a uno que ya existe antes de crear un producto nuevo (server/movimientos.js).

const { claveCodigo } = require('./valores');

const MAX_OPCIONES = 3;

// Solo letras y números, en mayúscula: "TOR 0610", "tor-0610" y "TOR.0610" son lo mismo.
function codigoSuelto(v) {
  return claveCodigo(v).replace(/[^A-Z0-9]/g, '');
}

// Palabras de un nombre, sin tildes ni signos, para comparar nombres escritos distinto.
function palabras(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 2);
}

// Distancia de edición, cortada en `tope`: si se pasa, no importa cuánto.
function distancia(a, b, tope) {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    let menor = i;
    for (let j = 1; j <= b.length; j++) {
      fila[j] = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (fila[j] < menor) menor = fila[j];
    }
    if (menor > tope) return tope + 1;
    previa = fila;
  }
  return previa[b.length];
}

// Qué tanto se parecen dos listas de palabras: las que comparten sobre las del más corto.
function parecidoNombres(a, b) {
  if (!a.length || !b.length) return 0;
  const B = new Set(b);
  const comunes = new Set(a.filter((p) => B.has(p))).size;
  return comunes / Math.min(new Set(a).size, B.size);
}

/**
 * Hasta tres productos de `catalogo` ([{ codigo, nombre }]) parecidos a un código desconocido, del
 * más al menos parecido. `nombre` es el que venía en la línea, si venía.
 */
function productosParecidos(codigo, nombre, catalogo) {
  const suelto = codigoSuelto(codigo);
  const tope = suelto.length >= 8 ? 2 : 1;
  // Lo escrito como código puede ser el nombre ("codo cobre 3/8"): se compara también con los nombres.
  const delNombre = palabras(nombre);
  const delCodigo = /[a-z]{3,}/i.test(String(codigo)) ? palabras(codigo) : [];
  const puntos = [];
  for (const p of catalogo) {
    const otro = codigoSuelto(p.codigo);
    let puntaje = 0;
    if (suelto && otro) {
      if (suelto === otro) puntaje = 1;
      else if (suelto.length >= 4 && otro.length >= 4) {
        const d = distancia(suelto, otro, tope);
        if (d <= tope) puntaje = Math.max(puntaje, 0.9 - d * 0.1);
        else if ((otro.includes(suelto) || suelto.includes(otro)) && Math.abs(otro.length - suelto.length) <= 3) puntaje = Math.max(puntaje, 0.6);
      }
    }
    const nombreP = palabras(p.nombre);
    // Códigos seguidos (31010002, 31010003) son productos distintos: si los dos traen nombre y no
    // se parecen, un código casi igual no basta.
    if (puntaje > 0 && puntaje < 1 && delNombre.length && nombreP.length && parecidoNombres(delNombre, nombreP) < 0.5) puntaje = 0;
    for (const ps of [delNombre, delCodigo]) {
      if (ps.length < 2 && !(ps.length === 1 && nombreP.length === 1)) continue;
      const n = parecidoNombres(ps, nombreP);
      if (n >= 0.75) puntaje = Math.max(puntaje, 0.5 + n * 0.3);
    }
    if (puntaje > 0) puntos.push({ p, puntaje });
  }
  puntos.sort((a, b) => b.puntaje - a.puntaje || a.p.codigo.localeCompare(b.p.codigo, 'es', { numeric: true }));
  return puntos.slice(0, MAX_OPCIONES).map(({ p }) => ({ codigo: p.codigo, nombre: p.nombre || '' }));
}

module.exports = { productosParecidos, codigoSuelto };
