'use strict';

// Uso (con DATABASE_URL de Neon para producción; sin ella, la base local de PGlite):
//   node scripts/borrar-datos.js --email probador@empresa.co             cuenta lo que se borraría
//   node scripts/borrar-datos.js --email probador@empresa.co --confirmar borra esa cuenta y sus datos
//   node scripts/borrar-datos.js --todos --confirmar                     borra todas las cuentas que no son del equipo
// Sin --confirmar no borra nada: solo muestra qué se borraría.

const db = require('../server/db');
const { borrarDatos } = require('../server/borrar');

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--email');
  const email = i >= 0 ? args[i + 1] : null;
  const todos = args.includes('--todos');
  const confirmar = args.includes('--confirmar');
  if (!email && !todos) {
    console.log('Di qué borrar: --email correo@empresa.co o --todos. Agrega --confirmar para borrar de verdad.');
    process.exit(1);
  }
  await db.iniciar();
  console.log(`Base de datos: ${db.nombreMotor()}`);
  const r = await borrarDatos({ email, todos, confirmar });
  console.log(`${r.borrado ? 'Se borraron' : 'Se borrarían'}: ${r.usuarios.length} cuenta(s), ${r.pedidos} pedido(s), ${r.archivos} archivo(s), ${r.eventos} evento(s).`);
  if (r.archivosQuedan) console.log(`${r.archivosQuedan} archivo(s) ${r.borrado ? 'quedaron' : 'quedarían'} en su empresa, que sigue con otras personas.`);
  if (r.usuarios.length) console.log(r.usuarios.join('\n'));
  if (!confirmar) console.log('No se borró nada. Repite con --confirmar para borrar.');
  await db.cerrar();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
