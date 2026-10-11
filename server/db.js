'use strict';

// Base de datos PostgreSQL.
// - En producción: DATABASE_URL (por ejemplo, Neon, Supabase o Render Postgres).
// - En local, sin configurar nada: PGlite (PostgreSQL embebido) guardado en ./data/pglite.
//   DATA_DIR=memory:// lo deja en memoria (lo usan las pruebas automáticas).

const path = require('path');

let motor = null;

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    clave_hash TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'usuario',
    mapeos JSONB NOT NULL DEFAULT '{}'::jsonb,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS sesiones (
    token_hash TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_en TIMESTAMPTZ NOT NULL,
    ultima_actividad_en TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS pedidos (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    proveedor TEXT NOT NULL DEFAULT '',
    tipo TEXT CHECK (tipo IN ('real', 'simulado')),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    lista_inicial JSONB NOT NULL DEFAULT '[]'::jsonb,
    inicial_guardada_en TIMESTAMPTZ,
    export_id INTEGER,
    reporte_visto_en TIMESTAMPTZ,
    lista_final JSONB,
    final_guardada_en TIMESTAMPTZ,
    comparacion JSONB,
    por_que TEXT,
    terminado_en TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS exports (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    subido_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    estado TEXT NOT NULL,
    errores JSONB,
    hojas JSONB,
    reporte JSONB
  )`,
  `CREATE TABLE IF NOT EXISTS archivos (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    export_id INTEGER REFERENCES exports(id) ON DELETE SET NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('export', 'lista')),
    nombre TEXT NOT NULL,
    tamano INTEGER NOT NULL,
    contenido BYTEA NOT NULL,
    subido_en TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS eventos (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    pedido_id INTEGER,
    detalle JSONB,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  'CREATE INDEX IF NOT EXISTS pedidos_usuario ON pedidos(usuario_id)',
  'CREATE INDEX IF NOT EXISTS exports_pedido ON exports(pedido_id)',
  'CREATE INDEX IF NOT EXISTS archivos_export ON archivos(export_id)',
  'CREATE INDEX IF NOT EXISTS eventos_usuario ON eventos(usuario_id, creado_en)',
  'CREATE INDEX IF NOT EXISTS sesiones_usuario ON sesiones(usuario_id)',
];

async function iniciar() {
  if (motor) return motor;
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
    motor = {
      nombre: 'postgres',
      query: (sql, params) => pool.query(sql, params),
      async tx(fn) {
        const cliente = await pool.connect();
        try {
          await cliente.query('BEGIN');
          const r = await fn({ query: (sql, params) => cliente.query(sql, params) });
          await cliente.query('COMMIT');
          return r;
        } catch (e) {
          await cliente.query('ROLLBACK');
          throw e;
        } finally {
          cliente.release();
        }
      },
      cerrar: () => pool.end(),
    };
  } else {
    const { PGlite } = require('@electric-sql/pglite');
    const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data', 'pglite');
    require('fs').mkdirSync(path.dirname(dir), { recursive: true });
    const pg = new PGlite(dir);
    await pg.waitReady;
    motor = {
      nombre: `pglite (${dir})`,
      query: (sql, params) => pg.query(sql, params),
      tx: (fn) => pg.transaction((t) => fn({ query: (sql, params) => t.query(sql, params) })),
      cerrar: () => pg.close(),
    };
  }
  for (const sql of ESQUEMA) await motor.query(sql);
  return motor;
}

async function query(sql, params) {
  const r = await motor.query(sql, params);
  return r.rows;
}

async function uno(sql, params) {
  const filas = await query(sql, params);
  return filas[0] || null;
}

function tx(fn) {
  return motor.tx(fn);
}

async function cerrar() {
  if (motor) await motor.cerrar();
  motor = null;
}

function nombreMotor() {
  return motor ? motor.nombre : null;
}

module.exports = { iniciar, query, uno, tx, cerrar, nombreMotor };
