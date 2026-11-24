'use strict';

// Cuentas, para el equipo (rol equipo): quién usa la app y cómo va cada cuenta, y borrar una cuenta
// con sus datos cuando la persona lo pide. Es la única pantalla que ve datos de otras cuentas, y
// por eso muestra lo mínimo: actividad y conteos, nunca el inventario ni los productos de nadie, ni
// la aceptación del pedido sugerido (D16 de docs/PLAN_ALPHA_02.md).
//
// Borrar pide tres cosas: escribir el correo de la cuenta, la contraseña de quien borra y que la
// cuenta no sea del equipo ni la propia. Lo que se borró queda en la actividad de quien borró, con
// el correo enmascarado.

const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const { requiereEquipo, ErrorUsuario, registrarEvento, verificarClave } = require('./cuentas');
const { borrarDatos, herederosDe } = require('./borrar');
const { limitar } = require('./limites');

const MS_DIA = 86400000;
const DIAS_ACTIVA = 7;
const DIAS_INACTIVA = 30;
const EVENTOS_DETALLE = 30;

// "cmueces81@gmail.com" → "cmu•••@gmail.com": para el registro de quién borró qué.
function enmascarar(email) {
  const [local, dominio] = String(email || '').split('@');
  return `${local.slice(0, 3)}•••${dominio ? `@${dominio}` : ''}`;
}

/**
 * Cómo va una cuenta, de lo que hizo: 'equipo', 'sin_datos' (no ha subido nada ni pedido),
 * 'activa' (algo en los últimos 7 días), 'en_riesgo' (8 a 30 días) o 'inactiva' (más de 30).
 */
function estadoCuenta({ rol, pendienteCodigo, ultimaActividad, archivos, pedidos, movimientos }, ahora = Date.now()) {
  if (rol === 'equipo') return 'equipo';
  if (pendienteCodigo) return 'esperando_codigo';
  if (!archivos && !pedidos && !movimientos) return 'sin_datos';
  const dias = ultimaActividad ? (ahora - new Date(ultimaActividad).getTime()) / MS_DIA : Infinity;
  if (dias <= DIAS_ACTIVA) return 'activa';
  if (dias <= DIAS_INACTIVA) return 'en_riesgo';
  return 'inactiva';
}

