// Reporte de rotación: una fila por producto, de menos a más semanas de inventario.

import { html, montar, numero, ventasSemana, semanas, dia, plural } from './util.js';

const POR_PAGINA = 200;

const SENALES = {
  no_en_ventas: 'No aparece en las ventas',
  no_en_existencias: 'No aparece en las existencias (se tomó 0)',
  existencias_negativas: 'Existencias negativas en el archivo',
  devoluciones: 'Las devoluciones igualan o superan las ventas',
  pico_recortado: (f) => `Mes fuera de lo normal: en ${mes(f.pico.mes)} vendió ${numero(f.pico.vendido)} y se contaron ${numero(f.pico.contado)}`,
  producto_nuevo: (f) => `Empezó a venderse hace poco: se cuentan ${semanas(f.semanasProducto)} semanas`,
};

function textoSenal(s, f) {
  const t = SENALES[s];
  return typeof t === 'function' ? t(f) : t || s;
}

const fmtMes = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
function mes(texto) {
  return fmtMes.format(new Date(`${texto}-01T00:00:00Z`));
}

function etiquetaEstado(f, umbrales) {
  if (f.estado === 'se_agota') return html`<span class="etiqueta roja" title="Menos de ${umbrales.seAgota} semanas">Se agota</span>`;
  if (f.sobra) return html`<span class="etiqueta azul" title="Más de ${umbrales.sobra} semanas o sin ventas">Sobra</span>`;
  return '';
}

function filaHTML(f, umbrales) {
  const clase = f.estado === 'se_agota' ? 'se-agota' : f.sobra ? 'sobra' : '';
  return html`<tr class="${clase}">
    <td class="codigo">${f.codigo}</td>
    <td>${f.nombre || html`<span class="sin-ventas">Sin nombre en el archivo</span>`}${f.senales.map((s) => html`<span class="senal">${textoSenal(s, f)}</span>`)}</td>
    <td class="numero" title="${f.promedioSimple !== undefined && f.estado !== 'sin_ventas' ? `Sin ajustes: ${ventasSemana(f.promedioSimple)} por semana` : ''}">${f.estado === 'sin_ventas' ? '0' : ventasSemana(f.promedioSemanal)}</td>
    <td class="numero">${numero(f.existencias)}</td>
    <td class="numero semanas">${f.semanasInventario === null ? html`<span class="sin-ventas">Sin ventas en el periodo</span>` : semanas(f.semanasInventario)}${etiquetaEstado(f, umbrales)}</td>
  </tr>`;
}

