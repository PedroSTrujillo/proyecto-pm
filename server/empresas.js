'use strict';

// Cuenta de empresa: todos los usuarios pertenecen a una. El inventario (archivos, catálogo,
// movimientos y ajustes de "Datos") es de la empresa; los pedidos siguen siendo de cada persona,
// porque la medición de la prueba es por persona (server/equipo.js).
//
//   GET    /api/empresa                       la empresa y sus miembros
//   PUT    /api/empresa                       nombre y NIT (quien administra)
//   POST   /api/empresa/invitaciones          enlace de un solo uso para unirse (quien administra)
//   GET    /api/empresa/invitaciones/:token   de qué empresa es un enlace (sin sesión)
//   DELETE /api/empresa/miembros/:id          sacar a alguien (quien administra)

const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const { requiereUsuario, requiereAdminEmpresa, registrarEvento, ErrorUsuario, hashToken, baseDe, DIAS_INVITACION } = require('./cuentas');
const { enviarCorreo, correoConfigurado } = require('./correo');

// --- Ajustes de inventario de la empresa ----------------------------------------------------

// Lo que antes estaba en usuarios.inventario: tiempos de entrega, cada cuánto pide, umbral de
// "se agota" y proveedores asignados. Se lee por usuario porque muchas rutas solo tienen su id.
async function inventarioDelUsuario(usuarioId) {
  const r = await db.uno('SELECT e.inventario FROM usuarios u JOIN empresas e ON e.id = u.empresa_id WHERE u.id = $1', [usuarioId]);
  return (r && r.inventario) || {};
}

async function guardarInventarioDelUsuario(usuarioId, ajustes) {
  await db.query('UPDATE empresas SET inventario = $1::jsonb WHERE id = (SELECT empresa_id FROM usuarios WHERE id = $2)', [JSON.stringify(ajustes), usuarioId]);
}

// --- Rutas ---------------------------------------------------------------------------------

const rutas = express.Router();

// Sin sesión: la pantalla de crear cuenta muestra a qué empresa lo invitaron.
rutas.get('/invitaciones/:token', async (req, res) => {
  const inv = await db.uno(
    `SELECT e.nombre, i.email FROM invitaciones i JOIN empresas e ON e.id = i.empresa_id
      WHERE i.token_hash = $1 AND i.usada_en IS NULL AND i.expira_en > now()`,
    [hashToken(String(req.params.token))],
  );
  if (!inv) throw new ErrorUsuario('Este enlace de invitación ya se usó o se venció. Pide uno nuevo a quien te invitó.', 404);
  res.json({ empresa: inv.nombre, email: inv.email || null });
});

rutas.use(requiereUsuario);

async function vistaEmpresa(empresaId) {
  const e = await db.uno('SELECT id, nombre, nit, vacia, creado_en FROM empresas WHERE id = $1', [empresaId]);
  const miembros = await db.query('SELECT id, nombre, email, perfil, admin_empresa, creado_en FROM usuarios WHERE empresa_id = $1 ORDER BY creado_en', [empresaId]);
  const invitaciones = await db.query(
    'SELECT email, creada_en, expira_en FROM invitaciones WHERE empresa_id = $1 AND usada_en IS NULL AND expira_en > now() ORDER BY creada_en DESC',
    [empresaId],
  );
  return {
    id: e.id,
    nombre: e.nombre,
    nit: e.nit,
    vacia: e.vacia,
    creadoEn: e.creado_en,
    miembros: miembros.map((m) => ({ id: m.id, nombre: m.nombre, email: m.email, perfil: m.perfil, admin: m.admin_empresa, desde: m.creado_en })),
    invitacionesAbiertas: invitaciones.map((i) => ({ email: i.email, creadaEn: i.creada_en, expiraEn: i.expira_en })),
  };
}

rutas.get('/', async (req, res) => {
  res.json({ empresa: await vistaEmpresa(req.usuario.empresa_id) });
});

