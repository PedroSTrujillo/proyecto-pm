// PostHog: embudo y grabación de sesiones, para ver en qué paso se traba un probador. Solo se
// carga si en Vercel está NEXT_PUBLIC_POSTHOG_KEY; sin ella no se manda nada.
// Es el cargador oficial de PostHog (sin el paquete de npm, que hacía fallar la instalación en
// Vercel): deja en window.posthog una cola que guarda las llamadas hasta que llega su script.
// Todo va por /ingest (reescrito en next.config.mjs) para que no lo bloqueen los bloqueadores.
// Las grabaciones tapan las tablas y lo que se escribe: los productos y cantidades de un
// probador son datos de su empresa y no salen del servidor de SINESC.

type Cola = unknown[] & { _i?: unknown[]; __SV?: number; [metodo: string]: unknown }

const clave = process.env.NEXT_PUBLIC_POSTHOG_KEY
const w = window as unknown as { posthog?: Cola }

if (clave && !w.posthog) {
  try {
    const cola = [] as unknown as Cola
    cola._i = []
    cola.__SV = 1
    for (const metodo of ['capture', 'identify', 'reset', 'register', 'opt_out_capturing', 'opt_in_capturing']) {
      cola[metodo] = (...args: unknown[]) => cola.push([metodo, ...args])
    }
    cola._i.push([
      clave,
      {
        api_host: '/ingest',
        ui_host: process.env.NEXT_PUBLIC_POSTHOG_REGION === 'eu' ? 'https://eu.posthog.com' : 'https://us.posthog.com',
        capture_pageview: 'history_change',
        person_profiles: 'identified_only',
        session_recording: { maskAllInputs: true, maskTextSelector: 'table, [data-privado]' },
        // Core Web Vitals de los usuarios reales (LCP, CLS, INP y FCP), en vez de Vercel Speed
        // Insights: entran en el plan gratis de PostHog y se ven en Web analytics → Web vitals.
        capture_performance: { web_vitals: true },
      },
      'posthog',
    ])
    w.posthog = cola
    const script = document.createElement('script')
    script.async = true
    script.crossOrigin = 'anonymous'
    script.src = '/ingest/static/array.js'
    document.head.appendChild(script)
  } catch {
    // Si PostHog falla, la app sigue igual.
  }
}
