'use strict';

// Plantillas descargables, con un ejemplo lleno y el diseño de SINESC (excel.js). Los nombres y
// el orden de las columnas salen de formatos.js (PLANTILLA_EXPORT y PLANTILLA_LISTA). El
// encabezado de cada tabla va en la fila 1, que es donde el lector lo busca primero.

const X = require('./excel');
const { PLANTILLA_EXPORT, PLANTILLA_LISTA, PLANTILLA_INVENTARIO } = require('./formatos');
const { EXCEL_EPOCA, diaHoy } = require('./valores');

// Productos de ejemplo (una distribuidora de ferretería).
const PRODUCTOS_EJEMPLO = [
  { codigo: 'CIN-0003', costo: 3200, nombre: 'Cinta aislante negra 18 mm x 10 m', porSemana: 25, existencias: 0, proveedor: 'Eléctricos del Valle', minimo: 40, maximo: 120 },
  { codigo: 'TOR-0610', costo: 9800, nombre: 'Tornillo drywall 6 x 1" (caja x100)', porSemana: 12, existencias: 18, proveedor: 'Tornillería Central', minimo: 30, maximo: 90 },
  { codigo: 'LIJ-0120', costo: 1400, nombre: 'Lija de agua #120', porSemana: 30, existencias: 150, proveedor: 'Abrasivos Andinos', minimo: 100, maximo: 300 },
  { codigo: 'PVC-0250', costo: 38000, nombre: 'Soldadura PVC 1/4 galón', porSemana: 6, existencias: 40, proveedor: 'Plásticos y Tubos', minimo: 15, maximo: 50 },
  { codigo: 'BRO-0002', costo: 4500, nombre: 'Brocha 2" mango plástico', porSemana: 4, existencias: 30, proveedor: 'Pinturas La Paleta', minimo: 12, maximo: 40 },
  { codigo: 'CAN-0040', costo: 21000, nombre: 'Candado de bronce 40 mm', porSemana: 2, existencias: 20, proveedor: 'Seguridad Total', minimo: 6, maximo: 24 },
  { codigo: 'MAN-1215', costo: 27000, nombre: 'Manguera de jardín 1/2" x 15 m', porSemana: 1, existencias: 45, proveedor: 'Plásticos y Tubos', minimo: 5, maximo: 20 },
  { codigo: 'GUA-0007', costo: 6800, nombre: 'Guantes de carnaza (par)', porSemana: 0, existencias: 60, proveedor: 'Seguridad Total', minimo: 10, maximo: 30 },
];

// Generador pseudoaleatorio con semilla: la plantilla sale igual cada vez.
function aleatorio(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Hoy en Bogotá: en UTC, después de las 7 de la noche ya es mañana y los movimientos de hoy
// quedarían antes del último día del archivo de ejemplo.
function hoyDia() {
  const [a, m, d] = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).split('-').map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / MS_DIA);
}

// Ventas de ejemplo: el último año, con 1 a 3 facturas por semana por producto.
function ventasEjemplo(semanas = 52) {
  const azar = aleatorio(20261001);
  const fin = diaHoy() - 1;
  const inicio = fin - semanas * 7 + 1;
  const filas = [];
  for (let s = 0; s < semanas; s++) {
    for (const p of PRODUCTOS_EJEMPLO) {
      if (!p.porSemana) continue;
      let restante = Math.max(0, Math.round(p.porSemana * (0.6 + azar() * 0.8)));
      const facturas = 1 + Math.floor(azar() * 3);
      for (let f = 0; f < facturas && restante > 0; f++) {
        const cantidad = f === facturas - 1 ? restante : Math.max(1, Math.round(restante * azar()));
        restante -= cantidad;
        filas.push({ codigo: p.codigo, nombre: p.nombre, dia: inicio + s * 7 + Math.floor(azar() * 7), cantidad });
      }
    }
  }
  filas.sort((a, b) => a.dia - b.dia || a.codigo.localeCompare(b.codigo));
  return filas;
}

// Hoja "Instrucciones" con el logo. El lector ignora las hojas que se llaman así.
function hojaInstrucciones(libro, titulo, lineas) {
  const { hoja, inicio } = X.hojaConMarca(libro, 'Instrucciones', { titulo, subtitulo: 'Plantilla de SINESC', anchos: [110] });
  X.parrafos(hoja, inicio, lineas);
}

async function plantillaExport() {
  const libro = X.nuevoLibro();
  const cv = PLANTILLA_EXPORT.ventas.columnas;
  const ventas = ventasEjemplo().map((v) => [v.codigo, v.nombre, v.dia + EXCEL_EPOCA, v.cantidad]);
  X.hojaPlantilla(libro, PLANTILLA_EXPORT.ventas.hoja, cv, ventas, [14, 40, 13, 11], ['', '', 'fecha', 'entero']);
  const ce = PLANTILLA_EXPORT.existencias.columnas;
  X.hojaPlantilla(libro, PLANTILLA_EXPORT.existencias.hoja, ce, PRODUCTOS_EJEMPLO.map((p) => [p.codigo, p.nombre, p.existencias]), [14, 40, 13], ['', '', 'entero']);
  hojaInstrucciones(libro, 'Ventas y existencias', [
    '1. En la hoja "Ventas", una fila por cada venta: código, nombre, fecha y cantidad. Lo ideal es el último año.',
    '2. En la hoja "Existencias", una fila por producto con lo que tiene hoy.',
    '3. Borre los productos de ejemplo, pegue los suyos, guarde y suba el archivo en SINESC.',
  ]);
  return X.aBuffer(libro);
}

