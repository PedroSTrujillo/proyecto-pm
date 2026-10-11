import { html, montar, api, fecha, fechaHora, dia, numero, plural, debounce, mensajeError, claveCodigo, semanas } from './util.js';
import { crearHoja } from './hoja.js';
import { pintarReporte } from './reporte.js';
import { SISTEMAS, GENERICA, sistemaPorId } from './sistemas.js';

const app = document.getElementById('app');
const menu = document.getElementById('menu');
let usuario = null;
let landing = null; // dirección de la página de presentación
let destinoTrasEntrar = null;
let alSalirDeVista = []; // p. ej. guardar el borrador antes de cambiar de pantalla

const NOMBRES_PASOS = ['Lista inicial', 'Subir export', 'Ver reporte', 'Lista final', '¿Por qué cambió?'];
const LEMA = 'Sube lo que exportas de tu programa contable y mira, en semanas de inventario, qué productos se agotan primero y cuáles sobran.';

// --- Navegación ---------------------------------------------------------------------

function ir(hash) {
  if (location.hash === hash) enrutar();
  else location.hash = hash;
}

async function enrutar() {
  for (const f of alSalirDeVista.splice(0)) {
    try { await f(); } catch { /* el borrador se intentará de nuevo */ }
  }
  const partes = (location.hash.replace(/^#/, '') || '/').split('/').filter(Boolean);
  window.scrollTo(0, 0);
  if (partes[0] === 'restablecer' && partes[1]) return vistaRestablecer(partes[1]);
  const publicas = ['entrar', 'crear-cuenta', 'olvide'];
  if (!usuario) {
    if (!publicas.includes(partes[0]) && partes.length) destinoTrasEntrar = location.hash;
    if (partes[0] === 'crear-cuenta') return vistaCrearCuenta();
    if (partes[0] === 'olvide') return vistaOlvide();
    return vistaEntrar();
  }
  if (publicas.includes(partes[0])) return ir('#/');
  if (partes[0] === 'cuenta') return vistaCuenta();
  if (partes[0] === 'pedido' && partes[1]) return vistaPedido(Number(partes[1]), partes[2] ? Number(partes[2]) : null);
  if (partes[0] === 'equipo') return vistaEquipo();
  return vistaInicio();
}

function pintarMenu() {
  const principal = landing ? html`<a href="${landing}">Página principal</a>` : '';
  if (!usuario) { montar(menu, principal); return; }
  montar(menu, html`
    ${principal}
    <a href="#/">Mis pedidos</a>
    ${usuario.rol === 'equipo' ? html`<a href="#/equipo">Resultados de la prueba</a>` : ''}
    <a href="#/cuenta" class="quien" title="Mi cuenta">${usuario.nombre}</a>
    <button type="button" class="enlace salir">Salir</button>`);
  menu.querySelector('.salir').addEventListener('click', async () => {
    for (const f of alSalirDeVista.splice(0)) { try { await f(); } catch { /* nada */ } }
    await api('POST', '/cuenta/salir').catch(() => {});
    usuario = null;
    pintarMenu();
    ir('#/entrar');
  });
}

window.addEventListener('sesion-cerrada', () => {
  if (!usuario) return;
  usuario = null;
  pintarMenu();
  destinoTrasEntrar = location.hash;
  ir('#/entrar');
});

function error(cont, e) {
  montar(cont, mensajeError(e));
}

// --- Cuenta ---------------------------------------------------------------------------

function formularioCuenta({ titulo, boton, conNombre, enviar, pie }) {
  montar(app, html`
    <div class="caja-cuenta">
      <h1>${titulo}</h1>
      <p class="lema">${LEMA}</p>
      <form class="tarjeta" novalidate>
        ${conNombre ? html`<label class="campo">Tu nombre <input type="text" name="nombre" required autocomplete="name"></label>` : ''}
        <label class="campo">Correo <input type="email" name="email" required autocomplete="email"></label>
        <label class="campo">Contraseña ${conNombre ? html`<span class="opcional">(mínimo 8 caracteres)</span>` : ''}
          <input type="password" name="clave" required autocomplete="${conNombre ? 'new-password' : 'current-password'}"></label>
        <div class="mensajes"></div>
        <button class="boton primario" type="submit">${boton}</button>
        <p class="nota">${pie}</p>
      </form>
      ${conNombre ? '' : html`<div class="tarjeta crear-cuenta-aviso">
        <p><strong>¿Es tu primera vez?</strong> Para usar SINESC necesitas una cuenta. Es gratis y toma un minuto.</p>
        <a class="boton" href="#/crear-cuenta">Crear una cuenta</a>
      </div>`}
    </div>`);
  const form = app.querySelector('form');
  form.querySelector('input').focus();
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const b = form.querySelector('button[type="submit"]');
    b.disabled = true;
    try {
      const datos = Object.fromEntries(new FormData(form));
      ({ usuario } = await enviar(datos));
      pintarMenu();
      const destino = destinoTrasEntrar;
      destinoTrasEntrar = null;
      ir(destino || '#/');
    } catch (e) {
      error(form.querySelector('.mensajes'), e);
      b.disabled = false;
    }
  });
}

function vistaEntrar() {
  formularioCuenta({
    titulo: 'Entra a tu cuenta',
    boton: 'Entrar',
    enviar: (d) => api('POST', '/cuenta/entrar', d),
    pie: html`<a href="#/olvide">¿Olvidaste tu contraseña?</a>`,
  });
}

function vistaCrearCuenta() {
  formularioCuenta({
    titulo: 'Crea tu cuenta',
    boton: 'Crear cuenta',
    conNombre: true,
    enviar: (d) => api('POST', '/cuenta/crear', d),
    pie: html`¿Ya tienes cuenta? <a href="#/entrar">Entra</a>.`,
  });
}

function vistaOlvide() {
  montar(app, html`
    <div class="caja-cuenta">
      <h1>¿Olvidaste tu contraseña?</h1>
      <form class="tarjeta" novalidate>
        <label class="campo">Tu correo <input type="email" name="email" required autocomplete="email"></label>
        <div class="mensajes"></div>
        <button class="boton primario" type="submit">Pedir un enlace para cambiarla</button>
        <p class="nota"><a href="#/entrar">Volver a entrar</a></p>
      </form>
    </div>`);
  const form = app.querySelector('form');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const b = form.querySelector('button[type="submit"]');
    b.disabled = true;
    try {
      const r = await api('POST', '/cuenta/olvide', Object.fromEntries(new FormData(form)));
      montar(form.querySelector('.mensajes'), r.correo
        ? html`<div class="mensaje ok">Si hay una cuenta con ese correo, te enviamos un enlace para cambiar la contraseña. Revisa también la carpeta de correo no deseado.</div>`
        : html`<div class="mensaje info">Escríbele al equipo que te invitó a la prueba: ellos te mandan un enlace para poner una contraseña nueva.</div>`);
    } catch (e) {
      error(form.querySelector('.mensajes'), e);
      b.disabled = false;
    }
  });
}

function vistaRestablecer(token) {
  montar(app, html`
    <div class="caja-cuenta">
      <h1>Pon una contraseña nueva</h1>
      <form class="tarjeta" novalidate>
        <label class="campo">Contraseña nueva <span class="opcional">(mínimo 8 caracteres)</span>
          <input type="password" name="clave" required autocomplete="new-password"></label>
        <label class="campo">Escríbela otra vez <input type="password" name="repetida" required autocomplete="new-password"></label>
        <div class="mensajes"></div>
        <button class="boton primario" type="submit">Guardar y entrar</button>
      </form>
    </div>`);
  const form = app.querySelector('form');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const { clave, repetida } = Object.fromEntries(new FormData(form));
    if (clave !== repetida) return montar(form.querySelector('.mensajes'), html`<div class="mensaje error">Las dos contraseñas no son iguales.</div>`);
    const b = form.querySelector('button[type="submit"]');
    b.disabled = true;
    try {
      ({ usuario } = await api('POST', '/cuenta/restablecer', { token, clave }));
      pintarMenu();
      ir('#/');
    } catch (e) {
      error(form.querySelector('.mensajes'), e);
      b.disabled = false;
    }
  });
}

