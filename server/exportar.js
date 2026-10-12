'use strict';

// El pedido armado en pantalla, como Excel: una hoja de resumen y una por proveedor, lista
// para mandar al proveedor o para que gerencia la apruebe. Y los mínimos y máximos de todos los
// productos. No guarda nada: arma el archivo con lo que llega y lo devuelve. Diseño en excel.js.

const express = require('express');
const { ErrorUsuario } = require('./cuentas');
const X = require('./excel');
const { pedidoPdf } = require('./pdf');

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

async function libroDePedido({ empresa, fecha, lineas }) {
  const libro = X.nuevoLibro();
  const porProveedor = new Map();
  for (const l of lineas) {
    const p = l.proveedor || 'Sin proveedor';
    if (!porProveedor.has(p)) porProveedor.set(p, []);
    porProveedor.get(p).push(l);
  }
  const conCosto = lineas.some((l) => l.costo > 0);
  const quien = empresa || 'mi empresa';

  const { hoja: resumen, inicio } = X.hojaConMarca(libro, 'Resumen', {
    titulo: `Pedido de ${quien}`,
    subtitulo: `Preparado con SINESC el ${fecha}`,
    anchos: [38, 12, 14, 18],
  });
  const filas = [...porProveedor].map(([p, ls]) => [
    p,
    ls.length,
    ls.reduce((s, l) => s + l.cantidad, 0),
    ...(conCosto ? [ls.reduce((s, l) => s + l.cantidad * (l.costo || 0), 0)] : []),
  ]);
  const formatos = ['', 'entero', 'entero', 'plata'];
  const fin = X.tabla(resumen, inicio, ['Proveedor', 'Líneas', 'Unidades', ...(conCosto ? ['Valor a costo'] : [])], filas, formatos);
  X.filaTotal(resumen, fin + 1, ['Total', lineas.length, lineas.reduce((s, l) => s + l.cantidad, 0), ...(conCosto ? [lineas.reduce((s, l) => s + l.cantidad * (l.costo || 0), 0)] : [])], formatos);
  X.parrafos(resumen, fin + 4, ['Aprobado por: ______________________________        Fecha: ______________']);

  const usadas = new Set(['resumen']);
  for (const [p, ls] of porProveedor) {
    const { hoja, inicio: i } = X.hojaConMarca(libro, nombreHoja(p, usadas), {
      titulo: p,
      subtitulo: `Pedido de ${quien} · ${fecha}`,
      anchos: [16, 48, 12, ...(conCosto ? [16, 16] : [])],
    });
    const f = ['', '', 'entero', 'plata', 'plata'];
    const final = X.tabla(
      hoja,
      i,
      ['Código', 'Producto', 'Cantidad', ...(conCosto ? ['Costo unitario', 'Valor'] : [])],
      ls.map((l) => [l.codigo, l.nombre, l.cantidad, ...(conCosto ? [l.costo || null, l.costo ? l.cantidad * l.costo : null] : [])]),
      f,
    );
    X.filaTotal(hoja, final + 1, ['Total', '', ls.reduce((s, l) => s + l.cantidad, 0), ...(conCosto ? ['', ls.reduce((s, l) => s + l.cantidad * (l.costo || 0), 0)] : [])], f);
  }
  return X.aBuffer(libro);
}