// El cálculo paso a paso, con un producto del propio archivo. Los reportes guardados antes de
// los ajustes (sin `r.ajustes`) se explican con el promedio simple con que se calcularon.
function explicacion(r) {
  if (!r.ajustes) return explicacionSimple(r);
  const p = r.periodo;
  const e = r.ejemplo;
  const a = r.ajustes;
  const s = r.resumen;
  return html`<div class="explicacion">
    <h3>¿De dónde sale el número?</h3>
    <p><span class="formula">Semanas de inventario</span> = existencias ÷ ventas por semana: cuántas semanas te alcanza lo que tienes si sigues vendiendo al mismo ritmo.</p>
    <p><span class="formula">Ventas por semana</span> sale de lo vendido en tu archivo (del ${dia(p.desde)} al ${dia(p.hasta)}, ${semanas(p.semanas)} semanas), con tres ajustes:</p>
    <ol class="ajustes">
      <li><strong>Lo reciente cuenta doble.</strong> Lo vendido desde el ${dia(p.recientesDesde)} (las últimas ${semanas(p.semanasRecientes)} semanas) pesa el doble, porque dice más de lo que viene que lo de hace un año.</li>
      <li><strong>Un mes fuera de lo normal no infla el promedio.</strong> Si un mes vendió más de ${a.vecesLoNormal} veces lo normal de ese producto y más del doble que cualquier otro mes (por ejemplo, una venta para un proyecto), se cuenta como ${a.vecesLoNormal} veces lo normal.${s.picosRecortados ? ` Pasó en ${plural(s.picosRecortados, 'producto', 'productos')}.` : ''}</li>
      <li><strong>Un producto nuevo no sale lento.</strong> Si su primera venta llegó mucho después del inicio del archivo (más de ${a.semanasMinimasProducto} semanas, y no porque se venda de vez en cuando), se cuentan las semanas desde esa primera venta y no todo el archivo.${s.productosNuevos ? ` Pasó en ${plural(s.productosNuevos, 'producto', 'productos')}.` : ''}</li>
    </ol>
    ${e ? html`<div class="ejemplo"><strong>Ejemplo con tu archivo: ${e.codigo}${e.nombre ? ` (${e.nombre})` : ''}</strong>
      <ol class="pasos-calculo">
        <li>Vendió ${numero(e.vendidoAjustado)} unidades en ${semanas(e.semanasProducto)} semanas; ${numero(e.vendidoReciente)} de ellas en las últimas ${semanas(e.semanasRecientes)}.</li>
        <li>Ventas por semana = (${numero(e.vendidoAjustado)} + ${numero(e.vendidoReciente)}) ÷ (${semanas(e.semanasProducto)} + ${semanas(e.semanasRecientes)}) = <strong>${ventasSemana(e.promedioSemanal)}</strong>.
          <span class="nota">Sin el ajuste serían ${numero(e.vendido)} ÷ ${semanas(e.semanasHistorico)} = ${ventasSemana(e.promedioSimple)}.</span></li>
        <li>Semanas de inventario = ${numero(e.existencias)} en existencias ÷ ${ventasSemana(e.promedioSemanal)} = <strong>${semanas(e.semanasInventario)} semanas</strong>.</li>
      </ol></div>` : ''}
  </div>`;
}

function explicacionSimple(r) {
  const p = r.periodo;
  const e = r.ejemplo;
  const T = semanas(p.semanas);
  return html`<div class="explicacion">
    <h3>¿De dónde sale el número?</h3>
    <p><span class="formula">Ventas promedio por semana</span> = todo lo vendido de ese producto en tu archivo ÷ las ${T} semanas que cubre (del ${dia(p.desde)} al ${dia(p.hasta)}).
    <span class="formula">Semanas de inventario</span> = existencias ÷ ventas promedio por semana: cuántas semanas te alcanza lo que tienes si sigues vendiendo igual.</p>
    ${e ? html`<p class="ejemplo"><strong>Ejemplo con tu archivo:</strong> ${e.codigo}${e.nombre ? ` (${e.nombre})` : ''} vendió ${numero(e.vendido)} unidades en ${T} semanas → ${numero(e.vendido)} ÷ ${T} = ${ventasSemana(e.promedioSemanal)} por semana.
      Tienes ${numero(e.existencias)} en existencias → ${numero(e.existencias)} ÷ ${ventasSemana(e.promedioSemanal)} = <strong>${semanas(e.semanasInventario)} semanas</strong> de inventario.</p>` : ''}
  </div>`;
}

function notas(r) {
  const avisos = r.avisos || [];
  const hojas = r.hojasUsadas || [];
  const nombresCampo = { codigo: 'código', nombre: 'nombre', fecha: 'fecha', cantidad: 'cantidad vendida', existencias: 'existencias' };
  return html`<details class="notas">
    <summary>Qué leímos de tu archivo${avisos.length ? ' (hay notas para revisar)' : ''}</summary>
    <ul>
      <li>${plural(r.resumen.filasVenta, 'fila de ventas', 'filas de ventas')} y ${plural(r.resumen.productos, 'producto', 'productos')}${r.archivos && r.archivos.length ? ` (${r.archivos.join(', ')})` : ''}.</li>
      ${hojas.map((h) => html`<li>${h.uso === 'ventas' ? 'Ventas' : h.uso === 'existencias' ? 'Existencias' : 'Ventas y existencias'}${h.hoja ? ` — hoja "${h.hoja}"` : ''}${h.porMes ? ' (una columna por mes)' : ''}: ${Object.entries(h.columnas).map(([k, v]) => `${nombresCampo[k] || k} en ${v}`).join('; ')}.</li>`)}
      ${avisos.map((a) => html`<li>${a}</li>`)}
    </ul>
  </details>`;
}

