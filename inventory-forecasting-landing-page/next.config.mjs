/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Normalmente la web y la API van juntas (server/index.js). Si la web se publica sola (por
  // ejemplo, en Vercel), API_URL es la dirección de la aplicación en Render y se le pasan /api y
  // /plantillas: para el navegador todo queda en la misma dirección y la sesión funciona.
  async rewrites() {
    const api = (process.env.API_URL || '').replace(/\/+$/, '')
    if (!api) return []
    return [
      { source: '/api/:ruta*', destination: `${api}/api/:ruta*` },
      { source: '/plantillas/:ruta*', destination: `${api}/plantillas/:ruta*` },
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
