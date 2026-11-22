'use strict';

// Cuenta de empresa: todos los usuarios pertenecen a una. El inventario (archivos, catálogo,
// movimientos y ajustes de "Datos") es de la empresa; los pedidos siguen siendo de cada persona,
// porque la medición de la prueba es por persona (server/equipo.js).
//
//   GET    /api/empresa                       la empresa y sus miembros
//   PUT    /api/empresa                       nombre y NIT (quien administra)
//   POST   /api/empresa/invitaciones          enlace de un solo uso para unirse (quien administra)
//   GET    /api/empresa/invitaciones/:token   de qué empresa es un enlace (sin sesión)
//   PUT    /api/empresa/miembros/:id          quién aprueba pedidos y el cargo de cada uno (quien administra)
//   DELETE /api/empresa/miembros/:id          sacar a alguien (quien administra)
//   GET    /api/empresa/logo                  el logo de la empresa (para la pantalla)
//   PUT    /api/empresa/logo                  subir el logo: { tipo, datos en base64 } (quien administra)
//   DELETE /api/empresa/logo                  quitarlo (quien administra)

const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const { SECTORES } = require('./noticias');
const { requiereUsuario, requiereAdminEmpresa, requiereRol, rolEmpresa, RANGO, registrarEvento, ErrorUsuario, hashToken, baseDe, leerCargo, DIAS_INVITACION } = require('./cuentas');
const { abrirImagen } = require('./pdf');

// El logo va en el PDF y el Excel del pedido: PNG o JPG pequeño, para que el archivo no pese.
const MAX_LOGO_KB = 300;
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
  if (!inv) throw new ErrorUsuario('Este enlace de invitación ya se usó o se venció. Pida uno nuevo a quien lo invitó.', 404);
  res.json({ empresa: inv.nombre, email: inv.email || null });
});

rutas.use(requiereUsuario);

// Solo se actúa sobre alguien de rango menor al propio: así nadie toca al gerente, ni a su igual, ni a sí mismo.
function exigirRangoSobre(req, miembro) {
  if (RANGO[rolEmpresa(miembro)] >= RANGO[rolEmpresa(req.usuario)]) throw new ErrorUsuario('Usted no puede cambiar a alguien de su mismo rango o de uno mayor.', 403);
}

// El rol que se le da a otra persona: administrador u operador, siempre menor al propio.
function leerRol(req, rol) {
  if (rol !== 'administrador' && rol !== 'operador') throw new ErrorUsuario('Elija el rol: administrador u operador.');
  if (RANGO[rol] >= RANGO[rolEmpresa(req.usuario)]) throw new ErrorUsuario('Usted solo puede dar un rol menor al suyo.', 403);
  return rol;
}

async function vistaEmpresa(empresaId) {
  const e = await db.uno('SELECT id, nombre, nit, sector, vacia, creado_en, logo IS NOT NULL AS con_logo FROM empresas WHERE id = $1', [empresaId]);
  const miembros = await db.query('SELECT aprueba, sube_datos, registra_movimientos, hace_conteos, id, nombre, email, perfil, admin_empresa, cargo, creado_en FROM usuarios WHERE empresa_id = $1 ORDER BY creado_en', [empresaId]);
  const invitaciones = await db.query(
    'SELECT email, creada_en, expira_en FROM invitaciones WHERE empresa_id = $1 AND usada_en IS NULL AND expira_en > now() ORDER BY creada_en DESC',
    [empresaId],
  );
  return {
    id: e.id,
    nombre: e.nombre,
    nit: e.nit,
    sector: SECTORES[e.sector] ? e.sector : null,
    vacia: e.vacia,
    creadoEn: e.creado_en,
    logo: Boolean(e.con_logo),
    miembros: miembros.map((m) => ({ id: m.id, nombre: m.nombre, email: m.email, perfil: m.perfil, rol: rolEmpresa(m), admin: m.admin_empresa, aprueba: m.aprueba, subeDatos: m.sube_datos, registraMovimientos: m.registra_movimientos, haceConteos: m.hace_conteos, cargo: m.cargo || '', desde: m.creado_en })),
    invitacionesAbiertas: invitaciones.map((i) => ({ email: i.email, creadaEn: i.creada_en, expiraEn: i.expira_en })),
  };
}