/**
 * Pinta el reporte dentro de `contenedor`.
 * opciones.compacto: para mostrarlo al lado de la lista final.
 */
export function pintarReporte(contenedor, r, { compacto = false } = {}) {
  const estado = { filtro: 'todos', busqueda: '', mostrar: POR_PAGINA };
  const u = r.umbrales || { seAgota: 2, sobra: 12 };
  const s = r.resumen;

  montar(contenedor, html`
    <div class="cifras">
      <div class="cifra"><strong>${numero(s.productos, 0)}</strong><span>productos</span></div>
      <div class="cifra roja"><strong>${numero(s.seAgotan, 0)}</strong><span>se agotan en menos de ${u.seAgota} semanas</span></div>
      <div class="cifra azul"><strong>${numero(s.sobran, 0)}</strong><span>sobran: más de ${u.sobra} semanas o sin ventas</span></div>
    </div>
    ${explicacion(r)}
    ${compacto ? '' : notas(r)}
    <div class="filtros">
      <input type="search" class="buscar" placeholder="Buscar por código o nombre" aria-label="Buscar por código o nombre">
      <div class="segmento" role="group" aria-label="Filtrar productos">
        <button type="button" data-filtro="todos" aria-pressed="true">Todos</button>
        <button type="button" data-filtro="se_agota" aria-pressed="false">Se agotan (menos de ${u.seAgota} semanas)</button>
        <button type="button" data-filtro="sobra" aria-pressed="false">Sobran</button>
      </div>
    </div>
    <div class="marco-tabla ${compacto ? 'limitado' : ''}">
      <table class="datos">
        <thead><tr>
          <th>Código</th><th>Producto</th><th class="numero">${r.ajustes ? 'Ventas por semana' : 'Ventas promedio por semana'}</th><th class="numero">Existencias</th><th class="numero">Semanas de inventario</th>
        </tr></thead>
        <tbody></tbody>
      </table>
      <div class="mas-filas oculto"><button type="button" class="boton chico mas">Mostrar más</button></div>
    </div>
    <p class="nota cuenta-filtro"></p>`);

  const tbody = contenedor.querySelector('tbody');
  const mas = contenedor.querySelector('.mas-filas');
  const cuenta = contenedor.querySelector('.cuenta-filtro');

  function filtradas() {
    const q = estado.busqueda.trim().toLowerCase();
    return r.filas.filter((f) => {
      if (estado.filtro === 'se_agota' && f.estado !== 'se_agota') return false;
      if (estado.filtro === 'sobra' && !f.sobra) return false;
      if (q && !String(f.codigo).toLowerCase().includes(q) && !String(f.nombre || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function pintarFilas() {
    const lista = filtradas();
    tbody.innerHTML = lista.slice(0, estado.mostrar).map((f) => filaHTML(f, u).toString()).join('')
      || html`<tr><td colspan="5" class="vacio">No hay productos con ese filtro.</td></tr>`.toString();
    const restantes = lista.length - Math.min(lista.length, estado.mostrar);
    mas.classList.toggle('oculto', restantes <= 0);
    mas.querySelector('button').textContent = `Mostrar ${Math.min(restantes, POR_PAGINA)} más (quedan ${numero(restantes, 0)})`;
    cuenta.textContent = lista.length === r.filas.length ? '' : `Mostrando ${numero(lista.length, 0)} de ${numero(r.filas.length, 0)} productos.`;
  }

  contenedor.querySelector('.buscar').addEventListener('input', (e) => {
    estado.busqueda = e.target.value;
    estado.mostrar = POR_PAGINA;
    pintarFilas();
  });
  contenedor.querySelector('.segmento').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-filtro]');
    if (!b) return;
    estado.filtro = b.dataset.filtro;
    estado.mostrar = POR_PAGINA;
    contenedor.querySelectorAll('.segmento button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    pintarFilas();
  });
  mas.addEventListener('click', () => {
    estado.mostrar += POR_PAGINA;
    pintarFilas();
  });

  pintarFilas();
}