function opcionesSistema(elegido) {
  return html`<option value="">Elige tu programa</option>${SISTEMAS.map((s) => html`<option value="${s.id}" ${s.id === elegido ? 'selected' : ''}>${s.nombre}</option>`)}`;
}

async function guardarSistema(sistema) {
  ({ usuario } = await api('PUT', '/cuenta/datos', { sistema: sistema || null }));
}

function vistaCuenta() {
  montar(app, html`
    <h1>Mi cuenta</h1>
    <section class="tarjeta">
      <h2>Tus datos</h2>
      <form class="datos" novalidate>
        <label class="campo">Nombre <input type="text" name="nombre" required value="${usuario.nombre}" autocomplete="name"></label>
        <label class="campo">Correo <input type="email" value="${usuario.email}" disabled></label>
        <label class="campo">Programa contable <select name="sistema">${opcionesSistema(usuario.sistema)}</select></label>
        <div class="mensajes"></div>
        <div class="acciones"><button class="boton primario" type="submit">Guardar</button></div>
      </form>
    </section>
    <section class="tarjeta">
      <h2>Cambiar contraseña</h2>
      <form class="clave" novalidate>
        <label class="campo">Contraseña actual <input type="password" name="actual" required autocomplete="current-password"></label>
        <label class="campo">Contraseña nueva <span class="opcional">(mínimo 8 caracteres)</span>
          <input type="password" name="nueva" required autocomplete="new-password"></label>
        <div class="mensajes"></div>
        <div class="acciones"><button class="boton primario" type="submit">Cambiar contraseña</button></div>
      </form>
    </section>`);

  const datos = app.querySelector('form.datos');
  datos.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const { nombre, sistema } = Object.fromEntries(new FormData(datos));
    try {
      ({ usuario } = await api('PUT', '/cuenta/datos', { nombre, sistema: sistema || null }));
      pintarMenu();
      montar(datos.querySelector('.mensajes'), html`<div class="mensaje ok">Guardado.</div>`);
    } catch (e) {
      error(datos.querySelector('.mensajes'), e);
    }
  });

  const clave = app.querySelector('form.clave');
  clave.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      await api('PUT', '/cuenta/clave', Object.fromEntries(new FormData(clave)));
      clave.reset();
      montar(clave.querySelector('.mensajes'), html`<div class="mensaje ok">Listo, cambiaste tu contraseña. Si tenías la sesión abierta en otro computador, allá tendrás que entrar de nuevo.</div>`);
    } catch (e) {
      error(clave.querySelector('.mensajes'), e);
    }
  });
}

// --- Inicio: mis pedidos -------------------------------------------------------------------

function estadoPedido(p) {
  if (p.paso === 6) return html`<span class="etiqueta verde">Terminado</span>`;
  return html`Paso ${p.paso} de 5: ${NOMBRES_PASOS[p.paso - 1].toLowerCase()}`;
}

async function nuevoPedido(boton) {
  boton.disabled = true;
  try {
    const { pedido } = await api('POST', '/pedidos', {});
    ir(`#/pedido/${pedido.id}`);
  } catch (e) {
    boton.disabled = false;
    window.alert(e.message);
  }
}

async function vistaInicio() {
  montar(app, html`<p class="cargando">Cargando tus pedidos…</p>`);
  let pedidos;
  try {
    ({ pedidos } = await api('GET', '/pedidos'));
  } catch (e) {
    return error(app, e);
  }

  const pasos = html`<ol class="pasos-explicados">
      <li><span><strong>Anota lo que ibas a pedir</strong>, antes de ver el reporte (escríbelo, pégalo desde Excel o importa tu archivo).</span></li>
      <li><span><strong>Sube el export de ventas y existencias</strong> de tu software contable, tal como sale.</span></li>
      <li><span><strong>Mira la rotación</strong>: cuántas semanas de inventario te quedan de cada producto, de lo que se agota primero a lo que sobra.</span></li>
      <li><span><strong>Ajusta tu lista</strong> con lo que de verdad vas a pedir.</span></li>
      <li><span><strong>Cuéntanos por qué</strong> cambiaste lo que cambiaste.</span></li>
    </ol>`;

  if (!pedidos.length) {
    montar(app, html`
      <section class="tarjeta">
        <h1>Hola, ${usuario.nombre.split(' ')[0]}</h1>
        <p class="ayuda">${LEMA} Cada pedido tiene 5 pasos y toma unos 5 minutos si tienes tu export a mano.</p>
        ${pasos}
        <button type="button" class="boton primario nuevo">Empezar mi primer pedido</button>
      </section>`);
  } else {
    montar(app, html`
      <div class="encabezado-pagina">
        <div><h1>Mis pedidos</h1><p class="ayuda">Cuando vayas a pedirle a un proveedor, prepara un pedido nuevo y sube tu export más reciente.</p></div>
        <button type="button" class="boton primario nuevo">Preparar un pedido nuevo</button>
      </div>
      <div class="marco-tabla">
        <table class="datos">
          <thead><tr><th>Pedido</th><th>Empezado</th><th>Tipo</th><th>Estado</th><th class="numero">Líneas cambiadas</th><th></th></tr></thead>
          <tbody>${pedidos.map((p) => html`<tr>
            <td>#${p.id}${p.proveedor ? html` · ${p.proveedor}` : ''}</td>
            <td>${fecha(p.creadoEn)}</td>
            <td>${p.tipo === 'real' ? 'Real' : p.tipo === 'simulado' ? 'Simulado' : '—'}</td>
            <td>${estadoPedido(p)}</td>
            <td class="numero">${p.conteo ? numero(p.conteo.total, 0) : '—'}</td>
            <td><a href="#/pedido/${p.id}">${p.paso === 6 ? 'Ver' : 'Continuar'}</a></td>
          </tr>`)}</tbody>
        </table>
      </div>
      <details class="notas tarjeta"><summary>¿Cómo funciona?</summary>${pasos}</details>`);
  }
  app.querySelector('.nuevo').addEventListener('click', (e) => nuevoPedido(e.currentTarget));
}

// --- Pedido: estructura y pasos --------------------------------------------------------------

async function vistaPedido(id, pasoPedido) {
  montar(app, html`<p class="cargando">Cargando el pedido…</p>`);
  let pedido;
  try {
    ({ pedido } = await api('GET', `/pedidos/${id}`));
  } catch (e) {
    return montar(app, html`<a class="volver" href="#/">← Mis pedidos</a>${mensajeError(e)}`);
  }
  const alcanzable = Math.min(pedido.paso, 5);
  let paso = pasoPedido && pasoPedido >= 1 && pasoPedido <= alcanzable ? pasoPedido : alcanzable;
  if (pasoPedido && pasoPedido !== paso) history.replaceState(null, '', `#/pedido/${id}/${paso}`);

  montar(app, html`
    <a class="volver" href="#/">← Mis pedidos</a>
    <div class="encabezado-pagina">
      <h1>Pedido #${pedido.id}${pedido.proveedor ? html` · ${pedido.proveedor}` : ''}</h1>
      ${pedido.tipo ? html`<span class="etiqueta ${pedido.tipo === 'real' ? 'verde' : 'gris'}">${pedido.tipo === 'real' ? 'Pedido real' : 'Pedido simulado'}</span>` : ''}
    </div>
    <ol class="pasos" aria-label="Pasos del pedido">
      ${NOMBRES_PASOS.map((nombre, k) => {
        const n = k + 1;
        const clase = [n < pedido.paso ? 'hecho' : '', n === paso ? 'actual' : '', n > alcanzable ? 'bloqueado' : ''].join(' ');
        const contenido = html`<span class="num">${n < pedido.paso && n !== paso ? '✓' : n}</span><span>${nombre}</span>`;
        return html`<li>${n <= alcanzable
          ? html`<a class="paso ${clase}" href="#/pedido/${pedido.id}/${n}" ${n === paso ? html`aria-current="step"` : ''}>${contenido}</a>`
          : html`<span class="paso ${clase}" title="Primero termina el paso anterior">${contenido}</span>`}</li>`;
      })}
    </ol>
    <div id="paso"></div>`);

  const cont = app.querySelector('#paso');
  const vistas = { 1: paso1, 2: paso2, 3: paso3, 4: paso4, 5: paso5 };
  await vistas[paso](cont, pedido);
}

