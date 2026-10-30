'use strict';

// El correo del boletín diario: asunto, texto y HTML. Sin base de datos (se prueba en
// test/boletin.test.js). El HTML lleva los estilos en línea y tablas, porque los programas de
// correo no leen hojas de estilo; el logo va como imagen servida por la app (Gmail no muestra
// imágenes en base64). Siempre va también la versión de texto.
//
// Desde el SP7 el correo se arma por secciones, una por tipo de alerta (server/alertas.js), y solo
// lleva las que tocan ese día y tienen algo que decir. Cada sección dice qué cambió desde la última
// vez que se revisó, no desde ayer: una sección semanal se compara con la del lunes anterior.

const { DIAS_SIN_DATOS } = require('./alertas');

const COLOR = { primario: '#0f766e', texto: '#1f2937', suave: '#6b7280', borde: '#e5e7eb', rojo: '#b91c1c', ambar: '#b45309', azul: '#1d4ed8', fondo: '#f6f8f7' };
const MAX_LISTA = 10;
const MAX_CLAVES = 2000;
const DIAS_POR_MES = 30.44;

// El orden en que van las secciones y del que sale el asunto: lo más urgente primero.
const ORDEN = ['enCero', 'pideYa', 'seAgota', 'porAprobar', 'porRecibir', 'sinDatos', 'sobran', 'dineroQuieto'];

function numero(n, dec = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: dec }).format(n);
}

function plata(n) {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1e6) return `$${numero(n / 1e6, 1)} M`;
  if (Math.abs(n) >= 1e4) return `$${numero(Math.round(n / 1000))} mil`;
  return `$${numero(n)}`;
}

const contar = (n, uno, varios) => `${numero(n)} ${n === 1 ? uno : varios}`;

// Para cuánto alcanza, en la unidad que eligió la persona (el cálculo siempre es en semanas).
function alcance(semanas, unidad = 'semanas') {
  if (semanas === null || semanas === undefined) return '—';
  const dias = Math.max(0, semanas * 7);
  if (unidad === 'dias' || semanas < 1) {
    const d = semanas <= 0 ? 0 : Math.max(1, Math.round(dias));
    return `${numero(d)} ${d === 1 ? 'día' : 'días'}`;
  }
  if (unidad === 'meses') {
    const m = dias / DIAS_POR_MES;
    if (m < 0.5) return 'menos de medio mes';
    return `${numero(m, 1)} ${numero(m, 1) === '1' ? 'mes' : 'meses'}`;
  }
  const s = numero(semanas, semanas >= 10 ? 0 : 1);
  return `${s} ${s === '1' ? 'semana' : 'semanas'}`;
}

function escapar(t) {
  return String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function fechaLarga(dia) {
  return new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${dia}T12:00:00Z`));
}

function fechaCorta(dia) {
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${dia}T12:00:00Z`));
}

// --- Qué lleva cada sección ------------------------------------------------------------------

const sobra = (p) => p.estado === 'sobra' || (p.estado === 'sin_ventas' && p.existencias > 0);

/**
 * Lo que dice una sección hoy, o null si no tiene nada que decir.
 * ctx: { inv, porAprobar: [{ id, numero, preparadoPor, enviadoEn, lineas }], porRecibir:
 *   atrasadosDe(...) de server/recepcion.js, sinDatos: { dias } }.
 * claves: lo que se guarda para decir la próxima vez qué es nuevo.
 */