// Una sola pasada por tabla (Neon cobra por lo que sale): conteos agrupados, sin traer filas.
async function listarCuentas() {
  const [usuarios, eventos, pedidos, archivos, movimientos, sesiones, exportes, invitaciones] = await Promise.all([
    db.query(
      `SELECT u.id, u.nombre, u.email, u.rol, u.perfil, u.cargo, u.sistema, u.creado_en, u.suspendida_en, u.pendiente_codigo, u.admin_empresa, u.aprueba, u.boletin,
              e.id AS empresa_id, e.nombre AS empresa, e.vacia,
              (SELECT count(*)::int FROM usuarios m WHERE m.empresa_id = u.empresa_id) AS miembros
         FROM usuarios u LEFT JOIN empresas e ON e.id = u.empresa_id ORDER BY u.creado_en DESC, u.id DESC`,
    ),
    db.query(
      `SELECT usuario_id, max(creado_en) AS ultima,
              max(creado_en) FILTER (WHERE tipo = 'ingreso') AS ultimo_ingreso,
              count(*) FILTER (WHERE tipo = 'ingreso')::int AS ingresos,
              count(DISTINCT to_char(creado_en AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD'))::int AS dias
         FROM eventos GROUP BY usuario_id`,
    ),
    db.query(
      `SELECT usuario_id,
              count(*) FILTER (WHERE borrado_en IS NULL)::int AS total,
              count(*) FILTER (WHERE borrado_en IS NULL AND anulado_en IS NULL AND terminado_en IS NOT NULL)::int AS cerrados
         FROM pedidos GROUP BY usuario_id`,
    ),
    db.query('SELECT usuario_id, count(*)::int AS n FROM archivos GROUP BY usuario_id'),
    db.query('SELECT empresa_id, count(*)::int AS n, max(creado_en) AS ultimo FROM movimientos WHERE anulado_en IS NULL GROUP BY empresa_id'),
    db.query('SELECT usuario_id, count(*)::int AS n FROM sesiones WHERE expira_en > now() GROUP BY usuario_id'),
    db.query(`SELECT empresa_id, max(subido_en) AS ultimo FROM exports WHERE estado = 'ok' AND origen = 'archivo' GROUP BY empresa_id`),
    // El growth loop de la Entrega 4: una persona invita a otra de su empresa.
    db.query('SELECT empresa_id, count(*)::int AS creadas, count(usada_en)::int AS aceptadas FROM invitaciones GROUP BY empresa_id'),
  ]);
  const de = (filas, clave, id) => filas.find((f) => f[clave] === id) || {};
  const cuentas = usuarios.map((u) => {
    const ev = de(eventos, 'usuario_id', u.id);
    const pe = de(pedidos, 'usuario_id', u.id);
    const mo = u.empresa_id ? de(movimientos, 'empresa_id', u.empresa_id) : {};
    const inv = u.empresa_id ? de(invitaciones, 'empresa_id', u.empresa_id) : {};
    const c = {
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      rol: u.rol,
      perfil: u.perfil,
      cargo: u.cargo || '',
      sistema: u.sistema || null,
      creadoEn: u.creado_en,
      suspendidaEn: u.suspendida_en || null,
      pendienteCodigo: Boolean(u.pendiente_codigo),
      boletin: Boolean(u.boletin),
      empresa: u.empresa_id
        ? {
          id: u.empresa_id, nombre: u.empresa || '', vacia: Boolean(u.vacia), miembros: u.miembros, admin: Boolean(u.admin_empresa), aprueba: Boolean(u.aprueba),
          invitaciones: { creadas: inv.creadas || 0, aceptadas: inv.aceptadas || 0 },
        }
        : null,
      ultimoIngreso: ev.ultimo_ingreso || null,
      ultimaActividad: ev.ultima || null,
      ingresos: ev.ingresos || 0,
      diasActivos: ev.dias || 0,
      pedidos: pe.total || 0,
      pedidosCerrados: pe.cerrados || 0,
      archivos: de(archivos, 'usuario_id', u.id).n || 0,
      movimientos: mo.n || 0,
      ultimoArchivo: u.empresa_id ? de(exportes, 'empresa_id', u.empresa_id).ultimo || null : null,
      sesionesAbiertas: de(sesiones, 'usuario_id', u.id).n || 0,
    };
    return { ...c, estado: estadoCuenta(c) };
  });
  const resumen = { total: 0, activa: 0, en_riesgo: 0, inactiva: 0, sin_datos: 0, esperando_codigo: 0, equipo: 0 };
  for (const c of cuentas) {
    resumen[c.estado]++;
    if (c.estado !== 'equipo') resumen.total++;
  }
  // Invitaciones de las empresas de clientes (cada empresa una vez, aunque tenga varias personas),
  // y las aceptadas por cada cuenta activa: la métrica del loop.
  const empresasClientes = new Set(cuentas.filter((c) => c.rol !== 'equipo' && c.empresa).map((c) => c.empresa.id));
  const delLoop = invitaciones.filter((i) => empresasClientes.has(i.empresa_id));
  const creadas = delLoop.reduce((n, i) => n + i.creadas, 0);
  const aceptadas = delLoop.reduce((n, i) => n + i.aceptadas, 0);
  resumen.loop = {
    creadas,
    aceptadas,
    empresasQueInvitaron: delLoop.filter((i) => i.creadas > 0).length,
    porCuentaActiva: resumen.activa ? Math.round((aceptadas / resumen.activa) * 100) / 100 : null,
  };
  return { cuentas, resumen, generadoEn: new Date() };
}

async function cuentaPorId(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorUsuario('No encontramos esa cuenta.', 404);
  const u = await db.uno(
    `SELECT u.id, u.nombre, u.email, u.rol, u.empresa_id, u.admin_empresa, u.clave_hash, e.nombre AS empresa
       FROM usuarios u LEFT JOIN empresas e ON e.id = u.empresa_id WHERE u.id = $1`,
    [n],
  );
  if (!u) throw new ErrorUsuario('No encontramos esa cuenta. Puede que alguien ya la haya borrado.', 404);
  return u;
}

