'use strict';

// El correo del boletín diario: asunto, texto y HTML. Sin base de datos (se prueba en
// test/boletin.test.js). El HTML lleva los estilos en línea y tablas, porque los programas de
// correo no leen hojas de estilo; el logo va como imagen servida por la app (Gmail no muestra
// imágenes en base64). Siempre va también la versión de texto.

const COLOR = { primario: '#0f766e', texto: '#1f2937', suave: '#6b7280', borde: '#e5e7eb', rojo: '#b91c1c', ambar: '#b45309', azul: '#1d4ed8', fondo: '#f6f8f7' };
const MAX_URGENTES = 10;
const DIAS_POR_MES = 30.44;

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

/**
 * Lo que se guarda cada día (boletines.resumen), para decir mañana qué cambió.
 */
function resumenDelDia(inv) {
  const codigos = (fn) => inv.productos.filter(fn).map((p) => p.codigo).slice(0, 2000);
  return {
    productos: inv.resumen.productos,
    seAgotan: inv.resumen.seAgotan,
    enCero: inv.resumen.enCero,
    pideYa: inv.resumen.pideYa,
    sobran: inv.resumen.sobran,
    agotados: codigos((p) => p.estado === 'agota' && p.existencias <= 0),
    porAgotarse: codigos((p) => p.estado === 'agota' || p.estado === 'pide'),
  };
}

// Productos que hoy están en cero o por agotarse y ayer no.
function cambiosDesde(ayer, hoy) {
  if (!ayer) return null;
  const antes = new Set([...(ayer.agotados || []), ...(ayer.porAgotarse || [])]);
  const antesCero = new Set(ayer.agotados || []);
  return {
    nuevosEnCero: hoy.agotados.filter((c) => !antesCero.has(c)),
    nuevosPorAgotarse: hoy.porAgotarse.filter((c) => !antes.has(c)),
  };
}

/**
 * usuario: { nombre, perfil, unidad }; empresa: nombre; inv: construirInventario(...).
 * cambios: cambiosDesde(...) o null. movimientos: { ayer, usaMovimientos }.
 * url: dirección de la app; baja: enlace para dejar de recibirlo (o null).
 */
