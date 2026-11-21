'use strict';

// Base de datos PostgreSQL.
// - En producción: DATABASE_URL (Neon).
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
  // Recordatorio de calendario (server/recordatorios.js): la última respuesta de cada usuario.
  // Las fechas van como texto "YYYY-MM-DD" en hora de Colombia, para que no se corran por la
  // zona horaria del servidor.
  `CREATE TABLE IF NOT EXISTS recordatorios (
    usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    activo BOOLEAN NOT NULL,
    fecha_reporte TEXT,
    primer_aviso TEXT,
    respondido_en TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  // Columnas agregadas después de crear las tablas (la base de Neon ya las tiene creadas).
  'ALTER TABLE exports ADD COLUMN IF NOT EXISTS periodo JSONB', // { desde, hasta } si las ventas son totales de un periodo
  'ALTER TABLE exports ADD COLUMN IF NOT EXISTS documentos JSONB', // tipos de documento que el usuario marcó como ventas
  'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS sistema TEXT', // programa contable que eligió (public/js/sistemas.js)
  // Ventas por semana de cada producto (server/series.js) y su costo y proveedor si el archivo los traía:
  // con esto se arma el panel y el pronóstico sin volver a leer el archivo.
  'ALTER TABLE exports ADD COLUMN IF NOT EXISTS series JSONB',
  'ALTER TABLE exports ADD COLUMN IF NOT EXISTS catalogo JSONB',
  // Tiempos de entrega por proveedor y cada cuánto pide (server/inventario.js, leerAjustes).
  "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS inventario JSONB NOT NULL DEFAULT '{}'::jsonb",
  // Del equipo aunque su correo no esté en TEAM_EMAILS: lo marca el equipo desde Resultados.
  'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS es_equipo BOOLEAN NOT NULL DEFAULT false',
  // Enlaces para restablecer la contraseña: se guarda el hash del token, nunca el token.
  `CREATE TABLE IF NOT EXISTS restablecimientos (
    token_hash TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_en TIMESTAMPTZ NOT NULL,
    usado_en TIMESTAMPTZ
  )`,
  // Cómo leyó el equipo el "¿por qué cambió?": 'dato' (el dato le pareció correcto) o 'probar'
  // (cambió por probar la herramienta). Es el segundo criterio de pivote del plan de prueba.
  'ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS clasificacion TEXT',
  // Pedido que el usuario borró sin terminarlo. No se elimina: su lista inicial sigue marcando
  // el comienzo de la prueba y el equipo lo ve como borrado. Para el usuario ya no existe.
  'ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS borrado_en TIMESTAMPTZ',
  // Pedido anulado: sigue a la vista (del usuario y del equipo), con su motivo, pero no cuenta en
  // los resultados ni se puede editar. Se puede reactivar.
  'ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS anulado_en TIMESTAMPTZ',
  'ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS anulado_motivo TEXT',
  // Umbral de "se agota" de este pedido (lo elige en el paso 2; si no, el de Datos). Queda fijo
  // al ver el reporte. NULL en los pedidos de antes: usan el del reporte guardado.
  'ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS semanas_agota INTEGER',
  // Errores del servidor y de las pantallas (server/errores.js), para la vista del equipo.
  `CREATE TABLE IF NOT EXISTS errores (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    origen TEXT NOT NULL,
    mensaje TEXT NOT NULL,
    ruta TEXT NOT NULL DEFAULT '',
    detalle TEXT NOT NULL DEFAULT '',
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  // --- Alpha 0.2 (docs/PLAN_EMPRESAS_INVENTARIO.md) -------------------------------------------
  // Cuenta de empresa: el inventario (archivos, catálogo, movimientos y ajustes) es de la empresa;
  // los pedidos y su medición siguen siendo de cada persona.
  `CREATE TABLE IF NOT EXISTS empresas (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL DEFAULT '',
    nit TEXT,
    vacia BOOLEAN NOT NULL DEFAULT false,
    fundador_id INTEGER UNIQUE,
    inventario JSONB NOT NULL DEFAULT '{}'::jsonb,
    movimientos_cambiaron_en TIMESTAMPTZ,
    inventario_calculado_en TIMESTAMPTZ,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE SET NULL',
  'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS admin_empresa BOOLEAN NOT NULL DEFAULT false',
  // analista (en pantalla, administrador): métricas detalladas; operador: métricas gruesas e ingreso de
  // inventario. Junto con admin_empresa (el gerente) es el rol de la empresa y el servidor lo hace cumplir
  // (cuentas.js, rolEmpresa). No confundir con rol (probador o equipo).
  "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perfil TEXT NOT NULL DEFAULT 'analista' CHECK (perfil IN ('analista', 'operador'))",
  // { unidad: 'dias' | 'semanas' | 'meses', horizonte: semanas del pronóstico }
  "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS preferencias JSONB NOT NULL DEFAULT '{}'::jsonb",
  'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS boletin BOOLEAN NOT NULL DEFAULT false',
  'ALTER TABLE exports ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE',
  // 'archivo' (subido) o 'movimientos' (archivo base + lo registrado a mano después, server/saldos.js).
  "ALTER TABLE exports ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'archivo'",
  'ALTER TABLE exports ADD COLUMN IF NOT EXISTS base_export_id INTEGER',
  'ALTER TABLE exports ADD COLUMN IF NOT EXISTS movimientos INTEGER',
  // Enlaces para unirse a una empresa: se guarda el hash del token, nunca el token.
  `CREATE TABLE IF NOT EXISTS invitaciones (
    token_hash TEXT PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    creada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    email TEXT,
    creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_en TIMESTAMPTZ NOT NULL,
    usada_en TIMESTAMPTZ,
    usada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
  )`,
  // Rol con el que entra quien usa la invitación: 'administrador' u 'operador' (NULL = operador).
  'ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS rol TEXT',
  // Catálogo de la empresa: la identidad es claveCodigo (valores.js), igual que en el reporte.
  `CREATE TABLE IF NOT EXISTS productos (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    clave TEXT NOT NULL,
    codigo TEXT NOT NULL,
    nombre TEXT NOT NULL DEFAULT '',
    unidad TEXT,
    costo NUMERIC,
    proveedor TEXT,
    activo BOOLEAN NOT NULL DEFAULT true,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, clave)
  )`,
  // Entradas y salidas del día. Las existencias no se guardan: se suman desde el último conteo o
  // desde el archivo base (server/saldos.js). No se borran: se anulan, para que el historial cuadre.
  `CREATE TABLE IF NOT EXISTS movimientos (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'venta', 'devolucion', 'salida', 'conteo')),
    cantidad NUMERIC NOT NULL CHECK (cantidad >= 0),
    fecha TEXT NOT NULL,
    nota TEXT NOT NULL DEFAULT '',
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    anulado_en TIMESTAMPTZ
  )`,
  // Un boletín por persona y día (fecha en Bogotá): correr la tarea dos veces no manda dos correos.
  `CREATE TABLE IF NOT EXISTS boletines (
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    fecha TEXT NOT NULL,
    empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
    resumen JSONB,
    estado TEXT NOT NULL,
    error TEXT,
    enviado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, fecha)
  )`,
  // Los usuarios de antes de las empresas quedan cada uno con su "empresa vacía" (sin nombre),
  // con sus ajustes y sus archivos. No hace nada si ya no hay usuarios sin empresa.
  `INSERT INTO empresas (vacia, fundador_id, inventario)
     SELECT true, u.id, u.inventario FROM usuarios u WHERE u.empresa_id IS NULL
     ON CONFLICT (fundador_id) DO NOTHING`,
  `UPDATE usuarios u SET empresa_id = e.id, admin_empresa = true
     FROM empresas e WHERE e.fundador_id = u.id AND u.empresa_id IS NULL`,
  `UPDATE exports x SET empresa_id = u.empresa_id
     FROM usuarios u WHERE u.id = x.usuario_id AND x.empresa_id IS NULL`,
  // Alpha 0.2 → piloto (docs/PLAN_ALPHA_02.md, SP2): el pedido que arranca con todo lo sugerido.
  //   modo 'lista' = los 5 pasos de siempre; 'sugerido' = parte de la foto de lo sugerido.
  //   sugerido = esa foto, tal como estaba al crear el pedido (con ella se mide la aceptación).
  "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS modo TEXT NOT NULL DEFAULT 'lista'",
  'ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS sugerido JSONB',
  'ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE',
  'ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS observaciones TEXT',
  `UPDATE pedidos p SET empresa_id = u.empresa_id
     FROM usuarios u WHERE u.id = p.usuario_id AND p.empresa_id IS NULL AND u.empresa_id IS NOT NULL`,
  // SP3: la encuesta de satisfacción dentro de la app. Una fila por respuesta; "Ahora no" queda con
  // puntaje NULL (pospuesta). encuesta_pedida_en: el equipo la abrió para esa persona.
  `CREATE TABLE IF NOT EXISTS encuestas (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    puntaje INTEGER CHECK (puntaje BETWEEN 1 AND 5),
    comentario TEXT,
    mostrada_en TIMESTAMPTZ,
    respondida_en TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS encuesta_pedida_en TIMESTAMPTZ',
  'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS encuesta_mostrada_en TIMESTAMPTZ',
  'CREATE INDEX IF NOT EXISTS encuestas_usuario ON encuestas(usuario_id)',
  // SP4: catálogo y motor de reabastecimiento. Familia (línea o grupo del programa contable),
  // múltiplo de empaque (se pide en cajas de este tamaño) y mínimo de pedido del proveedor.
  'ALTER TABLE productos ADD COLUMN IF NOT EXISTS familia TEXT',
  'ALTER TABLE productos ADD COLUMN IF NOT EXISTS multiplo NUMERIC',
  'ALTER TABLE productos ADD COLUMN IF NOT EXISTS minimo_pedido NUMERIC',
  // Cuándo cambió por última vez lo escrito a mano en el catálogo: el inventario calculado se
  // guarda en memoria por archivo, y esto lo invalida (server/inventario-rutas.js).
  'ALTER TABLE empresas ADD COLUMN IF NOT EXISTS catalogo_cambio_en TIMESTAMPTZ',
  // Con qué movimientos y qué archivo se calculó el inventario al día (inventarioAlDia en
  // server/movimientos.js): si cambia, se vuelve a calcular.
  'ALTER TABLE empresas ADD COLUMN IF NOT EXISTS inventario_firma TEXT',
  // Ventas de proyecto (D12): bajan existencias pero no cuentan en el promedio. En un archivo, por
  // tipo de documento o por una columna de canal (centro de costo, OT, cliente): exports.canales
  // guarda qué valores de esa columna son de proyecto. En Movimientos, una casilla por venta.
  'ALTER TABLE exports ADD COLUMN IF NOT EXISTS canales JSONB',
  'ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS proyecto BOOLEAN NOT NULL DEFAULT false',
  // SP5: entradas, salidas y datos al día.
  //   movimientos.pedido_id: la entrada que se registró al recibir un pedido ("Registrar llegada").
  //     Sin uso desde T5 (2026-11-20): ya no se registra la llegada; las filas viejas se conservan.
  //   movimientos.desde: una venta que es el total de un periodo (desde → fecha); se reparte por días.
  //   pedidos.recibido: sin uso desde T5; lo que está en camino se calcula en server/en-camino.js.
  //   empresas.mapeos: las columnas y documentos que se recordaron, de toda la empresa.
  'ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL',
  'ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS desde TEXT',
  'ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS recibido JSONB',
  "ALTER TABLE empresas ADD COLUMN IF NOT EXISTS mapeos JSONB NOT NULL DEFAULT '{}'::jsonb",
  'CREATE INDEX IF NOT EXISTS movimientos_pedido ON movimientos(pedido_id)',
  // SP6: aprobación, trazabilidad y PDF de la empresa (D11).
  //   usuarios.aprueba: el administrador marca quién aprueba pedidos. Es el único permiso que hace
  //     cumplir el servidor; si nadie de la empresa aprueba, cada quien cierra sus pedidos.
  //   usuarios.cargo: va en el PDF junto al nombre de quien prepara y de quien aprueba.
  //   pedidos.enviado_en: esperando aprobación. Al devolverlo vuelve a NULL (devuelto_en y su motivo).
  //   pedidos.lista_enviada: la lista tal como la envió quien la preparó, para medir aparte lo que
  //     cambia quien aprueba (comparacion.aprobacion).
  //   empresas.logo: PNG o JPG de hasta 300 KB para el PDF y el Excel.
  'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS aprueba BOOLEAN NOT NULL DEFAULT false',
  'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo TEXT',
  // Un operador solo sube el archivo de inventario si quien administra se lo marca (T4 de docs/PLAN_CAMBIOS_SINESC.md).
  'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS sube_datos BOOLEAN NOT NULL DEFAULT false',
  // El gerente (quien fundó la empresa) siempre es administrador y aprueba; nadie le cambia el rol.
  "UPDATE usuarios SET perfil = 'analista', aprueba = true WHERE admin_empresa AND (perfil <> 'analista' OR NOT aprueba)",
  'ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS enviado_en TIMESTAMPTZ',
  'ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS lista_enviada JSONB',
  'ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS aprobado_en TIMESTAMPTZ',
  'ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS aprobado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL',
  'ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS devuelto_en TIMESTAMPTZ',
  'ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS devuelto_motivo TEXT',
  'ALTER TABLE empresas ADD COLUMN IF NOT EXISTS logo BYTEA',
  'ALTER TABLE empresas ADD COLUMN IF NOT EXISTS logo_tipo TEXT',
  // Quién cambió qué línea de un pedido (server/trazas.js). antes/despues: la cantidad, o NULL si la
  // línea no estaba. Los cambios de una persona sobre el mismo código en 10 minutos son una fila.
  `CREATE TABLE IF NOT EXISTS pedido_cambios (
    id SERIAL PRIMARY KEY,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    codigo TEXT NOT NULL,
    nombre TEXT NOT NULL DEFAULT '',
    antes NUMERIC,
    despues NUMERIC,
    nota TEXT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  'CREATE INDEX IF NOT EXISTS pedido_cambios_pedido ON pedido_cambios(pedido_id, creado_en)',
  // SP7: desde cuántas semanas de inventario sobra cada producto (NULL = las 12 de siempre). Se
  // aplica encima del reporte guardado, sin recalcularlo (server/inventario.js, conSobraPropia).
  // Las alertas del boletín van en usuarios.preferencias.alertas (server/alertas.js), sin columna.
  'ALTER TABLE productos ADD COLUMN IF NOT EXISTS sobra_semanas NUMERIC',
  'CREATE INDEX IF NOT EXISTS pedidos_empresa ON pedidos(empresa_id)',
  'CREATE INDEX IF NOT EXISTS usuarios_empresa ON usuarios(empresa_id)',
  'CREATE INDEX IF NOT EXISTS exports_empresa ON exports(empresa_id, subido_en)',
  'CREATE INDEX IF NOT EXISTS movimientos_empresa ON movimientos(empresa_id, fecha)',
  'CREATE INDEX IF NOT EXISTS movimientos_producto ON movimientos(producto_id, fecha)',
  'CREATE INDEX IF NOT EXISTS pedidos_usuario ON pedidos(usuario_id)',
  'CREATE INDEX IF NOT EXISTS exports_pedido ON exports(pedido_id)',
  'CREATE INDEX IF NOT EXISTS exports_usuario ON exports(usuario_id, subido_en)',
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

// Un archivo (export) cuenta como el inventario del usuario salvo que sea de un pedido que él
// borró y ningún pedido vivo lo reutilice ("usar el último inventario"). Va en un WHERE sobre
// la tabla exports (con o sin alias).
const EXPORT_VIGENTE = `NOT (pedido_id IS NOT NULL
  AND pedido_id IN (SELECT id FROM pedidos WHERE borrado_en IS NOT NULL)
  AND id NOT IN (SELECT export_id FROM pedidos WHERE export_id IS NOT NULL AND borrado_en IS NULL))`;

module.exports = { EXPORT_VIGENTE, ESQUEMA, iniciar, query, uno, tx, cerrar, nombreMotor };
