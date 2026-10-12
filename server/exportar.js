'use strict';

// El pedido armado en pantalla, como Excel: una hoja por proveedor y una de resumen, lista
// para mandar al proveedor o para que gerencia la apruebe. No guarda nada: arma el archivo con
// lo que llega y lo devuelve.

const express = require('express');
const XLSX = require('xlsx');
const { ErrorUsuario } = require('./cuentas');

const MAX_LINEAS = 3000;

function texto(v, max) {
  return String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function nombreHoja(nombre, usadas) {
  // Excel: máximo 31 caracteres y sin : \ / ? * [ ]
  let base = texto(nombre, 28).replace(/[:\\/?*[\]]/g, ' ').trim() || 'Proveedor';
  let n = base;
  let k = 2;
  while (usadas.has(n.toLowerCase())) n = `${base.slice(0, 26)} ${k++}`;
  usadas.add(n.toLowerCase());
  return n;
}

function hoja(filas, anchos) {
  const h = XLSX.utils.aoa_to_sheet(filas);
  h['!cols'] = anchos.map((wch) => ({ wch }));
  return h;
}

function libroDePedido({ empresa, fecha, lineas }) {
  const libro = XLSX.utils.book_new();
  const porProveedor = new Map();
  for (const l of lineas) {
    const p = l.proveedor || 'Sin proveedor';
    if (!porProveedor.has(p)) porProveedor.set(p, []);
    porProveedor.get(p).push(l);
  }
  const conCosto = lineas.some((l) => l.costo > 0);
  const resumen = [[`Pedido de ${empresa || 'mi empresa'}`], [`Preparado el ${fecha}`], [], ['Proveedor', 'Líneas', 'Unidades', ...(conCosto ? ['Valor a costo'] : [])]];
  for (const [p, ls] of porProveedor) {
    resumen.push([p, ls.length, ls.reduce((s, l) => s + l.cantidad, 0), ...(conCosto ? [ls.reduce((s, l) => s + l.cantidad * (l.costo || 0), 0)] : [])]);
  }
  resumen.push([], ['Aprobado por: ______________________', '', 'Fecha: ____________']);
  XLSX.utils.book_append_sheet(libro, hoja(resumen, [36, 10, 12, 16]), 'Resumen');
  const usadas = new Set(['resumen']);
  for (const [p, ls] of porProveedor) {
    const filas = [['Código', 'Producto', 'Cantidad', ...(conCosto ? ['Costo unitario', 'Valor'] : [])]];
    for (const l of ls) filas.push([l.codigo, l.nombre, l.cantidad, ...(conCosto ? [l.costo || '', l.costo ? l.cantidad * l.costo : ''] : [])]);
    XLSX.utils.book_append_sheet(libro, hoja(filas, [14, 46, 10, 14, 14]), nombreHoja(p, usadas));
  }
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
}

const rutas = express.Router();

rutas.post('/pedido.xlsx', (req, res) => {
  const crudas = Array.isArray(req.body?.lineas) ? req.body.lineas : [];
  if (!crudas.length) throw new ErrorUsuario('El pedido está vacío.');
  if (crudas.length > MAX_LINEAS) throw new ErrorUsuario(`El pedido tiene más de ${MAX_LINEAS} líneas.`);
  const lineas = crudas
    .map((l) => ({
      proveedor: texto(l.proveedor, 80),
      codigo: texto(l.codigo, 60),
      nombre: texto(l.nombre, 160),
      cantidad: Math.max(0, Math.round(Number(l.cantidad) || 0)),
      costo: Number(l.costo) > 0 ? Number(l.costo) : 0,
    }))
    .filter((l) => l.codigo && l.cantidad > 0);
  if (!lineas.length) throw new ErrorUsuario('El pedido está vacío.');
  const fecha = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric' });
  const buf = libroDePedido({ empresa: texto(req.body?.empresa, 80), fecha, lineas });
  const dia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="pedido-${dia}.xlsx"`);
  res.send(buf);
});

// Mínimos y máximos de todos los productos, para cargarlos en el programa contable (casi todos
// tienen esos dos campos por producto y avisan cuando se baja del mínimo).
rutas.post('/minimos.xlsx', (req, res) => {
  const crudos = Array.isArray(req.body?.productos) ? req.body.productos : [];
  if (!crudos.length) throw new ErrorUsuario('No hay productos para exportar.');
  if (crudos.length > 50000) throw new ErrorUsuario('Son demasiados productos para un solo archivo.');
  const filas = [['Código', 'Producto', 'Proveedor', 'Existencias hoy', 'Mínimo', 'Máximo', 'Ventas por semana']];
  for (const p of crudos) {
    const codigo = texto(p.codigo, 60);
    if (!codigo) continue;
    const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : '');
    filas.push([codigo, texto(p.nombre, 160), texto(p.proveedor, 80), n(p.existencias), n(p.minimo), n(p.maximo), n(p.ventasSemana)]);
  }
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja(filas, [14, 46, 28, 14, 10, 10, 16]), 'Minimos y maximos');
  const notas = [
    ['Cómo se calcularon'],
    [''],
    ['Mínimo: lo que se vende mientras llega un pedido, en 9 de cada 10 casos. Cuando tengas el mínimo o menos, pide.'],
    ['Máximo: hasta dónde pedir para cubrir la entrega y el tiempo hasta tu siguiente pedido.'],
    [`Calculado con SINESC el ${new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}. Cambian con tus ventas: actualízalos cada mes.`],
  ];
  XLSX.utils.book_append_sheet(libro, hoja(notas, [110]), 'Como se calcularon');
  const dia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="minimos-y-maximos-${dia}.xlsx"`);
  res.send(XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }));
});

module.exports = { rutas, libroDePedido };
