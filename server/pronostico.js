'use strict';

// Pronóstico de ventas por producto (ver docs/modelo-rotacion.md §7).
//
// Modelo Gamma-Poisson: las unidades que se venden en una semana siguen una Poisson cuya tasa
// no se conoce; esa incertidumbre es una Gamma que combina lo que vendió el producto con una
// tasa de referencia del catálogo, con más peso para el producto cuantas más semanas tiene.
// La predicción para h semanas es una binomial negativa: da un rango (no un solo número) y la
// probabilidad de agotarse, que es lo que importa para productos que se venden de a poco.
//
//   tasa base     λ = ventas por semana del reporte (con sus tres ajustes) ÷ temporada de su ventana
//   φ             = varianza ÷ media de sus ventas semanales (≥ 1): ventas "en paquetes"
//   a priori      Gamma(α₀, β₀), β₀ = media semana, α₀ = β₀ · tasa típica del catálogo ÷ φ
//   a posteriori  α = α₀ + λ · n ÷ φ,  β = β₀ + n   (n = semanas que cuentan para el producto)
//   en h semanas  X = φ · N,  N ~ BinomialNegativa(α, β ÷ (β + h·t))   (t = temporada de esas semanas)
//
// El número que ven los probadores (semanas de inventario) no cambia: el pronóstico solo
// agrega el rango, la probabilidad de agotarse y la cantidad sugerida.

const { MS_DIA } = require('./valores');

const BETA_PREVIA = 0.5;
const PHI_MAXIMO = 25;
const SEMANAS_TEMPORADA = 78; // 18 meses: cada mes del año aparece al menos una vez
const AMORTIGUAR_TEMPORADA = 0.6; // la temporada se toma al 60 %: más vale quedarse corto
const TEMPORADA_MIN = 0.6;
const TEMPORADA_MAX = 1.6;
const SEMANAS_RECIENTES = 13;

// --- Distribuciones ------------------------------------------------------------------

