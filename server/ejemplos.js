'use strict';

// Ejemplos para el equipo: los seis negocios de la demo como archivos de Excel y los archivos de
// ejemplos/ (formatos de Siigo, SAP, ventas por mes y un catálogo grande). Se pueden descargar
// para subirlos por el flujo normal, o cargar directo como el inventario de la cuenta del equipo.
// Solo el equipo: un probador nunca ve esta página ni estas rutas.

const fs = require('fs');
const path = require('path');
const express = require('express');
const { requiereEquipo, ErrorUsuario } = require('./cuentas');
const { guardarExport } = require('./inventario-rutas');
const { archivoDemo, sectores } = require('./demo');
const { leerAjustes } = require('./inventario');
const { inventarioDelUsuario, guardarInventarioDelUsuario } = require('./empresas');

// En Vercel la API va empaquetada dentro de la web y __dirname ya no es server/: se busca la
// carpeta también desde donde corre el proceso (next.config.mjs la incluye en la función).
const DIR = [path.join(__dirname, '..', 'ejemplos'), path.join(process.cwd(), '..', 'ejemplos'), path.join(process.cwd(), 'ejemplos')]
  .find((d) => fs.existsSync(path.join(d, 'sap-ventas-y-stock.xlsx'))) || path.join(__dirname, '..', 'ejemplos');

// Lo que hay en ejemplos/ (npm run ejemplos los regenera). tipo 'lista' es para el paso 1 de un pedido.
const ARCHIVOS = [
  {
    id: 'siigo',
    titulo: 'Siigo: movimiento y saldos',
    texto: 'Dos CSV con punto y coma y tildes en ANSI, con títulos arriba y una fila de total, como salen de Siigo. Las existencias vienen por bodega. 120 productos y año y medio de ventas.',
    archivos: ['siigo-movimiento-productos.csv', 'siigo-saldos-productos.csv'],
    tipo: 'export',
  },
  {
    id: 'sap',
    titulo: 'SAP: ventas y stock en un Excel',
    texto: 'Una hoja de ventas con las devoluciones escritas como "3-" y otra de stock con el código como número. 60 productos y dos años de ventas.',
    archivos: ['sap-ventas-y-stock.xlsx'],
    tipo: 'export',
  },
  {
    id: 'por-mes',
    titulo: 'Ventas con una columna por mes',
    texto: 'Un informe con 24 meses en columnas y una hoja de existencias, sin la fecha de cada venta. 80 productos.',
    archivos: ['ventas-por-mes.xlsx'],
    tipo: 'export',
  },
  {
    id: 'grande',
    titulo: 'Catálogo grande',
    texto: 'Unos 3.000 productos y dos años de ventas en CSV. Sirve para comprobar que el panel y la lista de productos responden rápido.',
    archivos: ['grande-ventas.csv', 'grande-existencias.csv'],
    tipo: 'export',
  },
  {
    id: 'lista',
    titulo: 'Lista inicial: informe de mínimos',
    texto: 'Para el paso 1 de un pedido, en "Importar mi archivo de pedido". Trae los productos del ejemplo de Siigo con su cantidad a pedir.',
    archivos: ['lista-inicial-informe-minimos.xlsx'],
    tipo: 'lista',
  },
];

const rutas = express.Router();
rutas.use(requiereEquipo);

rutas.get('/', (_req, res) => {
  const archivos = ARCHIVOS.map((a) => ({ ...a, disponible: a.archivos.every((n) => fs.existsSync(path.join(DIR, n))) }));
  res.json({ negocios: sectores(), archivos });
});

// formato: 'ventas' (Excel con la fecha de cada venta) o 'listado' (listado de inventario con
// las salidas del periodo, como lo saca Helisa; solo los negocios que trabajan así).
function negocio(req) {
  const formato = req.query.formato === 'listado' ? 'listado' : 'ventas';
  const archivo = archivoDemo(req.params.id, formato);
  if (!archivo) throw new ErrorUsuario('No existe ese ejemplo.', 404);
  return archivo;
}

function ejemplo(req) {
  const e = ARCHIVOS.find((a) => a.id === req.params.id);
  if (!e) throw new ErrorUsuario('No existe ese ejemplo.', 404);
  return e;
}

function leer(nombre) {
  const ruta = path.join(DIR, nombre);
  if (!fs.existsSync(ruta)) throw new ErrorUsuario(`Falta ${nombre} en la carpeta ejemplos/. Se generan con npm run ejemplos.`, 404);
  return fs.readFileSync(ruta);
}

function enviar(res, nombre, buffer) {
  const tipo = nombre.endsWith('.csv') ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  res.setHeader('Content-Type', tipo);
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  res.send(buffer);
}

rutas.get('/negocios/:id/archivo', (req, res) => {
  const a = negocio(req);
  enviar(res, a.nombre, a.buffer);
});

// Carga el negocio como el inventario de la cuenta, con los tiempos de entrega de sus proveedores
// y cada cuánto pide. El listado ya trae su periodo, así que no se pregunta.
rutas.post('/negocios/:id/cargar', async (req, res) => {
  const a = negocio(req);
  const r = await guardarExport(req.usuario.id, [{ nombre: a.nombre, buffer: a.buffer }], { desde: 'ejemplos', periodo: a.periodo || null });
  if (r.ok) {
    const previos = await inventarioDelUsuario(req.usuario.id);
    await guardarInventarioDelUsuario(req.usuario.id, leerAjustes({ ...previos, cadaCuanto: a.cadaCuanto, entregas: { ...(previos.entregas || {}), ...a.entregas } }));
  }
  res.json(r);
});

rutas.get('/archivos/:id/:nombre', (req, res) => {
  const e = ejemplo(req);
  if (!e.archivos.includes(req.params.nombre)) throw new ErrorUsuario('Ese archivo no es de este ejemplo.', 404);
  enviar(res, req.params.nombre, leer(req.params.nombre));
});

rutas.post('/archivos/:id/cargar', async (req, res) => {
  const e = ejemplo(req);
  if (e.tipo !== 'export') throw new ErrorUsuario('Este ejemplo es una lista de pedido: se importa en el paso 1 de un pedido.');
  res.json(await guardarExport(req.usuario.id, e.archivos.map((nombre) => ({ nombre, buffer: leer(nombre) })), { desde: 'ejemplos' }));
});

module.exports = { rutas };
