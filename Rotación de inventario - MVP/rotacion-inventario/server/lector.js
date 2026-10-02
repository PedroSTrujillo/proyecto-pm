'use strict';

// Lee el export del software contable (ventas y existencias) y la lista de pedido.
// Acepta Excel (.xlsx, .xls, .ods) y texto separado por comas, punto y coma o
// tabulaciones (.csv, .txt). Busca sola la fila de encabezados, reconoce las
// columnas por sus nombres habituales y explica en palabras sencillas lo que falte.

const XLSX = require('xlsx');
const { CAMPOS, camposDeEncabezado, normalizarEncabezado } = require('./formatos');
const V = require('./valores');

const EXT_TEXTO = new Set(['csv', 'txt', 'tsv', 'prn']);
const EXT_EXCEL = new Set(['xlsx', 'xlsm', 'xls', 'xlsb', 'ods']);
const EXT_IMAGEN = new Set(['jpg', 'jpeg', 'png', 'gif', 'heic', 'heif', 'webp', 'bmp', 'tif', 'tiff', 'pdf']);
const MAX_PROBLEMAS_MOSTRADOS = 8;
// Si más del 20 % de las filas (y más de 10) no se pueden leer, lo más probable es
// que una columna esté mal reconocida: se detiene y se explica en vez de seguir.
const LIMITE_FILAS_CON_PROBLEMAS = 0.2;
const MINIMO_FILAS_CON_PROBLEMAS = 10;

