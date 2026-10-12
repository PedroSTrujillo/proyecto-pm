'use strict';

// Instala y compila la web (Next.js): `npm run build`. En Vercel no se usa (Vercel instala y
// compila solo, ver inventory-forecasting-landing-page/vercel.json); sirve para probar en local
// como en producción: `npm run build && NODE_ENV=production npm start`.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '..', 'inventory-forecasting-landing-page');

function correr(comando, args) {
  console.log(`> ${comando} ${args.join(' ')}`);
  return spawnSync(comando, args, { cwd: WEB, stdio: 'inherit', shell: process.platform === 'win32' }).status;
}

if (correr('npm', ['install', '--no-package-lock']) !== 0) {
  // En una copia limpia no falla. En Windows, con node_modules de una instalación vieja con pnpm,
  // npm puede fallar con "Cannot read properties of null": si Next ya está, se sigue.
  if (!fs.existsSync(path.join(WEB, 'node_modules', 'next', 'package.json'))) process.exit(1);
  console.log('Aviso: npm install falló, pero Next.js ya está instalado; se compila con lo que hay.');
}
process.exit(correr('node', [path.join('node_modules', 'next', 'dist', 'bin', 'next'), 'build']));
