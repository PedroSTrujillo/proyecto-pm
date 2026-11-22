'use strict';

// Reportes predefinidos por rango de fechas (T7 de docs/PLAN_CAMBIOS_SINESC.md): los más y menos
// vendidos, los de proyectos, los de venta única y los pedidos cerrados. Se ven en pantalla (JSON) y
// se bajan en Excel (.xlsx). Solo informan: no tocan existencias ni pedidos. Son de gerente y
// administrador porque llevan dinero. Diseño del Excel en excel.js.

const express = require('express');
const db = require('./db');
const X = require('./excel');
const { ErrorUsuario, requiereRol } = require('./cuentas');
const { claveCodigo } = require('./valores');
const { ventasEnRango } = require('./series');
const { inventarioDeEmpresa } = require('./inventario-rutas');
const { fechaBogota } = require('./recordatorios');

const TOP = 50;
const dia = (d) => new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10);

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
// "2026-10-23" → "23 de octubre de 2026": el subtítulo lo lee una persona, en pantalla y en el Excel.
const fechaLarga = (d) => `${Number(d.slice(8, 10))} de ${MESES[Number(d.slice(5, 7)) - 1]} de ${d.slice(0, 4)}`;

const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(f)) && dia(f) === f;

// Sin fechas: los últimos 30 días hasta hoy.
function leerRango(q) {
  if ([q.desde, q.hasta].some((f) => f !== undefined && !fechaValida(f))) throw new ErrorUsuario('Las fechas van como AAAA-MM-DD.', 400);
  const hasta = q.hasta || fechaBogota();
  const desde = q.desde || fechaBogota(new Date(new Date(`${hasta}T12:00:00Z`).getTime() - 29 * 86400000));
  if (desde > hasta) throw new ErrorUsuario('La fecha de inicio es después de la final.', 400);
  return { desde, hasta };
}

// Los de ventas: una fila por producto con lo vendido en el rango, lo que hay y lo ya pedido.
function deVentas(titulo, nota, campo, elegir) {
  return async (empresaId, desde, hasta) => {
    const e = await inventarioDeEmpresa(empresaId);
    if (!e) throw new ErrorUsuario('Suba primero el inventario en Datos.', 409);
    const ventas = ventasEnRango(e.series, desde, hasta);
    const conCosto = e.inv.productos.some((p) => p.costo > 0);
    // En unidades enteras: el reparto de cada semana por días deja fracciones ("100,71 unidades") que
    // nadie vendió así; el rango ya es aproximado (ventasEnRango).
    const filas = elegir(e.inv.productos.map((p) => ({ p, v: Math.round((ventas[claveCodigo(p.codigo)] || {})[campo] || 0) })))
      .map(({ p, v }) => [p.codigo, p.nombre, v, p.existencias, p.pedidoReciente ? p.pedidoReciente.cantidad : '', ...(conCosto ? [Math.round(v * (p.costo || 0))] : [])]);
    return {
      titulo,
      subtitulo: `Del ${fechaLarga(desde)} al ${fechaLarga(hasta)}. ${nota}${e.series ? '' : ' Su archivo trae el total de un periodo y no las ventas por semana: no se puede armar este reporte.'}`,
      columnas: ['Código', 'Producto', 'Unidades vendidas', 'Existencias', 'Pedido', ...(conCosto ? ['Valor vendido'] : [])],
      formatos: ['', '', 'decimal', 'decimal', 'decimal', ...(conCosto ? ['plata'] : [])],
      filas,
    };
  };
}

const porMayor = (a, b) => b.v - a.v || String(a.p.nombre).localeCompare(b.p.nombre);

async function deLosPedidos(empresaId, desde, hasta) {
  const pedidos = await db.query(
    `SELECT p.id, p.terminado_en, p.lista_final, u.nombre AS por,
            (SELECT count(*)::int FROM pedidos q WHERE q.usuario_id = p.usuario_id AND q.id <= p.id AND q.borrado_en IS NULL) AS numero
       FROM pedidos p LEFT JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.empresa_id = $1 AND p.terminado_en IS NOT NULL AND p.borrado_en IS NULL AND p.anulado_en IS NULL
        AND p.tipo IS DISTINCT FROM 'simulado'
        AND (p.terminado_en AT TIME ZONE 'America/Bogota')::date BETWEEN $2::date AND $3::date
      ORDER BY p.terminado_en DESC, p.id DESC`,
    [empresaId, desde, hasta],
  );
  const filas = pedidos.flatMap((f) => (Array.isArray(f.lista_final) ? f.lista_final : []).map((l) => [fechaBogota(new Date(f.terminado_en)), `N.º ${f.numero}`, f.por || '', l.codigo, l.nombre || '', l.proveedor || '', Number(l.cantidad)]));
  return {
    titulo: 'Pedidos',
    subtitulo: `Del ${fechaLarga(desde)} al ${fechaLarga(hasta)}. Los pedidos cerrados, una fila por producto pedido.`,
    columnas: ['Fecha', 'Pedido', 'Preparó', 'Código', 'Producto', 'Proveedor', 'Cantidad'],
    formatos: ['', '', '', '', '', '', 'decimal'],
    filas,
  };
}

const REPORTES = {
  'mas-vendidos': deVentas('Productos más vendidos', `Los ${TOP} con más unidades vendidas, sin las ventas de proyecto.`, 'vendido', (l) => l.sort(porMayor).slice(0, TOP)),
  'menos-vendidos': deVentas('Productos menos vendidos', `Los ${TOP} con menos unidades vendidas, empezando por los que no vendieron nada. Sin las ventas de proyecto.`, 'vendido', (l) => l.sort((a, b) => a.v - b.v || String(a.p.nombre).localeCompare(b.p.nombre)).slice(0, TOP)),
  proyectos: deVentas('Ventas de proyectos', 'Lo que se vendió a clientes por proyecto, de más a menos.', 'proyecto', (l) => l.filter((x) => x.v > 0).sort(porMayor)),
  'venta-unica': deVentas('Productos de venta única', 'Productos que se vendieron de una sola vez y no volvieron a salir, con lo que se vendió en estas fechas.', 'vendido', (l) => l.filter((x) => x.p.clase === 'unica' && x.v > 0).sort(porMayor)),
  pedidos: deLosPedidos,
};

const rutas = express.Router();
rutas.use(requiereRol('gerente', 'administrador'));

async function armar(req) {
  const hacer = Object.hasOwn(REPORTES, req.params.tipo) && REPORTES[req.params.tipo];
  if (!hacer) throw new ErrorUsuario('Ese reporte no existe.', 404);
  const { desde, hasta } = leerRango(req.query);
  return { ...(await hacer(req.usuario.empresa_id, desde, hasta)), desde, hasta };
}

// La .xlsx va primero: "/:tipo" también atraparía "mas-vendidos.xlsx".
rutas.get('/:tipo.xlsx', async (req, res) => {
  const r = await armar(req);
  const libro = X.nuevoLibro();
  const { hoja, inicio } = X.hojaConMarca(libro, 'Reporte', { titulo: r.titulo, subtitulo: r.subtitulo, anchos: r.columnas.map((c) => (/producto/i.test(c) ? 46 : 18)) });
  X.tabla(hoja, inicio, r.columnas, r.filas, r.formatos);
  res.attachment(`${req.params.tipo}-${r.desde}-${r.hasta}.xlsx`);
  res.send(await X.aBuffer(libro));
});

rutas.get('/:tipo', async (req, res) => {
  res.json(await armar(req));
});

module.exports = { rutas };
