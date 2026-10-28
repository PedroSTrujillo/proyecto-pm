'use strict';

// Borrar datos de usuarios: los de prueba antes de empezar con los 5 probadores (para que el
// resumen cuente solo a ellos) y los de cada probador al terminar (sus archivos son datos
// comerciales de su empresa). Las cuentas del equipo nunca se borran.
//
// Al borrar el usuario se borran en cascada sus sesiones, pedidos, archivos, exports, fotos,
// eventos y recordatorios (ON DELETE CASCADE en server/db.js). La empresa que queda sin nadie se
// borra también, con su catálogo y sus movimientos.

const db = require('./db');

/**
 * { email } borra una cuenta; { todos: true } borra todas las cuentas que no son del equipo.
 * Con confirmar: false solo cuenta lo que se borraría.
 */
async function borrarDatos({ email = null, todos = false, confirmar = false }) {
  if (!email && !todos) throw new Error('Di qué borrar: un correo o todas las cuentas de prueba.');
  const usuarios = email
    ? await db.query("SELECT id, email FROM usuarios WHERE email = $1 AND rol <> 'equipo'", [String(email).trim().toLowerCase()])
    : await db.query("SELECT id, email FROM usuarios WHERE rol <> 'equipo'");
  const ids = usuarios.map((u) => u.id);
  const contar = async (tabla) => (ids.length ? (await db.uno(`SELECT count(*)::int AS n FROM ${tabla} WHERE usuario_id = ANY($1::int[])`, [ids])).n : 0);
  const resumen = {
    usuarios: usuarios.map((u) => u.email),
    pedidos: await contar('pedidos'),
    archivos: await contar('archivos'),
    eventos: await contar('eventos'),
  };
  if (confirmar && ids.length) {
    await db.query('DELETE FROM usuarios WHERE id = ANY($1::int[])', [ids]);
    // Una empresa sin nadie se borra con su inventario (archivos, catálogo y movimientos).
    await db.query('DELETE FROM empresas e WHERE NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.empresa_id = e.id)');
  }
  return { ...resumen, borrado: Boolean(confirmar && ids.length) };
}

module.exports = { borrarDatos };
