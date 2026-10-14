'use strict';

// Lee el export del software contable (ventas y existencias) y la lista de pedido.
// Acepta Excel (.xlsx, .xls, .ods) y texto separado por comas, punto y coma o
// tabulaciones (.csv, .txt). Busca sola la fila de encabezados, reconoce las
// columnas por sus nombres habituales y explica en palabras sencillas lo que falte.

const XLSX = require('xlsx');
const { CAMPOS, camposDeEncabezado, normalizarEncabezado } = require('./formatos');
const V = require('./valores');

const EXT_TEXTO = new Set(['csv', 'txt', 'tsv', 'prn']);
// xml, htm y html: varios programas guardan el informe como XML de Excel 2003 o como página web.
const EXT_EXCEL = new Set(['xlsx', 'xlsm', 'xls', 'xlsb', 'ods', 'xml', 'htm', 'html']);
const EXT_IMAGEN = new Set(['jpg', 'jpeg', 'png', 'gif', 'heic', 'heif', 'webp', 'bmp', 'tif', 'tiff', 'pdf']);
const MAX_PROBLEMAS_MOSTRADOS = 8;
// Si más del 20 % de las filas (y más de 10) no se pueden leer, lo más probable es
// que una columna esté mal reconocida: se detiene y se explica en vez de seguir.
const LIMITE_FILAS_CON_PROBLEMAS = 0.2;
const MINIMO_FILAS_CON_PROBLEMAS = 10;

class ErrorArchivo extends Error {}

// Un archivo con los encabezados y sin productos: casi siempre es una plantilla de SINESC sin llenar.
const SIN_LLENAR = 'El archivo solo trae los encabezados, sin productos. Si es la plantilla de SINESC, escribe tus productos en la primera hoja, guárdala y vuelve a subirla.';

// Las hojas de ayuda de una plantilla ("Instrucciones", "Ejemplo") no son datos del usuario.
const esHojaDeAyuda = (h) => /^(instrucciones?|ejemplos?|ayuda|como llenar.*)$/.test(normalizarEncabezado(h.hoja || ''));

function extension(nombre) {
  const m = String(nombre || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

function pareceImagen(buf) {
  if (buf.length < 4) return false;
  const h = buf.subarray(0, 4).toString('hex');
  return h.startsWith('ffd8ff') || h === '89504e47' || h === '25504446' || h.startsWith('47494638');
}

// --- Texto (CSV) ---------------------------------------------------------------

function decodificarTexto(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8');
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    // Los programas en Windows suelen guardar en ANSI (tildes como "Código" en un byte).
    return new TextDecoder('windows-1252').decode(buf);
  }
}

function contarFueraDeComillas(linea, sep) {
  let n = 0;
  let enComillas = false;
  for (const ch of linea) {
    if (ch === '"') enComillas = !enComillas;
    else if (ch === sep && !enComillas) n++;
  }
  return n;
}

function detectarSeparador(texto) {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30);
  const m = lineas[0] && lineas[0].match(/^sep=(.)\s*$/i);
  if (m) return { sep: m[1], saltar: 1 };
  let mejor = { sep: ',', puntaje: -1 };
  for (const sep of [';', '\t', ',', '|']) {
    const cuentas = lineas.map((l) => contarFueraDeComillas(l, sep));
    const frecuencia = new Map();
    for (const c of cuentas) if (c > 0) frecuencia.set(c, (frecuencia.get(c) || 0) + 1);
    let puntaje = 0;
    for (const [c, f] of frecuencia) puntaje = Math.max(puntaje, f * 1000 + c);
    if (puntaje > mejor.puntaje) mejor = { sep, puntaje };
  }
  return { sep: mejor.sep, saltar: 0 };
}

function parsearCSV(texto) {
  const { sep, saltar } = detectarSeparador(texto);
  const filas = [];
  let fila = [];
  let campo = '';
  let enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (enComillas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else enComillas = false;
      } else campo += ch;
    } else if (ch === '"' && campo === '') {
      enComillas = true;
    } else if (ch === sep) {
      fila.push(campo); campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += ch;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.slice(saltar).map((f) => f.map((c) => (c.trim() === '' ? null : c.trim())));
}

// --- Abrir un archivo cualquiera -> hojas con filas -----------------------------

// Devuelve [{ archivo, hoja, filas, primeraFila }] donde primeraFila es el número
// de fila (como lo muestra Excel) de filas[0].
function abrirArchivo(buffer, nombreArchivo) {
  const ext = extension(nombreArchivo);
  if (EXT_IMAGEN.has(ext) || pareceImagen(buffer)) {
    throw new ErrorArchivo(`"${nombreArchivo}" es una imagen o un PDF. Necesitamos el archivo de Excel o CSV, no una foto: el producto tiene que poder leer los códigos y las cantidades.`);
  }
  if (!buffer.length) throw new ErrorArchivo(`"${nombreArchivo}" está vacío.`);

  // Un texto plano va por el lector propio aunque se llame .xls (hay programas que guardan así un
  // texto separado por tabuladores): el de Excel leería "05/01/2026" como 1 de mayo.
  if (EXT_TEXTO.has(ext) || (!esLibroBinario(buffer) && !esMarcado(buffer))) {
    const filas = parsearCSV(decodificarTexto(buffer));
    return [{ archivo: nombreArchivo, hoja: null, filas, primeraFila: 1 }];
  }

  let libro;
  try {
    libro = XLSX.read(buffer, { type: 'buffer', cellDates: true, UTC: true, dense: true });
  } catch {
    throw new ErrorArchivo(`No pudimos abrir "${nombreArchivo}". Revisa que sea un Excel (.xlsx o .xls) o un CSV, y que no tenga contraseña.`);
  }
  const hojas = [];
  for (const nombreHoja of libro.SheetNames) {
    const ws = libro.Sheets[nombreHoja];
    if (!ws) continue;
    ajustarRango(ws);
    if (!ws['!ref']) continue;
    const rango = XLSX.utils.decode_range(ws['!ref']);
    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true, UTC: true });
    const limpias = filas.map((f) => f.map((c) => (typeof c === 'string' ? (c.trim() === '' ? null : c.trim()) : c)));
    // Las columnas arrancan donde arranca el rango de la hoja.
    hojas.push({ archivo: nombreArchivo, hoja: nombreHoja, filas: limpias, primeraFila: rango.s.r + 1, primeraColumna: rango.s.c });
  }
  return hojas;
}

