'use strict';

// Manda el boletín diario de hoy a quienes lo activaron (server/boletin.js). En Vercel lo dispara
// el Cron de inventory-forecasting-landing-page/vercel.json; en un servidor propio, programen este
// script una vez al día (por ejemplo, con cron a las 6 a. m. de Bogotá).
//
//   node scripts/enviar-boletin.js            con DATABASE_URL de Neon para producción; sin ella, PGlite
//   npm run boletin -- --email tu@correo.co   solo a esa cuenta, aunque hoy ya le haya llegado (para revisarlo)
//
// Necesita BREVO_API_KEY y CORREO_REMITENTE. Correrlo dos veces el mismo día no manda dos correos.

const db = require('../server/db');
const { enviarBoletines } = require('../server/boletin');

async function main() {
  await db.iniciar();
  console.log(`Base de datos: ${db.nombreMotor()}`);
  const i = process.argv.indexOf('--email');
  let solo = null;
  if (i !== -1) {
    solo = await db.uno('SELECT id FROM usuarios WHERE lower(email) = lower($1)', [String(process.argv[i + 1] || '').trim()]);
    if (!solo) throw new Error(`No hay ninguna cuenta con el correo ${process.argv[i + 1]}.`);
  }
  const r = await enviarBoletines(solo ? { soloUsuario: solo.id, forzar: true, limiteMs: Infinity } : { limiteMs: Infinity });
  if (r.motivo === 'sin correo') console.log('No se mandó nada: faltan BREVO_API_KEY y CORREO_REMITENTE.');
  else console.log(`Enviados: ${r.enviados} · sin inventario: ${r.sinDatos} · con error: ${r.errores}`);
  await db.cerrar();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