// La hoja "Pedido" va vacía y el ejemplo en su propia hoja: un probador que subió la plantilla
// sin llenar guardó los productos de ejemplo como su lista inicial, y esa lista ya no se cambia.
async function plantillaLista() {
  const libro = X.nuevoLibro();
  const pedir = { 'CIN-0003': 100, 'TOR-0610': 60, 'LIJ-0120': 100, 'PVC-0250': 12, 'MAN-1215': 10 };
  const filas = PRODUCTOS_EJEMPLO.map((p) => [p.codigo, p.nombre, p.proveedor, p.existencias, p.minimo, p.maximo, pedir[p.codigo] ?? null]);
  const anchos = [14, 40, 24, 12, 10, 10, 17];
  const formatos = ['', '', '', 'entero', 'entero', 'entero', 'entero'];
  X.hojaPlantilla(libro, PLANTILLA_LISTA.hoja, PLANTILLA_LISTA.columnas, [], anchos, formatos);
  X.hojaPlantilla(libro, 'Ejemplo', PLANTILLA_LISTA.columnas, filas, anchos, formatos);
  hojaInstrucciones(libro, 'Lista de pedido', [
    '1. En la hoja "Pedido", una fila por producto que iba a pedir: código y cantidad a pedir. Lo demás es opcional.',
    '2. Los productos sin cantidad no se tienen en cuenta.',
    '3. Guarde el archivo y súbalo en el paso 1 de su pedido en SINESC.',
    '',
    'La hoja "Ejemplo" muestra cómo se ve llena. No hace falta borrarla: no se tiene en cuenta.',
  ]);
  return X.aBuffer(libro);
}

// Códigos de los productos de ejemplo: si un archivo solo trae estos, es una plantilla sin llenar.
const CODIGOS_EJEMPLO = new Set(PRODUCTOS_EJEMPLO.map((p) => p.codigo));
const soloEjemplo = (codigos) => codigos.length > 0 && codigos.every((c) => CODIGOS_EJEMPLO.has(String(c).trim().toUpperCase()));

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Los 12 meses completos anteriores a hoy, como "Oct-2025".
function ultimosDoceMeses(hoy = new Date()) {
  const meses = [];
  for (let i = 12; i >= 1; i--) {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
    meses.push(`${MESES[d.getUTCMonth()]}-${d.getUTCFullYear()}`);
  }
  return meses;
}

/**
 * Para quien lleva el inventario en Excel o a mano. Tres hojas: "Productos" para llenar,
 * "Ejemplo" ya lleno e "Instrucciones". El lector ignora las hojas Ejemplo e Instrucciones.
 */
// Fila de los encabezados en la hoja Productos (arriba van el título y los grupos de columnas).
const FILA_ENCABEZADOS = 4;
const FILAS_PARA_LLENAR = 200;

/**
 * La hoja para llenar de la plantilla de inventario: título, qué es obligatorio y qué no, una nota
 * en cada encabezado, validación de números y 200 filas marcadas. filas: ejemplo ya lleno o [].
 */