// Algunos programas (un "Movimiento de productos" de Siigo, por ejemplo) declaran la hoja como
// A1:A3935 aunque traen datos de la A a la N, y el lector solo veía la columna A. El rango se
// recalcula con las celdas que de verdad hay (la hoja se lee con dense: true).
function ajustarRango(ws) {
  const datos = ws['!data'];
  if (!Array.isArray(datos)) return;
  let ultimaFila = -1;
  let ultimaColumna = -1;
  datos.forEach((fila, r) => {
    if (!fila) return;
    fila.forEach((celda, c) => {
      if (celda && celda.v !== undefined && celda.v !== null && celda.v !== '') {
        if (r > ultimaFila) ultimaFila = r;
        if (c > ultimaColumna) ultimaColumna = c;
      }
    });
  });
  if (ultimaFila < 0) return;
  const actual = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
  if (ultimaFila <= actual.e.r && ultimaColumna <= actual.e.c) return;
  actual.e.r = Math.max(actual.e.r, ultimaFila);
  actual.e.c = Math.max(actual.e.c, ultimaColumna);
  ws['!ref'] = XLSX.utils.encode_range(actual);
}

// HTML o XML (un "Excel" que en realidad es una página web o un XML de Excel 2003).
function esMarcado(buf) {
  const inicio = buf.subarray(0, 1024);
  const texto = inicio[0] === 0xff && inicio[1] === 0xfe ? new TextDecoder('utf-16le').decode(inicio.subarray(2)) : inicio.toString('latin1');
  return /^(\xef\xbb\xbf)?\s*</.test(texto); // con o sin la marca de UTF-8 al comienzo
}

function esLibroBinario(buf) {
  const h = buf.subarray(0, 4).toString('hex');
  return h === '504b0304' || h === 'd0cf11e0'; // zip (xlsx/ods) u OLE (xls)
}

// --- Encabezados y columnas -----------------------------------------------------

function letraColumna(hoja, i) {
  return XLSX.utils.encode_col((hoja.primeraColumna || 0) + i);
}

function filaVacia(f) {
  return !f || f.every((c) => c === null || c === undefined || c === '');
}

// Busca entre las primeras filas la que más se parece a una fila de encabezados.
function buscarEncabezado(hoja, campos) {
  let mejor = { indice: -1, puntaje: 0 };
  const limite = Math.min(hoja.filas.length, 40);
  for (let i = 0; i < limite; i++) {
    const f = hoja.filas[i];
    if (filaVacia(f)) continue;
    const encontrados = new Set();
    for (const c of f) for (const m of camposDeEncabezado(c)) if (campos.includes(m.campo)) encontrados.add(m.campo);
    if (encontrados.size > mejor.puntaje) mejor = { indice: i, puntaje: encontrados.size };
  }
  if (mejor.indice === -1) mejor.indice = hoja.filas.findIndex((f) => !filaVacia(f));
  return mejor.indice;
}

// Asigna a cada campo la columna que mejor le sirve (cada columna, un solo campo).
function detectarColumnas(encabezados, campos) {
  const candidatos = [];
  const vecinos = new Set(encabezados.map((e) => normalizarEncabezado(e)));
  encabezados.forEach((texto, col) => {
    for (const m of camposDeEncabezado(texto, vecinos)) {
      if (campos.includes(m.campo)) candidatos.push({ ...m, col });
    }
  });
  candidatos.sort((a, b) => a.prioridad - b.prioridad || campos.indexOf(a.campo) - campos.indexOf(b.campo) || a.col - b.col);
  const asignado = {};
  const usadas = new Set();
  for (const c of candidatos) {
    if (asignado[c.campo] !== undefined || usadas.has(c.col)) continue;
    asignado[c.campo] = c.col;
    usadas.add(c.col);
  }
  return asignado;
}

// Informes "anchos": una columna por mes (Ene-2025, Feb-2025, ...).
function columnasDeMes(encabezados, excluir) {
  const cols = [];
  encabezados.forEach((texto, col) => {
    if (excluir.has(col) || texto === null || texto === undefined) return;
    if (typeof texto === 'number' && !(texto >= 199001 && texto <= 210012) && !(texto > 32000 && texto < 75000)) return;
    const f = V.leerFecha(texto);
    if (f) cols.push({ col, dia: f.dia, mensual: f.mensual || new Date(f.dia * V.MS_DIA).getUTCDate() === 1 });
  });
  return cols.length >= 2 ? cols : [];
}

function firmaEncabezados(encabezados) {
  return encabezados.map((e) => normalizarEncabezado(e)).join('|');
}

function claveHoja(indiceArchivo, hoja) {
  return `${indiceArchivo}:${hoja.hoja === null ? '' : hoja.hoja}`;
}

function nombreHoja(hoja, varias) {
  if (hoja.hoja === null) return `el archivo "${hoja.archivo}"`;
  return varias ? `la hoja "${hoja.hoja}" de "${hoja.archivo}"` : `la hoja "${hoja.hoja}"`;
}

// Prepara la hoja: fila de encabezados, columnas detectadas (o las que eligió el usuario).
function analizarHoja(hoja, campos, mapeo) {
  const iEnc = buscarEncabezado(hoja, campos);
  const encabezados = iEnc >= 0 ? hoja.filas[iEnc].map((c) => (c instanceof Date ? V.textoDia(Math.round(c.getTime() / V.MS_DIA)) : c)) : [];
  const brutos = iEnc >= 0 ? hoja.filas[iEnc] : [];
  let columnas = detectarColumnas(encabezados, campos);
  const firma = firmaEncabezados(encabezados);
  const manual = mapeo && (mapeo.porClave || mapeo.porFirma && mapeo.porFirma[firma]);
  if (manual) {
    columnas = {};
    for (const campo of campos) {
      const v = manual[campo];
      if (Number.isInteger(v) && v >= 0 && v < encabezados.length) columnas[campo] = v;
    }
  }
  if (!manual && iEnc >= 0) columnas = realinearColumnas(hoja, iEnc, columnas, firma);
  const usadas = new Set(Object.values(columnas));
  const meses = campos.includes('fecha') && columnas.fecha === undefined ? columnasDeMes(brutos, usadas) : [];
  let codigoEnNombre = false;
  if (columnas.codigo === undefined && columnas.nombre !== undefined) {
    const nombres = valoresDe(filasDeMuestra(hoja, iEnc + 1, firma), columnas.nombre);
    const parte = (fn) => nombres.length >= 3 && nombres.filter(fn).length / nombres.length >= 0.6;
    if (parte((v) => /^[A-Za-z0-9._/-]{1,20}$/.test(String(v).trim()))) {
      // Una columna "Producto" con valores como "TV123" trae códigos, no nombres (así exporta World Office).
      columnas = { ...columnas, codigo: columnas.nombre };
      delete columnas.nombre;
    } else {
      codigoEnNombre = parte((v) => RE_CODIGO_EN_NOMBRE.test(String(v)));
    }
  }
  return { iEnc, encabezados, columnas, meses, firma, manual: Boolean(manual), codigoEnNombre };
}