function irAPaso(pedido, n) {
  ir(`#/pedido/${pedido.id}/${n}`);
}

// Formulario para elegir columnas cuando no las reconocemos.
// Guía para sacar los archivos desde el programa contable del usuario (public/js/sistemas.js).
function guiaSistema(id) {
  const s = sistemaPorId(id);
  if (!s) return '';
  const sinRuta = !s.ventas && !s.existencias;
  const lista = (pasos) => html`<ol>${pasos.map((p) => html`<li>${p}</li>`)}</ol>`;
  return html`<div class="guia">
    ${sinRuta ? html`<p class="nota">${s.id === 'otro' ? 'Estos pasos sirven en casi cualquier programa contable.' : `Todavía no tenemos los nombres exactos de los menús de ${s.nombre}. Estos pasos sirven en casi cualquier programa contable.`}</p>` : ''}
    ${s.notaGeneral ? html`<p>${s.notaGeneral}</p>` : ''}
    <h3>1. Lo que vendiste</h3>
    ${lista(s.ventas || GENERICA.ventas)}
    ${!s.ventas && !sinRuta ? html`<p class="nota">No encontramos la ruta exacta de este informe en ${s.nombre}: los pasos son generales.</p>` : ''}
    ${s.ventasNota ? html`<p class="nota">${s.ventasNota}</p>` : ''}
    <h3>2. Lo que tienes hoy</h3>
    ${s.existencias ? lista(s.existencias) : s.existenciasNota ? '' : lista(GENERICA.existencias)}
    ${s.existenciasNota ? html`<p>${s.existenciasNota}</p>` : ''}
    <h3>3. Súbelos aquí abajo</h3>
    <p>Los dos archivos juntos, tal como salen. Si no reconocemos alguna columna, te preguntamos cuál es una sola vez.</p>
    ${s.sinRutaConfirmada ? html`<p class="nota">${s.sinRutaConfirmada}</p>` : ''}
    ${s.fuentes.length ? html`<p class="nota">Fuentes, consultadas en octubre de 2026: ${s.fuentes.map((x, i) => html`${i ? ' · ' : ''}<a href="${x.url}" target="_blank" rel="noopener noreferrer">${x.texto}</a>`)}.</p>` : ''}
  </div>`;
}

function formularioColumnas(cont, hojas, campos, alEnviar) {
  const utiles = hojas.filter((h) => h.encabezados.length);
  if (!utiles.length) return;
  montar(cont, html`
    <form class="mapeo">
      <h3>Indícanos qué columna es cuál</h3>
      <p class="nota">Solo hace falta una vez: la próxima vez que subas un archivo con estas mismas columnas, lo leemos solo.</p>
      ${utiles.map((h) => html`<fieldset data-clave="${h.clave}">
        <legend>${h.hoja ? `Hoja "${h.hoja}"` : `Archivo "${h.archivo}"`}${h.hoja && hojas.some((x) => x.archivo !== h.archivo) ? ` de "${h.archivo}"` : ''}${h.filaEncabezados ? html` <span class="opcional">(encabezados en la fila ${h.filaEncabezados})</span>` : ''}</legend>
        <div class="grilla">${campos.map((c) => html`<label>${c.nombre}
          <select data-campo="${c.campo}">
            <option value="">— No está en esta hoja —</option>
            ${h.encabezados.map((e) => html`<option value="${e.indice}" ${h.columnas[c.campo] === e.indice ? 'selected' : ''}>${e.letra}${e.texto ? ` · ${e.texto}` : ''}</option>`)}
          </select></label>`)}</div>
      </fieldset>`)}
      <div class="acciones"><button type="submit" class="boton primario">Leer de nuevo con estas columnas</button></div>
    </form>`);
  const form = cont.querySelector('form');
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const mapeo = {};
    form.querySelectorAll('fieldset[data-clave]').forEach((fs) => {
      const m = {};
      fs.querySelectorAll('select').forEach((s) => { m[s.dataset.campo] = s.value === '' ? null : Number(s.value); });
      mapeo[fs.dataset.clave] = m;
    });
    form.querySelector('button[type="submit"]').disabled = true;
    alEnviar(mapeo);
  });
}

const CAMPOS_LISTA = [
  { campo: 'codigo', nombre: 'Código de producto' },
  { campo: 'pedir', nombre: 'Cantidad a pedir' },
  { campo: 'nombre', nombre: 'Nombre (opcional)' },
];
const CAMPOS_EXPORT = [
  { campo: 'codigo', nombre: 'Código de producto' },
  { campo: 'nombre', nombre: 'Nombre (opcional)' },
  { campo: 'fecha', nombre: 'Fecha de la venta' },
  { campo: 'cantidad', nombre: 'Cantidad vendida' },
  { campo: 'existencias', nombre: 'Existencias' },
];

// Importar una lista (inicial o final) desde Excel/CSV a la hoja.
function conectarImportacion(raiz, pedido, para, hoja, alImportar) {
  const input = raiz.querySelector('.importar input[type="file"]');
  const zonaMensajes = raiz.querySelector('.mensajes-importar');
  async function enviar(datos) {
    montar(zonaMensajes, html`<p class="nota">Leyendo tu archivo…</p>`);
    let r;
    try {
      r = await api('POST', `/pedidos/${pedido.id}/importar-lista`, null, { formulario: datos });
    } catch (e) {
      return error(zonaMensajes, e);
    }
    if (!r.ok) {
      montar(zonaMensajes, html`${mensajeError({ message: 'No pudimos leer la lista:', datos: { errores: r.errores } })}<div class="mapeo-lista"></div>`);
      formularioColumnas(zonaMensajes.querySelector('.mapeo-lista'), r.hojas || [], CAMPOS_LISTA, (mapeo) => {
        const fd = new FormData();
        fd.append('para', para);
        fd.append('archivoId', r.archivoId);
        fd.append('mapeo', JSON.stringify(mapeo));
        enviar(fd);
      });
      return;
    }
    if (!r.lineas.length) {
      return montar(zonaMensajes, html`<div class="mensaje aviso">El archivo no tiene productos con cantidad a pedir (columna: ${r.columnas.pedir}).</div>`);
    }
    const hayAlgo = hoja.obtenerLineas().some((l) => l.codigo || l.cantidad);
    if (hayAlgo && !window.confirm(`El archivo trae ${r.lineas.length} productos. ¿Reemplazar lo que hay en la tabla?`)) {
      zonaMensajes.innerHTML = '';
      return;
    }
    hoja.fijarLineas(r.lineas);
    montar(zonaMensajes, html`<div class="mensaje ok">Importamos ${plural(r.lineas.length, 'producto', 'productos')} de "${r.archivo}"${r.hoja ? ` (hoja "${r.hoja}")` : ''}: código en ${r.columnas.codigo}, cantidad en ${r.columnas.pedir}.${r.omitidas ? ` ${plural(r.omitidas, 'producto sin cantidad a pedir no se incluyó', 'productos sin cantidad a pedir no se incluyeron')}.` : ''} Revisa la tabla antes de guardar.</div>`);
    alImportar();
  }
  input.addEventListener('change', () => {
    const f = input.files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('para', para);
    fd.append('archivo', f);
    input.value = '';
    enviar(fd);
  });
}

