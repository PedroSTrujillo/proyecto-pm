// Utilidades del front: HTML seguro, formatos en español de Colombia y llamadas al servidor.

class Crudo {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pintar(v) {
  if (v instanceof Crudo) return v.s;
  if (Array.isArray(v)) return v.map(pintar).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(v);
}

// Plantillas HTML: todo lo interpolado se escapa salvo lo que ya viene de html``.
export function html(partes, ...valores) {
  let out = '';
  partes.forEach((p, i) => {
    out += p;
    if (i < valores.length) out += pintar(valores[i]);
  });
  return new Crudo(out);
}

export function montar(contenedor, contenido) {
  contenedor.innerHTML = pintar(contenido);
  return contenedor;
}

// --- Números y fechas -----------------------------------------------------------

const formatos = new Map();
function formato(min, max) {
  const k = `${min}-${max}`;
  if (!formatos.has(k)) formatos.set(k, new Intl.NumberFormat('es-CO', { minimumFractionDigits: min, maximumFractionDigits: max }));
  return formatos.get(k);
}

export function numero(n, max = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return formato(0, max).format(n);
}

export function ventasSemana(n) {
  if (n === null || n === undefined) return '—';
  if (n === 0) return '0';
  return formato(0, n < 1 ? 2 : 1).format(n);
}

export function semanas(n) {
  if (n === null || n === undefined) return '—';
  return formato(0, n >= 100 ? 0 : 1).format(n);
}

const fmtFecha = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtFechaUTC = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtFechaHora = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function fecha(v) {
  return v ? fmtFecha.format(new Date(v)) : '—';
}

export function fechaHora(v) {
  return v ? fmtFechaHora.format(new Date(v)) : '—';
}

// "2026-01-15" (día del histórico) sin correrse por zona horaria.
export function dia(texto) {
  return texto ? fmtFechaUTC.format(new Date(`${texto}T00:00:00Z`)) : '—';
}

export function plural(n, uno, varios) {
  return `${numero(n, 0)} ${n === 1 ? uno : varios}`;
}

// Misma clave de comparación que usa el servidor.
export function claveCodigo(v) {
  const t = String(v ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  return /^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, '') : t;
}

// --- Servidor -------------------------------------------------------------------

export async function api(metodo, ruta, cuerpo, { formulario } = {}) {
  const opciones = { method: metodo, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
  if (formulario) opciones.body = formulario;
  else if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  let r;
  try {
    r = await fetch(`/api${ruta}`, opciones);
  } catch {
    throw Object.assign(new Error('No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.'), { estado: 0, datos: {} });
  }
  let datos = {};
  try { datos = await r.json(); } catch { /* sin cuerpo */ }
  if (r.status === 401 && !ruta.startsWith('/cuenta/')) {
    window.dispatchEvent(new CustomEvent('sesion-cerrada'));
  }
  if (!r.ok) throw Object.assign(new Error(datos.error || 'Algo salió mal. Intenta de nuevo.'), { estado: r.status, datos });
  return datos;
}

export function debounce(fn, ms) {
  let t = null;
  const envuelta = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, ms);
  };
  envuelta.ahora = (...args) => { clearTimeout(t); t = null; return fn(...args); };
  envuelta.pendiente = () => t !== null;
  return envuelta;
}

export function mensajeError(e) {
  return html`<div class="mensaje error" role="alert"><p>${e.message}</p>${
    e.datos && Array.isArray(e.datos.errores) && e.datos.errores.length
      ? html`<ul>${e.datos.errores.slice(0, 12).map((x) => html`<li>${typeof x === 'string' ? x : x.mensaje}</li>`)}${e.datos.errores.length > 12 ? html`<li>…y ${e.datos.errores.length - 12} más.</li>` : ''}</ul>`
      : ''
  }</div>`;
}