function describirColumna(hoja, analisis, col) {
  const t = analisis.encabezados[col];
  return `columna ${letraColumna(hoja, col)}${t ? ` (${t})` : ''}`;
}

function resumenParaMapeo(indiceArchivo, hoja, analisis, campos) {
  return {
    clave: claveHoja(indiceArchivo, hoja),
    archivo: hoja.archivo,
    hoja: hoja.hoja,
    firma: analisis.firma,
    filaEncabezados: analisis.iEnc >= 0 ? hoja.primeraFila + analisis.iEnc : null,
    encabezados: analisis.encabezados.map((t, i) => ({ indice: i, letra: letraColumna(hoja, i), texto: t === null || t === undefined ? '' : String(t) })),
    columnas: Object.fromEntries(campos.map((c) => [c, analisis.columnas[c] ?? null])),
    sugeridas: sugerirPorContenido(hoja, analisis, campos),
    mensual: analisis.meses.length > 0,
  };
}

// --- Problemas por fila ----------------------------------------------------------

function esFilaDeTotal(f) {
  return f.some((c) => typeof c === 'string' && /^(sub)?total(es)?\b|^gran total\b/.test(normalizarEncabezado(c)));
}

function textoValor(v) {
  if (v instanceof Date) return V.textoDia(Math.round(v.getTime() / V.MS_DIA));
  return String(v).slice(0, 40);
}

function mensajeProblema(p) {
  const donde = p.donde ? `${p.donde}: ` : '';
  const pre = `${donde}la fila ${p.fila}`;
  switch (p.tipo) {
    case 'sin_codigo': return `${capital(pre)} no tiene código de producto.`;
    case 'fecha': return `${capital(pre)} tiene una fecha que no entendemos ("${p.valor}", ${p.columna}). Usa el formato día/mes/año, por ejemplo 15/01/2026.`;
    case 'sin_fecha': return `${capital(pre)} no tiene fecha.`;
    case 'cantidad': return `${capital(pre)} tiene una cantidad que no es un número ("${p.valor}", ${p.columna}).`;
    case 'sin_cantidad': return `${capital(pre)} no tiene cantidad.`;
    case 'existencias': return `${capital(pre)} tiene existencias que no son un número ("${p.valor}", ${p.columna}).`;
    default: return `${capital(pre)} tiene un problema.`;
  }
}

