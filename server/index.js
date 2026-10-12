'use strict';

// Un solo servidor: la API de Express y, para todo lo demás, la página y la aplicación en
// Next.js (inventory-forecasting-landing-page). Así la sesión, la base de datos y el sitio
// comparten dirección y no hace falta configurar dominios ni cookies entre dos servicios.

const http = require('http');
const path = require('path');
const db = require('./db');
const { crearApp } = require('./app');

const PUERTO = Number(process.env.PORT) || 3000;
const WEB = path.join(__dirname, '..', 'inventory-forecasting-landing-page');
const DEV = process.env.NODE_ENV !== 'production';

// Next.js está instalado en la carpeta de la web, no en la raíz.
async function prepararWeb(servidor) {
  if (process.env.SIN_WEB) return null;
  let mod;
  try {
    mod = require(require.resolve('next', { paths: [WEB] }));
  } catch {
    console.log(`Aviso: no encontré Next.js en ${WEB}. Corre "npm install" en esa carpeta; mientras tanto se sirve la versión anterior (public/).`);
    return null;
  }
  if (!DEV && !require('fs').existsSync(path.join(WEB, '.next', 'BUILD_ID'))) {
    console.log('Aviso: falta compilar la web ("npm run build"); mientras tanto se sirve la versión anterior (public/).');
    return null;
  }
  const next = mod.default || mod;
  const web = next({ dev: DEV, dir: WEB, httpServer: servidor, port: PUERTO, hostname: 'localhost' });
  await web.prepare();
  if (DEV && typeof web.getUpgradeHandler === 'function') {
    const upgrade = web.getUpgradeHandler();
    servidor.on('upgrade', (req, socket, head) => upgrade(req, socket, head));
  }
  return web.getRequestHandler();
}

async function main() {
  await db.iniciar();
  const servidor = http.createServer();
  const web = await prepararWeb(servidor);
  const app = crearApp({ web, dev: DEV });
  servidor.on('request', app);
  servidor.listen(PUERTO, () => {
    console.log(`SINESC listo en http://localhost:${PUERTO}${web ? '' : ' (sin Next.js)'}`);
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
