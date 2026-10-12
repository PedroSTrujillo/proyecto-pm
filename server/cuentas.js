'use strict';

// Cuentas, sesiones y registro de actividad.

const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const { enviarCorreo, correoConfigurado } = require('./correo');

const COOKIE = 'sesion';
const HORAS_ENLACE_RESTABLECER = 24;
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

// Carga req.usuario si hay sesión válida.
async function cargarUsuario(req, _res, next) {
  const token = leerCookies(req)[COOKIE];
  if (!token) return next();
  const fila = await db.uno(
    `SELECT u.id, u.email, u.nombre, u.rol, u.sistema, s.token_hash, s.ultima_actividad_en
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = $1 AND s.expira_en > now()`,
    [hashToken(token)],
  );
  if (!fila) return next();
  req.usuario = fila;
  const minutos = (Date.now() - new Date(fila.ultima_actividad_en).getTime()) / 60000;
  if (minutos >= 1) {
    if (minutos >= MINUTOS_ENTRE_INGRESOS) {
      await registrarEvento(fila.id, 'ingreso', { detalle: { como: 'volvio_con_sesion_abierta' } });
    }
    await db.query('UPDATE sesiones SET ultima_actividad_en = now() WHERE token_hash = $1', [fila.token_hash]);
  }
  next();
}

function requiereUsuario(req, _res, next) {
  if (!req.usuario) return next(new ErrorUsuario('Tu sesión se cerró. Vuelve a iniciar sesión.', 401));
  next();
}

function requiereEquipo(req, _res, next) {
  if (!req.usuario) return next(new ErrorUsuario('Tu sesión se cerró. Vuelve a iniciar sesión.', 401));
  if (req.usuario.rol !== 'equipo') return next(new ErrorUsuario('Esta pantalla es solo para el equipo.', 403));
  next();
}

function publico(u) {
  return { id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, sistema: u.sistema || null };
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
  return process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
}

// --- Rutas -----------------------------------------------------------------------

const rutas = express.Router();

rutas.post('/crear', async (req, res) => {
  const nombre = String(req.body?.nombre || '').trim().slice(0, 100);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const clave = String(req.body?.clave || '');
  if (!nombre) throw new ErrorUsuario('Escribe tu nombre.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorUsuario('Escribe un correo válido.');
  validarClave(clave);
  const existe = await db.uno('SELECT id FROM usuarios WHERE email = $1', [email]);
  if (existe) throw new ErrorUsuario('Ya hay una cuenta con ese correo. Inicia sesión.');
  const rol = esEmailDeEquipo(email) ? 'equipo' : 'usuario';
  const u = await db.uno(
    'INSERT INTO usuarios (email, nombre, clave_hash, rol) VALUES ($1, $2, $3, $4) RETURNING id, email, nombre, rol, sistema',
    [email, nombre, hashClave(clave), rol],
  );
  await registrarEvento(u.id, 'cuenta_creada');
  await registrarEvento(u.id, 'ingreso', { detalle: { como: 'cuenta_nueva' } });
  await abrirSesion(req, res, u.id);
  res.status(201).json({ usuario: publico(u) });
});

rutas.post('/entrar', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const clave = String(req.body?.clave || '');
  const u = await db.uno('SELECT id, email, nombre, rol, sistema, clave_hash FROM usuarios WHERE email = $1', [email]);
  if (!u || !verificarClave(clave, u.clave_hash)) throw new ErrorUsuario('El correo o la contraseña no coinciden.', 401);
  const rol = esEmailDeEquipo(email) ? 'equipo' : u.rol === 'equipo' && !process.env.TEAM_EMAILS ? 'equipo' : 'usuario';
  if (rol !== u.rol) await db.query('UPDATE usuarios SET rol = $1 WHERE id = $2', [rol, u.id]);
  u.rol = rol;
  await registrarEvento(u.id, 'ingreso', { detalle: { como: 'inicio_sesion' } });
  await abrirSesion(req, res, u.id);
  res.json({ usuario: publico(u) });
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
  res.json({ usuario: req.usuario ? publico(req.usuario) : null, landing: process.env.LANDING_URL || 'https://proyecto-pm.vercel.app' });
});

// --- Página de cuenta ---------------------------------------------------------------

rutas.put('/datos', requiereUsuario, async (req, res) => {
  const nombre = String(req.body?.nombre ?? req.usuario.nombre).trim().slice(0, 100);
  if (!nombre) throw new ErrorUsuario('Escribe tu nombre.');
  const sistema = req.body?.sistema === undefined ? req.usuario.sistema : req.body.sistema;
  if (sistema !== null && !/^[a-z0-9-]{1,40}$/.test(String(sistema))) throw new ErrorUsuario('Elige tu programa contable de la lista.');
  const u = await db.uno('UPDATE usuarios SET nombre = $1, sistema = $2 WHERE id = $3 RETURNING id, email, nombre, rol, sistema', [nombre, sistema, req.usuario.id]);
  res.json({ usuario: publico(u) });
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
  const u = await db.uno('SELECT id, nombre, email FROM usuarios WHERE email = $1', [email]);
  if (u) {
    const { enlace, horas } = await crearEnlaceRestablecer(u.id, baseDe(req));
    await enviarCorreo({
      para: u.email,
      nombre: u.nombre,
      asunto: 'Cambia tu contraseña de SINESC',
      texto: `Hola, ${u.nombre}:\n\nPara poner una contraseña nueva, abre este enlace. Sirve una sola vez y durante ${horas} horas:\n${enlace}\n\nSi no lo pediste, ignora este correo: tu contraseña sigue igual.`,
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
  if (!r) throw new ErrorUsuario('Este enlace ya se usó o se venció. Pide uno nuevo.', 400);
  await db.query('UPDATE usuarios SET clave_hash = $1 WHERE id = $2', [hashClave(clave), r.usuario_id]);
  await db.query('DELETE FROM sesiones WHERE usuario_id = $1', [r.usuario_id]);
  await registrarEvento(r.usuario_id, 'clave_restablecida');
  await abrirSesion(req, res, r.usuario_id);
  const u = await db.uno('SELECT id, email, nombre, rol, sistema FROM usuarios WHERE id = $1', [r.usuario_id]);
  res.json({ usuario: publico(u) });
});

module.exports = {
  rutas,
  cargarUsuario,
  requiereUsuario,
  requiereEquipo,
  registrarEvento,
  ErrorUsuario,
  hashClave,
  crearEnlaceRestablecer,
  baseDe,
};