rutas.get('/', async (req, res) => {
  res.json({ empresa: await vistaEmpresa(req.usuario.empresa_id) });
});

rutas.put('/', requiereAdminEmpresa, async (req, res) => {
  const nombre = String(req.body?.nombre || '').trim().slice(0, 120);
  const nit = String(req.body?.nit || '').trim().slice(0, 30) || null;
  if (!nombre) throw new ErrorUsuario('Escriba el nombre de la empresa.');
  // El sector solo cambia si viene; vacío lo quita.
  const sector = req.body?.sector === undefined ? undefined : String(req.body.sector || '') || null;
  if (sector && !SECTORES[sector]) throw new ErrorUsuario('Elija un sector de la lista.');
  await db.query('UPDATE empresas SET nombre = $1, nit = $2, vacia = false, sector = CASE WHEN $4::boolean THEN $5 ELSE sector END WHERE id = $3', [nombre, nit, req.usuario.empresa_id, sector !== undefined, sector ?? null]);
  await registrarEvento(req.usuario.id, 'empresa_actualizada');
  res.json({ empresa: await vistaEmpresa(req.usuario.empresa_id) });
});

rutas.post('/invitaciones', requiereAdminEmpresa, async (req, res) => {
  if (req.usuario.empresa_vacia) throw new ErrorUsuario('Póngale nombre a su empresa antes de invitar a alguien: así sabrá a qué se une.');
  const email = String(req.body?.email || '').trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorUsuario('Escriba un correo válido, o déjelo vacío para un enlace que sirva a cualquiera.');
  if (email && (await db.uno('SELECT id FROM usuarios WHERE email = $1', [email]))) {
    throw new ErrorUsuario('Ya hay una cuenta con ese correo. Por ahora una cuenta no se puede pasar de una empresa a otra.');
  }
  const rol = leerRol(req, req.body?.rol ?? 'operador');
  const token = crypto.randomBytes(24).toString('base64url');
  await db.query(
    `INSERT INTO invitaciones (token_hash, empresa_id, creada_por, email, rol, expira_en)
     VALUES ($1, $2, $3, $4, $5, now() + interval '${DIAS_INVITACION} days')`,
    [hashToken(token), req.usuario.empresa_id, req.usuario.id, email, rol],
  );
  const enlace = `${baseDe(req).replace(/\/+$/, '')}/crear-cuenta?invitacion=${token}`;
  let enviado = false;
  if (email && correoConfigurado()) {
    await enviarCorreo({
      para: email,
      nombre: email,
      asunto: `${req.usuario.nombre} lo invitó a ${req.usuario.empresa_nombre} en SINESC`,
      texto: `Hola:\n\n${req.usuario.nombre} lo invitó a llevar el inventario de ${req.usuario.empresa_nombre} en SINESC.\n\nPara crear su cuenta, abra este enlace. Sirve una sola vez y durante ${DIAS_INVITACION} días:\n${enlace}\n\nSi no esperaba este correo, ignórelo.`,
    })
      .then(() => { enviado = true; })
      .catch((e) => console.error('No se pudo enviar la invitación:', e.message));
  }
  await registrarEvento(req.usuario.id, 'invitacion_creada', { detalle: { conCorreo: Boolean(email), enviado, rol } });
  res.status(201).json({ enlace, dias: DIAS_INVITACION, enviado, empresa: await vistaEmpresa(req.usuario.empresa_id) });
});

