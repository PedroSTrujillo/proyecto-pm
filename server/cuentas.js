'use strict';

// Cuentas, sesiones y registro de actividad.

const crypto = require('crypto');
const express = require('express');
const db = require('./db');

const COOKIE = 'sesion';
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
    `SELECT u.id, u.email, u.nombre, u.rol, s.token_hash, s.ultima_actividad_en
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
  return { id: u.id, email: u.email, nombre: u.nombre, rol: u.rol };
}

// --- Rutas -----------------------------------------------------------------------

const rutas = express.Router();

rutas.post('/crear', async (req, res) => {
  const nombre = String(req.body?.nombre || '').trim().slice(0, 100);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const clave = String(req.body?.clave || '');
  if (!nombre) throw new ErrorUsuario('Escribe tu nombre.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorUsuario('Escribe un correo válido.');
  if (clave.length < 8) throw new ErrorUsuario('La contraseña debe tener al menos 8 caracteres.');
  const existe = await db.uno('SELECT id FROM usuarios WHERE email = $1', [email]);
  if (existe) throw new ErrorUsuario('Ya hay una cuenta con ese correo. Inicia sesión.');
  const rol = esEmailDeEquipo(email) ? 'equipo' : 'usuario';
  const u = await db.uno(
    'INSERT INTO usuarios (email, nombre, clave_hash, rol) VALUES ($1, $2, $3, $4) RETURNING id, email, nombre, rol',
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
  const u = await db.uno('SELECT id, email, nombre, rol, clave_hash FROM usuarios WHERE email = $1', [email]);
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

rutas.get('/yo', (req, res) => {
  res.json({ usuario: req.usuario ? publico(req.usuario) : null });
});

module.exports = {
  rutas,
  cargarUsuario,
  requiereUsuario,
  requiereEquipo,
  registrarEvento,
  ErrorUsuario,
  hashClave,
};