// Lo que se ve al abrir una cuenta: quién más está en su empresa, sus pedidos (sin las líneas) y
// lo último que hizo.
async function detalleCuenta(id) {
  const u = await cuentaPorId(id);
  const [miembros, pedidos, eventos] = await Promise.all([
    u.empresa_id
      ? db.query(
        `SELECT id, nombre, email, perfil, admin_empresa, aprueba
           FROM usuarios WHERE empresa_id = $1 ORDER BY creado_en, id`,
        [u.empresa_id],
      )
      : [],
    // El número es el mismo que ve la persona (numeroDe en pedidos.js): sin contar los borrados.
    db.query(
      `SELECT * FROM (
         SELECT id, modo, creado_en, terminado_en, anulado_en, borrado_en, enviado_en, aprobado_en,
                CASE WHEN borrado_en IS NULL THEN count(*) FILTER (WHERE borrado_en IS NULL) OVER (ORDER BY id) END AS numero,
                jsonb_array_length(COALESCE(lista_final, lista_inicial)) AS lineas
           FROM pedidos WHERE usuario_id = $1) p
        ORDER BY creado_en DESC, id DESC LIMIT 20`,
      [u.id],
    ),
    db.query('SELECT tipo, detalle, creado_en FROM eventos WHERE usuario_id = $1 ORDER BY creado_en DESC, id DESC LIMIT $2', [u.id, EVENTOS_DETALLE]),
  ]);
  const estadoPedido = (p) => (p.borrado_en ? 'borrado' : p.anulado_en ? 'anulado' : p.terminado_en || p.aprobado_en ? 'cerrado' : p.enviado_en ? 'por_aprobar' : 'abierto');
  return {
    id: u.id,
    miembros: miembros.map((m) => ({ id: m.id, nombre: m.nombre, email: m.email, perfil: m.perfil, admin: Boolean(m.admin_empresa), aprueba: Boolean(m.aprueba), esEsta: m.id === u.id })),
    pedidos: pedidos.map((p) => ({ id: p.id, numero: p.numero, modo: p.modo, creadoEn: p.creado_en, terminadoEn: p.terminado_en, lineas: p.lineas, estado: estadoPedido(p) })),
    // Solo cómo entró ("como"), no el resto del detalle: puede traer nombres de archivos.
    actividad: eventos.map((e) => ({ tipo: e.tipo, en: e.creado_en, como: e.detalle && typeof e.detalle.como === 'string' ? e.detalle.como : null })),
  };
}

// Por qué no se puede borrar una cuenta, o null si se puede.
function impedimento(u, quien) {
  if (u.id === quien.id) return 'No puede borrar su propia cuenta desde aquí.';
  if (u.rol === 'equipo') return 'Las cuentas del equipo no se borran desde la aplicación.';
  return null;
}

// Lo que pasaría al borrar, para la ventana de confirmación. No borra nada.
async function previaBorrado(id, quien) {
  const u = await cuentaPorId(id);
  const r = await borrarDatos({ email: u.email });
  const [heredero] = await herederosDe([u]);
  let empresa = null;
  if (u.empresa_id) {
    const otros = (await db.uno('SELECT count(*)::int AS n FROM usuarios WHERE empresa_id = $1 AND id <> $2', [u.empresa_id, u.id])).n;
    const sigue = otros > 0;
    const conteo = sigue
      ? { productos: 0, movimientos: 0 }
      : await db.uno(
        `SELECT (SELECT count(*)::int FROM productos WHERE empresa_id = $1) AS productos,
                (SELECT count(*)::int FROM movimientos WHERE empresa_id = $1) AS movimientos`,
        [u.empresa_id],
      );
    const queda = heredero ? await db.uno('SELECT nombre FROM usuarios WHERE id = $1', [heredero.queda]) : null;
    empresa = {
      nombre: u.empresa || '',
      sigue,
      otros,
      productos: conteo.productos,
      movimientos: conteo.movimientos,
      recibe: queda ? queda.nombre : null,
      nuevoAdmin: Boolean(heredero && heredero.nuevoAdmin),
    };
  }
  return {
    cuenta: { id: u.id, nombre: u.nombre, email: u.email },
    pedidos: r.pedidos,
    archivos: r.archivos,
    archivosQuedan: r.archivosQuedan,
    eventos: r.eventos,
    empresa,
    impedimento: impedimento(u, quien),
  };
}

async function borrarCuenta(id, quien, { confirmacion, clave }) {
  const u = await cuentaPorId(id);
  const no = impedimento(u, quien);
  if (no) throw new ErrorUsuario(no, 403);
  if (String(confirmacion || '').trim().toLowerCase() !== u.email.toLowerCase()) {
    throw new ErrorUsuario('El correo que escribió no es el de esta cuenta. Escríbalo completo para confirmar.');
  }
  // La contraseña de quien borra, no la de la cuenta: confirma que sigue siendo esa persona.
  const yo = await db.uno('SELECT clave_hash FROM usuarios WHERE id = $1', [quien.id]);
  if (!yo || !verificarClave(String(clave || ''), yo.clave_hash)) throw new ErrorUsuario('Su contraseña no es correcta.');
  const r = await borrarDatos({ email: u.email, confirmar: true });
  if (!r.borrado) throw new ErrorUsuario('No encontramos esa cuenta. Puede que alguien ya la haya borrado.', 404);
  await registrarEvento(quien.id, 'cuenta_borrada', {
    detalle: { cuenta: enmascarar(u.email), pedidos: r.pedidos, archivos: r.archivos, archivosQuedan: r.archivosQuedan, eventos: r.eventos },
  });
  return { borrada: enmascarar(u.email), pedidos: r.pedidos, archivos: r.archivos, archivosQuedan: r.archivosQuedan };
}

