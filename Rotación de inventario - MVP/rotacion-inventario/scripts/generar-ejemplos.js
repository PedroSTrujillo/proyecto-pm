'use strict';

// Genera archivos de ejemplo en ./ejemplos con formatos distintos, para probar
// que el lector reconoce exports de varios programas sin reorganizar columnas.
// Son datos inventados. Uso: npm run ejemplos

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { EXCEL_EPOCA, MS_DIA, textoDia } = require('../server/valores');

const DIR = path.join(__dirname, '..', 'ejemplos');
fs.mkdirSync(DIR, { recursive: true });

function aleatorio(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const azar = aleatorio(42);
const hoy = Math.floor(Date.now() / MS_DIA);
const ddmmyyyy = (d) => { const [y, m, dd] = textoDia(d).split('-'); return `${dd}/${m}/${y}`; };

const FAMILIAS = [
  ['TOR', 'Tornillo', ['drywall 6x1"', 'drywall 6x2"', 'madera 8x1"', 'autoperforante 10x3/4"', 'estufa 1/4x2"']],
  ['PUN', 'Puntilla', ['con cabeza 1"', 'con cabeza 2"', 'sin cabeza 1 1/2"', 'acero 2"']],
  ['TUB', 'Tubo PVC', ['presión 1/2"', 'presión 3/4"', 'sanitario 2"', 'sanitario 4"']],
  ['CIN', 'Cinta', ['aislante negra', 'enmascarar 1"', 'teflón 1/2"', 'doble faz']],
  ['BRO', 'Brocha', ['1"', '2"', '3"', '4"']],
  ['LIJ', 'Lija', ['agua #80', 'agua #120', 'agua #220', 'madera #100']],
  ['CAN', 'Candado', ['30 mm', '40 mm', '50 mm']],
  ['MAN', 'Manguera', ['jardín 1/2" x 15 m', 'jardín 1/2" x 30 m', 'nivel 5 m']],
];

// Catálogo: ritmo de venta muy distinto entre productos (unos rotan mucho, otros casi nada).
function catalogo(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const [pre, base, variantes] = FAMILIAS[i % FAMILIAS.length];
    const v = variantes[Math.floor(i / FAMILIAS.length) % variantes.length];
    const codigo = `${pre}-${String(1000 + i).slice(-4)}`;
    const r = azar();
    const porSemana = r < 0.1 ? 0 : r < 0.45 ? azar() * 0.6 : r < 0.85 ? 1 + azar() * 10 : 10 + azar() * 60;
    const semanasStock = azar() < 0.15 ? 0 : azar() * 20;
    out.push({ codigo, nombre: `${base} ${v}${i >= FAMILIAS.length * 5 ? ` ref ${i}` : ''}`, porSemana, existencias: Math.round(porSemana * semanasStock + (porSemana === 0 ? 5 + azar() * 40 : 0)) });
  }
  return out;
}

function ventas(productos, semanas) {
  const filas = [];
  const inicio = hoy - semanas * 7;
  for (const p of productos) {
    if (!p.porSemana) continue;
    for (let s = 0; s < semanas; s++) {
      const esperado = p.porSemana;
      if (esperado < 1 && azar() > esperado) continue; // demanda intermitente
      const cantidad = Math.max(1, Math.round(esperado * (0.5 + azar())));
      filas.push({ codigo: p.codigo, nombre: p.nombre, dia: inicio + s * 7 + Math.floor(azar() * 7), cantidad });
    }
  }
  return filas.sort((a, b) => a.dia - b.dia);
}

// 1) Estilo Siigo: CSV con punto y coma, en ANSI (windows-1252), con títulos arriba y total al final.
function siigo() {
  const prods = catalogo(120);
  const v = ventas(prods, 78);
  const lineas = [
    'FERRETERÍA EL TORNILLO FELIZ S.A.S.',
    'Informe movimiento de productos',
    `Fecha de elaboración: del ${ddmmyyyy(hoy - 546)} al ${ddmmyyyy(hoy - 1)}`,
    '',
    'Código producto;Nombre producto;Fecha elaboración;Comprobante;Cantidad;Valor total',
    ...v.map((x, i) => `${x.codigo};${x.nombre};${ddmmyyyy(x.dia)};FV-1-${1000 + i};${x.cantidad};${(x.cantidad * 1234.5).toFixed(2).replace('.', ',')}`),
    `;Total general;;;${v.reduce((n, x) => n + x.cantidad, 0)};`,
  ];
  fs.writeFileSync(path.join(DIR, 'siigo-movimiento-productos.csv'), latin1(lineas.join('\r\n')));
  const saldos = ['Código;Nombre;Bodega;Saldo cantidad'];
  for (const p of prods) {
    const a = Math.floor(p.existencias * 0.7);
    saldos.push(`${p.codigo};${p.nombre};Principal;${a}`);
    if (p.existencias - a) saldos.push(`${p.codigo};${p.nombre};Sucursal Norte;${p.existencias - a}`);
  }
  fs.writeFileSync(path.join(DIR, 'siigo-saldos-productos.csv'), latin1(saldos.join('\r\n')));
  return prods;
}