function herramientasLista() {
  return html`<div class="herramientas-lista">
      <span class="pista">Escribe en la tabla o pega filas copiadas de tu Excel (Ctrl+V). También puedes</span>
      <label class="boton chico importar">Importar mi archivo de pedido (Excel o CSV)
        <input type="file" class="oculto" accept=".xlsx,.xls,.xlsm,.ods,.csv,.txt"></label>
      <a href="/plantillas/lista-pedido.xlsx" download>Descargar plantilla de lista de pedido</a>
    </div>
    <div class="mensajes-importar"></div>`;
}

// Autoguardado del borrador con indicador.
function autoguardado(raiz, guardar) {
  const indicador = raiz.querySelector('.estado-guardado');
  const g = debounce(async () => {
    indicador.textContent = 'Guardando borrador…';
    try {
      await guardar();
      indicador.textContent = 'Borrador guardado. Puedes seguir después.';
    } catch {
      indicador.textContent = 'No se pudo guardar el borrador. Revisa tu conexión.';
    }
  }, 900);
  alSalirDeVista.push(() => (g.pendiente() ? g.ahora() : null));
  return () => { indicador.textContent = 'Cambios sin guardar…'; g(); };
}

// --- Paso 1: lista inicial ---------------------------------------------------------------------

function paso1(cont, pedido) {
  if (pedido.inicialGuardadaEn) {
    montar(cont, html`<section class="tarjeta">
      <h2>Paso 1 · Lo que ibas a pedir</h2>
      <p class="ayuda">Guardaste esta lista el ${fechaHora(pedido.inicialGuardadaEn)}. Ya no se puede cambiar: es la base para comparar con tu lista final.</p>
      <div class="hoja-inicial"></div>
      ${pedido.paso === 2 ? html`<div class="acciones"><a class="boton primario" href="#/pedido/${pedido.id}/2">Seguir: subir el export →</a></div>` : ''}
    </section>`);
    crearHoja(cont.querySelector('.hoja-inicial'), { lineas: pedido.listaInicial, soloLectura: true });
    return;
  }

  montar(cont, html`<section class="tarjeta">
    <h2>Paso 1 · Lo que ibas a pedir</h2>
    <p class="ayuda">Antes de ver el reporte, anota lo que ibas a pedir hoy, como lo harías normalmente. Al final vamos a comparar esta lista con la que decidas después de ver la rotación.</p>
    <div class="campos-pedido">
      <label class="campo">Proveedor o nombre del pedido <span class="opcional">(opcional)</span>
        <input type="text" name="proveedor" maxlength="120" value="${pedido.proveedor || ''}" placeholder="Ej.: Tornillería Central"></label>
      <fieldset>
        <legend>¿Este pedido es real o simulado?</legend>
        <div class="opciones-radio">
          <label class="opcion-radio"><input type="radio" name="tipo" value="real" ${pedido.tipo === 'real' ? 'checked' : ''}>
            <span>Real<small>Lo voy a hacer en estos días.</small></span></label>
          <label class="opcion-radio"><input type="radio" name="tipo" value="simulado" ${pedido.tipo === 'simulado' ? 'checked' : ''}>
            <span>Simulado<small>Lo armo como si fuera a pedir hoy.</small></span></label>
        </div>
      </fieldset>
    </div>
    ${herramientasLista()}
    <div class="hoja"></div>
    <p class="nota">Cada línea necesita código de producto y cantidad; el nombre es opcional. No se aceptan fotos ni imágenes de la lista.</p>
    <div class="mensajes"></div>
    <div class="acciones">
      <span class="estado-guardado izquierda"></span>
      <button type="button" class="boton primario guardar">Guardar lista inicial</button>
    </div>
  </section>`);

  const proveedor = cont.querySelector('input[name="proveedor"]');
  const tipo = () => (cont.querySelector('input[name="tipo"]:checked') || {}).value || null;
  const mensajes = cont.querySelector('.mensajes');
  let hoja;
  const cambio = autoguardado(cont, () => api('PUT', `/pedidos/${pedido.id}/lista-inicial`, { lineas: hoja.obtenerLineas(), tipo: tipo(), proveedor: proveedor.value }));
  hoja = crearHoja(cont.querySelector('.hoja'), { lineas: pedido.listaInicial, alCambiar: cambio });
  proveedor.addEventListener('input', cambio);
  cont.querySelectorAll('input[name="tipo"]').forEach((r) => r.addEventListener('change', cambio));
  conectarImportacion(cont, pedido, 'inicial', hoja, cambio);

  cont.querySelector('.guardar').addEventListener('click', async (ev) => {
    const boton = ev.currentTarget;
    mensajes.innerHTML = '';
    if (!tipo()) {
      montar(mensajes, html`<div class="mensaje error" role="alert">Marca si el pedido es real o simulado.</div>`);
      return;
    }
    const cuerpo = { lineas: hoja.obtenerLineas(), tipo: tipo(), proveedor: proveedor.value };
    boton.disabled = true;
    try {
      const rev = await api('POST', `/pedidos/${pedido.id}/lista-inicial`, { ...cuerpo, revisar: true });
      const avisos = rev.avisos.length ? `\n\nAntes de guardar, ten en cuenta:\n• ${rev.avisos.join('\n• ')}` : '';
      if (!window.confirm(`Vas a guardar tu lista inicial con ${rev.lineas} ${rev.lineas === 1 ? 'producto' : 'productos'}.${avisos}\n\nUna vez guardada queda fija y ya no se puede cambiar. ¿Guardar?`)) {
        boton.disabled = false;
        return;
      }
      await api('POST', `/pedidos/${pedido.id}/lista-inicial`, cuerpo);
      alSalirDeVista = [];
      irAPaso(pedido, 2);
    } catch (e) {
      boton.disabled = false;
      error(mensajes, e);
      if (e.datos && e.datos.errores) hoja.marcarErrores(e.datos.errores);
    }
  });
}

// --- Paso 2: subir el export ----------------------------------------------------------------

