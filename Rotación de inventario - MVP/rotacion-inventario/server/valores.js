'use strict';

// Lectura de valores sueltos: códigos, números y fechas tal como salen de un
// Excel o un CSV colombiano ("1.234,5", "15/01/2026", "15-ene-2026", "5-" de SAP...).

const MS_DIA = 86400000;
const EXCEL_EPOCA = 25569; // número de serie de Excel del 1970-01-01

const MESES = {
  ene: 1, enero: 1, jan: 1, january: 1,
  feb: 2, febrero: 2, february: 2,
  mar: 3, marzo: 3, march: 3,
  abr: 4, abril: 4, apr: 4, april: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6, june: 6,
  jul: 7, julio: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8,
  sep: 9, sept: 9, septiembre: 9, setiembre: 9, september: 9,
  oct: 10, octubre: 10, october: 10,
  nov: 11, noviembre: 11, november: 11,
  dic: 12, diciembre: 12, dec: 12, december: 12,
};

// --- Códigos -----------------------------------------------------------------

function textoCodigo(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    return Number.isFinite(v) ? String(v) : '';
  }
  return String(v).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

// Clave para comparar códigos: sin espacios sobrantes, en mayúscula y, si es
// solo números, sin ceros a la izquierda (Excel suele borrarlos: "00123" -> 123).
function claveCodigo(v) {
  const t = textoCodigo(v).toUpperCase();
  if (/^\d+$/.test(t)) return t.replace(/^0+(?=\d)/, '');
  return t;
}

// --- Números -----------------------------------------------------------------

// Decide si en una columna la coma es decimal ("1,5") o separador de miles ("1,234.5").
function inferirDecimal(valores) {
  let coma = 0;
  let punto = 0;
  for (const v of valores) {
    if (typeof v !== 'string') continue;
    const s = v.replace(/[\s $]/g, '').replace(/[()+-]/g, '');
    if (!s) continue;
    const ultimaComa = s.lastIndexOf(',');
    const ultimoPunto = s.lastIndexOf('.');
    if (ultimaComa >= 0 && ultimoPunto >= 0) {
      if (ultimaComa > ultimoPunto) coma += 5; else punto += 5;
    } else if (ultimaComa >= 0) {
      if ((s.match(/,/g) || []).length > 1) punto += 2;
      else if (!/,\d{3}$/.test(s)) coma += 2;
    } else if (ultimoPunto >= 0) {
      if ((s.match(/\./g) || []).length > 1) coma += 2;
      else if (!/\.\d{3}$/.test(s)) punto += 2;
    }
  }
  if (punto > coma) return 'punto';
  return 'coma'; // en Colombia lo normal es coma decimal
}

// Devuelve un número o null si el valor no es un número.
function leerNumero(v, decimal = 'coma') {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return null;
  let s = String(v).replace(/[\s ]/g, '').replace(/^\$/, '');
  if (!s) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1); }
  if (/-$/.test(s)) { negativo = !negativo; s = s.slice(0, -1); } // SAP: "5-"
  if (/^-/.test(s)) { negativo = !negativo; s = s.slice(1); }
  if (/^\+/.test(s)) s = s.slice(1);
  // Cada valor se decide por sí mismo cuando se puede ("2.5" y "2,5" son 2,5;
  // "1.234,5" y "1,234.5" son 1234,5). Solo "1.000" o "1,000" son ambiguos:
  // ahí manda lo que se dedujo para la columna (en Colombia, coma decimal).
  const comas = (s.match(/,/g) || []).length;
  const puntos = (s.match(/\./g) || []).length;
  let sepDecimal = null;
  if (comas && puntos) sepDecimal = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
  else if (comas > 1) sepDecimal = '.';
  else if (puntos > 1) sepDecimal = ',';
  else if (comas === 1) sepDecimal = /,\d{3}$/.test(s) ? (decimal === 'coma' ? ',' : '.') : ',';
  else if (puntos === 1) sepDecimal = /\.\d{3}$/.test(s) ? (decimal === 'coma' ? ',' : '.') : '.';
  if (sepDecimal === ',') s = s.replace(/\./g, '').replace(',', '.');
  else if (sepDecimal === '.') s = s.replace(/,/g, '');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

// --- Fechas ------------------------------------------------------------------
// Las fechas se manejan como "número de día" (días desde 1970-01-01, en UTC),
// para no tener problemas de zona horaria.

