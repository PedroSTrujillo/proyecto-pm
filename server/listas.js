'use strict';

// Listas de pedido (inicial y final): validación y comparación por código de producto.

const { claveCodigo, textoCodigo, leerNumero, inferirDecimal } = require('./valores');

/**
 * Revisa las líneas que el usuario escribió, pegó o importó.
 * lineas: [{ codigo, nombre, cantidad, fila? }]  (cantidad puede venir como texto)
 * Devuelve { lineas: [{codigo, nombre, cantidad}], errores: [{fila, mensaje}], avisos: [] }
 * - Filas vacías: se ignoran.
 * - Cantidad 0: no es parte del pedido (se ignora y se avisa).
 * - Código repetido: se suman las cantidades (y se avisa).
 */
function revisarLista(lineas) {
  const errores = [];
  const avisos = [];
  const decimal = inferirDecimal((lineas || []).map((l) => (l && typeof l.cantidad === 'string' ? l.cantidad : null)).filter(Boolean));
  const porClave = new Map();
  let enCero = 0;

  (lineas || []).forEach((l, i) => {
    if (!l) return;
    const fila = Number.isInteger(l.fila) ? l.fila : i + 1;
    const codigo = textoCodigo(l.codigo);
    const nombre = l.nombre === null || l.nombre === undefined ? '' : String(l.nombre).trim().slice(0, 200);
    const proveedor = l.proveedor === null || l.proveedor === undefined ? '' : String(l.proveedor).replace(/\s+/g, ' ').trim().slice(0, 80);
    const nota = l.nota === null || l.nota === undefined ? '' : String(l.nota).replace(/\s+/g, ' ').trim().slice(0, 200);
    const bruto = l.cantidad === null || l.cantidad === undefined ? '' : String(l.cantidad).trim();
    if (!codigo && !bruto && !nombre) return;
    if (!codigo) { errores.push({ fila, mensaje: `La fila ${fila} no tiene código de producto.` }); return; }
    if (codigo.length > 80) { errores.push({ fila, mensaje: `La fila ${fila} tiene un código demasiado largo.` }); return; }
    if (!bruto) { errores.push({ fila, mensaje: `La fila ${fila} (código ${codigo}) no tiene cantidad.` }); return; }
    const cantidad = typeof l.cantidad === 'number' ? l.cantidad : leerNumero(bruto, decimal);
    if (cantidad === null || !Number.isFinite(cantidad)) { errores.push({ fila, mensaje: `La fila ${fila} (código ${codigo}): la cantidad "${bruto}" no es un número.` }); return; }
    if (cantidad < 0) { errores.push({ fila, mensaje: `La fila ${fila} (código ${codigo}) tiene una cantidad negativa.` }); return; }
    if (cantidad === 0) { enCero++; return; }
    const clave = claveCodigo(codigo);
    const previa = porClave.get(clave);
    if (previa) {
      previa.cantidad = Math.round((previa.cantidad + cantidad) * 1e6) / 1e6;
      previa.filas.push(fila);
      if (!previa.nombre && nombre) previa.nombre = nombre;
      if (!previa.proveedor && proveedor) previa.proveedor = proveedor;
      if (!previa.nota && nota) previa.nota = nota;
    } else {
      porClave.set(clave, { codigo, nombre, cantidad, proveedor, nota, filas: [fila] });
    }
  });

  for (const l of porClave.values()) {
    if (l.filas.length > 1) {
      avisos.push(`El código ${l.codigo} aparece en las filas ${unir(l.filas)}: se sumaron las cantidades (${formatear(l.cantidad)}).`);
    }
  }
  if (enCero) avisos.push(`${enCero === 1 ? 'Una fila tiene' : `${enCero} filas tienen`} cantidad 0 y no ${enCero === 1 ? 'cuenta' : 'cuentan'} como parte del pedido.`);

  return {
    lineas: [...porClave.values()].map(({ codigo, nombre, cantidad, proveedor, nota }) => ({ codigo, nombre, cantidad, ...(proveedor ? { proveedor } : {}), ...(nota ? { nota } : {}) })),
    errores,
    avisos,
  };
}

/**
 * Compara la lista inicial con la final por código de producto.
 *   agregadas: códigos que están en la final y no en la inicial
 *   quitadas:  códigos que estaban en la inicial y no en la final
 *   cambiadas: códigos en ambas con distinta cantidad
 *   total = agregadas + quitadas + cambiadas   (la métrica de la prueba)
 */