function paso2(cont, pedido) {
  const terminado = pedido.terminado;
  montar(cont, html`<section class="tarjeta">
    <h2>Paso 2 · Sube tus ventas y existencias</h2>
    <p class="ayuda">Necesitamos dos cosas de tu programa contable: <strong>lo que vendiste</strong> de cada producto en el último año (o los dos últimos) y <strong>lo que tienes hoy</strong> en existencias. Pueden venir en un archivo o en dos, tal como salen.</p>
    ${terminado ? '' : html`<label class="campo campo-sistema">¿Qué programa contable usas?
      <select class="sistema">${opcionesSistema(usuario.sistema)}</select></label>
    <div class="guia-sistema"></div>`}
    <p class="ayuda"><a href="/plantillas/export.xlsx" download>Descargar una plantilla con un ejemplo</a></p>
    ${pedido.export ? html`<div class="mensaje ok">Ya subiste ${pedido.export.archivos.map((a) => `"${a.nombre}"`).join(' y ')} el ${fechaHora(pedido.export.subidoEn)}.
      ${terminado ? '' : html`<a href="#/pedido/${pedido.id}/3">Ver el reporte →</a>`}</div>` : ''}
    ${terminado ? '' : html`<label class="zona-archivo">
      <strong>${pedido.export ? 'Subir otro archivo' : 'Arrastra aquí tu archivo o haz clic para elegirlo'}</strong>
      <span class="nota">Excel (.xlsx, .xls) o CSV. Puedes elegir dos archivos a la vez.</span>
      <input type="file" multiple accept=".xlsx,.xls,.xlsm,.xlsb,.ods,.csv,.txt">
    </label>`}
    <div class="resultado"></div>
    ${pedido.archivosSubidos.length ? html`<details class="notas"><summary>Archivos subidos en este pedido (${pedido.archivosSubidos.length})</summary>
      <ul class="lista-archivos">${pedido.archivosSubidos.map((a) => html`<li>${a.nombre} · ${fechaHora(a.subidoEn)}</li>`)}</ul></details>` : ''}
  </section>`);
  if (terminado) return;

  const zona = cont.querySelector('.zona-archivo');
  const input = zona.querySelector('input');
  const resultado = cont.querySelector('.resultado');
  const selector = cont.querySelector('select.sistema');
  const guia = cont.querySelector('.guia-sistema');
  montar(guia, guiaSistema(usuario.sistema));
  selector.addEventListener('change', () => {
    montar(guia, guiaSistema(selector.value));
    guardarSistema(selector.value).catch(() => {}); // si no se guarda, se vuelve a preguntar la próxima vez
  });

  async function procesar(promesa) {
    montar(resultado, html`<div class="mensaje info">Leyendo tu archivo y calculando la rotación… (con archivos grandes puede tardar unos segundos)</div>`);
    let r;
    try {
      r = await promesa;
    } catch (e) {
      return error(resultado, e);
    }
    if (r.ok) return irAPaso(pedido, 3);
    if (r.necesitaPeriodo) return pedirPeriodo(r.exportId);
    montar(resultado, html`${mensajeError({ message: 'No pudimos usar el archivo:', datos: { errores: r.errores } })}
      <p class="nota">Corrige el archivo y vuelve a subirlo${r.hojas && r.hojas.some((h) => h.encabezados.length) ? ', o indícanos abajo qué columna es cuál' : ''}.</p>
      <div class="mapeo-export"></div>`);
    formularioColumnas(resultado.querySelector('.mapeo-export'), r.hojas || [], CAMPOS_EXPORT, (mapeo) => {
      procesar(api('POST', `/pedidos/${pedido.id}/export/${r.exportId}/columnas`, { mapeo }));
    });
  }

  // El archivo trae el total vendido de cada producto, sin la fecha de cada venta.
  function pedirPeriodo(exportId) {
    const hoy = new Date();
    const haceUnAno = new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate() + 1);
    const iso = (x) => x.toLocaleDateString('en-CA');
    montar(resultado, html`<form class="periodo mensaje info" novalidate>
      <p><strong>Tu archivo trae el total vendido de cada producto, pero no la fecha de cada venta.</strong>
        ¿De qué fecha a qué fecha son esas ventas? Es el rango que elegiste al sacar el informe.</p>
      <div class="fechas">
        <label class="campo">Desde <input type="date" name="desde" required value="${iso(haceUnAno)}"></label>
        <label class="campo">Hasta <input type="date" name="hasta" required value="${iso(hoy)}" max="${iso(hoy)}"></label>
      </div>
      <div class="mensajes"></div>
      <div class="acciones"><button type="submit" class="boton primario">Calcular con este periodo</button></div>
    </form>`);
    const form = resultado.querySelector('form');
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      procesar(api('POST', `/pedidos/${pedido.id}/export/${exportId}/periodo`, Object.fromEntries(new FormData(form))));
    });
  }

  function subir(archivos) {
    if (!archivos || !archivos.length) return;
    const fd = new FormData();
    for (const f of [...archivos].slice(0, 5)) fd.append('archivos', f);
    input.value = '';
    procesar(api('POST', `/pedidos/${pedido.id}/export`, null, { formulario: fd }));
  }

  input.addEventListener('change', () => subir(input.files));
  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('encima'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('encima'));
  zona.addEventListener('drop', (e) => {
    e.preventDefault();
    zona.classList.remove('encima');
    subir(e.dataTransfer.files);
  });
}

// --- Paso 3: reporte ----------------------------------------------------------------------

async function paso3(cont, pedido) {
  montar(cont, html`<section class="tarjeta"><h2>Paso 3 · Tu reporte de rotación</h2><p class="cargando">Cargando el reporte…</p></section>`);
  let reporte;
  try {
    ({ reporte } = await api('GET', `/pedidos/${pedido.id}/reporte`));
  } catch (e) {
    return error(cont.querySelector('section'), e);
  }
  montar(cont, html`<section class="tarjeta">
    <div class="encabezado-pagina">
      <div>
        <h2>Paso 3 · Tu reporte de rotación</h2>
        <p class="ayuda">Arriba está lo que se agota primero; abajo, lo que sobra. Archivo: ${reporte.archivos.join(', ')} (subido el ${fechaHora(reporte.subidoEn)}).
        ${pedido.terminado ? '' : html`<a href="#/pedido/${pedido.id}/2">Usar otro archivo</a>`}</p>
      </div>
      ${pedido.terminado ? '' : html`<a class="boton primario" href="#/pedido/${pedido.id}/4">Seguir: arma tu lista final →</a>`}
    </div>
    <div class="recordatorio"></div>
    <div class="reporte"></div>
    ${pedido.terminado ? '' : html`<div class="acciones"><a class="boton primario" href="#/pedido/${pedido.id}/4">Seguir: arma tu lista final →</a></div>`}
  </section>`);
  pintarReporte(cont.querySelector('.reporte'), reporte);
  pintarRecordatorio(cont.querySelector('.recordatorio'), pedido);
}

// Stickiness del Entregable: al ver el reporte se ofrece un recordatorio 3 días antes de que
// un producto con buen nivel hoy llegue a 2 semanas de inventario. Es un archivo de calendario
// (y, si el correo está configurado, también llega como invitación al correo).
async function pintarRecordatorio(caja, pedido) {
  let datos;
  try {
    datos = await api('GET', `/pedidos/${pedido.id}/recordatorio`);
  } catch {
    return; // sin el ofrecimiento el reporte sigue sirviendo
  }

  const responder = async (activo, boton) => {
    boton.disabled = true;
    try {
      datos = await api('POST', `/pedidos/${pedido.id}/recordatorio`, { activo });
      dibujar();
    } catch (e) {
      boton.disabled = false;
      montar(caja.querySelector('.error-recordatorio'), mensajeError(e));
    }
  };

  function dibujar() {
    const { plan, respuesta, email, correo } = datos;
    const activo = respuesta && respuesta.activo;
    const deEste = respuesta && respuesta.pedidoId === pedido.id;
    const p = plan.primero;
    const descargar = html`<a class="boton chico primario" href="/api/pedidos/${pedido.id}/recordatorio.ics" download>Descargar para mi calendario</a>`;
    let contenido;
    if (activo && deEste) {
      contenido = html`<p><strong>Listo.</strong> ${correo === 'enviado' ? `Te enviamos la invitación a ${email}. ` : ''}${correo === 'fallo' ? 'No pudimos enviarte el correo, pero puedes descargar el archivo. ' : ''}
        Descarga el archivo y ábrelo: tu calendario (Google Calendar, Outlook o el del celular) te avisará. El primer recordatorio es el ${dia(respuesta.primerAviso)}.</p>
        <div class="acciones">${descargar}<button type="button" class="boton chico" data-activo="false">Ya no lo quiero</button></div>`;
    } else if (activo) {
      contenido = html`<p>Tienes recordatorios con el reporte del ${dia(respuesta.fechaReporte)}.${plan.productos ? ` ¿Prefieres usar este, del ${dia(plan.fechaReporte)}?` : ''}</p>
        <div class="acciones">${plan.productos ? html`<button type="button" class="boton chico primario" data-activo="true">Usar este reporte</button>` : ''}<button type="button" class="boton chico" data-activo="false">Ya no lo quiero</button></div>`;
    } else if (plan.productos) {
      contenido = html`<p><strong>¿Te recordamos antes de que se agoten?</strong>
        ${plural(plan.productos, 'producto que hoy tiene', 'productos que hoy tienen')} más de ${plan.semanasBuenNivel} semanas de inventario ${plan.productos === 1 ? 'baja' : 'bajan'} de 2 semanas en los próximos 3 meses, si sigues vendiendo al mismo ritmo. El primero es ${p.codigo}${p.nombre ? ` (${p.nombre})` : ''}, hacia el ${dia(p.fechaUmbral)}.
        Te dejamos un recordatorio en tu calendario ${plan.diasAntes} días antes${plan.correo ? ` y te lo mandamos a ${email}` : ''}, como máximo uno por semana.</p>
        <div class="acciones">${respuesta ? '' : html`<button type="button" class="boton chico" data-activo="false">No, gracias</button>`}<button type="button" class="boton chico primario" data-activo="true">Sí, recuérdamelo</button></div>`;
    } else {
      contenido = '';
    }
    montar(caja, contenido ? html`<div class="mensaje info">${contenido}<div class="error-recordatorio"></div></div>` : '');
    caja.querySelectorAll('button[data-activo]').forEach((b) => b.addEventListener('click', () => responder(b.dataset.activo === 'true', b)));
  }

  dibujar();
}