function seccion(tipo, ctx) {
  const { inv } = ctx;
  const productos = (fn, orden = null) => {
    const ps = inv.productos.filter(fn);
    if (orden) ps.sort(orden);
    return ps.length ? { tipo, n: ps.length, claves: ps.map((p) => p.codigo), productos: ps } : null;
  };
  if (tipo === 'enCero') return productos((p) => p.estado === 'agota' && p.existencias <= 0);
  if (tipo === 'seAgota') return productos((p) => p.estado === 'agota' && p.existencias > 0);
  if (tipo === 'pideYa') {
    const s = productos((p) => p.estado === 'pide');
    return s && { ...s, proveedores: inv.proveedores.filter((p) => p.pideYa > 0) };
  }
  if (tipo === 'sobran') return productos(sobra, (a, b) => (b.quieto || 0) - (a.quieto || 0) || (b.semanas ?? Infinity) - (a.semanas ?? Infinity));
  if (tipo === 'dineroQuieto') {
    if (!inv.resumen.tieneCostos || !(inv.resumen.dineroQuieto > 0)) return null;
    const ps = inv.productos.filter((p) => p.quieto > 0).sort((a, b) => b.quieto - a.quieto);
    return { tipo, n: inv.resumen.dineroQuieto, claves: ps.map((p) => p.codigo), productos: ps };
  }
  if (tipo === 'porAprobar') {
    const ps = ctx.porAprobar || [];
    return ps.length ? { tipo, n: ps.length, claves: ps.map((p) => String(p.id)), pedidos: ps } : null;
  }
  if (tipo === 'porRecibir') {
    const ps = ctx.porRecibir || [];
    return ps.length ? { tipo, n: ps.length, claves: ps.map((p) => `${p.pedidoId}:${p.proveedor}`), entregas: ps } : null;
  }
  if (tipo === 'sinDatos') {
    const dias = ctx.sinDatos && ctx.sinDatos.dias;
    return dias > DIAS_SIN_DATOS ? { tipo, n: dias, claves: [] } : null;
  }
  return null;
}

// Las secciones de hoy con algo que decir, en el orden de ORDEN.
function seccionesDelDia(tipos, ctx) {
  return ORDEN.filter((t) => tipos.includes(t)).map((t) => seccion(t, ctx)).filter(Boolean);
}

/**
 * Lo que se guarda cada día (boletines.resumen): el estado de cada tipo revisado hoy y la fecha. Los
 * tipos que hoy no tocaban siguen como estaban la última vez, para compararlos en su próximo turno.
 * tipos: los que tocaban hoy (aunque no tuvieran nada); previo: el resumen anterior o null.
 */
function resumenDelDia(tipos, secciones, hoy, previo = null) {
  const out = { ...((previo && previo.tipos) || {}) };
  for (const t of tipos) {
    const s = secciones.find((x) => x.tipo === t);
    out[t] = { fecha: hoy, n: s ? s.n : 0, claves: s ? s.claves.slice(0, MAX_CLAVES) : [] };
  }
  return { tipos: out };
}

// Qué cambió en una sección desde la última vez que se revisó: lo nuevo y lo que había antes.
function cambiosDesde(previo, s) {
  const p = previo && previo.tipos && previo.tipos[s.tipo];
  if (!p) return null;
  const antes = new Set(p.claves || []);
  return { desde: p.fecha, antes: p.n, nuevos: s.claves.filter((c) => !antes.has(c)) };
}

// --- Cómo se dice cada sección ---------------------------------------------------------------

// El asunto: la sección más urgente, y cuántas más trae.
function asuntoDe(secciones, empresa) {
  const s = secciones[0];
  const n = s.n;
  const textos = {
    enCero: () => `En cero: ${contar(n, 'producto', 'productos')}`,
    pideYa: () => `Pedir ya: ${contar(n, 'producto', 'productos')}`,
    seAgota: () => `Se van a agotar: ${contar(n, 'producto', 'productos')}`,
    porAprobar: () => `Por aprobar: ${contar(n, 'pedido', 'pedidos')}`,
    porRecibir: () => `Entregas atrasadas: ${numero(n)}`,
    sinDatos: () => `Sin movimientos hace ${numero(n)} días hábiles`,
    sobran: () => `Sobran: ${contar(n, 'producto', 'productos')}`,
    dineroQuieto: () => `Dinero quieto: ${plata(n)}`,
  };
  const mas = secciones.length - 1;
  return `${textos[s.tipo]()}${mas ? ` y ${contar(mas, 'aviso más', 'avisos más')}` : ''} · ${empresa}`;
}

/**
 * Una sección como bloques que se dicen igual en texto y en HTML:
 * { titulo, parrafos: [texto], tabla: { columnas, filas: [[celda]] } | null, enlaces: [{ texto, url }] }.
 * Cada celda es texto, o { texto, fuerte, sub, color }.
 */