function capital(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function resumirProblemas(problemas) {
  const lista = problemas.slice(0, MAX_PROBLEMAS_MOSTRADOS).map(mensajeProblema);
  if (problemas.length > MAX_PROBLEMAS_MOSTRADOS) {
    lista.push(`…y ${problemas.length - MAX_PROBLEMAS_MOSTRADOS} filas más con problemas parecidos.`);
  }
  return lista;
}

function muestraColumna(filas, desde, col, max = 3000) {
  const out = [];
  for (let i = desde; i < filas.length && out.length < max; i++) {
    const v = filas[i] && filas[i][col];
    if (typeof v === 'string') out.push(v);
  }
  return out;
}

// --- Export de ventas y existencias -----------------------------------------------

// costo, costoTotal y proveedor son opcionales: si vienen, el panel muestra el dinero en
// inventario y agrupa el pedido por proveedor. Su falta nunca impide leer el archivo.
const CAMPOS_EXPORT = ['codigo', 'nombre', 'fecha', 'cantidad', 'existencias', 'entrada', 'documento', 'costo', 'costoTotal', 'proveedor'];

// --- Informes "de impresora" y otros formatos difíciles -------------------------------

const RE_PAGINA = /p[aá]gina\s+\d+\s+de\s+\d+/i;
const RE_CODIGO_EN_NOMBRE = /\(([^()]{2,30})\)\s*$/; // «TORNILLO HEX 1/4 (AB-100)»
// Documentos que casi siempre son ventas: se dejan marcados al preguntar.
// RM y REM: remisión de venta (en Siigo saca la mercancía antes de la factura).
// En un kardex, la fila de un producto sin movimientos en el periodo trae su saldo, sin fecha ni
// documento. No es una venta ni un tipo de documento que haya que preguntar.
const esFilaDeSaldoSinMovimiento = (f, c) =>
  c.documento !== undefined && c.fecha !== undefined && prefijoDocumento(f[c.documento]) === '(vacío)' && (f[c.fecha] === null || f[c.fecha] === undefined || f[c.fecha] === '');

// Devoluciones de clientes: se restan de las ventas (NC: nota crédito de venta).
const RE_DOC_DEVOLUCION = /^(NC|NCV|NCE|DV|DEV|DEVOLUCION|DEVOLUCIONES)$/;

// Lo que el usuario marcó: una lista (versión anterior: solo ventas) o { ventas, devoluciones }.
function eleccionDocumentos(x) {
  if (!x) return null;
  if (Array.isArray(x)) return { ventas: new Set(x), devoluciones: new Set() };
  return { ventas: new Set(x.ventas || []), devoluciones: new Set(x.devoluciones || []) };
}

const RE_DOC_VENTA = /^(FV|FE|FED|FVE|FAC|FACT|FACTURA|POS|VTA|VEN|VENTA|VENTAS|SALIDA|SALIDAS|RM|REM)$/;

function celdasLlenas(f) {
  return f.filter((c) => c !== null && c !== undefined && String(c).trim() !== '').length;
}

function soloNumeros(f) {
  const llenas = f.filter((c) => c !== null && c !== undefined && String(c).trim() !== '');
  return llenas.length > 0 && llenas.every((c) => typeof c === 'number' || /^[\s$\d.,()-]+$/.test(String(c)));
}

// Encabezados de página repetidos, "Página 3 de 53" y la fila de títulos repetida en cada página.
function esFilaDeRuido(f, firma) {
  if (f.some((c) => typeof c === 'string' && RE_PAGINA.test(c))) return true;
  return Boolean(firma) && celdasLlenas(f) >= 2 && firmaEncabezados(f) === firma;
}

// Filas que no son datos: totales, subtotales (solo números) y títulos sueltos sin código.
// Encabezado de grupo de un kardex: "Código producto: 31010002 Codo de cobre…", con los totales
// del producto en la misma fila (Movimiento de productos de Siigo Nube).
const RE_FILA_DE_GRUPO = /^c[oó]d(igo|\.)?(\s+(de\s+)?(producto|art[ií]culo|item|[ií]tem|referencia))?\s*:/i;

function esFilaQueSeSalta(f, codigo) {
  if (esFilaDeTotal(f) && (!codigo || /total/i.test(codigo))) return true;
  if (RE_FILA_DE_GRUPO.test(codigo)) return true;
  return !codigo && (celdasLlenas(f) <= 2 || soloNumeros(f));
}

function codigoYNombre(f, analisis) {
  const c = analisis.columnas;
  const nombre = c.nombre !== undefined && f[c.nombre] !== null && f[c.nombre] !== undefined ? String(f[c.nombre]).trim() : '';
  if (c.codigo !== undefined) return { codigo: V.textoCodigo(f[c.codigo]), nombre };
  if (!analisis.codigoEnNombre) return { codigo: '', nombre };
  const m = RE_CODIGO_EN_NOMBRE.exec(nombre);
  return m ? { codigo: V.textoCodigo(m[1]), nombre: nombre.slice(0, m.index).trim() } : { codigo: '', nombre };
}

// "FED 137529" → FED · "FV-1-1000" → FV · "Salida por venta" → SALIDA
function prefijoDocumento(v) {
  if (v === null || v === undefined) return '(vacío)';
  const m = /^[\s]*([A-Za-zÁÉÍÓÚÑáéíóúñ]+)/.exec(String(v));
  return m ? m[1].toUpperCase() : '(sin letras)';
}

/**
 * Algunos programas exportan la fecha con el año cortado por el ancho de la columna
 * ("01/MAR/202"). Como esos informes van en orden de fecha, el año se completa con el de la
 * última fecha completa de la misma columna (o el siguiente, si el mes ya dio la vuelta).
 */
function fechaConAnioCortado(v, ultimo, orden) {
  if (typeof v !== 'string' || !ultimo) return null;
  const m = /^(\s*\d{1,2}[/.-][A-Za-z]{3,}[/.-]|\s*\d{1,2}[/.-]\d{1,2}[/.-])(\d{1,3})\s*$/.exec(v);
  if (!m) return null;
  const anio = new Date(ultimo * V.MS_DIA).getUTCFullYear();
  for (const candidato of [anio, anio + 1]) {
    if (!String(candidato).startsWith(m[2])) continue;
    const fecha = V.leerFecha(m[1] + candidato, orden);
    if (fecha && fecha.dia >= ultimo - 31) return fecha;
  }
  return null;
}

function filasDeMuestra(hoja, desde, firma, max = 80) {
  const out = [];
  // Una fila con muy pocas celdas suele ser un título suelto, salvo que la tabla misma tenga pocas columnas.
  const minimo = Math.min(3, Math.max(1, celdasLlenas(hoja.filas[desde - 1] || [])));
  for (let i = desde; i < hoja.filas.length && out.length < max; i++) {
    const f = hoja.filas[i];
    if (filaVacia(f) || esFilaDeRuido(f, firma) || esFilaDeTotal(f) || celdasLlenas(f) < minimo) continue;
    out.push(f);
  }
  return out;
}

function valoresDe(filas, col) {
  return filas.map((f) => f[col]).filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
}

// ¿Los valores de una columna parecen de este campo?
function pareceDelCampo(campo, valores) {
  if (!valores.length) return false;
  const frac = (fn) => valores.filter(fn).length / valores.length;
  const esNumero = (v) => typeof v === 'number' || V.leerNumero(String(v), V.inferirDecimal([String(v)])) !== null;
  const esFecha = (v) => v instanceof Date || V.leerFecha(v) !== null;
  switch (campo) {
    case 'fecha': return frac(esFecha) >= 0.6;
    case 'cantidad':
    case 'entrada':
    case 'existencias':
    case 'costo':
    case 'costoTotal': return frac((v) => esNumero(v) && !(v instanceof Date)) >= 0.8;
    case 'proveedor': return frac((v) => typeof v === 'string' && /[a-záéíóúñ]{3}/i.test(v)) >= 0.6;
    case 'nombre': return frac((v) => typeof v === 'string' && /[a-záéíóúñ]{3}/i.test(v)) >= 0.6;
    case 'documento': return frac((v) => typeof v === 'string' && /[a-zñ]/i.test(v)) >= 0.6;
    default: return frac((v) => !(v instanceof Date)) >= 0.6; // código: cualquier texto o número
  }
}

/**
 * En los informes armados como página de impresión, el título de una columna no cae encima de
 * sus datos (por ejemplo, "CANTIDAD" en la columna M y los números en la N). Si una columna
 * reconocida está casi vacía, se toma la vecina más cercana (hasta 4 columnas) cuyos datos sí
 * parecen de ese campo.
 */
function realinearColumnas(hoja, iEnc, columnas, firma) {
  const muestra = filasDeMuestra(hoja, iEnc + 1, firma);
  if (muestra.length < 3) return columnas;
  const lleno = (col) => valoresDe(muestra, col).length / muestra.length;
  const out = { ...columnas };
  const usadas = new Set(Object.values(out).filter((col) => lleno(col) >= 0.3));
  for (const [campo, col] of Object.entries(columnas)) {
    if (lleno(col) >= 0.3) continue;
    for (let dist = 1; dist <= 4; dist++) {
      const opcion = [col - dist, col + dist].find((c) => c >= 0 && !usadas.has(c) && lleno(c) >= 0.5 && pareceDelCampo(campo, valoresDe(muestra, c)));
      if (opcion !== undefined) { out[campo] = opcion; usadas.add(opcion); break; }
    }
  }
  return out;
}

// Los informes de totales casi siempre dicen su periodo en el título ("Del 01/ENE/2026 al
// 30/SEP/2026", "Periodo: 2025-10-01 - 2026-09-30"). Se busca en las primeras filas para
// proponerlo al preguntar; el usuario lo confirma.
const RE_FECHA_TITULO = /\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-](?:\d{1,2}|[A-Za-zÁÉÍÓÚáéíóú]{3,})[/.-]\d{2,4}/g;
function periodoDelTitulo(hojas) {
  for (const hoja of hojas) {
    for (const fila of hoja.filas.slice(0, 12)) {
      const textoFila = fila.filter((c) => typeof c === 'string').join(' ');
      const dias = (textoFila.match(RE_FECHA_TITULO) || []).map((t) => V.leerFecha(t)).filter(Boolean).map((f) => f.dia);
      if (dias.length >= 2) {
        const desde = Math.min(...dias);
        const hasta = Math.max(...dias);
        if (hasta - desde >= 6) return { desde: V.textoDia(desde), hasta: V.textoDia(hasta) };
      }
    }
  }
  return null;
}

