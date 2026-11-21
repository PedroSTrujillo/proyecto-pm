'use strict';

// Importadores (T14 de docs/PLAN_CAMBIOS_SINESC.md): el pedido a un proveedor importado tiene que caber en los
// contenedores que la empresa piensa contratar. Solo cuenta el volumen. Es una extensión que cada empresa
// enciende en Proveedores (ajustes.importaciones); apagada, nada de esto se usa.
//
// Capacidades: volumen interno nominal de un contenedor ISO de 20' (~33 m³) y de 40' (~67 m³).
// shortcut: FACTOR_ESTIBA (huecos, estiba y mercancía que no encaja) es un supuesto, no un dato: contrástelo con
// el agente de carga. Tampoco se mira el peso ni el apilado.
const CAPACIDAD_M3 = { 20: 33, 40: 67 };
const FACTOR_ESTIBA = 0.85;

/** m³ útiles de los contenedores de un proveedor ({ contenedores, tipoContenedor }), o null si no es importado. */
function capacidadDe(condicion) {
  const n = Number(condicion && condicion.contenedores);
  if (!(n > 0)) return null;
  return Math.round(n * (CAPACIDAD_M3[condicion.tipoContenedor] || CAPACIDAD_M3[40]) * FACTOR_ESTIBA * 100) / 100;
}

/** m³ que ocupa una línea { cantidad, lote, volumenPaquete }. Sin medidas no cuenta. */
function volumenDe(l) {
  return l.volumenPaquete > 0 ? (l.cantidad / (l.lote > 0 ? l.lote : 1)) * l.volumenPaquete : 0;
}

/**
 * Si el volumen del pedido pasa la capacidad, quita paquetes empezando por la línea con más semanas de
 * inventario (la menos urgente) hasta que quepa. lineas: [{ cantidad, lote, volumenPaquete, semanas }].
 * Devuelve { lineas, quitados }: las líneas nuevas (sin las que quedan en 0) y cuántos paquetes se quitaron.
 */
function ajustarAContenedores(lineas, capacidad) {
  const out = lineas.map((l) => ({ ...l }));
  if (!(capacidad > 0)) return { lineas: out, quitados: 0 };
  let exceso = out.reduce((s, l) => s + volumenDe(l), 0) - capacidad;
  let quitados = 0;
  for (const l of [...out].filter((x) => x.volumenPaquete > 0).sort((a, b) => (b.semanas ?? 0) - (a.semanas ?? 0))) {
    if (exceso <= 1e-9) break;
    const lote = l.lote > 0 ? l.lote : 1;
    const paquetes = Math.floor(l.cantidad / lote);
    const aQuitar = Math.min(paquetes, Math.ceil(exceso / l.volumenPaquete - 1e-9));
    if (aQuitar <= 0) continue;
    l.cantidad = Math.round((l.cantidad - aQuitar * lote) * 1000) / 1000;
    exceso -= aQuitar * l.volumenPaquete;
    quitados += aQuitar;
  }
  return { lineas: out.filter((l) => l.cantidad > 0), quitados };
}

module.exports = { CAPACIDAD_M3, FACTOR_ESTIBA, capacidadDe, volumenDe, ajustarAContenedores };