function bloques(s, { analista, unidad, url, cambios }) {
  const ir = (ruta) => `${url}${ruta}${ruta.includes('?') ? '&' : '?'}desde=boletin`;
  const lista = (codigos) => `${codigos.slice(0, 8).join(', ')}${codigos.length > 8 ? '…' : ''}`;
  const producto = (p) => ({ texto: p.codigo, fuerte: true, sub: p.nombre });
  const resto = (total, mostrados, uno, varios) => (total > mostrados ? [`Y ${contar(total - mostrados, uno, varios)} más.`] : []);
  const nuevos = (uno, varios) => {
    if (!cambios) return [];
    if (!cambios.nuevos.length) return [`Sin ${varios} nuevos desde el ${fechaLarga(cambios.desde)}.`];
    return [`${cambios.nuevos.length === 1 ? 'Nuevo' : 'Nuevos'} desde el ${fechaLarga(cambios.desde)}: ${s.claves.length > 30 ? contar(cambios.nuevos.length, uno, varios) : lista(cambios.nuevos)}.`];
  };
  const tablaProductos = (ps, conSugerido) => ({
    columnas: ['Producto', 'Existencias', 'Alcanza para', ...(conSugerido ? ['Sugerido'] : [])],
    filas: ps.slice(0, MAX_LISTA).map((p) => [
      producto(p),
      numero(p.existencias, 1),
      p.existencias <= 0 ? { texto: 'En cero', color: COLOR.rojo, sinEtiqueta: true } : p.semanas === null ? { texto: 'Sin ventas', sinEtiqueta: true } : alcance(p.semanas, unidad),
      ...(conSugerido ? [p.sugerido ? numero(p.sugerido) : '—'] : []),
    ]),
  });

  if (s.tipo === 'enCero' || s.tipo === 'seAgota') {
    return {
      titulo: s.tipo === 'enCero' ? `En cero (${numero(s.n)})` : `Se van a agotar (${numero(s.n)})`,
      parrafos: [...nuevos('producto', 'productos'), ...resto(s.n, MAX_LISTA, 'producto', 'productos')],
      tabla: tablaProductos(s.productos, analista),
      enlaces: [{ texto: 'Ver en Productos', url: ir('/productos?estado=agota') }],
    };
  }
  if (s.tipo === 'pideYa') {
    const porProveedor = analista ? s.proveedores.slice(0, 8).map((p) => `${p.nombre}: ${contar(p.pideYa, 'producto', 'productos')} (tarda ${alcance(p.entrega, unidad)}).`) : [];
    return {
      titulo: `Pedir ya (${numero(s.n)})`,
      parrafos: ['Si espera al próximo pedido, llegan tarde.', ...porProveedor, ...nuevos('producto', 'productos'), ...resto(s.n, MAX_LISTA, 'producto', 'productos')],
      tabla: tablaProductos(s.productos, analista),
      enlaces: [{ texto: 'Preparar pedido', url: ir('/pedidos/sugerido') }, { texto: 'Ver en Productos', url: ir('/productos?estado=pide') }],
    };
  }
  if (s.tipo === 'porAprobar') {
    return {
      titulo: `Pedidos por aprobar (${numero(s.n)})`,
      parrafos: [
        ...s.pedidos.slice(0, MAX_LISTA).map((p) => `Pedido ${p.numero ?? p.id}, de ${p.preparadoPor}: ${contar(p.lineas, 'producto', 'productos')}, enviado el ${fechaCorta(p.enviadoDia)}.`),
        ...resto(s.n, MAX_LISTA, 'pedido', 'pedidos'),
      ],
      tabla: null,
      enlaces: [{ texto: 'Revisar los pedidos', url: ir('/pedidos') }],
    };
  }
  if (s.tipo === 'porRecibir') {
    return {
      titulo: `Entregas atrasadas (${numero(s.n)})`,
      parrafos: [
        'Según lo que tarda cada proveedor, ya deberían haber llegado. Si llegaron, registre la llegada para que el sugerido siga al día.',
        ...s.entregas.slice(0, MAX_LISTA).map((e) => `${e.proveedor}, pedido ${e.numero ?? e.pedidoId} del ${fechaCorta(e.pedidoEl)}: debía llegar el ${fechaCorta(e.esperado)} (${contar(e.diasTarde, 'día hábil', 'días hábiles')} de retraso). Faltan ${contar(e.pendientes, 'producto', 'productos')}.`),
        ...resto(s.n, MAX_LISTA, 'entrega', 'entregas'),
      ],
      tabla: null,
      enlaces: [{ texto: 'Registrar la llegada', url: ir('/pedidos') }],
    };
  }
  if (s.tipo === 'sinDatos') {
    return {
      titulo: 'Datos sin actualizar',
      parrafos: [`Hace ${numero(s.n)} días hábiles que no se registran movimientos ni archivos. Lo que sugiere SINESC depende de tener las entradas y salidas al día.`],
      tabla: null,
      enlaces: [{ texto: 'Registrar movimientos', url: ir('/movimientos') }],
    };
  }
  if (s.tipo === 'sobran') {
    return {
      titulo: `Sobran (${numero(s.n)})`,
      parrafos: ['Alcanzan para más tiempo del que se considera normal. No los pida por ahora.', ...nuevos('producto', 'productos'), ...resto(s.n, MAX_LISTA, 'producto', 'productos')],
      tabla: tablaProductos(s.productos, false),
      enlaces: [{ texto: 'Ver en Productos', url: ir('/productos?estado=sobra') }],
    };
  }
  // dineroQuieto
  const antes = cambios && cambios.antes > 0 && cambios.antes !== s.n ? [`El ${fechaLarga(cambios.desde)} era ${plata(cambios.antes)}.`] : [];
  return {
    titulo: 'Dinero quieto',
    parrafos: [`En lo que sobra hay ${plata(s.n)} quieto.`, ...antes],
    tabla: s.productos.length ? {
      columnas: ['Producto', 'Unidades de más', 'Dinero quieto'],
      filas: s.productos.slice(0, 5).map((p) => [producto(p), numero(p.unidadesQuietas, 1), plata(p.quieto)]),
    } : null,
    enlaces: [{ texto: 'Ver lo que sobra', url: ir('/productos?estado=sobra') }],
  };
}

