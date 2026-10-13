// PostHog: embudo y grabación de sesiones, para ver en qué paso se traba un probador. Solo se
// carga si en Vercel está NEXT_PUBLIC_POSTHOG_KEY; sin ella no se manda nada.
// Va por /ingest (reescrito en next.config.mjs) para que no lo bloqueen los bloqueadores.
// Las grabaciones tapan las tablas y lo que se escribe: los productos y cantidades de un
// probador son datos de su empresa y no salen del servidor de SINESC.
import posthog from 'posthog-js'

const clave = process.env.NEXT_PUBLIC_POSTHOG_KEY

if (clave) {
  try {
    posthog.init(clave, {
      api_host: '/ingest',
      ui_host: process.env.NEXT_PUBLIC_POSTHOG_REGION === 'eu' ? 'https://eu.posthog.com' : 'https://us.posthog.com',
      capture_pageview: 'history_change',
      person_profiles: 'identified_only',
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: 'table, [data-privado]',
      },
    })
  } catch {
    // Si PostHog falla, la app sigue igual.
  }
}