// Para el formulario de columnas: lo que parece cada columna por su contenido.
function sugerirPorContenido(hoja, analisis, campos) {
  const muestra = filasDeMuestra(hoja, analisis.iEnc + 1, analisis.firma, 60);
  const sugeridas = {};
  if (muestra.length < 3) return sugeridas;
  const usadas = new Set(Object.values(analisis.columnas));
  const ancho = Math.max(...muestra.map((f) => f.length));
  const libres = () => Array.from({ length: ancho }, (_, i) => i).filter((i) => !usadas.has(i) && valoresDe(muestra, i).length / muestra.length >= 0.5);
  const tomar = (campo, criterio) => {
    if (!campos.includes(campo) || analisis.columnas[campo] !== undefined) return;
    const col = libres().filter((i) => pareceDelCampo(campo, valoresDe(muestra, i))).sort(criterio)[0];
    if (col !== undefined) { sugeridas[campo] = col; usadas.add(col); }
  };
  const largo = (i) => valoresDe(muestra, i).reduce((s, v) => s + String(v).length, 0) / Math.max(valoresDe(muestra, i).length, 1);
  tomar('fecha', (a, b) => a - b);
  tomar('nombre', (a, b) => largo(b) - largo(a)); // el texto más largo
  tomar('codigo', (a, b) => largo(a) - largo(b)); // el texto corto que queda
  tomar('cantidad', (a, b) => a - b);
  tomar('existencias', (a, b) => a - b);
  return sugeridas;
}


/**
 * archivos: [{ nombre, buffer }]
 * mapeo: { porClave: { "0:Ventas": {codigo: 0, ...} }, porFirma: { firma: {...} } }
 * Devuelve { ok: true, ventas, existencias, mensual, periodo, hojasUsadas, avisos }
 *
 * opciones.periodo = { desde, hasta } ("YYYY-MM-DD"): para los informes que traen el total
 * vendido de cada producto en un periodo, sin una fecha por venta (por ejemplo, "Ventas por
 * ítems" de Alegra o el listado de inventario con la casilla de salidas). Si el archivo es así
 * y no viene el periodo, se devuelve { ok: false, necesitaPeriodo: true } para preguntarlo.
 *       o  { ok: false, errores, hojas } (hojas sirve para que el usuario elija columnas)
 */