// --- Paso 4: lista final --------------------------------------------------------------------

async function paso4(cont, pedido) {
  montar(cont, html`<section class="tarjeta"><h2>Paso 4 · Lo que de verdad vas a pedir</h2><p class="cargando">Cargando…</p></section>`);
  let reporte;
  try {
    ({ reporte } = await api('GET', `/pedidos/${pedido.id}/reporte`));
  } catch (e) {
    return error(cont.querySelector('section'), e);
  }
  const porCodigo = new Map(reporte.filas.map((f) => [claveCodigo(f.codigo), f]));
  const inicial = new Map(pedido.listaInicial.map((l) => [claveCodigo(l.codigo), l]));
  const extras = [
    {
      titulo: 'Ibas a pedir',
      valor: (f) => {
        if (!f.codigo) return { texto: '' };
        const l = inicial.get(claveCodigo(f.codigo));
        return { texto: l ? numero(l.cantidad) : 'nuevo' };
      },
    },
    {
      titulo: 'Semanas de inventario',
      valor: (f) => {
        if (!f.codigo) return { texto: '' };
        const r = porCodigo.get(claveCodigo(f.codigo));
        if (!r) return { texto: 'no está en el export' };
        if (r.semanasInventario === null) return { texto: 'sin ventas', clase: r.sobra ? 'sobra' : '' };
        return { texto: semanas(r.semanasInventario), clase: r.estado === 'se_agota' ? 'se-agota' : r.sobra ? 'sobra' : '' };
      },
    },
  ];

  if (pedido.terminado) {
    montar(cont, html`<section class="tarjeta">
      <h2>Paso 4 · Lo que de verdad vas a pedir</h2>
      <p class="ayuda">Guardaste esta lista el ${fechaHora(pedido.finalGuardadaEn)}.</p>
      <div class="hoja-final"></div></section>`);
    crearHoja(cont.querySelector('.hoja-final'), { lineas: pedido.listaFinal, soloLectura: true, extras });
    return;
  }

  montar(cont, html`<section class="tarjeta">
    <h2>Paso 4 · Lo que de verdad vas a pedir</h2>
    <p class="ayuda">Arrancamos con una copia de tu lista inicial. Agrega, quita o cambia cantidades según lo que decidas. Puedes mirar el reporte aquí mismo mientras editas.</p>
    <button type="button" class="boton chico ver-reporte" aria-expanded="false">Mostrar el reporte</button>
    <div class="panel-reporte oculto"><div class="reporte"></div></div>
    ${herramientasLista()}
    <div class="hoja"></div>
    <div class="mensajes"></div>
    <div class="acciones">
      <span class="estado-guardado izquierda"></span>
      <button type="button" class="boton primario guardar">Guardar lista final</button>
    </div>
  </section>`);

  const panel = cont.querySelector('.panel-reporte');
  const botonReporte = cont.querySelector('.ver-reporte');
  let reportePintado = false;
  botonReporte.addEventListener('click', () => {
    const abrir = panel.classList.contains('oculto');
    panel.classList.toggle('oculto', !abrir);
    botonReporte.setAttribute('aria-expanded', String(abrir));
    botonReporte.textContent = abrir ? 'Ocultar el reporte' : 'Mostrar el reporte';
    if (abrir && !reportePintado) {
      pintarReporte(cont.querySelector('.reporte'), reporte, { compacto: true });
      reportePintado = true;
    }
  });

  const mensajes = cont.querySelector('.mensajes');
  let hoja;
  const cambio = autoguardado(cont, () => api('PUT', `/pedidos/${pedido.id}/lista-final`, { lineas: hoja.obtenerLineas() }));
  hoja = crearHoja(cont.querySelector('.hoja'), { lineas: pedido.listaFinal || pedido.listaInicial, extras, alCambiar: cambio });
  conectarImportacion(cont, pedido, 'final', hoja, cambio);

  cont.querySelector('.guardar').addEventListener('click', async (ev) => {
    const boton = ev.currentTarget;
    mensajes.innerHTML = '';
    const cuerpo = { lineas: hoja.obtenerLineas() };
    boton.disabled = true;
    try {
      const rev = await api('POST', `/pedidos/${pedido.id}/lista-final`, { ...cuerpo, revisar: true });
      let texto = rev.lineas === 0
        ? 'Tu lista final está vacía: ¿no vas a pedir nada?'
        : `Vas a guardar tu lista final con ${rev.lineas} ${rev.lineas === 1 ? 'producto' : 'productos'}.`;
      if (rev.avisos.length) texto += `\n\nTen en cuenta:\n• ${rev.avisos.join('\n• ')}`;
      if (!window.confirm(`${texto}\n\n¿Guardar?`)) {
        boton.disabled = false;
        return;
      }
      await api('POST', `/pedidos/${pedido.id}/lista-final`, cuerpo);
      alSalirDeVista = [];
      irAPaso(pedido, 5);
    } catch (e) {
      boton.disabled = false;
      error(mensajes, e);
      if (e.datos && e.datos.errores) hoja.marcarErrores(e.datos.errores);
    }
  });
}

// --- Paso 5: comparación y ¿por qué? ---------------------------------------------------------

function listaDetalle(titulo, items, pintar) {
  return html`<div><h3>${titulo} (${items.length})</h3>${items.length
    ? html`<ul>${items.map((x) => html`<li>${pintar(x)}</li>`)}</ul>`
    : html`<p class="vacio">Ninguna.</p>`}</div>`;
}