// Inversa de la normal estándar (aproximación de Acklam, error < 1e-9).
function zNormal(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const bajo = 0.02425;
  if (p < bajo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - bajo) return -zNormal(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// Normal estándar acumulada (Abramowitz y Stegun 7.1.26).
function fiNormal(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/**
 * Binomial negativa N ~ BN(r, p): P(N = k) = Γ(k+r) / (k! Γ(r)) · pʳ · (1−p)ᵏ.
 * Con medias grandes se usa la aproximación normal (la exacta sumaría miles de términos).
 */
function binomialNegativa(r, p) {
  const media = (r * (1 - p)) / p;
  const varianza = (r * (1 - p)) / (p * p);
  const logP0 = r * Math.log(p);
  const normal = media > 3000 || logP0 < -600;
  return {
    media,
    varianza,
    cuantil(q) {
      if (media <= 0) return 0;
      if (normal) return Math.max(0, Math.round(media + zNormal(q) * Math.sqrt(varianza)));
      let pk = Math.exp(logP0);
      let acumulada = pk;
      let k = 0;
      while (acumulada < q && k < 100000) {
        pk *= ((k + r) / (k + 1)) * (1 - p);
        acumulada += pk;
        k++;
      }
      return k;
    },
    // P(N > x)
    colaSobre(x) {
      if (x < 0) return 1;
      if (media <= 0) return 0;
      if (normal) return 1 - fiNormal((Math.floor(x) + 0.5 - media) / Math.sqrt(varianza));
      let pk = Math.exp(logP0);
      let acumulada = pk;
      for (let k = 0; k < Math.floor(x) && acumulada < 1 - 1e-12; k++) {
        pk *= ((k + r) / (k + 1)) * (1 - p);
        acumulada += pk;
      }
      return Math.max(0, 1 - acumulada);
    },
  };
}

/**
 * Lo que se va a vender en un horizonte cuyo "tamaño" es h semanas-temporada (la suma de los
 * índices de temporada de esas semanas). Devuelve media, varianza, cuantil(q) y probMayorQue(x).
 */
function predictiva(ajuste, h) {
  const { alfa, beta, phi } = ajuste;
  if (!(alfa > 0) || !(h > 0)) {
    return { media: 0, varianza: 0, cuantil: () => 0, probMayorQue: () => 0 };
  }
  const bn = binomialNegativa(alfa, beta / (beta + h));
  return {
    media: phi * bn.media,
    varianza: phi * phi * bn.varianza,
    cuantil: (q) => phi * bn.cuantil(q),
    probMayorQue: (x) => bn.colaSobre(x / phi),
  };
}

// --- Ajuste por producto -------------------------------------------------------------

function mediana(v) {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Varianza ÷ media de las ventas semanales: 1 si se vende de a una; más si se vende en paquetes.
function dispersion(serie) {
  if (!serie || serie.length < 8) return null;
  const media = serie.reduce((s, x) => s + x, 0) / serie.length;
  if (media <= 0) return null;
  const varianza = serie.reduce((s, x) => s + (x - media) ** 2, 0) / (serie.length - 1);
  return Math.min(PHI_MAXIMO, Math.max(1, varianza / media));
}

/**
 * tasa: ventas por semana desestacionalizadas. semanas: las que cuentan para el producto.
 * serie: sus ventas semanales (ya sin el pico de un proyecto), para medir la dispersión.
 * referencia: { tasa, phi } típicos del catálogo.
 */
function ajustarProducto({ tasa, semanas, serie, referencia }) {
  const propia = dispersion(serie);
  // Con pocas semanas la dispersión propia no es confiable: se mezcla con la del catálogo.
  const phi = propia === null ? referencia.phi : (propia * semanas + referencia.phi * 13) / (semanas + 13);
  const alfa0 = (BETA_PREVIA * referencia.tasa) / phi;
  return { alfa: alfa0 + (tasa * semanas) / phi, beta: BETA_PREVIA + semanas, phi };
}

// --- Temporada ------------------------------------------------------------------------

function mesDeSemana(hasta, semanas, i) {
  const [a, m, d] = hasta.split('-').map(Number);
  const ultimo = Math.round(Date.UTC(a, m - 1, d) / MS_DIA);
  const mitad = ultimo - (semanas - i) * 7 + 4; // el jueves de la semana
  return new Date(mitad * MS_DIA).getUTCMonth();
}

/**
 * Índice de cada mes del año (enero = 0) a partir de las ventas semanales de todo el catálogo:
 * cada semana se compara con la tendencia (una recta) y se promedian las de cada mes. Con menos
 * de 18 meses de ventas no se calcula (devuelve null): un solo diciembre no hace una temporada.
 */
function indiceTemporada(totales, hasta) {
  const n = totales.length;
  if (n < SEMANAS_TEMPORADA) return null;
  // Tendencia por mínimos cuadrados.
  const xm = (n - 1) / 2;
  const ym = totales.reduce((s, y) => s + y, 0) / n;
  if (ym <= 0) return null;
  let sxy = 0;
  let sxx = 0;
  totales.forEach((y, x) => { sxy += (x - xm) * (y - ym); sxx += (x - xm) ** 2; });
  const pendiente = sxx ? sxy / sxx : 0;
  const suma = new Array(12).fill(0);
  const cuenta = new Array(12).fill(0);
  totales.forEach((y, x) => {
    const tendencia = ym + pendiente * (x - xm);
    if (tendencia <= 0) return;
    const mes = mesDeSemana(hasta, n, x);
    suma[mes] += y / tendencia;
    cuenta[mes]++;
  });
  if (cuenta.some((c) => c === 0)) return null;
  const crudo = suma.map((s, m) => s / cuenta[m]);
  const amortiguado = crudo.map((v) => Math.min(TEMPORADA_MAX, Math.max(TEMPORADA_MIN, 1 + AMORTIGUAR_TEMPORADA * (v - 1))));
  const prom = amortiguado.reduce((s, v) => s + v, 0) / 12;
  return amortiguado.map((v) => Math.round((v / prom) * 1000) / 1000);
}

// Índice de temporada de la semana i (i puede pasar del final de la serie: semanas futuras).
function temporadaDeSemana(indice, hasta, semanas, i) {
  return indice ? indice[mesDeSemana(hasta, semanas, i)] : 1;
}

/**
 * Temporada promedio de la ventana con que se calculó la tasa del reporte (lo reciente pesa
 * doble). Dividir la tasa por esto la "desestacionaliza".
 */
function temporadaDeLaVentana(indice, hasta, semanas, semanasProducto, semanasRecientes) {
  if (!indice) return 1;
  const desde = Math.max(0, semanas - Math.round(semanasProducto));
  const recientesDesde = semanas - Math.round(semanasRecientes);
  let suma = 0;
  let peso = 0;
  for (let i = desde; i < semanas; i++) {
    const w = i >= recientesDesde ? 2 : 1;
    suma += w * temporadaDeSemana(indice, hasta, semanas, i);
    peso += w;
  }
  return peso ? suma / peso : 1;
}

// Suma de la temporada de las próximas h semanas (pueden ser fracciones: 1,5 semanas).
function semanasConTemporada(indice, hasta, semanas, h) {
  let total = 0;
  for (let k = 0; k < Math.ceil(h); k++) {
    const parte = Math.min(1, h - k);
    total += parte * temporadaDeSemana(indice, hasta, semanas, semanas + k);
  }
  return total;
}

// --- Acierto medido con los datos del usuario ----------------------------------------

/**
 * Se esconden las últimas 8 semanas, se pronostican con lo anterior y se compara con lo que de
 * verdad se vendió. Cuenta los productos cuya venta real cayó dentro del rango probable (10 % a
 * 90 %) y el error típico de la cantidad. Solo productos con ventas antes del corte.
 */
function medirAcierto(seriesPorProducto, hasta, semanas, referencia, h = 8) {
  const corte = semanas - h;
  if (corte < 26) return null;
  const indice = null; // con la temporada del periodo completo se haría trampa: se mide sin ella
  let productos = 0;
  let aciertos = 0;
  let error = 0;
  let vendido = 0;
  for (const serie of Object.values(seriesPorProducto)) {
    const antes = serie.slice(0, corte);
    const primera = antes.findIndex((x) => x > 0);
    if (primera < 0) continue;
    const n = primera >= SEMANAS_RECIENTES ? Math.max(SEMANAS_RECIENTES, corte - primera) : corte;
    const ventana = antes.slice(corte - n);
    const recientes = ventana.slice(-SEMANAS_RECIENTES);
    const tasa = (ventana.reduce((s, x) => s + x, 0) + recientes.reduce((s, x) => s + x, 0)) / (n + recientes.length);
    const ajuste = ajustarProducto({ tasa, semanas: n, serie: ventana, referencia });
    const pred = predictiva(ajuste, semanasConTemporada(indice, hasta, corte, h));
    const real = serie.slice(corte).reduce((s, x) => s + x, 0);
    productos++;
    if (real >= pred.cuantil(0.1) && real <= pred.cuantil(0.9)) aciertos++;
    error += Math.abs(real - pred.media);
    vendido += real;
  }
  if (productos < 5) return null;
  return { productos, aciertos, semanas: h, errorTipico: vendido > 0 ? error / vendido : null };
}

module.exports = {
  predictiva,
  ajustarProducto,
  dispersion,
  mediana,
  indiceTemporada,
  temporadaDeSemana,
  temporadaDeLaVentana,
  semanasConTemporada,
  medirAcierto,
  binomialNegativa,
  zNormal,
};