// Cierra todas las sesiones de una cuenta (por ejemplo, si entró desde un computador ajeno).
async function cerrarSesiones(id, quien) {
  const u = await cuentaPorId(id);
  if (u.rol === 'equipo' && u.id !== quien.id) throw new ErrorUsuario('Las sesiones de otra persona del equipo no se cierran desde aquí.', 403);
  const filas = await db.query('DELETE FROM sesiones WHERE usuario_id = $1 RETURNING usuario_id', [u.id]);
  await registrarEvento(quien.id, 'sesiones_cerradas', { detalle: { cuenta: enmascarar(u.email), sesiones: filas.length } });
  return { cerradas: filas.length };
}

// Sin 0, O, 1 ni I: el código se dicta por teléfono o por chat.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function nuevoCodigo() {
  const b = crypto.randomBytes(8);
  const c = Array.from(b, (x) => ALFABETO[x % ALFABETO.length]).join('');
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

/** Crea `cantidad` códigos de acceso de un solo uso y devuelve el texto de cada uno. */
async function crearCodigos(cantidad, nota, creadoPor) {
  const out = [];
  for (let i = 0; i < cantidad; i++) {
    const codigo = nuevoCodigo();
    await db.query('INSERT INTO codigos_acceso (codigo, nota, creado_por) VALUES ($1, $2, $3)', [codigo, nota || null, creadoPor]);
    out.push(codigo);
  }
  return out;
}

async function listarCodigos() {
  const filas = await db.query(
    `SELECT c.codigo, c.nota, c.creado_en, c.usado_en, u.nombre AS usado_por_nombre, u.email AS usado_por_email
       FROM codigos_acceso c LEFT JOIN usuarios u ON u.id = c.usado_por
      ORDER BY c.creado_en DESC, c.codigo LIMIT 100`,
  );
  return filas.map((f) => ({
    codigo: f.codigo,
    nota: f.nota,
    creadoEn: f.creado_en,
    usadoEn: f.usado_en,
    usadoPor: f.usado_en ? { nombre: f.usado_por_nombre, email: f.usado_por_email ? enmascarar(f.usado_por_email) : null } : null,
  }));
}

// Suspender no borra nada: la cuenta no entra (cargarUsuario y /entrar) hasta que se reactive.
async function suspender(id, quien, suspender) {
  const u = await cuentaPorId(id);
  if (suspender && (u.rol === 'equipo' || u.id === quien.id)) throw new ErrorUsuario('Una cuenta del equipo no se suspende desde aquí.', 403);
  await db.query('UPDATE usuarios SET suspendida_en = CASE WHEN $2 THEN now() END WHERE id = $1', [u.id, suspender]);
  if (suspender) await db.query('DELETE FROM sesiones WHERE usuario_id = $1', [u.id]);
  await registrarEvento(quien.id, suspender ? 'cuenta_suspendida' : 'cuenta_reactivada', { detalle: { cuenta: enmascarar(u.email) } });
  return { suspendida: suspender };
}

const rutas = express.Router();
rutas.use(requiereEquipo);
// Nadie del equipo necesita borrar más de unas pocas cuentas por hora; si pasa, algo anda mal.
const limiteBorrar = limitar({ max: 10, minutos: 60, mensaje: 'Demasiados intentos de borrar cuentas. Espere una hora.' });

rutas.get('/codigos', async (_req, res) => res.json({ codigos: await listarCodigos() }));
rutas.post('/codigos', async (req, res) => {
  const cantidad = Math.floor(Number(req.body?.cantidad ?? 1));
  if (!(cantidad >= 1 && cantidad <= 20)) throw new ErrorUsuario('Pida entre 1 y 20 códigos.');
  const nota = String(req.body?.nota || '').trim().slice(0, 100);
  res.status(201).json({ nuevos: await crearCodigos(cantidad, nota, req.usuario.id), codigos: await listarCodigos() });
});
rutas.get('/', async (_req, res) => res.json(await listarCuentas()));
rutas.get('/:id', async (req, res) => res.json(await detalleCuenta(req.params.id)));
rutas.get('/:id/borrar', async (req, res) => res.json(await previaBorrado(req.params.id, req.usuario)));
rutas.post('/:id/borrar', limiteBorrar, async (req, res) => res.json(await borrarCuenta(req.params.id, req.usuario, req.body || {})));
rutas.post('/:id/suspender', async (req, res) => res.json(await suspender(req.params.id, req.usuario, true)));
rutas.post('/:id/reactivar', async (req, res) => res.json(await suspender(req.params.id, req.usuario, false)));
rutas.post('/:id/cerrar-sesiones', async (req, res) => res.json(await cerrarSesiones(req.params.id, req.usuario)));

module.exports = { rutas, estadoCuenta, enmascarar, listarCuentas, crearCodigos };