function paso5(cont, pedido) {
  const c = pedido.comparacion;
  const n = c.conteo;
  const nombre = (x) => (x.nombre ? ` · ${x.nombre}` : '');
  montar(cont, html`<section class="tarjeta">
    <h2>Paso 5 · ¿Por qué cambió?</h2>
    <p class="ayuda">Comparamos tu lista inicial con la final, producto por producto (por código).</p>
    <div class="cifras">
      <div class="cifra"><strong>${n.agregadas}</strong><span>${n.agregadas === 1 ? 'línea agregada' : 'líneas agregadas'}</span></div>
      <div class="cifra"><strong>${n.quitadas}</strong><span>${n.quitadas === 1 ? 'línea quitada' : 'líneas quitadas'}</span></div>
      <div class="cifra"><strong>${n.cambiadas}</strong><span>con cantidad distinta</span></div>
      <div class="cifra verde"><strong>${n.total}</strong><span>${n.total === 1 ? 'línea cambiada en total' : 'líneas cambiadas en total'}</span></div>
    </div>
    <details class="notas" ${n.total && n.total <= 30 ? 'open' : ''}><summary>Ver el detalle</summary>
      <div class="comparacion-detalle">
        ${listaDetalle('Agregadas', c.agregadas, (x) => html`<span class="codigo">${x.codigo}</span>${nombre(x)}: ${numero(x.cantidad)}`)}
        ${listaDetalle('Quitadas', c.quitadas, (x) => html`<span class="codigo">${x.codigo}</span>${nombre(x)}: ${numero(x.cantidad)}`)}
        ${listaDetalle('Cantidad distinta', c.cambiadas, (x) => html`<span class="codigo">${x.codigo}</span>${nombre(x)}: ${numero(x.antes)} → ${numero(x.despues)}`)}
      </div>
      <p class="nota">${plural(c.iguales, 'línea quedó igual', 'líneas quedaron iguales')}.</p>
    </details>
    <div class="por-que-zona"></div>
  </section>`);

  const zona = cont.querySelector('.por-que-zona');
  if (pedido.terminado) {
    montar(zona, html`<div class="mensaje ok"><p><strong>Pedido terminado</strong> el ${fechaHora(pedido.terminadoEn)}. ¡Gracias!</p>
        <p><strong>¿Por qué cambiaste lo que cambiaste?</strong></p><p class="por-que">${pedido.porQue}</p></div>
      <div class="acciones"><a class="boton" href="#/">Volver a mis pedidos</a><button type="button" class="boton primario nuevo">Preparar otro pedido</button></div>`);
    zona.querySelector('.nuevo').addEventListener('click', (e) => nuevoPedido(e.currentTarget));
    return;
  }
  montar(zona, html`<form>
    <label class="campo">¿Por qué cambiaste lo que cambiaste?
      <textarea name="respuesta" maxlength="5000" required placeholder="Si no cambiaste nada, cuéntanos por qué."></textarea></label>
    <div class="mensajes"></div>
    <div class="acciones">
      <a class="izquierda" href="#/pedido/${pedido.id}/4">← Volver a la lista final</a>
      <button type="submit" class="boton primario">Terminar pedido</button>
    </div>
  </form>`);
  const form = zona.querySelector('form');
  form.querySelector('textarea').focus();
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const b = form.querySelector('button[type="submit"]');
    b.disabled = true;
    try {
      await api('POST', `/pedidos/${pedido.id}/por-que`, { respuesta: form.respuesta.value });
      vistaPedido(pedido.id, 5);
    } catch (e) {
      b.disabled = false;
      error(form.querySelector('.mensajes'), e);
    }
  });
}

// --- Equipo: resultados de la prueba ------------------------------------------------------------

const TEXTO_EVENTO = {
  ingreso: () => 'Entró',
  archivo_subido: (e) => (e.detalle && e.detalle.tipo === 'lista' ? `Importó una lista (${e.detalle.nombre})` : `Subió export${e.detalle && e.detalle.archivos ? ` (${e.detalle.archivos.join(', ')})` : ''}`),
  lista_inicial_guardada: (e) => `Guardó la lista inicial del pedido #${e.pedidoId}`,
  reporte_visto: (e) => `Vio el reporte del pedido #${e.pedidoId}`,
  lista_final_guardada: (e) => `Guardó la lista final del pedido #${e.pedidoId}${e.detalle ? ` (${e.detalle.total} cambios)` : ''}`,
  pedido_terminado: (e) => `Terminó el pedido #${e.pedidoId}`,
  recordatorio_respondido: (e) => (e.detalle && e.detalle.activo ? `Pidió recordatorios (${plural(e.detalle.productos, 'producto', 'productos')})` : 'Dijo que no quiere recordatorios'),
  recordatorio_enviado: () => 'Le llegó la invitación de calendario al correo',
  calendario_descargado: (e) => `Descargó los recordatorios del pedido #${e.pedidoId}`,
};

function textoCoherencia(c) {
  if (!c || !c.total) return '—';
  return html`${c.coherentes} de ${c.total}${c.contrarias ? html`<span class="senal">${plural(c.contrarias, 'en contra del reporte', 'en contra del reporte')}</span>` : ''}`;
}

function textoRecordatorio(r) {
  if (!r || r.activo === null) return 'sin responder';
  if (!r.activo) return 'no lo quiso';
  const partes = [`sí, el primero el ${dia(r.primerAviso)}`];
  partes.push(r.descargoCalendario ? 'descargó el calendario' : r.correoEnviado ? 'lo recibió por correo' : 'no ha descargado el calendario');
  if (r.yaLlego) partes.push(`entró ${r.ingresosDesdeAviso} ${r.ingresosDesdeAviso === 1 ? 'vez' : 'veces'} desde ese día`);
  return partes.join(' · ');
}

const CATEGORIAS = {
  cumple: html`<span class="etiqueta verde">Cambió 5 o más líneas</span>`,
  no_cambia: html`<span class="etiqueta roja">Cambió 0 o 1 líneas</span>`,
  intermedio: html`<span class="etiqueta ambar">Cambió entre 2 y 4 líneas</span>`,
  sin_pedido: html`<span class="etiqueta gris">Sin lista final en sus 14 días</span>`,
};