function diaDe(anio, mes, dia) {
  if (anio < 100) anio += 2000;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const t = Date.UTC(anio, mes - 1, dia);
  const d = new Date(t);
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null; // 31/02
  if (anio < 1990 || anio > 2100) return null;
  return Math.round(t / MS_DIA);
}

function finDeMes(diaNum) {
  const d = new Date(diaNum * MS_DIA);
  return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0) / MS_DIA);
}

function textoDia(diaNum) {
  return new Date(diaNum * MS_DIA).toISOString().slice(0, 10);
}

// En fechas como 03/04/2026 decide si va día/mes (Colombia) o mes/día (EE. UU.).
function inferirOrdenFecha(valores) {
  let dm = 0;
  let md = 0;
  for (const v of valores) {
    if (typeof v !== 'string') continue;
    const m = v.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (!m) continue;
    if (Number(m[1]) > 12) dm++;
    if (Number(m[2]) > 12) md++;
  }
  return md > dm ? 'md' : 'dm';
}

function mesDeTexto(t) {
  const k = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.$/, '');
  return MESES[k] || null;
}

// Devuelve { dia, mensual } o null. "mensual" indica que el valor es un mes
// completo (ej. "2026-01" o "Ene-2026"), como en los informes agrupados por mes.
function leerFecha(v, orden = 'dm') {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const dia = diaDe(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
    return dia === null ? null : { dia, mensual: false };
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    if (v >= 19000101 && v <= 21001231 && Number.isInteger(v)) return leerFecha(String(v), orden);
    if (v >= 199001 && v <= 210012 && Number.isInteger(v)) return leerFecha(String(v), orden);
    if (v > 32000 && v < 75000) { // número de serie de Excel (1987-2105)
      const dia = Math.floor(v) - EXCEL_EPOCA;
      return { dia, mensual: false };
    }
    return null;
  }
  const s = String(v).trim();
  let m;
  // 2026-01-15, 2026/01/15 (con o sin hora)
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[ T])/))) {
    const dia = diaDe(+m[1], +m[2], +m[3]);
    return dia === null ? null : { dia, mensual: false };
  }
  // 15/01/2026, 15-01-26 (con o sin hora)
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:$|[ T])/))) {
    const [a, b] = orden === 'md' ? [+m[2], +m[1]] : [+m[1], +m[2]];
    const dia = diaDe(+m[3], b, a);
    return dia === null ? null : { dia, mensual: false };
  }
  // 15-ene-2026, 15 enero 2026, 15 de enero de 2026
  if ((m = s.match(/^(\d{1,2})[-/. ]+(?:de\s+)?([A-Za-zÁÉÍÓÚáéíóú]{3,})\.?[-/. ]+(?:de\s+)?(\d{2}|\d{4})(?:$|[ T])/))) {
    const mes = mesDeTexto(m[2]);
    if (!mes) return null;
    const dia = diaDe(+m[3], mes, +m[1]);
    return dia === null ? null : { dia, mensual: false };
  }
  // 20260115
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) {
    const dia = diaDe(+m[1], +m[2], +m[3]);
    return dia === null ? null : { dia, mensual: false };
  }
  // Meses completos: 2026-01, 2026/01, 202601, 01/2026, Ene-2026, enero 2026, Ene-26
  if ((m = s.match(/^(\d{4})[-/.]?(\d{2})$/)) || (m = s.match(/^(\d{4})[-/.](\d{1})$/))) {
    const dia = diaDe(+m[1], +m[2], 1);
    return dia === null ? null : { dia, mensual: true };
  }
  if ((m = s.match(/^(\d{1,2})[-/.](\d{4})$/))) {
    const dia = diaDe(+m[2], +m[1], 1);
    return dia === null ? null : { dia, mensual: true };
  }
  if ((m = s.match(/^([A-Za-zÁÉÍÓÚáéíóú]{3,})\.?[-/. ]+(?:de\s+)?(\d{2}|\d{4})$/))) {
    const mes = mesDeTexto(m[1]);
    if (!mes) return null;
    const dia = diaDe(+m[2], mes, 1);
    return dia === null ? null : { dia, mensual: true };
  }
  return null;
}

module.exports = {
  MS_DIA,
  EXCEL_EPOCA,
  textoCodigo,
  claveCodigo,
  inferirDecimal,
  leerNumero,
  leerFecha,
  inferirOrdenFecha,
  finDeMes,
  textoDia,
  diaDe,
};