const textoCelda = (c) => (typeof c === 'object' && c !== null ? `${c.texto}${c.sub ? ` ${c.sub}` : ''}` : String(c));

function bloquesATexto(b) {
  const lineas = ['', b.titulo.toUpperCase()];
  for (const p of b.parrafos) lineas.push(p);
  if (b.tabla) {
    const etiquetada = (c, i) => (c && c.sinEtiqueta ? c.texto.toLowerCase() : `${b.tabla.columnas[i + 1].toLowerCase()} ${textoCelda(c)}`);
    for (const f of b.tabla.filas) lineas.push(`- ${textoCelda(f[0])}: ${f.slice(1).map(etiquetada).join(', ')}`);
  }
  for (const e of b.enlaces) lineas.push(`${e.texto}: ${e.url}`);
  return lineas;
}

function bloquesAHtml(b) {
  const parrafo = (t) => `<p style="margin:0 0 10px;color:${COLOR.texto};font-size:15px;line-height:1.5">${escapar(t)}</p>`;
  const celdaHtml = (c, i) => {
    const alinear = i === 0 ? 'left' : 'right';
    if (typeof c === 'object' && c !== null) {
      const dentro = c.fuerte ? `<strong>${escapar(c.texto)}</strong>` : escapar(c.texto);
      const sub = c.sub ? `<br><span style="color:${COLOR.suave};font-size:13px">${escapar(c.sub)}</span>` : '';
      return `<td style="padding:8px 6px;border-bottom:1px solid ${COLOR.borde};text-align:${alinear};color:${c.color || COLOR.texto}">${dentro}${sub}</td>`;
    }
    return `<td style="padding:8px 6px;border-bottom:1px solid ${COLOR.borde};text-align:${alinear}">${escapar(c)}</td>`;
  };
  let h = `<h2 style="margin:26px 0 10px;font-size:17px;color:${COLOR.texto}">${escapar(b.titulo)}</h2>`;
  h += b.parrafos.map(parrafo).join('');
  if (b.tabla) {
    h += `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;color:${COLOR.texto};margin-bottom:10px">
      <tr style="color:${COLOR.suave};font-size:12px">${b.tabla.columnas.map((c, i) => `<td style="padding:0 6px 6px;text-align:${i === 0 ? 'left' : 'right'}">${escapar(c)}</td>`).join('')}</tr>
      ${b.tabla.filas.map((f) => `<tr>${f.map(celdaHtml).join('')}</tr>`).join('')}</table>`;
  }
  h += `<p style="margin:0 0 6px;font-size:14px">${b.enlaces.map((e) => `<a href="${escapar(e.url)}" style="color:${COLOR.primario};font-weight:700">${escapar(e.texto)}</a>`).join(' &nbsp;·&nbsp; ')}</p>`;
  return h;
}