async function vistaEquipo() {
  montar(app, html`<p class="cargando">Cargando resultados…</p>`);
  let datos;
  try {
    datos = await api('GET', '/equipo/resultados');
  } catch (e) {
    return error(app, e);
  }
  const r = datos.resumen;
  const titulos = {
    meta_cumplida: `Se cumplió la meta: ${r.cumplen} de ${r.usuarios} cambiaron ${r.reglas.metaLineas} o más líneas`,
    pivotar: `Toca pivotar: ${r.noCambian} de ${r.usuarios} cambiaron 0 o 1 líneas`,
    en_curso: 'Todavía no hay resultado',
  };
  montar(app, html`
    <div class="encabezado-pagina">
      <div><h1>Resultados de la prueba</h1><p class="ayuda">Calculado con los datos guardados el ${fechaHora(datos.generadoEn)}.</p></div>
      <button type="button" class="boton actualizar">Actualizar</button>
    </div>
    <section class="veredicto ${r.veredicto}">
      <h2>${titulos[r.veredicto]}</h2>
      ${r.veredicto === 'en_curso' ? html`<p><strong>Por ahora: ${r.cumplen} de ${r.usuarios} cambiaron ${r.reglas.metaLineas} o más líneas y ${r.noCambian} cambiaron 0 o 1${r.sinPedido ? `; ${r.sinPedido} aún no ${r.sinPedido === 1 ? 'guarda' : 'guardan'} su lista final` : ''}.</strong></p>` : ''}
      <p>Meta: ${r.reglas.metaUsuarios} de ${r.usuariosEsperados} usuarios cambian ${r.reglas.metaLineas} o más líneas de su pedido en ${r.reglas.diasPrueba} días.
        Pivote: ${r.reglas.pivoteUsuarios} o más no cambian ninguna línea o cambian solo una.</p>
      <p class="nota">Revisa también las respuestas a "¿por qué cambió?": si cambiaron por probar la herramienta y no porque el dato les pareciera correcto, también toca pivotar.
        ${r.cumplen ? `Como apoyo: de los ${r.cumplen} que cumplen, ${r.cumplenCoherentes} movieron la mayoría de sus líneas en la dirección que indica el reporte (subir lo que se agota, bajar lo que sobra).` : ''}</p>
    </section>
    <div class="cifras">
      <div class="cifra verde"><strong>${r.cumplen} de ${r.usuarios}</strong><span>cambiaron ${r.reglas.metaLineas} o más líneas (meta: ${r.reglas.metaUsuarios})${r.cumplen ? ` · ${r.cumplenReal} en pedido real, ${r.cumplenSimulado} simulado` : ''}</span></div>
      <div class="cifra roja"><strong>${r.noCambian} de ${r.usuarios}</strong><span>cambiaron 0 o 1 líneas (pivote si son ${r.reglas.pivoteUsuarios} o más)</span></div>
      <div class="cifra"><strong>${r.intermedios}</strong><span>cambiaron entre 2 y 4</span></div>
      <div class="cifra"><strong>${r.sinPedido}</strong><span>aún sin lista final</span></div>
    </div>
    <h2 class="subtitulo">Stickiness: el recordatorio</h2>
    <div class="cifras">
      <div class="cifra"><strong>${r.aceptaronRecordatorio} de ${r.usuarios}</strong><span>pidieron el recordatorio</span></div>
      <div class="cifra"><strong>${r.conRecordatorioVencido}</strong><span>ya pasaron la fecha de su primer recordatorio</span></div>
      <div class="cifra verde"><strong>${r.volvieronTrasRecordatorio} de ${r.conRecordatorioVencido}</strong><span>volvieron a entrar desde ese día</span></div>
    </div>
    <p class="nota">Para cada usuario se toma el pedido con más líneas cambiadas (agregadas + quitadas + con cantidad distinta) cuya lista final guardó dentro de sus primeros ${r.reglas.diasPrueba} días, contados desde que guardó su primera lista inicial.
      ${r.usuarios !== r.usuariosEsperados ? `Hoy hay ${r.usuarios} cuentas de prueba; la meta está pensada para ${r.usuariosEsperados}.` : ''}</p>
    ${datos.usuarios.length ? '' : html`<div class="mensaje info">Todavía no hay usuarios de prueba registrados.</div>`}
    ${datos.usuarios.map((u) => html`<section class="tarjeta usuario-prueba">
      <header><h2>${u.nombre} <span class="opcional">${u.email}</span></h2>${CATEGORIAS[u.evaluacion.categoria]}</header>
      <p class="nota">Programa contable: <strong>${u.sistema ? (sistemaPorId(u.sistema) || { nombre: u.sistema }).nombre : 'no lo ha dicho'}</strong>
        · <button type="button" class="enlace enlace-clave" data-id="${u.id}">Enlace para que cambie su contraseña</button></p>
      <div class="enlace-generado"></div>
      <div class="metricas-usuario">
        <span>Entró <strong>${u.ingresos}</strong> ${u.ingresos === 1 ? 'vez' : 'veces'}${u.ultimoIngreso ? ` (última: ${fechaHora(u.ultimoIngreso)})` : ''}</span>
        <span>Subió <strong>${u.archivosExport}</strong> ${u.archivosExport === 1 ? 'archivo' : 'archivos'} de export${u.archivosLista ? ` y ${u.archivosLista} de lista` : ''}</span>
        <span>Días con actividad: <strong>${u.diasConActividad}</strong></span>
        <span>Cuenta creada: ${fecha(u.creadoEn)}</span>
        ${u.evaluacion.inicio ? html`<span>Sus 14 días: ${fecha(u.evaluacion.inicio)} – ${fecha(u.evaluacion.fin)}</span>` : ''}
        <span>Recordatorio: <strong>${textoRecordatorio(u.recordatorio)}</strong></span>
      </div>
      ${u.pedidos.length ? html`<div class="marco-tabla"><table class="datos">
        <thead><tr><th>Pedido</th><th>Tipo</th><th>Lista inicial</th><th>Lista final</th><th class="numero">Agregadas</th><th class="numero">Quitadas</th><th class="numero">Cantidad distinta</th><th class="numero">Total</th><th class="numero" title="Cambios en la dirección que indica el reporte: subir o agregar lo que se agota, bajar o quitar lo que sobra">Coherentes con el reporte</th><th class="numero" title="Unidades agregadas, quitadas o cambiadas, sobre las unidades de la lista inicial">Unidades movidas</th><th>¿Por qué cambió?</th></tr></thead>
        <tbody>${u.pedidos.map((p) => html`<tr>
          <td>#${p.id}${p.proveedor ? ` · ${p.proveedor}` : ''}${p.paso < 6 ? html`<span class="senal">Va en el paso ${p.paso} de 5</span>` : ''}${p.finalGuardadaEn && p.dentroDePrueba === false ? html`<span class="senal">Fuera de sus 14 días</span>` : ''}${u.evaluacion.mejor && u.evaluacion.mejor.id === p.id ? html`<span class="senal">Es el que cuenta</span>` : ''}</td>
          <td>${p.tipo === 'real' ? 'Real' : p.tipo === 'simulado' ? 'Simulado' : '—'}</td>
          <td>${fechaHora(p.inicialGuardadaEn)}${p.inicialGuardadaEn ? html`<span class="senal">${plural(p.lineasInicial, 'línea', 'líneas')}</span>` : ''}</td>
          <td>${fechaHora(p.finalGuardadaEn)}${p.finalGuardadaEn ? html`<span class="senal">${plural(p.lineasFinal, 'línea', 'líneas')}</span>` : ''}</td>
          <td class="numero">${p.conteo ? p.conteo.agregadas : '—'}</td>
          <td class="numero">${p.conteo ? p.conteo.quitadas : '—'}</td>
          <td class="numero">${p.conteo ? p.conteo.cambiadas : '—'}</td>
          <td class="numero"><strong>${p.conteo ? p.conteo.total : '—'}</strong></td>
          <td class="numero">${textoCoherencia(p.coherencia)}</td>
          <td class="numero">${p.magnitud && p.magnitud.porcentaje !== null ? `${numero(p.magnitud.porcentaje * 100, 0)} %` : '—'}${p.magnitud ? html`<span class="senal">${numero(p.magnitud.unidadesMovidas)} de ${numero(p.magnitud.unidadesIniciales)}</span>` : ''}</td>
          <td class="por-que">${p.porQue || '—'}</td>
        </tr>`)}</tbody></table></div>` : html`<p class="vacio">Todavía no ha empezado ningún pedido.</p>`}
      ${u.actividad.length ? html`<details class="notas"><summary>Actividad con fecha (${u.actividad.length})</summary>
        <ul class="actividad">${u.actividad.slice().reverse().map((e) => html`<li>${fechaHora(e.en)} · ${(TEXTO_EVENTO[e.tipo] || (() => e.tipo))(e)}</li>`)}</ul></details>` : ''}
    </section>`)}`);
  app.querySelector('.actualizar').addEventListener('click', vistaEquipo);
  app.querySelectorAll('.enlace-clave').forEach((b) => b.addEventListener('click', async () => {
    const caja = b.closest('section').querySelector('.enlace-generado');
    try {
      const r = await api('POST', `/equipo/usuarios/${b.dataset.id}/restablecer`);
      montar(caja, html`<div class="mensaje info"><p>Mándale este enlace (por ejemplo, por WhatsApp). Sirve una sola vez y durante ${r.horas} horas:</p>
        <input type="text" readonly class="enlace-copiar" value="${r.enlace}" aria-label="Enlace para cambiar la contraseña"></div>`);
      const campo = caja.querySelector('input');
      campo.select();
      navigator.clipboard?.writeText(r.enlace).catch(() => {});
    } catch (e) {
      error(caja, e);
    }
  }));
}

// --- Arranque -----------------------------------------------------------------------------------

async function iniciar() {
  try {
    ({ usuario, landing } = await api('GET', '/cuenta/yo'));
  } catch {
    usuario = null;
  }
  pintarMenu();
  window.addEventListener('hashchange', enrutar);
  enrutar();
}

iniciar();