function latin1(texto) {
  return Buffer.from(texto, 'latin1');
}

// 2) Estilo SAP: un Excel con hoja de ventas (devoluciones con el signo al final, "3-") y hoja de stock.
function sap() {
  const prods = catalogo(60).map((p) => ({ ...p, codigo: String(400000 + Number(p.codigo.slice(-4))).padStart(8, '0') }));
  const v = ventas(prods, 104);
  const filasVentas = v.map((x, i) => [x.codigo, x.nombre, { t: 'n', v: x.dia + EXCEL_EPOCA, z: 'dd.mm.yyyy' }, i % 97 === 0 ? `${Math.min(3, x.cantidad)}-` : x.cantidad, 'UN']);
  const libro = XLSX.utils.book_new();
  const wsV = XLSX.utils.aoa_to_sheet([['Material', 'Texto breve de material', 'Fecha contabilización', 'Cantidad', 'UMB'], ...filasVentas]);
  XLSX.utils.book_append_sheet(libro, wsV, 'VentasMB51');
  const wsS = XLSX.utils.aoa_to_sheet([['Material', 'Texto breve de material', 'Centro', 'Libre utilización'], ...prods.map((p) => [Number(p.codigo), p.nombre, '1000', p.existencias])]);
  XLSX.utils.book_append_sheet(libro, wsS, 'StockMB52');
  XLSX.writeFile(libro, path.join(DIR, 'sap-ventas-y-stock.xlsx'));
}

// 3) Informe de ventas por mes (una columna por mes) + hoja de existencias.
function porMes() {
  const prods = catalogo(80);
  const meses = [];
  const d = new Date(hoy * MS_DIA);
  for (let k = 23; k >= 0; k--) meses.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1 - k, 1)));
  const nombresMes = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const enc = ['Referencia', 'Descripción', ...meses.map((m) => `${nombresMes[m.getUTCMonth()]}-${m.getUTCFullYear()}`), 'Total'];
  const filas = prods.map((p) => {
    const vals = meses.map(() => Math.round(p.porSemana * 4.33 * (0.6 + azar() * 0.8)));
    return [p.codigo, p.nombre, ...vals, vals.reduce((a, b) => a + b, 0)];
  });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['Ventas por referencia y mes (unidades)'], [], enc, ...filas]), 'Ventas por mes');
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['Referencia', 'Descripción', 'Existencia actual'], ...prods.map((p) => [p.codigo, p.nombre, p.existencias])]), 'Inventario');
  XLSX.writeFile(libro, path.join(DIR, 'ventas-por-mes.xlsx'));
}

// 4) Lista de pedido como informe de mínimos (para la lista inicial).
function listaMinimos(prods) {
  const filas = prods.slice(0, 40).map((p) => {
    const minimo = Math.ceil(p.porSemana * 3);
    const maximo = Math.ceil(p.porSemana * 8) + 2;
    const pedir = p.existencias < minimo ? maximo - p.existencias : null;
    return [p.codigo, p.nombre, 'Proveedor ' + p.codigo.slice(0, 3), p.existencias, minimo, maximo, pedir];
  });
  const libro = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([['INFORME DE MÍNIMOS - REUNIÓN DE COMPRAS'], [], ['Cód.', 'Descripción', 'Proveedor', 'Existencia', 'Mínimo', 'Máximo', 'Cant. a pedir'], ...filas]);
  XLSX.utils.book_append_sheet(libro, ws, 'Mínimos');
  XLSX.writeFile(libro, path.join(DIR, 'lista-inicial-informe-minimos.xlsx'));
}

// 5) Catálogo grande (rendimiento): ~3.000 productos y dos años de ventas en un CSV.
function grande() {
  const prods = catalogo(3000);
  const v = ventas(prods, 104);
  const lineas = ['codigo,descripcion,fecha,cantidad', ...v.map((x) => `${x.codigo},"${x.nombre.replace(/"/g, '""')}",${textoDia(x.dia)},${x.cantidad}`)];
  fs.writeFileSync(path.join(DIR, 'grande-ventas.csv'), lineas.join('\n'));
  fs.writeFileSync(path.join(DIR, 'grande-existencias.csv'), ['codigo,existencias', ...prods.map((p) => `${p.codigo},${p.existencias}`)].join('\n'));
  return v.length;
}

const prodsSiigo = siigo();
sap();
porMes();
listaMinimos(prodsSiigo);
const n = grande();
console.log(`Ejemplos generados en ${DIR} (catálogo grande: ${n} filas de ventas).`);
