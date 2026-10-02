// Tabla que se maneja como una hoja de Excel: filas y columnas, Enter y flechas
// para moverse, y pegar varias filas copiadas de Excel (Ctrl+V / Cmd+V).

import { html, montar } from './util.js';

const COLUMNAS = ['codigo', 'nombre', 'cantidad'];
const FILAS_VACIAS_AL_FINAL = 3;
const FILAS_MINIMAS = 8;

function vacia(f) {
  return !f.codigo && !f.nombre && (f.cantidad === '' || f.cantidad === null || f.cantidad === undefined);
}

function normal(t) {
  return String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function pareceNumero(t) {
  const s = String(t ?? '').trim();
  return s !== '' && /^[-+(]?\$?\s*[\d.,\s]+\)?-?$/.test(s);
}

// Si lo pegado trae una fila de encabezados, ubica las columnas por su nombre.
function columnasPorEncabezado(fila) {
  const n = fila.map(normal);
  const buscar = (re) => n.findIndex((t) => re.test(t));
  const codigo = buscar(/^(cod|codigo|codigo producto|cod producto|referencia|ref|item|sku|articulo|codigo articulo|material|plu)\b/);
  if (codigo < 0) return null;
  let cantidad = buscar(/pedir|pedido|comprar|solicitad/);
  if (cantidad < 0) cantidad = buscar(/^(cantidad|cant|unidades)\b/);
  const nombre = buscar(/^(nombre|descripcion|producto|detalle|denominacion)/);
  return { codigo, nombre, cantidad };
}

function texto(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v).replace('.', ','); // sin separador de miles: 1000 -> "1000", 1.5 -> "1,5"
  return String(v);
}

/**
 * opciones:
 *   lineas: [{codigo, nombre, cantidad}]
 *   soloLectura: boolean
 *   extras: [{ titulo, valor(fila) -> {texto, clase} }]  columnas de solo lectura
 *   alCambiar(): se llama cuando el usuario edita
 */