function compararListas(inicial, final) {
  const mapa = (lista) => new Map(lista.map((l) => [claveCodigo(l.codigo), l]));
  const ini = mapa(inicial);
  const fin = mapa(final);
  const agregadas = [];
  const quitadas = [];
  const cambiadas = [];
  let iguales = 0;

  for (const [clave, l] of fin) {
    const antes = ini.get(clave);
    if (!antes) agregadas.push({ codigo: l.codigo, nombre: l.nombre, cantidad: l.cantidad });
    else if (Math.abs(antes.cantidad - l.cantidad) > 1e-9) cambiadas.push({ codigo: l.codigo, nombre: l.nombre || antes.nombre, antes: antes.cantidad, despues: l.cantidad });
    else iguales++;
  }
  for (const [clave, l] of ini) {
    if (!fin.has(clave)) quitadas.push({ codigo: l.codigo, nombre: l.nombre, cantidad: l.cantidad });
  }

  // Cuánto se movió el pedido en unidades. En M, cambiar una unidad cuenta igual que
  // quitar una referencia; esto deja ver si el cambio fue de fondo o de ajuste.
  const suma = (xs) => Math.round(xs.reduce((s, x) => s + x, 0) * 1e6) / 1e6;
  const unidadesMovidas = suma([...agregadas.map((l) => l.cantidad), ...quitadas.map((l) => l.cantidad), ...cambiadas.map((l) => Math.abs(l.despues - l.antes))]);
  const unidadesIniciales = suma([...ini.values()].map((l) => l.cantidad));

  return {
    agregadas,
    quitadas,
    cambiadas,
    iguales,
    conteo: {
      agregadas: agregadas.length,
      quitadas: quitadas.length,
      cambiadas: cambiadas.length,
      total: agregadas.length + quitadas.length + cambiadas.length,
    },
    magnitud: { unidadesMovidas, unidadesIniciales, porcentaje: unidadesIniciales > 0 ? unidadesMovidas / unidadesIniciales : null },
  };
}

/**
 * ¿Los cambios van en la dirección que indica el reporte? Sirve para juzgar el segundo
 * criterio de pivote ("cambió por probar la herramienta y no porque el dato le pareciera
 * correcto") con un número y no solo leyendo el "¿por qué?".
 *   coherente: sube o agrega algo que se agota, o baja o quita algo que sobra
 *   contraria: lo opuesto (sube lo que sobra, baja lo que se agota)
 *   neutra:    el producto está normal o no aparece en el reporte
 */
function coherenciaConReporte(comparacion, filasReporte) {
  const reporte = new Map((filasReporte || []).map((f) => [claveCodigo(f.codigo), f]));
  const cambios = [
    ...comparacion.agregadas.map((l) => ({ codigo: l.codigo, sube: true })),
    ...comparacion.quitadas.map((l) => ({ codigo: l.codigo, sube: false })),
    ...comparacion.cambiadas.map((l) => ({ codigo: l.codigo, sube: l.despues > l.antes })),
  ];
  const cuenta = { coherentes: 0, contrarias: 0, neutras: 0 };
  const detalle = cambios.map((c) => {
    const f = reporte.get(claveCodigo(c.codigo));
    const estado = !f ? 'fuera_del_reporte' : f.estado === 'se_agota' ? 'se_agota' : f.sobra ? 'sobra' : 'normal';
    let clase = 'neutra';
    if ((c.sube && estado === 'se_agota') || (!c.sube && estado === 'sobra')) clase = 'coherente';
    else if ((c.sube && estado === 'sobra') || (!c.sube && estado === 'se_agota')) clase = 'contraria';
    cuenta[`${clase}s`]++;
    return { codigo: c.codigo, direccion: c.sube ? 'sube' : 'baja', estado, clase };
  });
  return { ...cuenta, total: cambios.length, porcentaje: cambios.length ? cuenta.coherentes / cambios.length : null, detalle };
}

/**
 * Cuánto del pedido sugerido quedó tal cual: la aceptación del piloto (D16 de
 * docs/PLAN_ALPHA_02.md). sugerido es la foto que se guardó al crear el pedido; final, lo que la
 * persona cerró. Es compararListas con la foto en el lugar de la lista inicial.
 *   sinCambio: líneas sugeridas que quedaron con la misma cantidad
 *   ajustadas: con otra cantidad · quitadas: las sacó · agregadas: no estaban en lo sugerido
 */
function medirAceptacion(sugerido, final) {
  const c = compararListas(sugerido || [], final || []);
  const sugeridas = (sugerido || []).length;
  return {
    sugeridas,
    sinCambio: c.iguales,
    ajustadas: c.conteo.cambiadas,
    quitadas: c.conteo.quitadas,
    agregadas: c.conteo.agregadas,
    porcentaje: sugeridas ? c.iguales / sugeridas : null,
    magnitud: c.magnitud,
    cambios: { agregadas: c.agregadas, quitadas: c.quitadas, cambiadas: c.cambiadas },
  };
}

function unir(nums) {
  if (nums.length <= 1) return String(nums[0]);
  return `${nums.slice(0, -1).join(', ')} y ${nums[nums.length - 1]}`;
}

function formatear(n) {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(n);
}

module.exports = { revisarLista, compararListas, coherenciaConReporte, medirAceptacion };
