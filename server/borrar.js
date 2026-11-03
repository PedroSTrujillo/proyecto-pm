'use strict';

// Borrar datos de usuarios: los de prueba antes de empezar con los 5 probadores (para que el
// resumen cuente solo a ellos) y los de cada probador al terminar (sus archivos son datos
// comerciales de su empresa). Las cuentas del equipo nunca se borran.
//
// Al borrar el usuario se borran en cascada sus sesiones, pedidos, archivos, exports, eventos y
// recordatorios (ON DELETE CASCADE en server/db.js). La empresa que queda sin nadie se borra
// también, con su catálogo y sus movimientos. Si la empresa sigue con otras personas, el inventario
// es de ella y no de quien se va: sus archivos y exports pasan a quien queda, y si nadie queda
// administrando, la persona más antigua pasa a administrarla.

const db = require('./db');

/**
 * { email } borra una cuenta; { todos: true } borra todas las cuentas que no son del equipo.
 * Con confirmar: false solo cuenta lo que se borraría.
 */
async function borrarDatos({ email = null, todos = false, confirmar = false }) {
  if (!email && !todos) throw new Error('Di qué borrar: un correo o todas las cuentas de prueba.');
  const usuarios = email
    ? await db.query("SELECT id, email, empresa_id FROM usuarios WHERE email = $1 AND rol <> 'equipo'", [String(email).trim().toLowerCase()])
    : await db.query("SELECT id, email, empresa_id FROM usuarios WHERE rol <> 'equipo'");
  const ids = usuarios.map((u) => u.id);
  const contar = async (tabla) => (ids.length ? (await db.uno(`SELECT count(*)::int AS n FROM ${tabla} WHERE usuario_id = ANY($1::int[])`, [ids])).n : 0);
  const herederos = await herederosDe(usuarios);
  const resumen = {
    usuarios: usuarios.map((u) => u.email),
    pedidos: await contar('pedidos'),
    archivos: await contar('archivos'),
    eventos: await contar('eventos'),
    // Archivos de empresas que siguen con otras personas: no se borran, cambian de dueño.
    archivosQuedan: herederos.length
      ? (await db.uno('SELECT count(*)::int AS n FROM archivos WHERE usuario_id = ANY($1::int[])', [herederos.flatMap((h) => h.salen)])).n
      : 0,
  };
  resumen.archivos -= resumen.archivosQuedan;
  if (confirmar && ids.length) {
    await db.tx(async (t) => {
      for (const h of herederos) {
        await t.query('UPDATE exports SET usuario_id = $1 WHERE usuario_id = ANY($2::int[])', [h.queda, h.salen]);
        await t.query('UPDATE archivos SET usuario_id = $1 WHERE usuario_id = ANY($2::int[])', [h.queda, h.salen]);
        if (h.nuevoAdmin) await t.query('UPDATE usuarios SET admin_empresa = true WHERE id = $1', [h.queda]);
      }
      await t.query('DELETE FROM usuarios WHERE id = ANY($1::int[])', [ids]);
      // Una empresa sin nadie se borra con su inventario (archivos, catálogo y movimientos).
      await t.query('DELETE FROM empresas e WHERE NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.empresa_id = e.id)');
    });
  }
  return { ...resumen, borrado: Boolean(confirmar && ids.length) };
}

// Por cada empresa que pierde personas pero no queda vacía: quién recibe lo que subieron las que
// salen (quien administra, o la persona más antigua) y si hay que nombrarla administradora.
async function herederosDe(usuarios) {
  const porEmpresa = new Map();
  for (const u of usuarios) if (u.empresa_id) porEmpresa.set(u.empresa_id, [...(porEmpresa.get(u.empresa_id) || []), u.id]);
  const out = [];
  for (const [empresaId, salen] of porEmpresa) {
    const queda = await db.uno(
      `SELECT id, admin_empresa FROM usuarios WHERE empresa_id = $1 AND NOT (id = ANY($2::int[]))
        ORDER BY admin_empresa DESC, creado_en, id LIMIT 1`,
      [empresaId, salen],
    );
    if (queda) out.push({ empresaId, salen, queda: queda.id, nuevoAdmin: !queda.admin_empresa });
  }
  return out;
}

module.exports = { borrarDatos, herederosDe };