function hojaInventario(libro, nombre, meses, filas) {
  const C = X.COLORES;
  const hoja = libro.addWorksheet(nombre, { views: [{ state: 'frozen', xSplit: 2, ySplit: FILA_ENCABEZADOS, showGridLines: false }] });
  hoja.properties.tabColor = { argb: C.primario };
  const columnas = [
    { titulo: 'Código', ancho: 14, grupo: 'obligatorio', nota: 'El código del producto en su programa. Si no usa códigos, copie aquí el nombre.' },
    { titulo: 'Producto', ancho: 36, grupo: 'obligatorio', nota: 'El nombre del producto.' },
    { titulo: 'Existencias hoy', ancho: 15, grupo: 'obligatorio', formato: 'entero', nota: 'Cuántas unidades tiene hoy, sumando todas las bodegas.' },
    ...meses.map((m) => ({ titulo: m, ancho: 10, grupo: 'mes', formato: 'entero', nota: `Unidades que vendió en ${m}. En blanco si no vendió.` })),
    { titulo: 'Proveedor', ancho: 24, grupo: 'opcional', nota: 'Opcional. Con el proveedor, el pedido sugerido sale separado por proveedor.' },
    { titulo: 'Costo unitario', ancho: 15, grupo: 'opcional', formato: 'plata', nota: 'Opcional. Lo que le cuesta una unidad. Con el costo ve cuánto dinero tiene quieto.' },
  ];
  hoja.columns = columnas.map((c) => ({ width: c.ancho }));
  const ultima = columnas.length;
  const fuente = (extra = {}) => ({ name: 'Calibri', size: 11, ...extra });

  // Título y explicación.
  hoja.mergeCells(1, 1, 1, ultima);
  hoja.getCell(1, 1).value = 'Su inventario para SINESC: una fila por producto';
  hoja.getCell(1, 1).font = fuente({ size: 15, bold: true, color: { argb: C.primarioOscuro } });
  hoja.getRow(1).height = 26;
  hoja.mergeCells(2, 1, 2, ultima);
  hoja.getCell(2, 1).value = 'Llene las columnas verdes oscuras y lo que vendió cada mes. Proveedor y costo son opcionales. Pase el mouse por un encabezado para ver qué va ahí.';
  hoja.getCell(2, 1).font = fuente({ size: 10, color: { argb: C.gris } });

  // Grupos de columnas (fila 3) y encabezados (fila 4).
  const grupos = {
    obligatorio: { texto: 'OBLIGATORIO', fondo: C.primario, letra: C.blanco },
    mes: { texto: 'UNIDADES VENDIDAS CADA MES', fondo: C.claro, letra: C.primarioOscuro },
    opcional: { texto: 'OPCIONAL', fondo: 'FFE5E7EB', letra: C.gris },
  };
  let c = 1;
  while (c <= ultima) {
    const g = columnas[c - 1].grupo;
    let hasta = c;
    while (hasta < ultima && columnas[hasta].grupo === g) hasta++;
    if (hasta > c) hoja.mergeCells(3, c, 3, hasta);
    const celda = hoja.getCell(3, c);
    celda.value = grupos[g].texto;
    celda.font = fuente({ size: 9, bold: true, color: { argb: grupos[g].letra } });
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: grupos[g].fondo } };
    celda.alignment = { horizontal: 'center', vertical: 'middle' };
    c = hasta + 1;
  }
  const enc = hoja.getRow(FILA_ENCABEZADOS);
  enc.height = 22;
  columnas.forEach((col, k) => {
    const celda = enc.getCell(k + 1);
    celda.value = col.titulo;
    celda.note = col.nota;
    celda.font = fuente({ bold: true, color: { argb: grupos[col.grupo].letra } });
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: grupos[col.grupo].fondo } };
    celda.alignment = { vertical: 'middle', horizontal: col.formato ? 'center' : 'left' };
    celda.border = { bottom: { style: 'medium', color: { argb: C.primarioOscuro } } };
  });

  // Filas para llenar: bordes suaves, formato de número y validación.
  const total = Math.max(FILAS_PARA_LLENAR, filas.length);
  for (let i = 0; i < total; i++) {
    const fila = hoja.getRow(FILA_ENCABEZADOS + 1 + i);
    const valores = filas[i];
    columnas.forEach((col, k) => {
      const celda = fila.getCell(k + 1);
      if (valores && valores[k] !== null && valores[k] !== undefined) celda.value = valores[k];
      celda.font = fuente({ color: { argb: C.texto } });
      celda.border = { bottom: { style: 'hair', color: { argb: C.borde } }, right: { style: 'hair', color: { argb: C.borde } } };
      if (col.formato === 'entero') celda.numFmt = '#,##0';
      if (col.formato === 'plata') celda.numFmt = '"$"#,##0';
      if (col.formato) {
        celda.dataValidation = {
          type: 'decimal', operator: 'greaterThanOrEqual', formulae: [0], allowBlank: true,
          showErrorMessage: true, errorTitle: 'Solo números', error: 'Escriba solo el número, sin letras ni signos.',
        };
      }
    });
  }
  return hoja;
}

async function plantillaInventario() {
  const libro = X.nuevoLibro();
  const meses = ultimosDoceMeses();
  hojaInventario(libro, PLANTILLA_INVENTARIO.hoja, meses, []);
  const azar = aleatorio(20261011);
  const ejemplo = PRODUCTOS_EJEMPLO.slice(0, 4).map((p) => [
    p.codigo, p.nombre, p.existencias,
    ...meses.map(() => (p.porSemana ? Math.round(p.porSemana * 4.3 * (0.7 + azar() * 0.6)) : null)),
    p.proveedor, p.costo,
  ]);
  hojaInventario(libro, 'Ejemplo', meses, ejemplo);
  hojaInstrucciones(libro, 'Cómo llenar esta plantilla', [
    '1. En la hoja "Productos", escriba una fila por producto: código, nombre y cuántas unidades tiene hoy.',
    '2. En cada mes, las unidades que vendió de ese producto. Si no vendió nada, déjelo en blanco.',
    '3. Proveedor y costo unitario son opcionales: con ellos el pedido sale por proveedor y ve cuánto dinero tiene quieto.',
    '4. Si no usa códigos, copie el nombre del producto en la columna Código.',
    '5. Guarde el archivo y súbalo en SINESC. Puede pegar filas copiadas de otro Excel.',
    '',
    'La hoja "Ejemplo" muestra cómo se ve llena. No hace falta borrarla: no se tiene en cuenta.',
  ]);
  return X.aBuffer(libro);
}

module.exports = { plantillaExport, plantillaLista, plantillaInventario, ultimosDoceMeses, ventasEjemplo, soloEjemplo, PRODUCTOS_EJEMPLO };
