'use strict';

// Cálculo de la rotación por producto (ver docs/modelo-rotacion.md).
//
//   T  = semanas del histórico = (último día − primer día + 1) / 7
//   d̄ᵢ = ventas promedio por semana del producto i = (Σ cantidades vendidas de i) / T
//   Sᵢ = semanas de inventario restantes = existencias de i / d̄ᵢ
//
// Se usa todo el histórico (uno o dos años) porque en catálogos grandes muchos
// productos de baja rotación saldrían en cero si se mirara un periodo corto.

const { claveCodigo, finDeMes, textoDia } = require('./valores');

const SEMANAS_SE_AGOTA = 2; // menos de esto: se resalta como "se agota"
const SEMANAS_SOBRA = 12; // más de esto (unos 3 meses): "sobra"
const SEMANAS_HISTORICO_MINIMO = 26;
const SEMANAS_HISTORICO_MAXIMO = 110;

/**
 * ventas: [{ codigo, nombre, dia, cantidad }]  (dia = días desde 1970-01-01)
 * existencias: [{ codigo, nombre, existencias }]
 * mensual: true si las ventas vienen agrupadas por mes (la fecha es el día 1 de cada mes)
 */
function calcularRotacion({ ventas, existencias, mensual = false }) {
  if (!ventas.length) throw new Error('No hay ventas para calcular.');

  let desde = Infinity;
  let hasta = -Infinity;
  for (const v of ventas) {
    if (v.dia < desde) desde = v.dia;
    if (v.dia > hasta) hasta = v.dia;
  }
  if (mensual) hasta = finDeMes(hasta); // el último mes cuenta completo
  const dias = hasta - desde + 1;
  const semanasHistorico = dias / 7;

  const productos = new Map();
  const producto = (codigo, nombre) => {
    const clave = claveCodigo(codigo);
    let p = productos.get(clave);
    if (!p) {
      p = { clave, codigo, nombre: nombre || '', vendido: 0, filasVenta: 0, existencias: 0, filasExistencias: 0 };
      productos.set(clave, p);
    }
    return p;
  };

  for (const v of ventas) {
    const p = producto(v.codigo, v.nombre);
    p.vendido += v.cantidad;
    p.filasVenta++;
    if (!p.nombre && v.nombre) p.nombre = v.nombre;
  }
  for (const e of existencias) {
    const p = producto(e.codigo, e.nombre);
    p.existencias += e.existencias; // varias bodegas = varias filas: se suman
    p.filasExistencias++;
    if (e.nombre) p.nombreExistencias = p.nombreExistencias || e.nombre;
  }

  const filas = [];
  let variasBodegas = 0;
  for (const p of productos.values()) {
    const enVentas = p.filasVenta > 0;
    const enExistencias = p.filasExistencias > 0;
    if (p.filasExistencias > 1) variasBodegas++;
    const existenciasActuales = enExistencias ? redondear(p.existencias) : 0;
    const vendido = redondear(p.vendido);
    const promedioSemanal = vendido > 0 ? vendido / semanasHistorico : 0;
    const senales = [];
    if (!enVentas) senales.push('no_en_ventas');
    if (!enExistencias) senales.push('no_en_existencias');
    if (existenciasActuales < 0) senales.push('existencias_negativas');
    if (enVentas && vendido <= 0) senales.push('devoluciones');

    let semanasInventario = null;
    let estado;
    if (vendido <= 0) {
      estado = 'sin_ventas';
    } else {
      semanasInventario = Math.max(existenciasActuales, 0) / promedioSemanal;
      if (semanasInventario < SEMANAS_SE_AGOTA) estado = 'se_agota';
      else if (semanasInventario > SEMANAS_SOBRA) estado = 'sobra';
      else estado = 'normal';
    }
    const sobra = estado === 'sobra' || (estado === 'sin_ventas' && existenciasActuales > 0);

    filas.push({
      codigo: p.codigo,
      nombre: p.nombreExistencias || p.nombre,
      vendido,
      promedioSemanal,
      existencias: existenciasActuales,
      semanasInventario,
      estado,
      sobra,
      senales,
    });
  }

  // De menos a más semanas: lo que se agota primero va arriba. Sin ventas, al final.
  filas.sort((a, b) => {
    if (a.semanasInventario === null && b.semanasInventario === null) return b.existencias - a.existencias || comparaCodigo(a, b);
    if (a.semanasInventario === null) return 1;
    if (b.semanasInventario === null) return -1;
    return a.semanasInventario - b.semanasInventario || b.promedioSemanal - a.promedioSemanal || comparaCodigo(a, b);
  });

  const cuenta = (fn) => filas.reduce((n, f) => n + (fn(f) ? 1 : 0), 0);
  const resumen = {
    productos: filas.length,
    seAgotan: cuenta((f) => f.estado === 'se_agota'),
    sobran: cuenta((f) => f.sobra),
    sinVentas: cuenta((f) => f.estado === 'sin_ventas'),
    sinExistenciaCero: cuenta((f) => f.semanasInventario === 0),
    noEnVentas: cuenta((f) => f.senales.includes('no_en_ventas')),
    noEnExistencias: cuenta((f) => f.senales.includes('no_en_existencias')),
    filasVenta: ventas.length,
  };

  const periodo = {
    desde: textoDia(desde),
    hasta: textoDia(hasta),
    dias,
    semanas: semanasHistorico,
    mensual,
  };

  const avisos = [];
  if (semanasHistorico < SEMANAS_HISTORICO_MINIMO) {
    avisos.push(`Tu archivo trae ventas de solo ${Math.round(semanasHistorico)} semanas. El cálculo es más confiable con uno o dos años de ventas.`);
  } else if (semanasHistorico > SEMANAS_HISTORICO_MAXIMO) {
    avisos.push(`Tu archivo trae ventas de ${Math.round(semanasHistorico)} semanas (más de dos años). Se usaron todas.`);
  }
  if (resumen.noEnVentas) avisos.push(`${plural(resumen.noEnVentas, 'producto tiene', 'productos tienen')} existencias pero no aparece${resumen.noEnVentas === 1 ? '' : 'n'} en las ventas. Se muestra${resumen.noEnVentas === 1 ? '' : 'n'} como "sin ventas en el periodo".`);
  if (resumen.noEnExistencias) avisos.push(`${plural(resumen.noEnExistencias, 'producto aparece', 'productos aparecen')} en las ventas pero no en las existencias. Se tomaron con 0 existencias.`);
  if (variasBodegas) avisos.push(`${plural(variasBodegas, 'producto aparece', 'productos aparecen')} en varias filas de existencias (por ejemplo, varias bodegas). Se sumaron.`);
  const negativas = cuenta((f) => f.senales.includes('existencias_negativas'));
  if (negativas) avisos.push(`${plural(negativas, 'producto tiene', 'productos tienen')} existencias negativas en el archivo. Se cuentan como 0 semanas.`);

  return { filas, resumen, periodo, ejemplo: elegirEjemplo(filas, semanasHistorico), avisos, umbrales: { seAgota: SEMANAS_SE_AGOTA, sobra: SEMANAS_SOBRA } };
}

// Un producto del propio archivo para explicar el cálculo con sus números.
function elegirEjemplo(filas, semanasHistorico) {
  const conDatos = filas.filter((f) => f.vendido > 0 && f.existencias > 0 && f.senales.length === 0);
  const elegido = conDatos.find((f) => f.estado === 'se_agota')
    || conDatos.find((f) => f.estado === 'normal')
    || conDatos[0]
    || filas.find((f) => f.vendido > 0);
  if (!elegido) return null;
  return {
    codigo: elegido.codigo,
    nombre: elegido.nombre,
    vendido: elegido.vendido,
    semanasHistorico,
    promedioSemanal: elegido.promedioSemanal,
    existencias: elegido.existencias,
    semanasInventario: elegido.semanasInventario,
  };
}

function comparaCodigo(a, b) {
  return String(a.codigo).localeCompare(String(b.codigo), 'es', { numeric: true });
}

function redondear(n) {
  return Math.round(n * 1e6) / 1e6; // evita 0.30000000000000004 al sumar
}

function plural(n, uno, varios) {
  return n === 1 ? `1 ${uno}` : `${n} ${varios}`;
}

module.exports = { calcularRotacion, SEMANAS_SE_AGOTA, SEMANAS_SOBRA };