function leerExport(archivos, mapeo = {}, opciones = {}) {
  const errores = [];
  const avisos = [];
  const hojasLeidas = [];
  archivos.forEach((a, i) => {
    try {
      for (const h of abrirArchivo(a.buffer, a.nombre)) hojasLeidas.push({ indiceArchivo: i, hoja: h });
    } catch (e) {
      if (e instanceof ErrorArchivo) errores.push(e.message); else throw e;
    }
  });
  if (errores.length) return { ok: false, errores, hojas: [] };

  const conDatos = hojasLeidas.filter(({ hoja }) => !esHojaDeAyuda(hoja) && hoja.filas.some((f) => !filaVacia(f)));
  if (!conDatos.length) return { ok: false, errores: ['El archivo no tiene datos.'], hojas: [] };
  const varias = conDatos.length > 1;

  const analizadas = conDatos.map(({ indiceArchivo, hoja }) => {
    const clave = claveHoja(indiceArchivo, hoja);
    const manual = mapeo.porClave && mapeo.porClave[clave];
    const analisis = analizarHoja(hoja, CAMPOS_EXPORT, manual ? { porClave: manual } : { porFirma: mapeo.porFirma });
    const c = analisis.columnas;
    const tieneCodigo = c.codigo !== undefined || analisis.codigoEnNombre;
    const esVentas = tieneCodigo && ((c.fecha !== undefined && c.cantidad !== undefined) || analisis.meses.length >= 2);
    const esExistencias = tieneCodigo && c.existencias !== undefined;
    // Código y cantidad sin ninguna fecha: es el total vendido de un periodo.
    const esVentasPeriodo = tieneCodigo && !esVentas && c.cantidad !== undefined;
    return { indiceArchivo, hoja, clave, analisis, esVentas, esExistencias, esVentasPeriodo };
  });

  let hojasVentas = analizadas.filter((h) => h.esVentas);
  // Solo si no hay ventas con fecha: un archivo de existencias con una columna "Cantidad"
  // no debe confundirse con ventas cuando sí vinieron las ventas de verdad.
  const porPeriodo = hojasVentas.length ? [] : analizadas.filter((h) => h.esVentasPeriodo);
  if (porPeriodo.length) hojasVentas = porPeriodo;
  const soloExistencias = analizadas.filter((h) => h.esExistencias && !h.esVentas);
  const hojasExistencias = soloExistencias.length ? soloExistencias : analizadas.filter((h) => h.esExistencias);
  const resumenHojas = analizadas.map((h) => resumenParaMapeo(h.indiceArchivo, h.hoja, h.analisis, CAMPOS_EXPORT));

  if (!hojasVentas.length || !hojasExistencias.length) {
    return { ok: false, errores: explicarFaltantes(analizadas, hojasVentas.length > 0, hojasExistencias.length > 0, varias), hojas: resumenHojas };
  }
  // Informes que mezclan compras, ventas y ajustes: el usuario marca cuáles son ventas.
  const documentosElegidos = new Map(); // clave de hoja → { ventas: Set, devoluciones: Set }
  for (const h of hojasVentas) {
    const c = h.analisis.columnas;
    if (c.documento === undefined) continue;
    const conteo = new Map();
    for (let i = h.analisis.iEnc + 1; i < h.hoja.filas.length; i++) {
      const fila = h.hoja.filas[i];
      if (filaVacia(fila) || esFilaDeRuido(fila, h.analisis.firma)) continue;
      const { codigo } = codigoYNombre(fila, h.analisis);
      if (esFilaQueSeSalta(fila, codigo) || esFilaDeSaldoSinMovimiento(fila, c)) continue;
      const p = prefijoDocumento(fila[c.documento]);
      const e = conteo.get(p) || { prefijo: p, filas: 0, ejemplo: String(fila[c.documento] ?? '').trim().slice(0, 30) };
      e.filas++;
      conteo.set(p, e);
    }
    if (conteo.size < 2) continue;
    // Una elección recordada de antes de las devoluciones (solo la lista de ventas) se vuelve a
    // preguntar si el archivo trae algo que parece devolución; la de este mismo archivo se respeta.
    let recordada = opciones.documentosPorFirma && opciones.documentosPorFirma[h.analisis.firma];
    if (Array.isArray(recordada) && [...conteo.keys()].some((p) => RE_DOC_DEVOLUCION.test(p) && !recordada.includes(p))) recordada = null;
    const elegidos = opciones.documentos || recordada;
    if (!elegidos) {
      return {
        ok: false,
        necesitaDocumentos: true,
        documentos: [...conteo.values()].sort((a, b) => b.filas - a.filas).map((e) => ({ ...e, sugerido: RE_DOC_VENTA.test(e.prefijo), devolucion: RE_DOC_DEVOLUCION.test(e.prefijo) })),
        errores: ['Tu archivo trae varios tipos de documento (por ejemplo, compras y ventas). Marca cuáles son ventas y cuáles devoluciones de clientes.'],
        hojas: resumenHojas,
      };
    }
    documentosElegidos.set(h.clave, eleccionDocumentos(elegidos));
  }

  let periodo = null;
  if (porPeriodo.length) {
    if (!opciones.periodo) {
      return {
        ok: false,
        necesitaPeriodo: true,
        periodoSugerido: periodoDelTitulo(porPeriodo.map((h) => h.hoja)),
        errores: ['Tu archivo trae el total vendido de cada producto, pero no la fecha de cada venta. Dinos de qué fecha a qué fecha son esas ventas.'],
        hojas: resumenHojas,
      };
    }
    const dia = (t) => V.diaDe(...t.split('-').map(Number));
    periodo = { desde: dia(opciones.periodo.desde), hasta: dia(opciones.periodo.hasta) };
    avisos.push(`Tu archivo trae el total vendido de cada producto del ${opciones.periodo.desde} al ${opciones.periodo.hasta}, sin la fecha de cada venta.`);
  }

  // Ventas
  const ventas = [];
  const problemas = [];
  let filasDatos = 0;
  let filasTotal = 0;
  let todasMensuales = true;
  let filasOtrosDocumentos = 0;
  let fechasCompletadas = 0;
  let unidadesDevueltas = 0;
  const existenciasDeVentas = new Map(); // si la misma tabla trae ventas y existencias
  // Costo y proveedor de cada producto, si el archivo los trae (gana la última fila con dato).
  const catalogo = new Map();
  const anotarCatalogo = (codigo, f, c, decimal, existenciasFila = null) => {
    if (c.costo === undefined && c.costoTotal === undefined && c.proveedor === undefined) return;
    const clave = V.claveCodigo(codigo);
    const e = catalogo.get(clave) || {};
    if (c.costo !== undefined) {
      const v = V.leerNumero(f[c.costo], decimal);
      if (v !== null && v > 0) e.costo = v;
    }
    if (c.costoTotal !== undefined && e.costo === undefined && existenciasFila > 0) {
      const v = V.leerNumero(f[c.costoTotal], decimal);
      if (v !== null && v > 0) e.costo = v / existenciasFila;
    }
    if (c.proveedor !== undefined && f[c.proveedor] !== null && f[c.proveedor] !== undefined) {
      const t = String(f[c.proveedor]).replace(/\s+/g, ' ').trim().slice(0, 80);
      if (t) e.proveedor = t;
    }
    catalogo.set(clave, e);
  };
  for (const h of hojasVentas) {
    const { hoja, analisis } = h;
    const c = analisis.columnas;
    const donde = varias ? capital(nombreHoja(hoja, true)) : '';
    const desde = analisis.iEnc + 1;
    const decimal = V.inferirDecimal(muestraColumna(hoja.filas, desde, c.cantidad ?? analisis.meses[0]?.col));
    const orden = c.fecha !== undefined ? V.inferirOrdenFecha(muestraColumna(hoja.filas, desde, c.fecha)) : 'dm';
    const decimalExist = c.existencias !== undefined ? V.inferirDecimal(muestraColumna(hoja.filas, desde, c.existencias)) : 'coma';
    let ultimaFecha = null;
    const decimalCosto = V.inferirDecimal(muestraColumna(hoja.filas, desde, c.costo ?? c.costoTotal));
    // Si la misma tabla trae el saldo, se queda el de la fila más reciente de cada producto.
    const anotarSaldo = (codigo, nombre, f, dia) => {
      if (!h.esExistencias || soloExistencias.length) return;
      const e = V.leerNumero(f[c.existencias], decimalExist);
      const clave = V.claveCodigo(codigo);
      const prev = existenciasDeVentas.get(clave);
      if (e !== null && (!prev || dia >= prev.dia)) existenciasDeVentas.set(clave, { codigo, nombre, existencias: e, dia });
    };
    for (let i = desde; i < hoja.filas.length; i++) {
      const f = hoja.filas[i];
      if (filaVacia(f)) continue;
      const fila = hoja.primeraFila + i;
      if (esFilaDeRuido(f, analisis.firma)) continue;
      const { codigo, nombre } = codigoYNombre(f, analisis);
      if (esFilaQueSeSalta(f, codigo)) { filasTotal++; continue; }
      if (codigo && esFilaDeSaldoSinMovimiento(f, c)) {
        anotarSaldo(codigo, nombre, f, -Infinity); // cualquier movimiento con fecha gana
        continue;
      }
      const docs = documentosElegidos.get(h.clave);
      const prefijo = docs ? prefijoDocumento(f[c.documento]) : null;
      const esDevolucion = Boolean(docs && docs.devoluciones.has(prefijo));
      if (docs && !docs.ventas.has(prefijo) && !esDevolucion) {
        // No es una venta, pero su saldo sí cuenta: en un kardex, el saldo de hoy es el del último
        // movimiento, sea una venta, una compra o un ajuste.
        filasOtrosDocumentos++;
        if (codigo && c.fecha !== undefined) {
          const fechaOtro = V.leerFecha(f[c.fecha], orden) || fechaConAnioCortado(f[c.fecha], ultimaFecha, orden);
          if (fechaOtro) anotarSaldo(codigo, nombre, f, fechaOtro.dia);
        }
        continue;
      }
      filasDatos++;
      if (!codigo) { problemas.push({ tipo: 'sin_codigo', fila, donde }); continue; }
      anotarCatalogo(codigo, f, c, decimalCosto, c.existencias !== undefined ? V.leerNumero(f[c.existencias], decimalExist) : null);
      const cantidadDe = (bruto) => {
        const n = V.leerNumero(bruto, decimal);
        if (n === null || !esDevolucion) return n;
        const entro = c.entrada !== undefined ? V.leerNumero(f[c.entrada], decimal) : null;
        const devuelto = Math.abs(entro || n || 0);
        unidadesDevueltas += devuelto;
        return -devuelto;
      };
      if (periodo) {
        const bruto = f[c.cantidad];
        if (bruto === null || bruto === undefined) continue; // sin ventas en el periodo
        const cantidad = cantidadDe(bruto);
        if (cantidad === null) { problemas.push({ tipo: 'cantidad', fila, donde, valor: textoValor(bruto), columna: describirColumna(hoja, analisis, c.cantidad) }); continue; }
        if (cantidad !== 0) ventas.push({ codigo, nombre, dia: periodo.hasta, cantidad });
        todasMensuales = false;
        continue;
      }
      if (analisis.meses.length) {
        for (const m of analisis.meses) {
          const bruto = f[m.col];
          if (bruto === null || bruto === undefined) continue;
          const cantidad = cantidadDe(bruto);
          if (cantidad === null) { problemas.push({ tipo: 'cantidad', fila, donde, valor: textoValor(bruto), columna: describirColumna(hoja, analisis, m.col) }); continue; }
          if (cantidad !== 0) ventas.push({ codigo, nombre, dia: m.dia, cantidad });
          if (!m.mensual) todasMensuales = false;
        }
        if (h.esExistencias && !soloExistencias.length) {
          const e = V.leerNumero(f[c.existencias], decimalExist);
          if (e !== null) existenciasDeVentas.set(V.claveCodigo(codigo), { codigo, nombre, existencias: e, dia: Infinity });
        }
        continue;
      }
      const brutoFecha = f[c.fecha];
      if (brutoFecha === null || brutoFecha === undefined) { problemas.push({ tipo: 'sin_fecha', fila, donde }); continue; }
      let fecha = V.leerFecha(brutoFecha, orden);
      if (!fecha) {
        fecha = fechaConAnioCortado(brutoFecha, ultimaFecha, orden);
        if (fecha) fechasCompletadas++;
      }
      if (!fecha) { problemas.push({ tipo: 'fecha', fila, donde, valor: textoValor(brutoFecha), columna: describirColumna(hoja, analisis, c.fecha) }); continue; }
      ultimaFecha = fecha.dia;
      const brutoCant = f[c.cantidad];
      if ((brutoCant === null || brutoCant === undefined) && !(esDevolucion && c.entrada !== undefined)) { problemas.push({ tipo: 'sin_cantidad', fila, donde }); continue; }
      const cantidad = cantidadDe(brutoCant ?? 0);
      if (cantidad === null) { problemas.push({ tipo: 'cantidad', fila, donde, valor: textoValor(brutoCant), columna: describirColumna(hoja, analisis, c.cantidad) }); continue; }
      if (!fecha.mensual) todasMensuales = false;
      if (cantidad !== 0) ventas.push({ codigo, nombre, dia: fecha.dia, cantidad });
      anotarSaldo(codigo, nombre, f, fecha.dia);
    }
  }

  // Existencias
  const existencias = [];
  let existenciasEnBlanco = 0;
  if (soloExistencias.length) {
    for (const h of hojasExistencias) {
      const { hoja, analisis } = h;
      const c = analisis.columnas;
      const donde = varias ? capital(nombreHoja(hoja, true)) : '';
      const desde = analisis.iEnc + 1;
      const decimal = V.inferirDecimal(muestraColumna(hoja.filas, desde, c.existencias));
      const decimalCosto = V.inferirDecimal(muestraColumna(hoja.filas, desde, c.costo ?? c.costoTotal));
      for (let i = desde; i < hoja.filas.length; i++) {
        const f = hoja.filas[i];
        if (filaVacia(f)) continue;
        const fila = hoja.primeraFila + i;
        if (esFilaDeRuido(f, analisis.firma)) continue;
        const { codigo, nombre } = codigoYNombre(f, analisis);
        if (esFilaQueSeSalta(f, codigo)) { filasTotal++; continue; }
        filasDatos++;
        if (!codigo) { problemas.push({ tipo: 'sin_codigo', fila, donde }); continue; }
        const bruto = f[c.existencias];
        let valor = 0;
        if (bruto === null || bruto === undefined) existenciasEnBlanco++;
        else {
          valor = V.leerNumero(bruto, decimal);
          if (valor === null) { problemas.push({ tipo: 'existencias', fila, donde, valor: textoValor(bruto), columna: describirColumna(hoja, analisis, c.existencias) }); continue; }
        }
        existencias.push({ codigo, nombre, existencias: valor });
        anotarCatalogo(codigo, f, c, decimalCosto, valor);
      }
    }
  } else {
    for (const e of existenciasDeVentas.values()) existencias.push({ codigo: e.codigo, nombre: e.nombre, existencias: e.existencias });
    avisos.push('Las existencias se tomaron de la misma tabla de ventas: para cada producto se usó el valor de su fila más reciente.');
  }

  if (!ventas.length) {
    // Solo los encabezados: casi siempre es la plantilla de SINESC subida sin llenar.
    if (!filasDatos && !problemas.length && !existencias.some((e) => e.existencias)) {
      return { ok: false, errores: [SIN_LLENAR], hojas: [] };
    }
    const errs = ['No encontramos ninguna venta que podamos leer en el archivo.'];
    if (problemas.length) errs.push(...resumirProblemas(problemas));
    return { ok: false, errores: errs, hojas: resumenHojas };
  }
  if (problemas.length > MINIMO_FILAS_CON_PROBLEMAS && problemas.length > LIMITE_FILAS_CON_PROBLEMAS * filasDatos) {
    return {
      ok: false,
      errores: [
        `Muchas filas (${problemas.length} de ${filasDatos}) no se pudieron leer. Puede que una columna no sea la que creemos; revisa las columnas abajo o corrige estas filas:`,
        ...resumirProblemas(problemas),
      ],
      hojas: resumenHojas,
    };
  }
  if (problemas.length) {
    avisos.push(`${problemas.length === 1 ? 'Una fila no se tuvo' : `${problemas.length} filas no se tuvieron`} en cuenta:`, ...resumirProblemas(problemas));
  }
  if (filasTotal) avisos.push(filasTotal === 1 ? 'Se ignoró una fila de totales o títulos.' : `Se ignoraron ${filasTotal} filas de totales o títulos.`);
  if (fechasCompletadas) avisos.push(`${fechasCompletadas} ${fechasCompletadas === 1 ? 'fecha venía' : 'fechas venían'} con el año cortado (por ejemplo, "01/MAR/202"): se completó con el año de las filas vecinas.`);
  if (filasOtrosDocumentos) avisos.push(`Se dejaron por fuera ${filasOtrosDocumentos} ${filasOtrosDocumentos === 1 ? 'fila' : 'filas'} de documentos que no son ventas.`);
  if (analizadas.some((h) => h.analisis.codigoEnNombre && (hojasVentas.includes(h) || hojasExistencias.includes(h)))) avisos.push('El código de cada producto se tomó de los paréntesis al final de su nombre.');
  if (existenciasEnBlanco) avisos.push(`${existenciasEnBlanco} ${existenciasEnBlanco === 1 ? 'producto tiene' : 'productos tienen'} la casilla de existencias vacía: se tomaron como 0.`);

  const hojasUsadas = analizadas
    .filter((h) => hojasVentas.includes(h) || hojasExistencias.includes(h))
    .map((h) => ({
      archivo: h.hoja.archivo,
      hoja: h.hoja.hoja,
      uso: hojasVentas.includes(h) && hojasExistencias.includes(h) ? 'ventas y existencias' : hojasVentas.includes(h) ? 'ventas' : 'existencias',
      columnas: Object.fromEntries(CAMPOS_EXPORT.filter((k) => h.analisis.columnas[k] !== undefined).map((k) => [k, describirColumna(h.hoja, h.analisis, h.analisis.columnas[k])])),
      porMes: h.analisis.meses.length > 0,
      firma: h.analisis.firma,
      clave: h.clave,
      manual: h.analisis.manual,
    }));

  if (unidadesDevueltas) avisos.push(`Se restaron de las ventas ${(Math.round(unidadesDevueltas * 100) / 100).toLocaleString('es-CO')} unidades que devolvieron los clientes.`);
  const documentos = documentosElegidos.size
    ? Object.fromEntries(analizadas.filter((h) => documentosElegidos.has(h.clave)).map((h) => {
      const d = documentosElegidos.get(h.clave);
      return [h.analisis.firma, { ventas: [...d.ventas], devoluciones: [...d.devoluciones] }];
    }))
    : null;
  return { ok: true, ventas, existencias, mensual: todasMensuales, periodo, documentos, catalogo: Object.fromEntries(catalogo), hojasUsadas, avisos, hojas: resumenHojas };
}

