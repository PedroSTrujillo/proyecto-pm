'use strict';

// Envío de correos con la API de Brevo (plan gratis: 300 correos al día). Brevo deja
// verificar un solo remitente con un clic, sin tener dominio propio.
// Sin BREVO_API_KEY, el correo no sale: se imprime en la consola del servidor (modo prueba).

async function enviarCorreo({ para, nombre, asunto, texto }) {
  const clave = process.env.BREVO_API_KEY;
  if (!clave) {
    console.log(`[correo de prueba] Para: ${para}\nAsunto: ${asunto}\n\n${texto}\n`);
    return { via: 'prueba' };
  }
  const remitente = process.env.CORREO_REMITENTE;
  if (!remitente) throw new Error('Falta CORREO_REMITENTE (el correo verificado en Brevo).');
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': clave, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Rotación de inventario', email: remitente },
      to: [{ email: para, name: nombre }],
      subject: asunto,
      textContent: texto,
    }),
  });
  if (!r.ok) throw new Error(`Brevo respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return { via: 'brevo' };
}

module.exports = { enviarCorreo };
