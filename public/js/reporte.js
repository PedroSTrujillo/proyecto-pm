// Reporte de rotación: una fila por producto, de menos a más semanas de inventario.

import { html, montar, numero, ventasSemana, semanas, plural } from './util.js';

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

// El cálculo en dos líneas, con un producto del propio archivo (requisito del MVP: que el número
// se entienda). Los reportes viejos y los de totales por periodo usan el promedio simple.
function explicacion(r) {
  const e = r.ejemplo;
  const conAjustes = r.ajustes && !r.periodo.totales;
  return html`<details class="explicacion">
    <summary>¿De dónde sale el número?</summary>
    <p><strong>Semanas de inventario = existencias ÷ ventas por semana.</strong>
      ${e ? `Por ejemplo, ${e.codigo} vende ${ventasSemana(e.promedioSemanal)} por semana y tienes ${numero(e.existencias)}: te alcanza para ${semanas(e.semanasInventario)} semanas.` : ''}</p>
    <p class="nota">${conAjustes
      ? 'Las ventas por semana salen de tu archivo: lo de los últimos 3 meses cuenta doble, un mes fuera de lo normal no infla el promedio y un producto nuevo se mide desde su primera venta.'
      : `Las ventas por semana son todo lo vendido en tu archivo dividido entre sus ${semanas(r.periodo.semanas)} semanas.`}</p>
  </details>`;
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
          <th>Código</th><th>Producto</th><th class="numero">Ventas/semana</th><th class="numero">Existencias</th><th class="numero">Semanas de inventario</th>
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
