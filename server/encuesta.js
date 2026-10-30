'use strict';

// La encuesta de satisfacción del piloto, dentro de la app (D15 de docs/PLAN_ALPHA_02.md): una
// pregunta de 1 a 5 y un "¿Qué mejoraría?" opcional. No menciona la prueba.
//
//   GET  /api/encuesta   { mostrar }   ¿se le muestra ahora?
//   POST /api/encuesta   { puntaje: 1–5 | null, comentario }   null = "Ahora no"
//
// Aparece cuando el equipo la abre (npm run resultados -- --encuesta abrir) o a los 21 días de su
// primer pedido desde lo sugerido cerrado. Una vez respondida no vuelve. Con "Ahora no" vuelve a
// los 3 días, como máximo dos veces más.

const express = require('express');
const db = require('./db');
const { requiereUsuario, registrarEvento, ErrorUsuario } = require('./cuentas');

const DIAS_TRAS_PRIMER_PEDIDO = 21;
const DIAS_ENTRE_AVISOS = 3;
const MAX_POSPUESTAS = 2;
const MS_DIA = 86400000;

/**
 * pedidaEn: cuándo la abrió el equipo (o null). primerCierre: cuándo cerró su primer pedido desde
 * lo sugerido (o null). respuestas: [{ puntaje, respondidaEn }], con puntaje null para "Ahora no".
 */
function debeMostrarse({ pedidaEn, primerCierre, respuestas = [], ahora = new Date() }) {
  if (respuestas.some((r) => r.puntaje !== null && r.puntaje !== undefined)) return false;
  if (respuestas.length > MAX_POSPUESTAS) return false;
  const t = new Date(ahora).getTime();
  const ultima = Math.max(0, ...respuestas.map((r) => new Date(r.respondidaEn).getTime()));
  if (ultima && t - ultima < DIAS_ENTRE_AVISOS * MS_DIA) return false;
  if (pedidaEn) return true;
  return Boolean(primerCierre && t - new Date(primerCierre).getTime() >= DIAS_TRAS_PRIMER_PEDIDO * MS_DIA);
}

async function estadoDe(usuarioId) {
  const u = await db.uno('SELECT encuesta_pedida_en, encuesta_mostrada_en FROM usuarios WHERE id = $1', [usuarioId]);
  const cierre = await db.uno(
    `SELECT min(terminado_en) AS en FROM pedidos
      WHERE usuario_id = $1 AND modo = 'sugerido' AND terminado_en IS NOT NULL AND anulado_en IS NULL AND borrado_en IS NULL`,
    [usuarioId],
  );
  const respuestas = await db.query('SELECT puntaje, respondida_en FROM encuestas WHERE usuario_id = $1', [usuarioId]);
  return {
    mostradaEn: u ? u.encuesta_mostrada_en : null,
    mostrar: debeMostrarse({
      pedidaEn: u ? u.encuesta_pedida_en : null,
      primerCierre: cierre ? cierre.en : null,
      respuestas: respuestas.map((r) => ({ puntaje: r.puntaje, respondidaEn: r.respondida_en })),
    }),
  };
}

const rutas = express.Router();
rutas.use(requiereUsuario);

rutas.get('/', async (req, res) => {
  const { mostrar } = await estadoDe(req.usuario.id);
  if (mostrar) await db.query('UPDATE usuarios SET encuesta_mostrada_en = now() WHERE id = $1', [req.usuario.id]);
  res.json({ mostrar });
});

rutas.post('/', async (req, res) => {
  const { mostrar, mostradaEn } = await estadoDe(req.usuario.id);
  if (!mostrar) throw new ErrorUsuario('Esta pregunta ya no está abierta.', 409);
  const crudo = req.body?.puntaje;
  const puntaje = crudo === null || crudo === undefined ? null : Number(crudo);
  if (puntaje !== null && !(Number.isInteger(puntaje) && puntaje >= 1 && puntaje <= 5)) throw new ErrorUsuario('Elija un número del 1 al 5.');
  const comentario = puntaje === null ? null : String(req.body?.comentario || '').trim().slice(0, 2000) || null;
  await db.query(
    'INSERT INTO encuestas (usuario_id, puntaje, comentario, mostrada_en) VALUES ($1, $2, $3, $4)',
    [req.usuario.id, puntaje, comentario, mostradaEn],
  );
  await registrarEvento(req.usuario.id, puntaje === null ? 'encuesta_pospuesta' : 'encuesta_respondida', { detalle: { puntaje } });
  res.json({ ok: true });
});

module.exports = { rutas, debeMostrarse, DIAS_TRAS_PRIMER_PEDIDO, DIAS_ENTRE_AVISOS, MAX_POSPUESTAS };
