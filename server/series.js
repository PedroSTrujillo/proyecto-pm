'use strict';

// Ventas por semana de cada producto, para los gráficos y el pronóstico.
//
// Las semanas se cuentan hacia atrás desde el último día del archivo: la última semana
// termina ese día. Una semana incompleta al comienzo del archivo se descarta. Si las ventas
// vienen por mes (plantilla o informe con una columna por mes), lo de cada mes se reparte
// por igual entre sus días. Con totales de un periodo no hay semanas: se devuelve null.

const { claveCodigo, finDeMes, textoDia, MS_DIA } = require('./valores');

const SEMANAS_MAXIMAS = 110; // unos dos años: lo mismo que acepta el cálculo

function diasDelMes(dia) {
  const d = new Date(dia * MS_DIA);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/**
 * ventas: [{ codigo, dia, cantidad }] como las devuelve leerExport.
 * Devuelve { hasta: "YYYY-MM-DD", semanas, porProducto: { clave: [cantidad por semana] } }
 * La posición 0 es la semana más antigua; la última es la que termina en `hasta`.
 */
function seriesSemanales(ventas, { mensual = false, totales = false } = {}) {
  if (totales || !ventas.length) return null;
  let desde = Infinity;
  let hasta = -Infinity;
  for (const v of ventas) {
    if (v.dia < desde) desde = v.dia;
    if (v.dia > hasta) hasta = v.dia;
  }
  if (mensual) hasta = finDeMes(hasta);
  const semanas = Math.min(Math.floor((hasta - desde + 1) / 7), SEMANAS_MAXIMAS);
  if (semanas < 1) return null;
  const primerDia = hasta - semanas * 7 + 1;
  const indice = (dia) => Math.floor((dia - primerDia) / 7);

  const porProducto = new Map();
  const serie = (codigo) => {
    const k = claveCodigo(codigo);
    if (!porProducto.has(k)) porProducto.set(k, new Array(semanas).fill(0));
    return porProducto.get(k);
  };

  for (const v of ventas) {
    if (!mensual) {
      if (v.dia < primerDia || v.dia > hasta) continue;
      serie(v.codigo)[indice(v.dia)] += v.cantidad;
      continue;
    }
    // Un mes: se reparte por igual entre sus días.
    const n = diasDelMes(v.dia);
    const porDia = v.cantidad / n;
    const s = serie(v.codigo);
    for (let d = v.dia; d < v.dia + n; d++) {
      if (d < primerDia || d > hasta) continue;
      s[indice(d)] += porDia;
    }
  }

  const out = {};
  for (const [k, s] of porProducto) {
    if (s.some((x) => x !== 0)) out[k] = s.map((x) => Math.round(x * 100) / 100);
  }
  return { hasta: textoDia(hasta), semanas, porProducto: out };
}

// Primer día ("YYYY-MM-DD") de la semana i de una serie que termina en `hasta`.
function inicioDeSemana(hasta, semanas, i) {
  const [a, m, d] = hasta.split('-').map(Number);
  const ultimo = Math.round(Date.UTC(a, m - 1, d) / MS_DIA);
  return textoDia(ultimo - (semanas - i) * 7 + 1);
}

module.exports = { seriesSemanales, inicioDeSemana, SEMANAS_MAXIMAS };
