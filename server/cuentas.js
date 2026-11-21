'use strict';

// Cuentas, sesiones y registro de actividad.

const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const { enviarCorreo, correoConfigurado } = require('./correo');
const { limpiarAlertas, alertasDe, TIPOS: TIPOS_ALERTA, FRECUENCIAS } = require('./alertas');

const COOKIE = 'sesion';
const HORAS_ENLACE_RESTABLECER = 24;
const DIAS_INVITACION = 7;
const DURACION_SESION_DIAS = 30;
// Si alguien vuelve con la sesión abierta después de este tiempo sin actividad,
// cuenta como un nuevo ingreso (para ver si los usuarios vuelven por su cuenta).
const MINUTOS_ENTRE_INGRESOS = 30;

class ErrorUsuario extends Error {
  constructor(mensaje, estado = 400, extra = {}) {
    super(mensaje);
    this.estado = estado;
    this.extra = extra;
  }
}

// --- Claves ---------------------------------------------------------------------

function hashClave(clave) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(clave, sal, 64);
  return `scrypt$${sal.toString('base64')}$${hash.toString('base64')}`;
}

function verificarClave(clave, guardado) {
  const [alg, sal, hash] = String(guardado).split('$');
  if (alg !== 'scrypt' || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  const calculado = crypto.scryptSync(clave, Buffer.from(sal, 'base64'), esperado.length);
  return crypto.timingSafeEqual(esperado, calculado);
}

// --- Eventos ---------------------------------------------------------------------

async function registrarEvento(usuarioId, tipo, { pedidoId = null, detalle = null } = {}, cliente = null) {
  const q = cliente ? cliente.query.bind(cliente) : (s, p) => db.query(s, p);
  await q('INSERT INTO eventos (usuario_id, tipo, pedido_id, detalle) VALUES ($1, $2, $3, $4::jsonb)', [usuarioId, tipo, pedidoId, detalle ? JSON.stringify(detalle) : null]);
}

// --- Sesiones --------------------------------------------------------------------

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function leerCookies(req) {
  const out = {};
  const h = req.headers.cookie;
  if (!h) return out;
  for (const parte of h.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    out[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
  }
  return out;
}

function opcionesCookie(req) {
  const segura = req.secure || process.env.NODE_ENV === 'production';
  return `Path=/; HttpOnly; SameSite=Lax${segura ? '; Secure' : ''}`;
}

async function abrirSesion(req, res, usuarioId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO sesiones (token_hash, usuario_id, expira_en) VALUES ($1, $2, now() + interval '${DURACION_SESION_DIAS} days')`,
    [hashToken(token), usuarioId],
  );
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Max-Age=${DURACION_SESION_DIAS * 86400}; ${opcionesCookie(req)}`);
}

function esEmailDeEquipo(email) {
  const lista = (process.env.TEAM_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return lista.includes(email);
}

// Lo que se sabe de un usuario en cada petición: sus datos, su empresa y sus preferencias.
const COLUMNAS_USUARIO = `u.id, u.email, u.nombre, u.rol, u.sistema, u.empresa_id, u.admin_empresa, u.perfil,
  u.preferencias, u.boletin, u.aprueba, u.sube_datos, u.cargo, e.nombre AS empresa_nombre, e.vacia AS empresa_vacia`;

async function usuarioPorId(id) {
  return db.uno(`SELECT ${COLUMNAS_USUARIO} FROM usuarios u LEFT JOIN empresas e ON e.id = u.empresa_id WHERE u.id = $1`, [id]);
}

// Todo usuario pertenece a una empresa. Si la suya se borró, queda con una empresa vacía nueva
// (lo mismo que reciben los usuarios de antes de las empresas, en server/db.js).
async function asegurarEmpresa(u) {
  if (u.empresa_id) return u;
  const e = await db.uno('INSERT INTO empresas (vacia) VALUES (true) RETURNING id');
  await db.query("UPDATE usuarios SET empresa_id = $1, admin_empresa = true, perfil = 'analista', aprueba = true WHERE id = $2", [e.id, u.id]);
  return { ...u, empresa_id: e.id, admin_empresa: true, perfil: 'analista', aprueba: true, empresa_nombre: '', empresa_vacia: true };
}

// Carga req.usuario si hay sesión válida.
async function cargarUsuario(req, _res, next) {
  const token = leerCookies(req)[COOKIE];
  if (!token) return next();
  const fila = await db.uno(
    `SELECT ${COLUMNAS_USUARIO}, s.token_hash, s.ultima_actividad_en
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id LEFT JOIN empresas e ON e.id = u.empresa_id
      WHERE s.token_hash = $1 AND s.expira_en > now() AND u.suspendida_en IS NULL`,
    [hashToken(token)],
  );
  if (!fila) return next();
  req.usuario = await asegurarEmpresa(fila);
  const minutos = (Date.now() - new Date(fila.ultima_actividad_en).getTime()) / 60000;
  if (minutos >= 1) {
    if (minutos >= MINUTOS_ENTRE_INGRESOS) {
      // Los enlaces del boletín diario traen ?desde=boletin (llega en el encabezado Referer de la API).
      const desdeBoletin = /[?&]desde=boletin\b/.test(String(req.get('referer') || ''));
      await registrarEvento(fila.id, 'ingreso', { detalle: { como: desdeBoletin ? 'boletin' : 'volvio_con_sesion_abierta' } });
    }
    await db.query('UPDATE sesiones SET ultima_actividad_en = now() WHERE token_hash = $1', [fila.token_hash]);
  }
  next();
}

function requiereUsuario(req, _res, next) {
  if (!req.usuario) return next(new ErrorUsuario('Su sesión se cerró. Vuelva a iniciar sesión.', 401));
  next();
}

function requiereEquipo(req, _res, next) {
  if (!req.usuario) return next(new ErrorUsuario('Su sesión se cerró. Vuelva a iniciar sesión.', 401));
  if (req.usuario.rol !== 'equipo') return next(new ErrorUsuario('Esta pantalla es solo para el equipo.', 403));
  next();
}

// El rol sale de dos columnas que ya existían: el gerente es quien fundó la empresa (admin_empresa) y
// el perfil guardado distingue al administrador ('analista') del operador. Una persona solo invita,
// cambia o saca a alguien de rango menor al suyo (docs/PLAN_CAMBIOS_SINESC.md, T1).
const RANGO = { operador: 1, administrador: 2, gerente: 3 };

function rolEmpresa(u) {
  if (u.admin_empresa) return 'gerente';
  return u.perfil === 'operador' ? 'operador' : 'administrador';
}

function requiereRol(...roles) {
  return (req, _res, next) => {
    if (!req.usuario) return next(new ErrorUsuario('Su sesión se cerró. Vuelva a iniciar sesión.', 401));
    if (!roles.includes(rolEmpresa(req.usuario))) return next(new ErrorUsuario('Solo quien administra la empresa puede hacer esto.', 403));
    next();
  };
}

const requiereAdminEmpresa = requiereRol('gerente', 'administrador');

const UNIDADES = ['dias', 'semanas', 'meses'];
const UNIDAD_CUENTA_NUEVA = 'dias';
const HORIZONTE_POR_DEFECTO = 4; // semanas: lo de "Venta en 4 semanas"
const HORIZONTE_MAXIMO = 26;

// Cómo quiere ver el tiempo: en días, semanas o meses, y cuántas semanas pronosticar. El cálculo
// sigue en semanas (docs/modelo-rotacion.md, "Unidades al mostrar"): esto solo cambia cómo se dice.
// alertas: solo lo que la persona cambió de la tabla del boletín (server/alertas.js); lo demás sigue su perfil.
function leerPreferencias(p) {
  const pref = p && typeof p === 'object' ? p : {};
  const h = Number(pref.horizonte);
  return {
    unidad: UNIDADES.includes(pref.unidad) ? pref.unidad : 'semanas',
    horizonte: Number.isFinite(h) && h >= 0.5 && h <= HORIZONTE_MAXIMO ? Math.round(h * 100) / 100 : HORIZONTE_POR_DEFECTO,
    alertas: limpiarAlertas(pref.alertas),
  };
}

function publico(u) {
  return {
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    rol: u.rol,
    sistema: u.sistema || null,
    perfil: u.perfil || 'analista',
    rolEmpresa: rolEmpresa(u),
    // alertas: la tabla completa del boletín; alertasPropias: si cambió algo de lo de su perfil.
    preferencias: { ...leerPreferencias(u.preferencias), alertas: alertasDe(u.preferencias, u.perfil || 'analista'), alertasPropias: Object.keys(leerPreferencias(u.preferencias).alertas).length > 0 },
    boletin: Boolean(u.boletin),
    cargo: u.cargo || '',
    // Aprueba los pedidos de su empresa (lo marca quien administra, D11).
    aprueba: Boolean(u.aprueba),
    // Un operador sube el archivo de inventario solo si quien administra se lo marcó.
    subeDatos: Boolean(u.sube_datos),
    empresa: u.empresa_id ? { id: u.empresa_id, nombre: u.empresa_nombre || '', vacia: Boolean(u.empresa_vacia), admin: Boolean(u.admin_empresa) } : null,
  };
}

async function publicoPorId(id) {
  return publico(await usuarioPorId(id));
}

// El cargo va en el PDF del pedido, al lado del nombre ("Jefe de compras").
function leerCargo(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || null;
}

function validarClave(clave) {
  if (clave.length < 8) throw new ErrorUsuario('La contraseña debe tener al menos 8 caracteres.');
}

/**
 * Crea un enlace de un solo uso para poner una contraseña nueva. Vale 24 horas.
 * base: la dirección de la app ("https://…"), para armar el enlace.
 */
async function crearEnlaceRestablecer(usuarioId, base) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO restablecimientos (token_hash, usuario_id, expira_en) VALUES ($1, $2, now() + interval '${HORAS_ENLACE_RESTABLECER} hours')`,
    [hashToken(token), usuarioId],
  );
  return { enlace: `${base.replace(/\/+$/, '')}/restablecer/${token}`, horas: HORAS_ENLACE_RESTABLECER };
}

function baseDe(req) {
  return process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : `${req.protocol}://${req.get('host')}`);
}

const CUENTA_SUSPENDIDA = 'Su cuenta está suspendida. Escriba al equipo de SINESC para reactivarla.';

// --- Rutas -----------------------------------------------------------------------

const rutas = express.Router();

// Una cuenta nueva siempre entra a una empresa: la que crea en el mismo formulario o la de la
// invitación que le mandaron (docs/PLAN_EMPRESAS_INVENTARIO.md, D2).
rutas.post('/crear', async (req, res) => {
  const nombre = String(req.body?.nombre || '').trim().slice(0, 100);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const clave = String(req.body?.clave || '');
  const invitacion = String(req.body?.invitacion || '').trim();
  const empresa = typeof req.body?.empresa === 'object' && req.body.empresa ? req.body.empresa : { nombre: req.body?.empresa, nit: req.body?.nit };
  const nombreEmpresa = String(empresa.nombre || '').trim().slice(0, 120);
  const nit = String(empresa.nit || '').trim().slice(0, 30) || null;
  const cargo = leerCargo(req.body?.cargo);
  const boletin = req.body?.boletin === true || req.body?.boletin === 'on' || req.body?.boletin === 'true';
  if (!nombre) throw new ErrorUsuario('Escriba su nombre.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorUsuario('Escriba un correo válido.');
  validarClave(clave);
  if (!invitacion && !nombreEmpresa) throw new ErrorUsuario('Escriba el nombre de su empresa o abra el enlace de invitación que le enviaron.');
  const existe = await db.uno('SELECT id FROM usuarios WHERE email = $1', [email]);
  if (existe) throw new ErrorUsuario('Ya hay una cuenta con ese correo. Inicie sesión.');
  const rol = esEmailDeEquipo(email) ? 'equipo' : 'usuario';
  // El código se dicta por teléfono: "flua gddv", "FLUAGDDV" y "FLUA-GDDV" son el mismo.
  const limpio = String(req.body?.codigo || '').replace(/[^0-9a-z]/gi, '').toUpperCase();
  const codigo = limpio.length === 8 ? `${limpio.slice(0, 4)}-${limpio.slice(4)}` : limpio;
  if (!codigo) throw new ErrorUsuario('Escriba su código de acceso. Se lo entrega el equipo de SINESC.');
  const id = await db.tx(async (t) => {
    // Cada persona lleva el suyo, también quien entra por invitación; si algo falla abajo, el tx lo devuelve.
    const { rows: usados } = await t.query('UPDATE codigos_acceso SET usado_en = now() WHERE codigo = $1 AND usado_en IS NULL RETURNING codigo', [codigo]);
    if (!usados[0]) throw new ErrorUsuario('El código de acceso no es válido o ya se usó. Pídalo al equipo de SINESC.');
    let empresaId;
    // Quien funda la empresa es su gerente y aprueba; quien entra por invitación toma el rol de la
    // invitación (sin rol, el más bajo), nunca uno que mande el formulario.
    let admin = true;
    let perfil = 'analista';
    let aprueba = true;
    if (invitacion) {
      const { rows } = await t.query(
        `UPDATE invitaciones SET usada_en = now()
          WHERE token_hash = $1 AND usada_en IS NULL AND expira_en > now() AND (email IS NULL OR email = $2)
          RETURNING empresa_id, rol`,
        [hashToken(invitacion), email],
      );
      if (!rows[0]) throw new ErrorUsuario('Este enlace de invitación ya se usó, se venció o es para otro correo. Pida uno nuevo a quien lo invitó.');
      empresaId = rows[0].empresa_id;
      admin = false;
      aprueba = false;
      perfil = rows[0].rol === 'administrador' ? 'analista' : 'operador';
    } else {
      const { rows } = await t.query('INSERT INTO empresas (nombre, nit) VALUES ($1, $2) RETURNING id', [nombreEmpresa, nit]);
      empresaId = rows[0].id;
    }
    // Las cuentas nuevas ven el tiempo en días (Francisco Lozano, entrevista de la semana 12: los
    // indicadores de inventario se miden en días, y mezclar días y semanas confundía). Las de antes siguen
    // como estaban, y cada quien lo cambia en Mi cuenta.
    const { rows } = await t.query(
      `INSERT INTO usuarios (email, nombre, clave_hash, rol, empresa_id, admin_empresa, perfil, aprueba, boletin, cargo, preferencias)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb) RETURNING id`,
      [email, nombre, hashClave(clave), rol, empresaId, admin, perfil, aprueba, boletin, cargo, JSON.stringify({ unidad: UNIDAD_CUENTA_NUEVA })],
    );
    await t.query('UPDATE codigos_acceso SET usado_por = $1 WHERE codigo = $2', [rows[0].id, codigo]);
    if (invitacion) await t.query('UPDATE invitaciones SET usada_por = $1 WHERE token_hash = $2', [rows[0].id, hashToken(invitacion)]);
    return rows[0].id;
  });
  const usuario = await publicoPorId(id);
  await registrarEvento(id, 'cuenta_creada', { detalle: { como: invitacion ? 'invitacion' : 'empresa_nueva', rol: usuario.rolEmpresa } });
  await registrarEvento(id, 'ingreso', { detalle: { como: 'cuenta_nueva' } });
  await abrirSesion(req, res, id);
  res.status(201).json({ usuario });
});

rutas.post('/entrar', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const clave = String(req.body?.clave || '');
  const u = await db.uno('SELECT id, email, nombre, rol, sistema, clave_hash, es_equipo, suspendida_en FROM usuarios WHERE email = $1', [email]);
  if (!u || !verificarClave(clave, u.clave_hash)) throw new ErrorUsuario('El correo o la contraseña no coinciden.', 401);
  if (u.suspendida_en) throw new ErrorUsuario(CUENTA_SUSPENDIDA, 403);
  const rol = esEmailDeEquipo(email) || u.es_equipo ? 'equipo' : u.rol === 'equipo' && !process.env.TEAM_EMAILS ? 'equipo' : 'usuario';
  if (rol !== u.rol) await db.query('UPDATE usuarios SET rol = $1 WHERE id = $2', [rol, u.id]);
  u.rol = rol;
  await registrarEvento(u.id, 'ingreso', { detalle: { como: 'inicio_sesion' } });
  await abrirSesion(req, res, u.id);
  res.json({ usuario: publico(await asegurarEmpresa(await usuarioPorId(u.id))) });
});

rutas.post('/salir', async (req, res) => {
  const token = leerCookies(req)[COOKIE];
  if (token) await db.query('DELETE FROM sesiones WHERE token_hash = $1', [hashToken(token)]);
  if (req.usuario) await registrarEvento(req.usuario.id, 'salida');
  res.setHeader('Set-Cookie', `${COOKIE}=; Max-Age=0; ${opcionesCookie(req)}`);
  res.json({ ok: true });
});

// LANDING_URL: la página de presentación, para el enlace "Página principal".
rutas.get('/yo', (req, res) => {
  res.json({ usuario: req.usuario ? publico(req.usuario) : null, landing: process.env.LANDING_URL || '/' });
});

// --- Página de cuenta ---------------------------------------------------------------

rutas.put('/datos', requiereUsuario, async (req, res) => {
  const nombre = String(req.body?.nombre ?? req.usuario.nombre).trim().slice(0, 100);
  if (!nombre) throw new ErrorUsuario('Escriba su nombre.');
  const sistema = req.body?.sistema === undefined ? req.usuario.sistema : req.body.sistema;
  if (sistema !== null && !/^[a-z0-9-]{1,40}$/.test(String(sistema))) throw new ErrorUsuario('Elija su programa contable de la lista.');
  const cargo = req.body?.cargo === undefined ? req.usuario.cargo : leerCargo(req.body.cargo);
  await db.query('UPDATE usuarios SET nombre = $1, sistema = $2, cargo = $3 WHERE id = $4', [nombre, sistema, cargo, req.usuario.id]);
  res.json({ usuario: await publicoPorId(req.usuario.id) });
});

rutas.put('/preferencias', requiereUsuario, async (req, res) => {
  const cuerpo = req.body && typeof req.body === 'object' ? req.body : {};
  if (cuerpo.unidad !== undefined && !UNIDADES.includes(cuerpo.unidad)) throw new ErrorUsuario('Elija días, semanas o meses.');
  if (cuerpo.horizonte !== undefined && !(Number(cuerpo.horizonte) >= 0.5 && Number(cuerpo.horizonte) <= HORIZONTE_MAXIMO)) {
    throw new ErrorUsuario(`El horizonte tiene que estar entre media semana y ${HORIZONTE_MAXIMO} semanas.`);
  }
  // alertas: { tipo: frecuencia } cambia solo esos tipos; null vuelve a los valores del perfil.
  const guardadas = leerPreferencias(req.usuario.preferencias);
  let alertas = guardadas.alertas;
  if (cuerpo.alertas === null) alertas = {};
  else if (cuerpo.alertas !== undefined) {
    const pedidas = cuerpo.alertas && typeof cuerpo.alertas === 'object' ? cuerpo.alertas : {};
    for (const [t, f] of Object.entries(pedidas)) {
      if (!TIPOS_ALERTA.includes(t)) throw new ErrorUsuario('Ese tipo de alerta no existe.');
      if (!FRECUENCIAS.includes(f)) throw new ErrorUsuario('Elija diario, semanal, mensual o nunca.');
    }
    alertas = { ...alertas, ...pedidas };
  }
  const pref = leerPreferencias({ ...guardadas, ...cuerpo, alertas });
  await db.query('UPDATE usuarios SET preferencias = $1::jsonb WHERE id = $2', [JSON.stringify(pref), req.usuario.id]);
  res.json({ usuario: await publicoPorId(req.usuario.id) });
});

rutas.put('/boletin', requiereUsuario, async (req, res) => {
  if (typeof req.body?.activo !== 'boolean') throw new ErrorUsuario('Elija si quiere recibir el boletín.');
  await db.query('UPDATE usuarios SET boletin = $1 WHERE id = $2', [req.body.activo, req.usuario.id]);
  await registrarEvento(req.usuario.id, req.body.activo ? 'boletin_activado' : 'boletin_desactivado');
  res.json({ usuario: await publicoPorId(req.usuario.id) });
});

rutas.put('/clave', requiereUsuario, async (req, res) => {
  const actual = String(req.body?.actual || '');
  const nueva = String(req.body?.nueva || '');
  const u = await db.uno('SELECT clave_hash FROM usuarios WHERE id = $1', [req.usuario.id]);
  if (!verificarClave(actual, u.clave_hash)) throw new ErrorUsuario('La contraseña actual no es correcta.');
  validarClave(nueva);
  await db.query('UPDATE usuarios SET clave_hash = $1 WHERE id = $2', [hashClave(nueva), req.usuario.id]);
  // Cierra las demás sesiones (por ejemplo, la de otro computador).
  await db.query('DELETE FROM sesiones WHERE usuario_id = $1 AND token_hash <> $2', [req.usuario.id, req.usuario.token_hash]);
  await registrarEvento(req.usuario.id, 'clave_cambiada');
  res.json({ ok: true });
});

// --- Olvidé mi contraseña --------------------------------------------------------------

// La respuesta es la misma exista o no la cuenta, para no revelar qué correos están registrados.
rutas.post('/olvide', async (req, res) => {
  if (!correoConfigurado()) return res.json({ correo: false });
  const email = String(req.body?.email || '').trim().toLowerCase();
  const u = await db.uno('SELECT id, nombre, email FROM usuarios WHERE email = $1 AND suspendida_en IS NULL', [email]);
  if (u) {
    const { enlace, horas } = await crearEnlaceRestablecer(u.id, baseDe(req));
    await enviarCorreo({
      para: u.email,
      nombre: u.nombre,
      asunto: 'Cambie su contraseña de SINESC',
      texto: `Hola, ${u.nombre}:\n\nPara poner una contraseña nueva, abra este enlace. Sirve una sola vez y durante ${horas} horas:\n${enlace}\n\nSi no lo pidió, ignore este correo: su contraseña sigue igual.`,
    }).catch((e) => console.error('No se pudo enviar el enlace para restablecer:', e.message));
  }
  res.json({ correo: true });
});

rutas.post('/restablecer', async (req, res) => {
  const token = String(req.body?.token || '');
  const clave = String(req.body?.clave || '');
  validarClave(clave);
  const r = await db.uno(
    'UPDATE restablecimientos SET usado_en = now() WHERE token_hash = $1 AND usado_en IS NULL AND expira_en > now() RETURNING usuario_id',
    [hashToken(token)],
  );
  if (!r) throw new ErrorUsuario('Este enlace ya se usó o se venció. Pida uno nuevo.', 400);
  if ((await db.uno('SELECT suspendida_en FROM usuarios WHERE id = $1', [r.usuario_id]))?.suspendida_en) throw new ErrorUsuario(CUENTA_SUSPENDIDA, 403);
  await db.query('UPDATE usuarios SET clave_hash = $1 WHERE id = $2', [hashClave(clave), r.usuario_id]);
  await db.query('DELETE FROM sesiones WHERE usuario_id = $1', [r.usuario_id]);
  await registrarEvento(r.usuario_id, 'clave_restablecida');
  await abrirSesion(req, res, r.usuario_id);
  res.json({ usuario: await publicoPorId(r.usuario_id) });
});

module.exports = {
  rutas,
  cargarUsuario,
  requiereUsuario,
  requiereEquipo,
  requiereAdminEmpresa,
  requiereRol,
  rolEmpresa,
  RANGO,
  leerPreferencias,
  hashToken,
  esEmailDeEquipo,
  DIAS_INVITACION,
  registrarEvento,
  ErrorUsuario,
  hashClave,
  verificarClave,
  crearEnlaceRestablecer,
  baseDe,
  leerCargo,
};