/**
 * usuario: { nombre, perfil, unidad }; empresa: nombre; inv: construirInventario(...).
 * secciones: seccionesDelDia(...), al menos una (sin secciones no se manda nada).
 * previo: el resumen guardado la vez anterior (o null), para decir qué cambió.
 * url: dirección de la app; baja: enlace para dejar de recibirlo (o null).
 */
function armarBoletin({ usuario, empresa, inv, secciones, previo = null, hoy, url, baja = null }) {
  const analista = usuario.perfil !== 'operador';
  const unidad = usuario.unidad || 'semanas';
  const nombreEmpresa = empresa || 'su empresa';
  const asunto = asuntoDe(secciones, nombreEmpresa);
  const destino = analista ? `${url}/panel?desde=boletin` : `${url}/movimientos?desde=boletin`;
  const bs = secciones.map((s) => bloques(s, { analista, unidad, url, cambios: cambiosDesde(previo, s) }));
  const intro = `Esto es lo que necesita atención hoy, ${fechaLarga(hoy)}, en ${nombreEmpresa}. Datos hasta el ${inv.fuente.hasta}.`;
  const ajustes = 'Qué avisos le llegan y cada cuánto se elige en Mi cuenta.';

  const lineas = [`Hola, ${usuario.nombre}:`, '', intro];
  for (const b of bs) lineas.push(...bloquesATexto(b));
  lineas.push('', `${analista ? 'Ver el panel' : 'Registrar movimientos'}: ${destino}`, '', ajustes);
  lineas.push(baja ? `Para dejar de recibir este correo: ${baja}` : 'Para dejar de recibir este correo, desactívelo en Mi cuenta.');

  const parrafo = (t) => `<p style="margin:0 0 14px;color:${COLOR.texto};font-size:15px;line-height:1.5">${t}</p>`;
  let cuerpo = parrafo(`Hola, ${escapar(usuario.nombre)}:`);
  cuerpo += parrafo(`Esto es lo que necesita atención hoy, ${escapar(fechaLarga(hoy))}, en <strong>${escapar(nombreEmpresa)}</strong>. Datos hasta el ${escapar(inv.fuente.hasta)}.`);
  cuerpo += bs.map(bloquesAHtml).join('');
  cuerpo += `<p style="margin:28px 0 8px"><a href="${escapar(destino)}" style="display:inline-block;padding:12px 20px;background:${COLOR.primario};color:#ffffff;border-radius:10px;font-weight:700;text-decoration:none">${analista ? 'Ver el panel' : 'Registrar movimientos'}</a></p>`;
  const pie = `Recibe este correo porque activó el boletín diario de SINESC. ${escapar(ajustes)} ${baja
    ? `<a href="${escapar(baja)}" style="color:${COLOR.suave}">Dejar de recibirlo</a>.`
    : 'Para dejar de recibirlo, desactívelo en Mi cuenta.'}`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapar(asunto)}</title></head>
<body style="margin:0;padding:0;background:${COLOR.fondo};font-family:Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid ${COLOR.borde};border-radius:16px">
<tr><td style="padding:22px 24px 6px"><img src="${escapar(url)}/apple-icon.png" width="36" height="36" alt="" style="vertical-align:middle;border-radius:8px"> <span style="font-size:20px;font-weight:800;color:${COLOR.texto};vertical-align:middle">SINESC</span></td></tr>
<tr><td style="padding:14px 24px 24px">${cuerpo}</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid ${COLOR.borde};color:${COLOR.suave};font-size:12px;line-height:1.5">${pie}</td></tr>
</table></td></tr></table></body></html>`;

  return { asunto, texto: lineas.join('\n'), html };
}

module.exports = { armarBoletin, seccionesDelDia, resumenDelDia, cambiosDesde, alcance, ORDEN };
