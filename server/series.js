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
 * ventas: [{ codigo, dia, cantidad, proyecto? }] como las devuelve leerExport.
 * hastaDia: último día del periodo si es después de la última venta.
 * Devuelve { hasta: "YYYY-MM-DD", semanas, porProducto: { clave: [cantidad por semana] }, proyecto? }
 * La posición 0 es la semana más antigua; la última es la que termina en `hasta`. Las ventas de
 * proyecto (D12) no entran en porProducto, que es lo que se pronostica: van aparte en `proyecto`,
 * con la misma forma, para el gráfico y para rearmar las ventas (saldos.js, ventasDeExport).
 */
function seriesSemanales(ventas, { mensual = false, totales = false, hastaDia } = {}) {
  if (totales || !ventas.length) return null;
  let desde = Infinity;
  let hasta = -Infinity;
  for (const v of ventas) {
    if (v.dia < desde) desde = v.dia;
    if (v.dia > hasta) hasta = v.dia;
  }
  if (mensual) hasta = finDeMes(hasta);
  // Igual que en calcularRotacion: el periodo puede terminar después de la última venta.
  if (hastaDia !== undefined && hastaDia > hasta) hasta = hastaDia;
  const semanas = Math.min(Math.floor((hasta - desde + 1) / 7), SEMANAS_MAXIMAS);
  if (semanas < 1) return null;
  const primerDia = hasta - semanas * 7 + 1;
  const indice = (dia) => Math.floor((dia - primerDia) / 7);

  const porProducto = new Map();
  const deProyecto = new Map();
  const serie = (codigo, mapa) => {
    const k = claveCodigo(codigo);
    if (!mapa.has(k)) mapa.set(k, new Array(semanas).fill(0));
    return mapa.get(k);
  };

  for (const v of ventas) {
    const mapa = v.proyecto ? deProyecto : porProducto;
    if (!mensual) {
      if (v.dia < primerDia || v.dia > hasta) continue;
      serie(v.codigo, mapa)[indice(v.dia)] += v.cantidad;
      continue;
    }
    // Un mes: se reparte por igual entre sus días.
    const n = diasDelMes(v.dia);
    const porDia = v.cantidad / n;
    const s = serie(v.codigo, mapa);
    for (let d = v.dia; d < v.dia + n; d++) {
      if (d < primerDia || d > hasta) continue;
      s[indice(d)] += porDia;
    }
  }

  const limpiar = (mapa) => {
    const out = {};
    for (const [k, s] of mapa) {
      descontarDevoluciones(s);
      if (s.some((x) => x !== 0)) out[k] = s.map((x) => Math.round(x * 100) / 100);
    }
    return out;
  };
  const proyecto = limpiar(deProyecto);
  return { hasta: textoDia(hasta), semanas, porProducto: limpiar(porProducto), ...(Object.keys(proyecto).length ? { proyecto } : {}) };
}

// Una devolución resta de la semana en que se hizo; si esa semana queda negativa (devolvieron algo
// vendido antes), lo que falta se descuenta de las semanas anteriores. El pronóstico no admite
// semanas negativas. Lo que no alcanza a descontarse (una venta de antes del archivo) se pierde.
function descontarDevoluciones(s) {
  for (let i = 0; i < s.length; i++) {
    if (s[i] >= 0) continue;
    let falta = -s[i];
    s[i] = 0;
    for (let j = i - 1; j >= 0 && falta > 0; j--) {
      const quita = Math.min(s[j], falta);
      s[j] -= quita;
      falta -= quita;
    }
  }
}

// Primer día ("YYYY-MM-DD") de la semana i de una serie que termina en `hasta`.
function inicioDeSemana(hasta, semanas, i) {
  const [a, m, d] = hasta.split('-').map(Number);
  const ultimo = Math.round(Date.UTC(a, m - 1, d) / MS_DIA);
  return textoDia(ultimo - (semanas - i) * 7 + 1);
}

module.exports = { seriesSemanales, inicioDeSemana, SEMANAS_MAXIMAS };
