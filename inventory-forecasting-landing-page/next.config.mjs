import path from 'node:path'
import { fileURLToPath } from 'node:url'

// La raíz del repositorio: ahí están la API (server/), los archivos de ejemplos/ y sus dependencias.
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// La API de Express corre dentro de este mismo proyecto: en Vercel, como la función
// pages/api/[[...ruta]].js; en local y en un servidor propio, con server/index.js. Next empaqueta
// el código de server/, pero no sus librerías: se cargan de node_modules de la raíz (Vercel las
// instala con vercel.json). Los archivos de ejemplos/ se leen del disco, así que se incluyen aparte.
const libreriasDeLaApi = ['express', 'multer', 'pg', 'xlsx', '@electric-sql/pglite']

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  outputFileTracingRoot: raiz,
  turbopack: { root: raiz },
  serverExternalPackages: libreriasDeLaApi,
  outputFileTracingIncludes: { '/api/*': ['../ejemplos/*'] },
  // Las plantillas y la revisión de salud también las atiende la API.
  async rewrites() {
    return [
      { source: '/plantillas/:ruta*', destination: '/api/plantillas/:ruta*' },
      { source: '/salud', destination: '/api/salud' },
    ]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default nextConfig
