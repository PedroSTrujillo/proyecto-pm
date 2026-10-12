'use strict';

// Instala y compila la web (Next.js). Es lo que corre `npm run build` en Render.
// En Render (variable RENDER, la pone Render) o con POCA_MEMORIA=1 compila con poca memoria:
// webpack en un solo proceso y sin source maps. El build normal (Turbopack) llega a ~2 GB y el
// plan gratis de Render tiene 512 MB; así baja a ~600 MB. Ver next.config.mjs.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '..', 'inventory-forecasting-landing-page');
const pocaMemoria = Boolean(process.env.RENDER || process.env.POCA_MEMORIA);

function correr(comando, args, env = process.env) {
  console.log(`> ${comando} ${args.join(' ')}`);
  return spawnSync(comando, args, { cwd: WEB, stdio: 'inherit', shell: process.platform === 'win32', env }).status;
}

if (correr('npm', ['install', '--no-package-lock']) !== 0) {
  // En una copia limpia (como en Render) no falla. En Windows, con node_modules de una instalación
  // vieja con pnpm, npm puede fallar con "Cannot read properties of null": si Next ya está, se sigue.
  if (!fs.existsSync(path.join(WEB, 'node_modules', 'next', 'package.json'))) process.exit(1);
  console.log('Aviso: npm install falló, pero Next.js ya está instalado; se compila con lo que hay.');
}
const env = pocaMemoria ? { ...process.env, POCA_MEMORIA: '1', NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=320`.trim() } : process.env;
process.exit(correr('node', [path.join('node_modules', 'next', 'dist', 'bin', 'next'), 'build', ...(pocaMemoria ? ['--webpack'] : [])], env));