function explicarFaltantes(analizadas, hayVentas, hayExistencias, varias) {
  const errores = [];
  const faltan = (h, campos) => campos.filter((k) => h.analisis.columnas[k] === undefined && !(k === 'fecha' && h.analisis.meses.length));
  if (!hayVentas) {
    // La hoja que más se parece a ventas
    const cand = analizadas
      .map((h) => ({ h, f: faltan(h, ['codigo', 'fecha', 'cantidad']) }))
      .sort((a, b) => a.f.length - b.f.length)[0];
    if (cand && cand.f.length < 3) {
      errores.push(`Para las ventas, en ${nombreHoja(cand.h.hoja, varias)} ${cand.f.length === 1 ? 'falta la columna' : 'faltan las columnas'} de ${listaCampos(cand.f)}.`);
    } else {
      errores.push('No encontramos las ventas: falta una tabla con código de producto y cantidad vendida (con la fecha de cada venta, o el total de un periodo).');
    }
  }
  if (!hayExistencias) {
    const cand = analizadas
      .filter((h) => !h.esVentas || analizadas.length === 1)
      .map((h) => ({ h, f: faltan(h, ['codigo', 'existencias']) }))
      .sort((a, b) => a.f.length - b.f.length)[0];
    if (cand && cand.f.length === 1 && cand.f[0] === 'codigo') {
      errores.push(`Para las existencias, en ${nombreHoja(cand.h.hoja, varias)} falta la columna de código de producto.`);
    } else {
      errores.push('Falta la columna de existencias. Agrega una hoja con código y existencias, o sube también el archivo de existencias junto con el de ventas.');
    }
  }
  return errores;
}

