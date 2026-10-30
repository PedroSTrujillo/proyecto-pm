'use strict';

// Límites de intentos y respuestas comprimidas. Sin dependencias: la app corre en un solo
// servidor, así que un contador en memoria alcanza (si se reinicia, se reinicia el conteo).

const zlib = require('zlib');
const { ErrorUsuario } = require('./cuentas');

/**
 * Máximo `max` intentos por `minutos`, contados por dirección IP y por lo que devuelva `clave`
 * (por ejemplo, el correo). Sirve para entrar, crear cuenta y pedir el enlace de contraseña.
 */
function limitar({ max, minutos, clave = () => '', mensaje }) {
  const intentos = new Map();
  const ventana = minutos * 60000;
  return (req, _res, next) => {
    if (process.env.SIN_LIMITES) return next();
    const ahora = Date.now();
    const k = `${req.ip}|${String(clave(req) || '').toLowerCase()}`;
    const lista = (intentos.get(k) || []).filter((t) => ahora - t < ventana);
    if (lista.length >= max) {
      return next(new ErrorUsuario(mensaje || `Demasiados intentos. Espere ${minutos} minutos y vuelva a intentarlo.`, 429));
    }
    lista.push(ahora);
    intentos.set(k, lista);
    if (intentos.size > 5000) for (const [kk, v] of intentos) if (!v.some((t) => ahora - t < ventana)) intentos.delete(kk);
    next();
  };
}

// Respuestas JSON grandes (el inventario de un catálogo de miles de productos) van comprimidas.
function comprimirJson(req, res, next) {
  const json = res.json.bind(res);
  res.json = (cuerpo) => {
    const texto = JSON.stringify(cuerpo);
    const acepta = String(req.headers['accept-encoding'] || '');
    if (texto.length < 8192 || !/\bgzip\b/.test(acepta) || res.headersSent) return json(cuerpo);
    const buf = zlib.gzipSync(texto, { level: 6 });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Content-Length', buf.length);
    return res.end(buf);
  };
  next();
}

module.exports = { limitar, comprimirJson };