class ErrorArchivo extends Error {}

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

  if (EXT_TEXTO.has(ext) || (!EXT_EXCEL.has(ext) && !esLibroBinario(buffer))) {
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
    if (!ws || !ws['!ref']) continue;
    const rango = XLSX.utils.decode_range(ws['!ref']);
    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true, UTC: true });
    const limpias = filas.map((f) => f.map((c) => (typeof c === 'string' ? (c.trim() === '' ? null : c.trim()) : c)));
    // Las columnas arrancan donde arranca el rango de la hoja.
    hojas.push({ archivo: nombreArchivo, hoja: nombreHoja, filas: limpias, primeraFila: rango.s.r + 1, primeraColumna: rango.s.c });
  }
  return hojas;
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
  encabezados.forEach((texto, col) => {
    for (const m of camposDeEncabezado(texto)) {
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
  const usadas = new Set(Object.values(columnas));
  const meses = campos.includes('fecha') && columnas.fecha === undefined ? columnasDeMes(brutos, usadas) : [];
  return { iEnc, encabezados, columnas, meses, firma, manual: Boolean(manual) };
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

const CAMPOS_EXPORT = ['codigo', 'nombre', 'fecha', 'cantidad', 'existencias'];

/**
 * archivos: [{ nombre, buffer }]
 * mapeo: { porClave: { "0:Ventas": {codigo: 0, ...} }, porFirma: { firma: {...} } }
 * Devuelve { ok: true, ventas, existencias, mensual, hojasUsadas, avisos }
 *       o  { ok: false, errores, hojas } (hojas sirve para que el usuario elija columnas)
 */
function leerExport(archivos, mapeo = {}) {
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

  const conDatos = hojasLeidas.filter(({ hoja }) => hoja.filas.some((f) => !filaVacia(f)));
  if (!conDatos.length) return { ok: false, errores: ['El archivo no tiene datos.'], hojas: [] };
  const varias = conDatos.length > 1;

  const analizadas = conDatos.map(({ indiceArchivo, hoja }) => {
    const clave = claveHoja(indiceArchivo, hoja);
    const manual = mapeo.porClave && mapeo.porClave[clave];
    const analisis = analizarHoja(hoja, CAMPOS_EXPORT, manual ? { porClave: manual } : { porFirma: mapeo.porFirma });
    const c = analisis.columnas;
    const tieneCodigo = c.codigo !== undefined;
    const esVentas = tieneCodigo && ((c.fecha !== undefined && c.cantidad !== undefined) || analisis.meses.length >= 2);
    const esExistencias = tieneCodigo && c.existencias !== undefined;
    return { indiceArchivo, hoja, clave, analisis, esVentas, esExistencias };
  });

  const hojasVentas = analizadas.filter((h) => h.esVentas);
  const soloExistencias = analizadas.filter((h) => h.esExistencias && !h.esVentas);
  const hojasExistencias = soloExistencias.length ? soloExistencias : analizadas.filter((h) => h.esExistencias);
  const resumenHojas = analizadas.map((h) => resumenParaMapeo(h.indiceArchivo, h.hoja, h.analisis, CAMPOS_EXPORT));

  if (!hojasVentas.length || !hojasExistencias.length) {
    return { ok: false, errores: explicarFaltantes(analizadas, hojasVentas.length > 0, hojasExistencias.length > 0, varias), hojas: resumenHojas };
  }

  // Ventas
  const ventas = [];
  const problemas = [];
  let filasDatos = 0;
  let filasTotal = 0;
  let todasMensuales = true;
  const existenciasDeVentas = new Map(); // si la misma tabla trae ventas y existencias
  for (const h of hojasVentas) {
    const { hoja, analisis } = h;
    const c = analisis.columnas;
    const donde = varias ? capital(nombreHoja(hoja, true)) : '';
    const desde = analisis.iEnc + 1;
    const decimal = V.inferirDecimal(muestraColumna(hoja.filas, desde, c.cantidad ?? analisis.meses[0]?.col));
    const orden = c.fecha !== undefined ? V.inferirOrdenFecha(muestraColumna(hoja.filas, desde, c.fecha)) : 'dm';
    const decimalExist = c.existencias !== undefined ? V.inferirDecimal(muestraColumna(hoja.filas, desde, c.existencias)) : 'coma';
    for (let i = desde; i < hoja.filas.length; i++) {
      const f = hoja.filas[i];
      if (filaVacia(f)) continue;
      const fila = hoja.primeraFila + i;
      const codigo = V.textoCodigo(f[c.codigo]);
      if (esFilaDeTotal(f) && (!codigo || /total/i.test(codigo))) { filasTotal++; continue; }
      filasDatos++;
      if (!codigo) { problemas.push({ tipo: 'sin_codigo', fila, donde }); continue; }
      const nombre = c.nombre !== undefined && f[c.nombre] !== null ? String(f[c.nombre]).trim() : '';
      if (analisis.meses.length) {
        for (const m of analisis.meses) {
          const bruto = f[m.col];
          if (bruto === null || bruto === undefined) continue;
          const cantidad = V.leerNumero(bruto, decimal);
          if (cantidad === null) { problemas.push({ tipo: 'cantidad', fila, donde, valor: textoValor(bruto), columna: describirColumna(hoja, analisis, m.col) }); continue; }
          if (cantidad !== 0) ventas.push({ codigo, nombre, dia: m.dia, cantidad });
          if (!m.mensual) todasMensuales = false;
        }
        continue;
      }
      const brutoFecha = f[c.fecha];
      if (brutoFecha === null || brutoFecha === undefined) { problemas.push({ tipo: 'sin_fecha', fila, donde }); continue; }
      const fecha = V.leerFecha(brutoFecha, orden);
      if (!fecha) { problemas.push({ tipo: 'fecha', fila, donde, valor: textoValor(brutoFecha), columna: describirColumna(hoja, analisis, c.fecha) }); continue; }
      const brutoCant = f[c.cantidad];
      if (brutoCant === null || brutoCant === undefined) { problemas.push({ tipo: 'sin_cantidad', fila, donde }); continue; }
      const cantidad = V.leerNumero(brutoCant, decimal);
      if (cantidad === null) { problemas.push({ tipo: 'cantidad', fila, donde, valor: textoValor(brutoCant), columna: describirColumna(hoja, analisis, c.cantidad) }); continue; }
      if (!fecha.mensual) todasMensuales = false;
      ventas.push({ codigo, nombre, dia: fecha.dia, cantidad });
      if (h.esExistencias && !soloExistencias.length) {
        const e = V.leerNumero(f[c.existencias], decimalExist);
        const clave = V.claveCodigo(codigo);
        const prev = existenciasDeVentas.get(clave);
        if (e !== null && (!prev || fecha.dia >= prev.dia)) existenciasDeVentas.set(clave, { codigo, nombre, existencias: e, dia: fecha.dia });
      }
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
      for (let i = desde; i < hoja.filas.length; i++) {
        const f = hoja.filas[i];
        if (filaVacia(f)) continue;
        const fila = hoja.primeraFila + i;
        const codigo = V.textoCodigo(f[c.codigo]);
        if (esFilaDeTotal(f) && (!codigo || /total/i.test(codigo))) { filasTotal++; continue; }
        filasDatos++;
        if (!codigo) { problemas.push({ tipo: 'sin_codigo', fila, donde }); continue; }
        const nombre = c.nombre !== undefined && f[c.nombre] !== null ? String(f[c.nombre]).trim() : '';
        const bruto = f[c.existencias];
        let valor = 0;
        if (bruto === null || bruto === undefined) existenciasEnBlanco++;
        else {
          valor = V.leerNumero(bruto, decimal);
          if (valor === null) { problemas.push({ tipo: 'existencias', fila, donde, valor: textoValor(bruto), columna: describirColumna(hoja, analisis, c.existencias) }); continue; }
        }
        existencias.push({ codigo, nombre, existencias: valor });
      }
    }
  } else {
    for (const e of existenciasDeVentas.values()) existencias.push({ codigo: e.codigo, nombre: e.nombre, existencias: e.existencias });
    avisos.push('Las existencias se tomaron de la misma tabla de ventas: para cada producto se usó el valor de su fila más reciente.');
  }

  if (!ventas.length) {
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
  if (filasTotal) avisos.push(filasTotal === 1 ? 'Se ignoró una fila de totales.' : `Se ignoraron ${filasTotal} filas de totales.`);
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

  return { ok: true, ventas, existencias, mensual: todasMensuales, hojasUsadas, avisos, hojas: resumenHojas };
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
      errores.push('No encontramos las ventas: falta una tabla con código de producto, fecha y cantidad vendida.');
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
    hojas = abrirArchivo(buffer, nombreArchivo).filter((h) => h.filas.some((f) => !filaVacia(f)));
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