function armarBoletin({ usuario, empresa, inv, cambios = null, movimientos = { ayer: 0, usaMovimientos: false }, hoy, url, baja = null }) {
  const analista = usuario.perfil !== 'operador';
  const unidad = usuario.unidad || 'semanas';
  const r = inv.resumen;
  const urgentes = inv.productos.filter((p) => p.estado === 'agota' || p.estado === 'pide').slice(0, MAX_URGENTES);
  const destino = analista ? `${url}/panel?desde=boletin` : `${url}/movimientos?desde=boletin`;
  const nombreEmpresa = empresa || 'su empresa';
  const asunto = r.enCero || r.seAgotan
    ? `${nombreEmpresa}: ${r.enCero ? `${numero(r.enCero)} en cero` : ''}${r.enCero && r.seAgotan - r.enCero > 0 ? ' y ' : ''}${r.seAgotan - r.enCero > 0 ? `${numero(r.seAgotan - r.enCero)} por agotarse` : ''}`
    : `${nombreEmpresa}: su inventario hoy`;

  const cifras = [
    { texto: 'En cero', valor: r.enCero, color: COLOR.rojo },
    { texto: 'Se van a agotar', valor: r.seAgotan - r.enCero, color: COLOR.rojo },
    { texto: 'Pedir ya', valor: r.pideYa, color: COLOR.ambar },
    { texto: 'Sobran', valor: r.sobran, color: COLOR.azul },
  ];
  const lineas = [];
  lineas.push(`Hola, ${usuario.nombre}:`, '', `Así está el inventario de ${nombreEmpresa} hoy, ${fechaLarga(hoy)}. Datos hasta el ${inv.fuente.hasta}.`, '');
  for (const c of cifras) lineas.push(`- ${c.texto}: ${numero(c.valor)}`);
  if (movimientos.usaMovimientos && !movimientos.ayer) lineas.push('', 'Ayer no se registraron movimientos. Si hubo ventas o llegó mercancía, regístrelas para que el inventario siga al día.');
  if (cambios && (cambios.nuevosEnCero.length || cambios.nuevosPorAgotarse.length)) {
    lineas.push('', 'Desde ayer:');
    if (cambios.nuevosEnCero.length) lineas.push(`- Quedaron en cero: ${cambios.nuevosEnCero.slice(0, 8).join(', ')}${cambios.nuevosEnCero.length > 8 ? '…' : ''}`);
    if (cambios.nuevosPorAgotarse.length) lineas.push(`- Empezaron a agotarse: ${cambios.nuevosPorAgotarse.slice(0, 8).join(', ')}${cambios.nuevosPorAgotarse.length > 8 ? '…' : ''}`);
  }
  if (urgentes.length) {
    lineas.push('', 'Lo más urgente:');
    for (const p of urgentes) lineas.push(`- ${p.codigo} ${p.nombre}: hay ${numero(p.existencias, 1)}, alcanza para ${alcance(p.semanas, unidad)}${analista && p.sugerido ? `. Sugerido: ${numero(p.sugerido)}` : ''}`);
  }
  const conPedir = analista ? inv.proveedores.filter((p) => p.pideYa > 0) : [];
  if (conPedir.length) {
    lineas.push('', 'Pedir ya, por proveedor:');
    for (const p of conPedir.slice(0, 8)) lineas.push(`- ${p.nombre}: ${numero(p.pideYa)} ${p.pideYa === 1 ? 'producto' : 'productos'} (tarda ${alcance(p.entrega, unidad)})`);
  }
  if (analista && r.dineroQuieto) lineas.push('', `Dinero quieto en lo que sobra: ${plata(r.dineroQuieto)}.`);
  lineas.push('', `${analista ? 'Ver el panel' : 'Registrar movimientos'}: ${destino}`);
  if (baja) lineas.push('', `Para dejar de recibir este correo: ${baja}`);
  else lineas.push('', 'Para dejar de recibir este correo, desactívelo en Mi cuenta.');

  // --- HTML ---
  const celda = (c) => `<td style="padding:12px 10px;border:1px solid ${COLOR.borde};border-radius:10px;text-align:center;width:25%">
      <div style="font-size:26px;font-weight:800;color:${c.valor ? c.color : COLOR.suave}">${numero(c.valor)}</div>
      <div style="font-size:12px;color:${COLOR.suave}">${escapar(c.texto)}</div></td>`;
  const fila = (p) => `<tr>
      <td style="padding:8px 6px;border-bottom:1px solid ${COLOR.borde}"><strong>${escapar(p.codigo)}</strong><br><span style="color:${COLOR.suave};font-size:13px">${escapar(p.nombre)}</span></td>
      <td style="padding:8px 6px;border-bottom:1px solid ${COLOR.borde};text-align:right">${numero(p.existencias, 1)}</td>
      <td style="padding:8px 6px;border-bottom:1px solid ${COLOR.borde};text-align:right;color:${p.existencias <= 0 ? COLOR.rojo : COLOR.texto}">${escapar(p.existencias <= 0 ? 'En cero' : alcance(p.semanas, unidad))}</td>
      ${analista ? `<td style="padding:8px 6px;border-bottom:1px solid ${COLOR.borde};text-align:right">${p.sugerido ? numero(p.sugerido) : '—'}</td>` : ''}
    </tr>`;
  const parrafo = (t, color = COLOR.texto) => `<p style="margin:0 0 14px;color:${color};font-size:15px;line-height:1.5">${t}</p>`;
  const titulo = (t) => `<h2 style="margin:22px 0 10px;font-size:17px;color:${COLOR.texto}">${escapar(t)}</h2>`;
  let cuerpo = '';
  cuerpo += parrafo(`Hola, ${escapar(usuario.nombre)}:`);
  cuerpo += parrafo(`Así está el inventario de <strong>${escapar(nombreEmpresa)}</strong> hoy, ${escapar(fechaLarga(hoy))}. Datos hasta el ${escapar(inv.fuente.hasta)}.`);
  cuerpo += `<table role="presentation" width="100%" cellspacing="6" cellpadding="0" style="border-collapse:separate"><tr>${cifras.map(celda).join('')}</tr></table>`;
  if (movimientos.usaMovimientos && !movimientos.ayer) {
    cuerpo += `<div style="margin:16px 0;padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;color:${COLOR.ambar};font-size:14px">Ayer no se registraron movimientos. Si hubo ventas o llegó mercancía, regístrelas para que el inventario siga al día.</div>`;
  }
  if (cambios && (cambios.nuevosEnCero.length || cambios.nuevosPorAgotarse.length)) {
    cuerpo += titulo('Desde ayer');
    if (cambios.nuevosEnCero.length) cuerpo += parrafo(`Quedaron en cero: <strong>${escapar(cambios.nuevosEnCero.slice(0, 8).join(', '))}</strong>${cambios.nuevosEnCero.length > 8 ? '…' : ''}`);
    if (cambios.nuevosPorAgotarse.length) cuerpo += parrafo(`Empezaron a agotarse: <strong>${escapar(cambios.nuevosPorAgotarse.slice(0, 8).join(', '))}</strong>${cambios.nuevosPorAgotarse.length > 8 ? '…' : ''}`);
  }
  if (urgentes.length) {
    cuerpo += titulo('Lo más urgente');
    cuerpo += `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;color:${COLOR.texto}">
      <tr style="color:${COLOR.suave};font-size:12px;text-align:right"><td style="text-align:left;padding:0 6px 6px">Producto</td><td style="padding:0 6px 6px">Existencias</td><td style="padding:0 6px 6px">Alcanza para</td>${analista ? '<td style="padding:0 6px 6px">Sugerido</td>' : ''}</tr>
      ${urgentes.map(fila).join('')}</table>`;
  }
  if (conPedir.length) {
    cuerpo += titulo('Pedir ya, por proveedor');
    cuerpo += conPedir.slice(0, 8).map((p) => parrafo(`<strong>${escapar(p.nombre)}</strong>: ${numero(p.pideYa)} ${p.pideYa === 1 ? 'producto' : 'productos'} (tarda ${escapar(alcance(p.entrega, unidad))})`)).join('');
  }
  if (analista && r.dineroQuieto) cuerpo += parrafo(`Dinero quieto en lo que sobra: <strong>${escapar(plata(r.dineroQuieto))}</strong>.`);
  cuerpo += `<p style="margin:24px 0"><a href="${escapar(destino)}" style="display:inline-block;padding:12px 20px;background:${COLOR.primario};color:#ffffff;border-radius:10px;font-weight:700;text-decoration:none">${analista ? 'Ver el panel' : 'Registrar movimientos'}</a></p>`;
  const pie = baja
    ? `Recibe este correo porque activó el boletín diario de SINESC. <a href="${escapar(baja)}" style="color:${COLOR.suave}">Dejar de recibirlo</a>.`
    : 'Recibe este correo porque activó el boletín diario de SINESC. Para dejar de recibirlo, desactívelo en Mi cuenta.';
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

module.exports = { armarBoletin, resumenDelDia, cambiosDesde, alcance };
