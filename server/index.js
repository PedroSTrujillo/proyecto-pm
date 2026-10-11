'use strict';

const db = require('./db');
const { crearApp } = require('./app');

const PUERTO = Number(process.env.PORT) || 3000;

async function main() {
  await db.iniciar();
  const app = crearApp();
  app.listen(PUERTO, () => {
    console.log(`Rotación de inventario lista en http://localhost:${PUERTO}`);
    console.log(`Base de datos: ${db.nombreMotor()}`);
    if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
      console.log('Aviso: en producción configura DATABASE_URL; los datos de PGlite se pierden si el disco del servidor no es permanente.');
    }
    if (!process.env.TEAM_EMAILS) {
      console.log('Aviso: TEAM_EMAILS no está configurado; nadie tendrá acceso a la vista del equipo.');
    }
  });
}

main().catch((e) => {
  console.error('No se pudo iniciar:', e);
  process.exit(1);
});