function listaCampos(campos) {
  const nombres = campos.map((c) => CAMPOS[c].nombre);
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

// --- Lista de pedido ---------------------------------------------------------------

const CAMPOS_LISTA = ['codigo', 'nombre', 'pedir'];

/**
 * Lee la hoja con la que el usuario arma el pedido (ej. su informe de mínimos).
 * Devuelve { ok: true, lineas: [{codigo, nombre, cantidad}], omitidas, hoja, columnas }
 *       o  { ok: false, errores, hojas }
 */
function leerLista(buffer, nombreArchivo, mapeo = {}) {
  let hojas;
  try {
    hojas = abrirArchivo(buffer, nombreArchivo).filter((h) => !esHojaDeAyuda(h) && h.filas.some((f) => !filaVacia(f)));
  } catch (e) {
    if (e instanceof ErrorArchivo) return { ok: false, errores: [e.message], hojas: [] };
    throw e;
  }
  if (!hojas.length) return { ok: false, errores: ['El archivo no tiene datos.'], hojas: [] };

  const analizadas = hojas.map((hoja) => {
    const clave = claveHoja(0, hoja);
    const manual = mapeo.porClave && mapeo.porClave[clave];
    const analisis = analizarHoja(hoja, CAMPOS_LISTA, manual ? { porClave: manual } : { porFirma: mapeo.porFirma });
    return { hoja, clave, analisis };
  });
  const elegida = analizadas.find((h) => h.analisis.columnas.codigo !== undefined && h.analisis.columnas.pedir !== undefined);
  const resumenHojas = analizadas.map((h) => resumenParaMapeo(0, h.hoja, h.analisis, CAMPOS_LISTA));
  if (!elegida) {
    const h = analizadas.find((x) => x.analisis.columnas.codigo !== undefined) || analizadas[0];
    const falta = [];
    if (h.analisis.columnas.codigo === undefined) falta.push('código de producto');
    if (h.analisis.columnas.pedir === undefined) falta.push('cantidad a pedir');
    return {
      ok: false,
      errores: [`No encontramos la columna de ${falta.join(' ni la de ')} en ${nombreHoja(h.hoja, hojas.length > 1)}. Indícanos abajo cuál es.`],
      hojas: resumenHojas,
    };
  }

  const { hoja, analisis } = elegida;
  const c = analisis.columnas;
  const lineas = [];
  let omitidas = 0;
  for (let i = analisis.iEnc + 1; i < hoja.filas.length; i++) {
    const f = hoja.filas[i];
    if (filaVacia(f)) continue;
    const codigo = V.textoCodigo(f[c.codigo]);
    if (esFilaDeTotal(f) && (!codigo || /total/i.test(codigo))) continue;
    const bruto = f[c.pedir];
    const nombre = c.nombre !== undefined && f[c.nombre] !== null ? String(f[c.nombre]).trim() : '';
    if (bruto === null || bruto === undefined || bruto === 0 || bruto === '0') { if (codigo) omitidas++; continue; }
    lineas.push({ codigo, nombre, cantidad: typeof bruto === 'number' ? bruto : String(bruto), fila: hoja.primeraFila + i });
  }
  if (!lineas.length && !omitidas) return { ok: false, errores: [SIN_LLENAR], hojas: [] };
  return {
    ok: true,
    lineas,
    omitidas,
    hoja: hoja.hoja,
    columnas: Object.fromEntries(CAMPOS_LISTA.filter((k) => c[k] !== undefined).map((k) => [k, describirColumna(hoja, analisis, c[k])])),
    firma: analisis.firma,
    clave: elegida.clave,
    manual: analisis.manual,
  };
}

module.exports = {
  ErrorArchivo,
  leerExport,
  leerLista,
  parsearCSV,
  decodificarTexto,
  abrirArchivo,
  CAMPOS_EXPORT,
  CAMPOS_LISTA,
};