// El rol de cada persona (T1), quién aprueba pedidos (D11) y su cargo. Solo cambia lo que viene.
rutas.put('/miembros/:id', requiereAdminEmpresa, async (req, res) => {
  const m = await db.uno('SELECT aprueba, sube_datos, registra_movimientos, hace_conteos, id, nombre, cargo, perfil, admin_empresa FROM usuarios WHERE id = $1 AND empresa_id = $2', [Number(req.params.id), req.usuario.empresa_id]);
  if (!m) throw new ErrorUsuario('Esa persona no está en su empresa.', 404);
  exigirRangoSobre(req, m);
  const rol = req.body?.rol === undefined ? rolEmpresa(m) : leerRol(req, req.body.rol);
  // Un operador no abre los pedidos, así que no aprueba; y solo sube el archivo de inventario si se le marca.
  const aprueba = rol === 'operador' ? false : typeof req.body?.aprueba === 'boolean' ? req.body.aprueba : m.aprueba;
  const subeDatos = typeof req.body?.subeDatos === 'boolean' ? req.body.subeDatos : m.sube_datos;
  const registraMovimientos = typeof req.body?.registraMovimientos === 'boolean' ? req.body.registraMovimientos : m.registra_movimientos;
  const haceConteos = typeof req.body?.haceConteos === 'boolean' ? req.body.haceConteos : m.hace_conteos;
  const cargo = req.body?.cargo === undefined ? m.cargo : leerCargo(req.body.cargo);
  await db.query('UPDATE usuarios SET aprueba = $1, cargo = $2, perfil = $3, sube_datos = $4, registra_movimientos = $5, hace_conteos = $6 WHERE id = $7', [aprueba, cargo, rol === 'administrador' ? 'analista' : 'operador', subeDatos, registraMovimientos, haceConteos, m.id]);
  await registrarEvento(req.usuario.id, 'miembro_editado', { detalle: { usuario: m.id, antes: { aprueba: m.aprueba, subeDatos: m.sube_datos, registraMovimientos: m.registra_movimientos, haceConteos: m.hace_conteos, cargo: m.cargo, rol: rolEmpresa(m) }, despues: { aprueba, subeDatos, registraMovimientos, haceConteos, cargo, rol } } });
  res.json({ empresa: await vistaEmpresa(req.usuario.empresa_id) });
});

rutas.get('/logo', async (req, res) => {
  const e = await db.uno('SELECT logo, logo_tipo FROM empresas WHERE id = $1', [req.usuario.empresa_id]);
  if (!e || !e.logo) throw new ErrorUsuario('Su empresa no tiene logo.', 404);
  res.setHeader('Content-Type', e.logo_tipo || 'image/png');
  res.setHeader('Cache-Control', 'private, no-cache');
  res.send(Buffer.from(e.logo));
});

rutas.put('/logo', requiereAdminEmpresa, async (req, res) => {
  const datos = String(req.body?.datos || '').replace(/^data:[^,]*,/, '');
  if (!datos) throw new ErrorUsuario('Elija la imagen del logo.');
  const buffer = Buffer.from(datos, 'base64');
  const kb = Math.ceil(buffer.length / 1024);
  if (kb > MAX_LOGO_KB) throw new ErrorUsuario(`El logo pesa ${kb} KB y el máximo es ${MAX_LOGO_KB} KB. Guárdelo más pequeño (por ejemplo, de 600 píxeles de ancho) y vuelva a subirlo.`, 413);
  const png = buffer[0] === 0x89 && buffer.slice(1, 4).toString('latin1') === 'PNG';
  const jpg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (!png && !jpg) throw new ErrorUsuario('El logo tiene que ser una imagen PNG o JPG.');
  if (!abrirImagen(buffer)) throw new ErrorUsuario('No pudimos leer esa imagen. Ábrala y guárdela otra vez como PNG o JPG.');
  await db.query('UPDATE empresas SET logo = $1, logo_tipo = $2 WHERE id = $3', [buffer, png ? 'image/png' : 'image/jpeg', req.usuario.empresa_id]);
  await registrarEvento(req.usuario.id, 'logo_subido', { detalle: { kb } });
  res.json({ empresa: await vistaEmpresa(req.usuario.empresa_id) });
});

rutas.delete('/logo', requiereAdminEmpresa, async (req, res) => {
  await db.query('UPDATE empresas SET logo = NULL, logo_tipo = NULL WHERE id = $1', [req.usuario.empresa_id]);
  await registrarEvento(req.usuario.id, 'logo_quitado');
  res.json({ empresa: await vistaEmpresa(req.usuario.empresa_id) });
});

