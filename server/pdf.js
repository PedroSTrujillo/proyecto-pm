'use strict';

// El pedido para que gerencia lo apruebe, como PDF tamaño carta con el diseño de SINESC: logo,
// resumen, una tabla por proveedor con su total, espacio para la firma y número de página.
// Usa las fuentes que trae todo lector de PDF (Helvetica), que incluyen tildes y la ñ.

const PDFDocument = require('pdfkit');
const LOGO = require('./logo');

const C = {
  primario: '#0F766E',
  oscuro: '#0B5D57',
  claro: '#E7F3F1',
  alterna: '#F6F7F5',
  texto: '#111827',
  gris: '#4B5563',
  borde: '#E5E7EB',
  ambar: '#B45309',
};
const MARGEN = 48;
const ANCHO = 612 - MARGEN * 2; // carta: 612 × 792 puntos
const PIE = 792 - 40;

const miles = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const plata = (n) => `$ ${miles(n)}`;
const semanas = (s) => (s === null || s === undefined ? 'sin ventas' : `${String(Math.round(s * 10) / 10).replace('.', ',')} sem`);

function encabezado(doc, { empresa, fecha }) {
  doc.image(LOGO, MARGEN, 40, { width: 30, height: 30 });
  doc.font('Helvetica-Bold').fontSize(16).fillColor(C.oscuro).text('SINESC', MARGEN + 40, 47, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(15).fillColor(C.texto).text('Pedido para aprobar', MARGEN, 42, { width: ANCHO, align: 'right' });
  doc.font('Helvetica').fontSize(9.5).fillColor(C.gris).text(`${empresa} · ${fecha}`, MARGEN, 61, { width: ANCHO, align: 'right' });
  doc.moveTo(MARGEN, 82).lineTo(MARGEN + ANCHO, 82).lineWidth(1.5).strokeColor(C.primario).stroke();
  doc.y = 96;
}

function cifras(doc, datos) {
  const y = doc.y;
  const ancho = (ANCHO - 12 * (datos.length - 1)) / datos.length;
  datos.forEach(([titulo, valor], k) => {
    const x = MARGEN + k * (ancho + 12);
    doc.roundedRect(x, y, ancho, 50, 6).fillColor(C.claro).fill();
    doc.font('Helvetica').fontSize(8.5).fillColor(C.oscuro).text(titulo.toUpperCase(), x + 10, y + 9, { width: ancho - 20, characterSpacing: 0.4 });
    // Si el número no cabe a 16 puntos, se achica hasta que quepa en una línea.
    let tam = 16;
    doc.font('Helvetica-Bold');
    while (tam > 10 && doc.fontSize(tam).widthOfString(valor) > ancho - 20) tam -= 1;
    doc.fontSize(tam).fillColor(C.texto).text(valor, x + 10, y + 24 + (16 - tam) / 2, { width: ancho - 20, lineBreak: false });
  });
  doc.y = y + 64;
}

function columnasDe(conCosto) {
  // [título, ancho, alineación]
  const base = [['Código', 86, 'left'], ['Producto', 0, 'left'], ['Te alcanza', 62, 'right'], ['Cantidad', 58, 'right']];
  if (conCosto) base.push(['Costo unit.', 66, 'right'], ['Valor', 74, 'right']);
  const fijo = base.reduce((s, c) => s + c[1], 0);
  base[1][1] = ANCHO - fijo;
  return base;
}

function filaTabla(doc, columnas, valores, { y, alto, fondo, fuente = 'Helvetica', color = C.texto, tam = 9 }) {
  if (fondo) doc.rect(MARGEN, y, ANCHO, alto).fillColor(fondo).fill();
  let x = MARGEN;
  columnas.forEach(([, ancho, alinea], k) => {
    doc.font(fuente).fontSize(tam).fillColor(color).text(String(valores[k] ?? ''), x + 6, y + (alto - tam) / 2 - 0.5, { width: ancho - 12, height: tam + 3, align: alinea, lineBreak: false, ellipsis: true });
    x += ancho;
  });
  doc.y = y; // doc.text mueve el cursor: la fila la avanza quien llama
}

function nuevaPaginaSiHaceFalta(doc, alto, datos) {
  if (doc.y + alto <= PIE - 24) return false;
  doc.addPage();
  encabezado(doc, datos);
  return true;
}

/**
 * lineas: [{ proveedor, codigo, nombre, cantidad, costo, semanas }]. Devuelve un Buffer.
 */
function pedidoPdf({ empresa, fecha, cadaCuanto, lineas }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: MARGEN, bufferPages: true, info: { Title: `Pedido de ${empresa}`, Author: 'SINESC', Creator: 'SINESC' } });
    const partes = [];
    doc.on('data', (b) => partes.push(b));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const datos = { empresa, fecha };
    const porProveedor = new Map();
    for (const l of lineas) {
      const p = l.proveedor || 'Sin proveedor';
      if (!porProveedor.has(p)) porProveedor.set(p, []);
      porProveedor.get(p).push(l);
    }
    const conCosto = lineas.some((l) => l.costo > 0);
    const valor = (ls) => ls.reduce((s, l) => s + l.cantidad * (l.costo || 0), 0);
    const unidades = (ls) => ls.reduce((s, l) => s + l.cantidad, 0);

    encabezado(doc, datos);
    doc.font('Helvetica').fontSize(10).fillColor(C.gris).text(
      `Cantidades sugeridas por SINESC para cubrir lo que tarda cada proveedor y ${cadaCuanto} más, ya revisadas por quien arma el pedido.`,
      MARGEN, doc.y, { width: ANCHO },
    );
    doc.moveDown(0.8);
    cifras(doc, [
      ['Proveedores', miles(porProveedor.size)],
      ['Líneas', miles(lineas.length)],
      ['Unidades', miles(unidades(lineas))],
      ...(conCosto ? [['Valor a costo', plata(valor(lineas))]] : []),
    ]);

    const columnas = columnasDe(conCosto);
    for (const [proveedor, ls] of porProveedor) {
      nuevaPaginaSiHaceFalta(doc, 70, datos);
      // Franja del proveedor (se repite con "continúa" si la tabla sigue en otra página).
      const franja = (sigue) => {
        const y0 = doc.y;
        doc.rect(MARGEN, y0, ANCHO, 24).fillColor(C.primario).fill();
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#FFFFFF').text(sigue ? `${proveedor} (continúa)` : proveedor, MARGEN + 8, y0 + 7, { width: ANCHO * 0.6, lineBreak: false, ellipsis: true });
        if (!sigue) {
          doc.font('Helvetica').fontSize(9).fillColor('#FFFFFF').text(
            `${ls.length} ${ls.length === 1 ? 'línea' : 'líneas'} · ${miles(unidades(ls))} unidades${conCosto ? ` · ${plata(valor(ls))}` : ''}`,
            MARGEN, y0 + 8, { width: ANCHO - 8, align: 'right', lineBreak: false },
          );
        }
        doc.y = y0 + 24;
      };
      franja(false);
      const titulos = () => {
        filaTabla(doc, columnas, columnas.map((c) => c[0]), { y: doc.y, alto: 20, fondo: C.claro, fuente: 'Helvetica-Bold', color: C.oscuro, tam: 8.5 });
        doc.y += 20;
      };
      titulos();
      ls.forEach((l, k) => {
        if (nuevaPaginaSiHaceFalta(doc, 20, datos)) {
          franja(true);
          titulos();
        }
        const vals = [l.codigo, l.nombre, semanas(l.semanas), miles(l.cantidad), ...(conCosto ? [l.costo ? plata(l.costo) : '—', l.costo ? plata(l.cantidad * l.costo) : '—'] : [])];
        filaTabla(doc, columnas, vals, { y: doc.y, alto: 19, fondo: k % 2 ? C.alterna : null });
        doc.moveTo(MARGEN, doc.y + 19).lineTo(MARGEN + ANCHO, doc.y + 19).lineWidth(0.5).strokeColor(C.borde).stroke();
        doc.y += 19;
      });
      doc.y += 16;
    }

    // Total y firma.
    nuevaPaginaSiHaceFalta(doc, 150, datos);
    const yt = doc.y;
    doc.roundedRect(MARGEN, yt, ANCHO, 34, 6).fillColor(C.claro).fill();
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.oscuro).text('Total del pedido', MARGEN + 12, yt + 12, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.texto).text(
      `${miles(unidades(lineas))} unidades${conCosto ? ` · ${plata(valor(lineas))}` : ''}`,
      MARGEN, yt + 12, { width: ANCHO - 12, align: 'right', lineBreak: false },
    );
    const yf = yt + 84;
    const firma = (x, ancho, texto) => {
      doc.moveTo(x, yf).lineTo(x + ancho, yf).lineWidth(0.8).strokeColor(C.gris).stroke();
      doc.font('Helvetica').fontSize(9).fillColor(C.gris).text(texto, x, yf + 5, { width: ancho });
    };
    firma(MARGEN, 200, 'Aprobado por');
    firma(MARGEN + 230, 150, 'Firma');
    firma(MARGEN + 410, ANCHO - 410, 'Fecha');

    // Pie de cada página.
    const { start, count } = doc.bufferedPageRange();
    for (let i = start; i < start + count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0; // el pie va debajo del margen: sin esto, pdfkit abre otra página
      doc.font('Helvetica').fontSize(8).fillColor(C.gris).text(`SINESC · Pedido de ${empresa} · ${fecha}`, MARGEN, PIE, { width: ANCHO - 90, height: 10, lineBreak: false, ellipsis: true });
      doc.text(`Página ${i - start + 1} de ${count}`, MARGEN, PIE, { width: ANCHO, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}

module.exports = { pedidoPdf };
