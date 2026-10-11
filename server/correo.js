'use strict';

// Envío de correos con la API de Brevo (plan gratis: 300 correos al día). Brevo deja
// verificar un solo remitente con un clic, sin tener dominio propio. Es opcional: sin
// BREVO_API_KEY la app no manda correos y el recordatorio se descarga desde la pantalla.

function correoConfigurado() {
  return Boolean(process.env.BREVO_API_KEY && process.env.CORREO_REMITENTE);
}

// adjuntos: [{ nombre, contenido (texto) }]
async function enviarCorreo({ para, nombre, asunto, texto, adjuntos = [] }) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Rotación de inventario', email: process.env.CORREO_REMITENTE },
      to: [{ email: para, name: nombre }],
      subject: asunto,
      textContent: texto,
      ...(adjuntos.length ? { attachment: adjuntos.map((a) => ({ name: a.nombre, content: Buffer.from(a.contenido).toString('base64') })) } : {}),
    }),
  });
  if (!r.ok) throw new Error(`Brevo respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

module.exports = { enviarCorreo, correoConfigurado };