// Quien sale de la empresa conserva su cuenta y sus pedidos, pero ya no ve el inventario de esta:
// queda con una empresa vacía nueva.
rutas.delete('/miembros/:id', requiereAdminEmpresa, async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.usuario.id) throw new ErrorUsuario('Usted no puede sacarse de la empresa.');
  const m = await db.uno('SELECT id, perfil, admin_empresa FROM usuarios WHERE id = $1 AND empresa_id = $2', [id, req.usuario.empresa_id]);
  if (!m) throw new ErrorUsuario('Esa persona no está en su empresa.', 404);
  exigirRangoSobre(req, m);
  await db.tx(async (t) => {
    const { rows } = await t.query('INSERT INTO empresas (vacia) VALUES (true) RETURNING id');
    await t.query("UPDATE usuarios SET aprueba = true, perfil = 'analista', empresa_id = $1, admin_empresa = true WHERE id = $2", [rows[0].id, id]);
  });
  await registrarEvento(req.usuario.id, 'miembro_retirado', { detalle: { usuario: id } });
  res.json({ empresa: await vistaEmpresa(req.usuario.empresa_id) });
});

// Qué hizo cada persona de la empresa (T20): archivos que subió, movimientos y pedidos, con el nombre del
// archivo (son de la propia empresa del gerente; el equipo de SINESC no los ve, cuentas-equipo.js).
const TIPOS_ACTIVIDAD = ['archivo_subido', 'export_reusado', 'movimientos_registrados', 'pedido_enviado', 'pedido_aprobado', 'pedido_devuelto', 'pedido_terminado'];

rutas.get('/actividad', requiereRol('gerente'), async (req, res) => {
  const pedido = Number(req.query.dias);
  const dias = Number.isInteger(pedido) && pedido >= 1 && pedido <= 90 ? pedido : 30;
  const filas = await db.query(
    `SELECT e.tipo, e.detalle, e.creado_en, u.nombre, u.cargo,
            CASE WHEN p.id IS NULL THEN NULL
                 ELSE (SELECT count(*)::int FROM pedidos x WHERE x.usuario_id = p.usuario_id AND x.id <= p.id AND x.borrado_en IS NULL) END AS numero
       FROM eventos e JOIN usuarios u ON u.id = e.usuario_id LEFT JOIN pedidos p ON p.id = e.pedido_id
      WHERE u.empresa_id = $1 AND e.tipo = ANY($2::text[]) AND e.creado_en > now() - ($3 * interval '1 day')
      ORDER BY e.creado_en DESC LIMIT 300`,
    [req.usuario.empresa_id, TIPOS_ACTIVIDAD, dias],
  );
  res.json({
    dias,
    eventos: filas.map((f) => {
      const d = f.detalle || {};
      const archivo = Array.isArray(d.archivos) ? d.archivos.join(', ') : d.nombre || null;
      return { quien: f.nombre, cargo: f.cargo || '', tipo: f.tipo, archivo, pedido: f.numero, cantidad: d.cantidad ?? d.lineas ?? null, fecha: f.creado_en };
    }),
  });
});

// Pasar la gerencia a mano (T17): quien la pasa queda como administrador. Sin ascenso automático.
rutas.put('/gerente', requiereRol('gerente'), async (req, res) => {
  const id = Number(req.body?.usuarioId);
  if (id === req.usuario.id) throw new ErrorUsuario('Usted ya es el gerente.');
  const m = await db.uno('SELECT id FROM usuarios WHERE id = $1 AND empresa_id = $2', [id, req.usuario.empresa_id]);
  if (!m) throw new ErrorUsuario('Esa persona no está en su empresa.', 404);
  await db.tx(async (t) => {
    await t.query("UPDATE usuarios SET admin_empresa = true, perfil = 'analista', aprueba = true WHERE id = $1", [id]);
    await t.query("UPDATE usuarios SET admin_empresa = false, perfil = 'analista' WHERE id = $1", [req.usuario.id]);
  });
  await registrarEvento(req.usuario.id, 'gerencia_pasada', { detalle: { usuario: id } });
  res.json({ empresa: await vistaEmpresa(req.usuario.empresa_id) });
});

module.exports = { rutas, inventarioDelUsuario, guardarInventarioDelUsuario };