rutas.put('/', requiereAdminEmpresa, async (req, res) => {
  const nombre = String(req.body?.nombre || '').trim().slice(0, 120);
  const nit = String(req.body?.nit || '').trim().slice(0, 30) || null;
  if (!nombre) throw new ErrorUsuario('Escribe el nombre de la empresa.');
  await db.query('UPDATE empresas SET nombre = $1, nit = $2, vacia = false WHERE id = $3', [nombre, nit, req.usuario.empresa_id]);
  await registrarEvento(req.usuario.id, 'empresa_actualizada');
  res.json({ empresa: await vistaEmpresa(req.usuario.empresa_id) });
});

rutas.post('/invitaciones', requiereAdminEmpresa, async (req, res) => {
  if (req.usuario.empresa_vacia) throw new ErrorUsuario('Ponle nombre a tu empresa antes de invitar a alguien: así sabrá a qué se une.');
  const email = String(req.body?.email || '').trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorUsuario('Escribe un correo válido, o déjalo vacío para un enlace que sirva a cualquiera.');
  if (email && (await db.uno('SELECT id FROM usuarios WHERE email = $1', [email]))) {
    throw new ErrorUsuario('Ya hay una cuenta con ese correo. Por ahora una cuenta no se puede pasar de una empresa a otra.');
  }
  const token = crypto.randomBytes(24).toString('base64url');
  await db.query(
    `INSERT INTO invitaciones (token_hash, empresa_id, creada_por, email, expira_en)
     VALUES ($1, $2, $3, $4, now() + interval '${DIAS_INVITACION} days')`,
    [hashToken(token), req.usuario.empresa_id, req.usuario.id, email],
  );
  const enlace = `${baseDe(req).replace(/\/+$/, '')}/crear-cuenta?invitacion=${token}`;
  let enviado = false;
  if (email && correoConfigurado()) {
    await enviarCorreo({
      para: email,
      nombre: email,
      asunto: `${req.usuario.nombre} te invitó a ${req.usuario.empresa_nombre} en SINESC`,
      texto: `Hola:\n\n${req.usuario.nombre} te invitó a llevar el inventario de ${req.usuario.empresa_nombre} en SINESC.\n\nPara crear tu cuenta, abre este enlace. Sirve una sola vez y durante ${DIAS_INVITACION} días:\n${enlace}\n\nSi no esperabas este correo, ignóralo.`,
    })
      .then(() => { enviado = true; })
      .catch((e) => console.error('No se pudo enviar la invitación:', e.message));
  }
  await registrarEvento(req.usuario.id, 'invitacion_creada', { detalle: { conCorreo: Boolean(email), enviado } });
  res.status(201).json({ enlace, dias: DIAS_INVITACION, enviado, empresa: await vistaEmpresa(req.usuario.empresa_id) });
});

// Quien sale de la empresa conserva su cuenta y sus pedidos, pero ya no ve el inventario de esta:
// queda con una empresa vacía nueva.
rutas.delete('/miembros/:id', requiereAdminEmpresa, async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.usuario.id) throw new ErrorUsuario('No te puedes sacar a ti mismo de la empresa.');
  const m = await db.uno('SELECT id FROM usuarios WHERE id = $1 AND empresa_id = $2', [id, req.usuario.empresa_id]);
  if (!m) throw new ErrorUsuario('Esa persona no está en tu empresa.', 404);
  await db.tx(async (t) => {
    const { rows } = await t.query('INSERT INTO empresas (vacia) VALUES (true) RETURNING id');
    await t.query('UPDATE usuarios SET empresa_id = $1, admin_empresa = true WHERE id = $2', [rows[0].id, id]);
  });
  await registrarEvento(req.usuario.id, 'miembro_retirado', { detalle: { usuario: id } });
  res.json({ empresa: await vistaEmpresa(req.usuario.empresa_id) });
});

module.exports = { rutas, inventarioDelUsuario, guardarInventarioDelUsuario };