async function libroDeMinimos(productos) {
  const libro = X.nuevoLibro();
  const fecha = X.fechaHoy();
  const { hoja, inicio } = X.hojaConMarca(libro, 'Minimos y maximos', {
    titulo: 'Mínimos y máximos',
    subtitulo: `Calculados con SINESC el ${fecha}. Cambian con tus ventas: actualízalos cada mes.`,
    anchos: [16, 46, 28, 15, 11, 11, 17],
  });
  X.tabla(
    hoja,
    inicio,
    ['Código', 'Producto', 'Proveedor', 'Existencias hoy', 'Mínimo', 'Máximo', 'Ventas por semana'],
    productos,
    ['', '', '', 'entero', 'entero', 'entero', 'decimal'],
  );
  const { hoja: notas, inicio: n } = X.hojaConMarca(libro, 'Como se calcularon', {
    titulo: 'Cómo se calcularon',
    subtitulo: `SINESC · ${fecha}`,
    anchos: [6, 110],
  });
  X.parrafos(notas, n, [
    'Mínimo: lo que se vende mientras llega un pedido, en 9 de cada 10 casos. Cuando tengas el mínimo o menos, pide.',
    'Máximo: hasta dónde pedir para cubrir la entrega y el tiempo hasta tu siguiente pedido.',
    'Casi todos los programas contables tienen estos dos campos por producto y avisan cuando se baja del mínimo.',
  ]);
  return X.aBuffer(libro);
}

function enviar(res, nombre, buf) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  res.send(buf);
}

const hoyCorto = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

const rutas = express.Router();

// Las líneas del pedido que llegan de la pantalla, limpias.
function lineasDelPedido(body) {
  const crudas = Array.isArray(body?.lineas) ? body.lineas : [];
  if (!crudas.length) throw new ErrorUsuario('El pedido está vacío.');
  if (crudas.length > MAX_LINEAS) throw new ErrorUsuario(`El pedido tiene más de ${MAX_LINEAS} líneas.`);
  const lineas = crudas
    .map((l) => ({
      proveedor: texto(l.proveedor, 80),
      codigo: texto(l.codigo, 60),
      nombre: texto(l.nombre, 160),
      cantidad: Math.max(0, Math.round(Number(l.cantidad) || 0)),
      costo: Number(l.costo) > 0 ? Number(l.costo) : 0,
      semanas: Number.isFinite(Number(l.semanas)) && l.semanas !== null ? Number(l.semanas) : null,
    }))
    .filter((l) => l.codigo && l.cantidad > 0);
  if (!lineas.length) throw new ErrorUsuario('El pedido está vacío.');
  return lineas;
}

rutas.post('/pedido.xlsx', async (req, res) => {
  const lineas = lineasDelPedido(req.body);
  enviar(res, `pedido-${hoyCorto()}.xlsx`, await libroDePedido({ empresa: texto(req.body?.empresa, 80), fecha: X.fechaHoy(), lineas }));
});

// El mismo pedido como PDF tamaño carta, para que gerencia lo apruebe y lo firme (server/pdf.js).
rutas.post('/pedido.pdf', async (req, res) => {
  const lineas = lineasDelPedido(req.body);
  const buf = await pedidoPdf({
    empresa: texto(req.body?.empresa, 80) || 'mi empresa',
    fecha: X.fechaHoy(),
    cadaCuanto: texto(req.body?.cadaCuanto, 30) || '4 semanas',
    lineas,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="pedido-para-aprobar-${hoyCorto()}.pdf"`);
  res.send(buf);
});

// Mínimos y máximos de todos los productos, para cargarlos en el programa contable (casi todos
// tienen esos dos campos por producto y avisan cuando se baja del mínimo).
rutas.post('/minimos.xlsx', async (req, res) => {
  const crudos = Array.isArray(req.body?.productos) ? req.body.productos : [];
  if (!crudos.length) throw new ErrorUsuario('No hay productos para exportar.');
  if (crudos.length > 50000) throw new ErrorUsuario('Son demasiados productos para un solo archivo.');
  const n = (v) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const filas = crudos
    .map((p) => [texto(p.codigo, 60), texto(p.nombre, 160), texto(p.proveedor, 80), n(p.existencias), n(p.minimo), n(p.maximo), n(p.ventasSemana)])
    .filter((f) => f[0]);
  enviar(res, `minimos-y-maximos-${hoyCorto()}.xlsx`, await libroDeMinimos(filas));
});

module.exports = { rutas, libroDePedido, libroDeMinimos };
