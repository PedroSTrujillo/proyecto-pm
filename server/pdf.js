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

// El logo que subió la empresa (PNG o JPG) o null si no se puede leer. Devuelve también sus medidas
// para que el Excel lo dibuje sin deformarlo. Se usa también al subirlo (server/empresas.js).
function abrirImagen(buffer) {
  if (!buffer || !buffer.length) return null;
  try {
    const img = new PDFDocument({ autoFirstPage: false }).openImage(Buffer.from(buffer));
    return { buffer: Buffer.from(buffer), ancho: img.width, alto: img.height };
  } catch {
    return null;
  }
}

function encabezado(doc, { empresa, fecha, numero, logo, aprobado }) {
  // Con logo de la empresa, el pedido es de ella: SINESC queda pequeño al pie.
  if (logo) {
    doc.image(logo.buffer, MARGEN, 38, { fit: [150, 36], valign: 'center' });
  } else {
    doc.image(LOGO, MARGEN, 40, { width: 30, height: 30 });
    doc.font('Helvetica-Bold').fontSize(16).fillColor(C.oscuro).text('SINESC', MARGEN + 40, 47, { lineBreak: false });
  }
  const titulo = aprobado ? (numero ? `Pedido ${numero} aprobado` : 'Pedido aprobado') : numero ? `Pedido ${numero} para aprobar` : 'Pedido para aprobar';
  doc.font('Helvetica-Bold').fontSize(15).fillColor(C.texto).text(titulo, MARGEN, 42, { width: ANCHO, align: 'right' });
  doc.font('Helvetica').fontSize(9.5).fillColor(C.gris).text(`${empresa} · ${fecha}`, MARGEN, 61, { width: ANCHO, align: 'right' });
  doc.moveTo(MARGEN, 82).lineTo(MARGEN + ANCHO, 82).lineWidth(1.5).strokeColor(C.primario).stroke();
  doc.y = 96;
}

// "Ana Pérez · Jefe de compras"
const persona = (p) => (p && p.nombre ? `${p.nombre}${p.cargo ? ` · ${p.cargo}` : ''}` : '');

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
  const base = [['Código', 86, 'left'], ['Producto', 0, 'left'], ['Alcanza para', 62, 'right'], ['Cantidad', 58, 'right']];
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
 * lineas: [{ proveedor, codigo, nombre, cantidad, costo, semanas, nota? }]. Devuelve un Buffer.
 * Del pedido guardado llegan también numero, observaciones, preparadoPor { nombre, cargo, fecha },
 * aprobadoPor { nombre, cargo, fecha } si ya se aprobó y logo (abrirImagen) si la empresa subió uno
 * (server/pedidos.js). preparadoPor también puede ser solo el nombre.
 */
function pedidoPdf({ empresa, fecha, cadaCuanto, lineas, numero = null, preparadoPor = null, aprobadoPor = null, observaciones = '', logo = null }) {
  const preparo = typeof preparadoPor === 'string' ? { nombre: preparadoPor } : preparadoPor;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: MARGEN, bufferPages: true, info: { Title: `Pedido de ${empresa}`, Author: 'SINESC', Creator: 'SINESC' } });
    const partes = [];
    doc.on('data', (b) => partes.push(b));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const datos = { empresa, fecha, numero, logo, aprobado: Boolean(aprobadoPor) };
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
      `Cantidades sugeridas por SINESC para cubrir lo que tarda cada proveedor y ${cadaCuanto} más, ya revisadas por quien arma el pedido.${preparo && preparo.nombre ? ` Preparado por ${persona(preparo)}.` : ''}`,
      MARGEN, doc.y, { width: ANCHO },
    );
    if (observaciones) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(C.texto).text('Observaciones: ', MARGEN, doc.y, { continued: true, width: ANCHO });
      doc.font('Helvetica').fillColor(C.texto).text(observaciones, { width: ANCHO });
    }
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
        // Con nota, la fila es más alta y la nota va debajo del nombre del producto.
        const alto = l.nota ? 31 : 19;
        if (nuevaPaginaSiHaceFalta(doc, alto + 1, datos)) {
          franja(true);
          titulos();
        }
        const y = doc.y;
        if (k % 2) doc.rect(MARGEN, y, ANCHO, alto).fillColor(C.alterna).fill();
        const vals = [l.codigo, l.nombre, semanas(l.semanas), miles(l.cantidad), ...(conCosto ? [l.costo ? plata(l.costo) : '—', l.costo ? plata(l.cantidad * l.costo) : '—'] : [])];
        filaTabla(doc, columnas, vals, { y, alto: 19 });
        if (l.nota) {
          doc.font('Helvetica-Oblique').fontSize(8).fillColor(C.gris).text(`Nota: ${l.nota}`, MARGEN + columnas[0][1] + 6, y + 17, { width: columnas[1][1] - 12, height: 10, lineBreak: false, ellipsis: true });
        }
        doc.moveTo(MARGEN, y + alto).lineTo(MARGEN + ANCHO, y + alto).lineWidth(0.5).strokeColor(C.borde).stroke();
        doc.y = y + alto;
      });
      doc.y += 16;
    }

    // Total y firmas: quien preparó y quien aprobó, con su cargo y la fecha ya escritos si se saben.
    nuevaPaginaSiHaceFalta(doc, 200, datos);
    const yt = doc.y;
    doc.roundedRect(MARGEN, yt, ANCHO, 34, 6).fillColor(C.claro).fill();
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.oscuro).text('Total del pedido', MARGEN + 12, yt + 12, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.texto).text(
      `${miles(unidades(lineas))} unidades${conCosto ? ` · ${plata(valor(lineas))}` : ''}`,
      MARGEN, yt + 12, { width: ANCHO - 12, align: 'right', lineBreak: false },
    );
    const firma = (yf, x, ancho, texto, valor = '') => {
      if (valor) doc.font('Helvetica').fontSize(10).fillColor(C.texto).text(valor, x, yf - 14, { width: ancho, height: 12, lineBreak: false, ellipsis: true });
      doc.moveTo(x, yf).lineTo(x + ancho, yf).lineWidth(0.8).strokeColor(C.gris).stroke();
      doc.font('Helvetica').fontSize(9).fillColor(C.gris).text(texto, x, yf + 5, { width: ancho });
    };
    const fila = (yf, titulo, quien) => {
      firma(yf, MARGEN, 250, titulo, persona(quien));
      firma(yf, MARGEN + 270, 120, 'Firma');
      firma(yf, MARGEN + 410, ANCHO - 410, 'Fecha', (quien && quien.fecha) || '');
    };
    fila(yt + 76, 'Preparado por', preparo);
    fila(yt + 128, 'Aprobado por', aprobadoPor);

    // Pie de cada página.
    const { start, count } = doc.bufferedPageRange();
    for (let i = start; i < start + count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0; // el pie va debajo del margen: sin esto, pdfkit abre otra página
      doc.image(LOGO, MARGEN, PIE - 1.5, { width: 10, height: 10 });
      doc.font('Helvetica').fontSize(8).fillColor(C.gris).text(`Hecho con SINESC · ${numero ? `Pedido ${numero} de` : 'Pedido de'} ${empresa} · ${fecha}`, MARGEN + 14, PIE, { width: ANCHO - 104, height: 10, lineBreak: false, ellipsis: true });
      doc.text(`Página ${i - start + 1} de ${count}`, MARGEN, PIE, { width: ANCHO, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}

module.exports = { pedidoPdf, abrirImagen };