export function crearHoja(contenedor, opciones) {
  const { soloLectura = false, extras = [], alCambiar = () => {} } = opciones;
  let filas = [];

  function fijarLineas(lineas) {
    filas = (lineas || []).map((l) => ({ codigo: texto(l.codigo), nombre: texto(l.nombre), cantidad: texto(l.cantidad) }));
    asegurarFilasVacias();
    pintarTodo();
  }

  function asegurarFilasVacias() {
    if (soloLectura) return;
    let vaciasAlFinal = 0;
    for (let i = filas.length - 1; i >= 0 && vacia(filas[i]); i--) vaciasAlFinal++;
    while (vaciasAlFinal < FILAS_VACIAS_AL_FINAL || filas.length < FILAS_MINIMAS) {
      filas.push({ codigo: '', nombre: '', cantidad: '' });
      vaciasAlFinal++;
    }
  }

  function celdasExtra(f) {
    return extras.map((x) => {
      const v = x.valor(f) || { texto: '' };
      return html`<td class="extra ${v.clase || ''}">${v.texto}</td>`;
    });
  }

  function filaHTML(f, i) {
    if (soloLectura) {
      return html`<tr><td class="n">${i + 1}</td><td>${f.codigo}</td><td>${f.nombre}</td><td class="extra">${f.cantidad}</td>${celdasExtra(f)}</tr>`;
    }
    const invalida = f.cantidad !== '' && !pareceNumero(f.cantidad) ? 'invalida' : '';
    return html`<tr data-i="${i}">
      <td class="n">${i + 1}</td>
      <td><input class="codigo" data-col="0" value="${f.codigo}" aria-label="Código, fila ${i + 1}" autocomplete="off" spellcheck="false"></td>
      <td><input class="nombre" data-col="1" value="${f.nombre}" aria-label="Nombre, fila ${i + 1}" autocomplete="off"></td>
      <td><input class="cantidad ${invalida}" data-col="2" value="${f.cantidad}" aria-label="Cantidad, fila ${i + 1}" inputmode="decimal" autocomplete="off"></td>
      ${celdasExtra(f)}
      <td class="quitar"><button type="button" tabindex="-1" aria-label="Quitar fila ${i + 1}" title="Quitar fila">×</button></td>
    </tr>`;
  }

  function pintarTodo() {
    const encabezadosExtra = extras.map((x) => html`<th>${x.titulo}</th>`);
    const visibles = soloLectura ? filas.filter((f) => !vacia(f)) : filas;
    montar(contenedor, html`
      <div class="marco-hoja">
        <table class="hoja ${soloLectura ? 'solo-lectura' : ''}">
          <thead><tr>
            <th>#</th><th class="c-codigo">Código</th><th>Nombre <span class="opcional">(opcional)</span></th><th class="c-cantidad">Cantidad</th>
            ${encabezadosExtra}${soloLectura ? '' : html`<th aria-label="Quitar"></th>`}
          </tr></thead>
          <tbody>${visibles.map(filaHTML)}</tbody>
        </table>
      </div>
      <div class="pie-hoja"><span class="cuenta-lineas"></span>${soloLectura ? '' : html`<button type="button" class="enlace vaciar">Vaciar lista</button>`}</div>`);
    actualizarCuenta();
  }

  function actualizarCuenta() {
    const n = filas.filter((f) => f.codigo).length;
    const el = contenedor.querySelector('.cuenta-lineas');
    if (el) el.textContent = n === 1 ? '1 producto' : `${n} productos`;
  }

  function actualizarExtras(tr, f) {
    if (!extras.length) return;
    const tds = tr.querySelectorAll('td.extra');
    extras.forEach((x, k) => {
      const v = x.valor(f) || { texto: '' };
      tds[k].textContent = v.texto;
      tds[k].className = `extra ${v.clase || ''}`;
    });
  }

  function enfocar(i, col) {
    const input = contenedor.querySelector(`tr[data-i="${i}"] input[data-col="${col}"]`);
    if (input) { input.focus(); input.select(); }
  }

  function agregarFilaAlDOM() {
    filas.push({ codigo: '', nombre: '', cantidad: '' });
    const tbody = contenedor.querySelector('tbody');
    tbody.insertAdjacentHTML('beforeend', filaHTML(filas[filas.length - 1], filas.length - 1).toString());
  }

  if (!soloLectura) {
    contenedor.addEventListener('input', (e) => {
      const input = e.target.closest('input[data-col]');
      if (!input) return;
      const tr = input.closest('tr');
      const i = Number(tr.dataset.i);
      const campo = COLUMNAS[Number(input.dataset.col)];
      filas[i][campo] = input.value;
      if (campo === 'cantidad') input.classList.toggle('invalida', input.value.trim() !== '' && !pareceNumero(input.value));
      tr.classList.remove('con-error');
      actualizarExtras(tr, filas[i]);
      let vaciasAlFinal = 0;
      for (let k = filas.length - 1; k >= 0 && vacia(filas[k]); k--) vaciasAlFinal++;
      while (vaciasAlFinal < FILAS_VACIAS_AL_FINAL) { agregarFilaAlDOM(); vaciasAlFinal++; }
      actualizarCuenta();
      alCambiar();
    });

    contenedor.addEventListener('keydown', (e) => {
      const input = e.target.closest('input[data-col]');
      if (!input) return;
      const i = Number(input.closest('tr').dataset.i);
      const col = Number(input.dataset.col);
      const alInicio = input.selectionStart === 0 && input.selectionEnd === 0;
      const alFinal = input.selectionStart === input.value.length;
      if (e.key === 'Enter' || (e.key === 'ArrowDown' && !e.altKey)) {
        e.preventDefault();
        if (e.key === 'Enter' && e.shiftKey) return enfocar(Math.max(0, i - 1), col);
        if (i + 1 >= filas.length) agregarFilaAlDOM();
        enfocar(i + 1, col);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        enfocar(Math.max(0, i - 1), col);
      } else if (e.key === 'ArrowLeft' && alInicio && col > 0) {
        e.preventDefault();
        enfocar(i, col - 1);
      } else if (e.key === 'ArrowRight' && alFinal && col < 2) {
        e.preventDefault();
        enfocar(i, col + 1);
      }
    });

    contenedor.addEventListener('paste', (e) => {
      const input = e.target.closest('input[data-col]');
      if (!input) return;
      const datos = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (!datos || (!datos.includes('\t') && !/\r?\n./.test(datos))) return; // una sola celda: pegado normal
      e.preventDefault();
      pegar(Number(input.closest('tr').dataset.i), Number(input.dataset.col), datos);
    });

    contenedor.addEventListener('click', (e) => {
      const quitar = e.target.closest('td.quitar button');
      if (quitar) {
        const i = Number(quitar.closest('tr').dataset.i);
        filas.splice(i, 1);
        asegurarFilasVacias();
        pintarTodo();
        alCambiar();
        return;
      }
      if (e.target.closest('.vaciar')) {
        if (!filas.some((f) => !vacia(f))) return;
        if (!window.confirm('¿Borrar todas las filas de la lista?')) return;
        filas = [];
        asegurarFilasVacias();
        pintarTodo();
        alCambiar();
      }
    });
  }

  function separarFilas(datos) {
    // Excel copia con tabulaciones y saltos de línea; las celdas con saltos van entre comillas.
    const out = [];
    let fila = [];
    let celda = '';
    let comillas = false;
    for (let k = 0; k < datos.length; k++) {
      const ch = datos[k];
      if (comillas) {
        if (ch === '"' && datos[k + 1] === '"') { celda += '"'; k++; } else if (ch === '"') comillas = false; else celda += ch;
      } else if (ch === '"' && celda === '') comillas = true;
      else if (ch === '\t') { fila.push(celda); celda = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && datos[k + 1] === '\n') k++;
        fila.push(celda); out.push(fila); fila = []; celda = '';
      } else celda += ch;
    }
    if (celda !== '' || fila.length) { fila.push(celda); out.push(fila); }
    return out.map((f) => f.map((c) => c.trim())).filter((f) => f.some((c) => c !== ''));
  }

  function pegar(i, col, datos) {
    let bloque = separarFilas(datos);
    if (!bloque.length) return;
    let mapa = null; // índice de columna pegada para cada campo
    const porEncabezado = columnasPorEncabezado(bloque[0]);
    if (porEncabezado && bloque[0].length > 1 && !pareceNumero(bloque[0][porEncabezado.cantidad] ?? 'x')) {
      mapa = porEncabezado;
      bloque = bloque.slice(1);
    } else if (col === 0 && bloque.every((f) => f.length === 2) && bloque.filter((f) => pareceNumero(f[1])).length >= bloque.length * 0.6) {
      mapa = { codigo: 0, nombre: -1, cantidad: 1 }; // código y cantidad
    }
    bloque.forEach((celdas, k) => {
      const destino = i + k;
      while (filas.length <= destino) filas.push({ codigo: '', nombre: '', cantidad: '' });
      const f = filas[destino];
      if (mapa) {
        if (mapa.codigo >= 0) f.codigo = celdas[mapa.codigo] ?? '';
        if (mapa.nombre >= 0) f.nombre = celdas[mapa.nombre] ?? '';
        if (mapa.cantidad >= 0) f.cantidad = celdas[mapa.cantidad] ?? '';
      } else {
        celdas.slice(0, 3 - col).forEach((c, j) => { f[COLUMNAS[col + j]] = c; });
      }
    });
    asegurarFilasVacias();
    pintarTodo();
    enfocar(Math.min(i + bloque.length, filas.length - 1), col);
    alCambiar();
  }

  function marcarErrores(errores) {
    contenedor.querySelectorAll('tr.con-error').forEach((tr) => tr.classList.remove('con-error'));
    for (const e of errores || []) {
      const tr = contenedor.querySelector(`tr[data-i="${e.fila - 1}"]`);
      if (tr) tr.classList.add('con-error');
    }
  }

  fijarLineas(opciones.lineas);

  return {
    // Todas las filas (con vacías intermedias) para que los números de fila coincidan.
    obtenerLineas() {
      const out = filas.map((f) => ({ codigo: f.codigo.trim(), nombre: f.nombre.trim(), cantidad: f.cantidad.trim() }));
      while (out.length && vacia(out[out.length - 1])) out.pop();
      return out;
    },
    fijarLineas,
    marcarErrores,
    refrescarExtras() {
      contenedor.querySelectorAll('tbody tr[data-i]').forEach((tr) => actualizarExtras(tr, filas[Number(tr.dataset.i)]));
    },
  };
}

