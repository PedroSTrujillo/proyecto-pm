# Plan: empresas, perfiles, inventario diario, horizonte y boletín

Escrito el 2026-10-28. Rama: `empresas-inventario-diario` (sale de `main` en `06770b4`). Es el plan de trabajo de las próximas sesiones; el estado de cada fase va en `docs/HANDOFF.md`.

**Estado (2026-10-28, entrada 35 de la bitácora):** fases 1 a 6 implementadas en la rama, sin publicar. Pendiente: la fase 0 (rama de Neon y variables en Vercel, la hace una persona del equipo) y lo que la entrada 35 lista como "no se hizo".

**2026-10-29:** lo que sigue (la retroalimentación de las pruebas y el piloto de Alpha 0.2) está en `docs/PLAN_ALPHA_02.md`. La fase 0 de este plan pasó a ser su SP0, y los pendientes de la entrada 35 quedaron repartidos en sus SP4 y SP5.

## Qué se pidió

1. **Inventario diario.** Además del flujo de hoy (subir el export del programa contable), registrar entradas y salidas de inventario cada día, con un manejo básico de inventario (existencias por producto, historial, conteo). No reemplaza nada de lo que existe.
2. **Horizonte de tiempo.** Hoy todo se dice en semanas. Debe poder verse en días, semanas o meses.
3. **Dos perfiles: analista y operador.** No se separan por contraseña: cada persona elige cuál usa. El analista ve las métricas detalladas; el operador ve métricas gruesas y además ingresa el inventario (diario, o el export mensual o esporádico de siempre). Para que tenga sentido, todos los usuarios pertenecen a una **cuenta de empresa**. Los usuarios de hoy quedan con una "empresa vacía"; los nuevos entran a una empresa ya creada.
4. **Boletín diario por correo** con el estado del inventario.

## Antes de empezar: lo que esto le hace a la prueba

`CLAUDE.md` dice que cualquier cosa nueva que vea un probador durante sus 14 días cambia el tratamiento. Las cuatro funciones lo hacen: el reporte en días o meses se lee distinto, el boletín es un recordatorio diario (y obliga a tener una tarea programada, que el equipo había descartado el 2026-10-11; ver D5) y el operador ve menos que lo que vio el probador en su prueba.

**Regla del plan:** nada de esto se despliega en producción mientras algún probador siga en su ventana de 14 días. Se trabaja en la rama, se prueba en un despliegue de vista previa de Vercel con una rama de Neon (no con la base de producción) y se publica cuando `/equipo` muestre a los 5 probadores con la ventana cerrada. Esto es la Alpha 0.2: cada función lleva su fila en "4 · Cambios y Reflexión" (lista en la fase 6).

## Decisiones (acordadas el 2026-10-28)

Se aceptaron las ocho recomendaciones tal como estaban. Lo que sigue del plan ya las da por tomadas.

| # | Pregunta | Decisión | Por qué |
|---|---|---|---|
| D1 | ¿La "empresa vacía" de los usuarios de hoy es una por usuario o una sola para todos? | **Una por usuario**, sin nombre (`vacia = true`). | Una sola empresa compartida mezclaría inventarios de negocios distintos. Con una por usuario nadie ve datos de otro, y cada uno puede ponerle nombre e invitar a su gente después. |
| D2 | ¿Cómo entra un usuario nuevo a una empresa "creada previamente"? | Dos caminos en `/crear-cuenta`: **crear la empresa** (quien la crea queda como administrador) o **unirse con una invitación** (enlace de un solo uso que manda el administrador). | Es lo mínimo que cumple "empresa creada antes del usuario" sin un panel de administración. Disferral (Orlando Álvarez y Nohora Rodríguez) sería el primer caso real. |
| D3 | ¿El perfil se hace cumplir en el servidor? (**Revertida el 2026-11-20 por T1 de `docs/PLAN_CAMBIOS_SINESC.md`: el rol ahora es gerente, administrador u operador y lo hace cumplir el servidor.**) | **No para leer**: el perfil es una preferencia guardada en la cuenta, se cambia con un clic y el servidor devuelve la vista resumida para el operador (menos datos, no seguridad). Las escrituras de inventario se dejan a los dos perfiles. | Se pidió explícitamente que no se separe por autenticación. Bloquear en el servidor algo que el usuario puede desbloquear con un clic no protege nada y complica las pruebas. |
| D4 | ¿Quién ve el flujo de 5 pasos de los pedidos? | **Los dos perfiles**, sin cambios. | Es el instrumento de medición y "no debe reemplazar a los servicios existentes". |
| D5 | El boletín necesita una tarea programada; el equipo decidió no tener cron (2026-10-11). | **Revertir esa decisión solo para el boletín**: un Vercel Cron al día que llama a una ruta protegida con `CRON_SECRET`. | Un correo diario no se puede mandar desde un archivo de calendario. Hay que escribirlo en `CLAUDE.md` y en "Cambios". |
| D6 | ¿El boletín llega a todos o a quien lo pida? | **A quien lo active.** Al crear una empresa nueva viene marcado; a los usuarios de hoy, desmarcado. Cada correo trae "Dejar de recibirlo" de un clic. | Ley 1581 de 2012 (datos personales) y el límite gratuito de Brevo (300 correos al día). |
| D7 | ¿Se permite que una salida deje un producto en negativo? | **Sí, con aviso** ("quedó en −3: ¿falta registrar una entrada?"). | En un negocio real se registra la venta antes que la llegada de mercancía. Bloquearla haría que dejen de registrar. |
| D8 | ¿El modelo pasa a calcular por día? | **No.** El modelo sigue en semanas (`docs/modelo-rotacion.md`); días y meses son una conversión al mostrarlo. | Con ventas de días sueltos el promedio diario es muy ruidoso, y cambiar el modelo invalida los reportes guardados de la prueba. |

D5 cambia una decisión anterior del equipo (2026-10-11, "sin cron"): en la fase 6 se corrige `CLAUDE.md` para que diga que la única tarea programada es el boletín.

## Orden de trabajo

| Fase | Qué | Depende de | Tamaño |
|---|---|---|---|
| 0 | Rama, base de Neon de prueba, banderas | — | chico |
| 1 | Empresas e invitaciones | 0 | grande |
| 2 | Perfiles analista y operador | 1 | mediano |
| 3 | Horizonte: días, semanas o meses | 0 (se puede hacer en paralelo con 1 y 2) | mediano |
| 4 | Inventario diario: catálogo, movimientos, existencias | 1 | grande |
| 5 | Boletín diario | 1, 2, 3 y 4 | mediano |
| 6 | Documentos, Entregable y cierre | todas | chico |

Cada fase termina con `npm test` en verde, `tsc --noEmit` sin errores, una revisión en el navegador (local) y una entrada en `docs/HANDOFF.md`. Un commit por paso, en español.

---

## Fase 0 · Preparación

1. Trabajar en `empresas-inventario-diario`. Traer `main` con `git merge main` al empezar cada sesión.
2. Crear una rama de Neon a partir de producción solo con el esquema (sin datos de probadores) y ponerla como `DATABASE_URL` del entorno *Preview* de Vercel. Así el `ALTER TABLE` y el relleno de empresas se prueban contra la misma forma de base que producción.
3. Variables nuevas (documentarlas en `docs/PUBLICAR.md`): `CRON_SECRET` (fase 5), `BOLETIN_SECRETO` (firma de los enlaces para darse de baja, fase 5). `BREVO_API_KEY` y `CORREO_REMITENTE` ya existen.
4. Recordar que **no hay migraciones**: todo va como `CREATE TABLE IF NOT EXISTS` o `ALTER TABLE … ADD COLUMN IF NOT EXISTS` en `ESQUEMA` de `server/db.js`, y cada sentencia tiene que poder correr en cada arranque sin cambiar nada la segunda vez.

---

## Fase 1 · Empresas

### Modelo de datos (`server/db.js`, al final de `ESQUEMA`)

```sql
CREATE TABLE IF NOT EXISTS empresas (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL DEFAULT '',
  nit TEXT,
  vacia BOOLEAN NOT NULL DEFAULT false,         -- creada sola para un usuario de antes (D1)
  fundador_id INTEGER UNIQUE,                    -- para rellenar sin duplicar (ver abajo)
  inventario JSONB NOT NULL DEFAULT '{}'::jsonb, -- ajustes de la empresa (hoy en usuarios.inventario)
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS admin_empresa BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE exports  ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE;
CREATE TABLE IF NOT EXISTS invitaciones (
  token_hash TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  creada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  email TEXT,                                    -- opcional: si se pone, solo ese correo la usa
  creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_en TIMESTAMPTZ NOT NULL,
  usada_en TIMESTAMPTZ,
  usada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS usuarios_empresa ON usuarios(empresa_id);
CREATE INDEX IF NOT EXISTS exports_empresa ON exports(empresa_id, subido_en);
```

**Relleno de la empresa vacía** (idempotente, también en `ESQUEMA`, después de lo anterior):

```sql
INSERT INTO empresas (vacia, fundador_id, inventario)
  SELECT true, u.id, u.inventario FROM usuarios u WHERE u.empresa_id IS NULL
  ON CONFLICT (fundador_id) DO NOTHING;
UPDATE usuarios u SET empresa_id = e.id, admin_empresa = true
  FROM empresas e WHERE e.fundador_id = u.id AND u.empresa_id IS NULL;
UPDATE exports x SET empresa_id = u.empresa_id
  FROM usuarios u WHERE u.id = x.usuario_id AND x.empresa_id IS NULL;
```

Los ajustes (`usuarios.inventario`: tiempos de entrega, proveedores asignados, umbral) se copian a la empresa porque el inventario pasa a ser de la empresa. `usuarios.inventario` queda sin borrar por si hay que volver atrás. `usuarios.mapeos` (columnas recordadas por firma) sigue por usuario en esta fase; pasarlo a la empresa queda anotado para después.

### Qué es de la empresa y qué sigue siendo de la persona

| Dato | Dueño | Por qué |
|---|---|---|
| Exports, archivos, catálogo, movimientos, ajustes de inventario | **Empresa** | El operador ingresa y el analista mira el mismo inventario. |
| Pedidos y su medición (lista inicial, lista final, M, "¿por qué?") | **Usuario**, como hoy | `equipo.js` evalúa la hipótesis por persona; no se toca. |
| Perfil, unidad de tiempo, boletín, sesión, contraseña | **Usuario** | Son preferencias de cada quien. |

La regla de `CLAUDE.md` "cada consulta sobre datos de usuario filtra por `usuario_id`" pasa a ser: **los datos de inventario filtran por `empresa_id`; los pedidos, por `usuario_id`**. Escribirla así en `CLAUDE.md`.

### Cambios en el servidor

- `server/cuentas.js`
  - `cargarUsuario`: traer también `u.empresa_id`, `u.admin_empresa`, `u.perfil`, `u.preferencias` (fase 2 y 3) y `e.nombre`, `e.vacia` con un `JOIN empresas`.
  - `publico(u)`: agregar `empresa: { id, nombre, vacia, admin }`.
  - `POST /crear`: exige **una** de dos cosas en el cuerpo:
    - `empresa: { nombre, nit? }` → en una transacción (`db.tx`) crea la empresa y el usuario con `admin_empresa = true`.
    - `invitacion: token` → valida el hash, que no esté usada ni vencida y, si trae correo, que coincida; crea el usuario en esa empresa y marca la invitación usada, en la misma transacción.
    - Sin ninguna de las dos: `ErrorUsuario('Escribe el nombre de tu empresa o abre el enlace de invitación que te mandaron.')`.
  - El rol `equipo` (`TEAM_EMAILS`) no cambia y es independiente de la empresa.
- `server/empresas.js` (nuevo, montado en `/api/empresa` en `app.js`):
  - `GET /` → la empresa y sus miembros (nombre, correo, perfil, administrador).
  - `PUT /` → nombre y NIT (solo administrador). Al ponerle nombre a una empresa vacía, `vacia = false`.
  - `POST /invitaciones` → crea un enlace de 7 días (solo administrador); si hay correo configurado, lo manda con `enviarCorreo`; si no, lo devuelve para copiarlo (igual que el restablecimiento de contraseña).
  - `GET /invitaciones/:token` (sin sesión) → nombre de la empresa, para mostrarlo en `/crear-cuenta?invitacion=…`.
  - `DELETE /miembros/:id` → saca a alguien (solo administrador; no a sí mismo si es el único administrador). Sus pedidos quedan; pierde el acceso al inventario de la empresa: se le crea una empresa vacía nueva.
  - Limitar `POST /invitaciones` con `limitar` de `limites.js`.
- `server/inventario-rutas.js`: `ultimoExport`, la consulta de `GET /`, `PUT /ajustes`, `guardarExport`, `exportSuelto` y `/cargas` pasan de `usuario_id` a `empresa_id` (el `usuario_id` del export queda como "quién lo subió", y `/cargas` lo muestra). Los ajustes se leen y guardan en `empresas.inventario`. La llave de `calculados` cambia a `[cab.id, alcance, empresa.inventario, …]`.
- `server/pedidos.js`: al crear un export desde un pedido, guardar `empresa_id`. "Usar el último inventario" busca el último export de la empresa. `asignarProveedores` y `semanasAgotaDe` usan `empresas.inventario`. `pedidoDe` sigue por `usuario_id`.
- `db.EXPORT_VIGENTE` no cambia (se aplica igual sobre los exports de la empresa).
- `server/borrar.js` y `scripts/borrar-datos.js`: al borrar el último usuario de una empresa, borrar la empresa (y con ella, en cascada, sus exports y movimientos).
- `server/equipo.js`: mostrar la empresa de cada probador (sirve para el vacío 13, independencia de los probadores). La métrica no cambia.

### Cambios en la web

- `app/(cuenta)/crear-cuenta`: dos pestañas, "Crear mi empresa" (nombre de la empresa y tus datos) y, si la URL trae `?invitacion=`, "Te invitaron a {empresa}" (solo tus datos). `cuenta-formularios.tsx`.
- `app/(app)/empresa/page.tsx` + `components/app/empresa.tsx`: nombre, miembros con su perfil, invitar (enlace para copiar o correo). Si la empresa está vacía, un aviso arriba del panel: "Ponle nombre a tu empresa para invitar a tu equipo".
- `lib/tipos.ts`: `Usuario.empresa`.
- `marco.tsx`: ítem "Mi empresa".

### Pruebas (`test/empresas.test.js` y `test/api.test.js`)

- Correr `ESQUEMA` dos veces sobre una base con usuarios de antes: cada usuario queda con una sola empresa vacía y sus ajustes copiados.
- Crear cuenta sin empresa ni invitación → 400. Con empresa → 201 y `admin`. Con invitación vencida, usada o de otro correo → 400.
- Aislamiento: un usuario de la empresa A pide `/api/inventario` y `/api/inventario/cargas` y no ve nada de la B.
- Dos usuarios de la misma empresa ven el mismo inventario; sus pedidos siguen separados.

---

## Fase 2 · Perfiles analista y operador

### Datos

```sql
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perfil TEXT NOT NULL DEFAULT 'analista'
  CHECK (perfil IN ('analista', 'operador'));
```

Se llama `perfil` para no confundirlo con `rol` (`usuario` / `equipo`), que decide quién es probador. Los usuarios de hoy quedan como analistas: ven lo mismo que veían. Un usuario nuevo lo elige al crear la cuenta y lo cambia cuando quiera.

### Qué ve cada uno

| Pantalla | Analista | Operador |
|---|---|---|
| Panel | Completo, como hoy: riesgo, "pide ya", dinero quieto, gráficos, próximos avisos, acierto medido | **Resumen**: cuántos productos en cero, se agotan, bien, sobran; los 10 más urgentes con su estado y para cuánto alcanza; fecha de los datos |
| Productos | Completo con ficha (pronóstico, rango, sugerido, desglose) | Lista con código, nombre, existencias, estado y "te alcanza"; sin pronóstico ni probabilidades |
| Pedidos (5 pasos) | Sí, sin cambios | Sí, sin cambios (D4) |
| Movimientos (fase 4) | Historial, solo lectura | **Registrar** entradas, ventas, devoluciones, salidas y conteos |
| Existencias (fase 4) | Sí | Sí |
| Datos: subir export | Ve el historial de cargas | **Sube** el export (lo mensual o esporádico de siempre) |
| Datos: tiempos de entrega, proveedores, umbral | Sí | No (se muestra el valor, sin editar) |
| Mi empresa, Mi cuenta | Sí | Sí |

### Servidor

- `PUT /api/cuenta/perfil` `{ perfil }`; registra el evento `perfil_cambiado`. *(Quitada el 2026-11-20 por T1.)*
- `GET /api/inventario`: si el perfil es operador, responde `resumirParaOperador(inventario)` (nueva función en `inventario.js`, pura y con pruebas): quita `detalleSugerido`, `pronostico`, `riesgo`, `acierto`, series y desgloses. Sigue calculándose igual (misma caché); solo se recorta la respuesta. La llave de caché no cambia.
- Ninguna ruta de escritura se bloquea por perfil (D3).

### Web

- Selector "Analista · Operador" en el encabezado de `marco.tsx` (y en el menú del celular), con una línea que diga qué cambia. Guarda con `PUT /cuenta/perfil` y recarga el inventario.
- `contexto.tsx`: `usuario.perfil` en la sesión; `itemsDe` arma el menú según el perfil.
- `panel.tsx` y `productos.tsx`: una variante `Resumen` para el operador; no duplicar las tarjetas, reutilizar `ui.tsx`.
- La demo (`/demo/...`) también tiene el selector, para mostrar las dos vistas sin cuenta.
- PostHog (`contexto.tsx`): agregar `perfil` y `e<empresa_id>` a `identify`, sin nombre de la empresa.

### Pruebas

- `resumirParaOperador` no deja ningún campo de detalle (lista de campos prohibidos).
- `GET /api/inventario` con perfil operador y con analista sobre el mismo export.

---

## Fase 3 · Horizonte: días, semanas o meses

### Qué cambia y qué no

- **El modelo no cambia** (D8). `S` sigue en semanas, los umbrales siguen en semanas (2 y 12) y los reportes guardados no se recalculan.
- Cambia **cómo se dice**: 2,4 semanas = 17 días = 0,6 meses. Conversión: días = S × 7; meses = S × 7 ÷ 30,44.
- Cambia también **el horizonte del pronóstico** que hoy está fijo: "Venderás en 4 semanas" (`productos.tsx`) y las 8 semanas del gráfico (`SEMANAS_PRONOSTICO` en `inventario.js`). El usuario elige el horizonte en la misma unidad: 7, 14 o 30 días; 2, 4, 8 o 12 semanas; 1, 2 o 3 meses. Por dentro siempre se pasa a semanas.

### Datos

```sql
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS preferencias JSONB NOT NULL DEFAULT '{}'::jsonb;
-- { "unidad": "dias" | "semanas" | "meses", "horizonte": <semanas> }
```

### Servidor

- `PUT /api/cuenta/preferencias`, validado (unidad de la lista; horizonte entre 1 y 26 semanas).
- `GET /api/inventario?horizonte=N`: `construirInventario` recibe `semanasPronostico` en vez de usar la constante; el valor va en la llave de `calculados`. Cada producto trae `ventaHorizonte: { media, bajo, alto }` para el horizonte elegido.
- `server/excel.js`, `server/pdf.js`, `server/exportar.js`: la columna "semanas" usa la unidad del usuario (se pasa como parámetro).
- `docs/modelo-rotacion.md`: sección nueva "Unidades al mostrar" con la conversión y por qué el cálculo sigue semanal.

### Web

- `lib/formato.ts`: `alcance`, `alcancePartes`, `duracion`, `semanas` y `ventasSemana` reciben la unidad (`'dias' | 'semanas' | 'meses'`). Reglas: en semanas, lo de hoy (menos de una semana se dice en días); en días, enteros; en meses, un decimal y "menos de 1 mes" por debajo de 0,5.
- `contexto.tsx`: la unidad y el horizonte en el contexto (de la cuenta, o de `localStorage` en la demo), y un hook `useTiempo()` que devuelve los formateadores ya atados a la unidad. Las 35 llamadas en `reporte.tsx`, `productos.tsx`, `panel.tsx`, `pedido-flujo.tsx`, `pedido-sugerido.tsx` y `ui.tsx` pasan a usar el hook (buscar `alcance(`, `semanas(`, `duracion(`).
- Selector "Ver en días · semanas · meses" en Panel, Productos y en el reporte del paso 3; el horizonte, junto al gráfico y a la columna "Venderás en…".
- Textos de umbrales: "se agota: menos de 2 semanas" pasa a "menos de 14 días" o "menos de medio mes" según la unidad. Los campos que se escriben en semanas (tiempo de entrega, cada cuánto pide, umbral) aceptan la unidad elegida y guardan semanas.
- `lib/tipos.ts`: `ventaHorizonte`.

### Pruebas

- Conversión y redondeo de los formateadores (agregar `test/formato.test.js` con `node --test` sobre una copia en JS de las funciones puras, o mover las funciones puras a un archivo compartido; ver en la sesión qué es más simple).
- `construirInventario` con horizonte 2 y 12: el pronóstico crece con el horizonte y la media de 12 es cerca de 6 veces la de 2 sin temporada.

---

## Fase 4 · Inventario diario

### Idea central

Los movimientos **producen un export más**, con la misma forma que los de hoy. Así el panel, los productos, el pedido sugerido, el flujo de 5 pasos ("usar el último inventario") y el boletín funcionan sin cambios, y subir un archivo sigue igual (no se reemplaza nada).

```
último export subido (ventas hasta el día H, existencias del día H)
   + movimientos con fecha > H (ventas, devoluciones, entradas, salidas, conteos)
   = "inventario al día": ventas hasta hoy y existencias de hoy
   → calcularRotacion + seriesSemanales + catálogo  →  fila en exports con origen = 'movimientos'
```

Sin ningún export, el inventario sale solo de los movimientos (con un aviso si hay menos de 4 semanas de ventas: "con tan pocas semanas el promedio todavía cambia mucho").

### Tipos de movimiento

| Tipo | Existencias | Cuenta como venta | Ejemplo |
|---|---|---|---|
| `entrada` | suma | no | llegó el pedido del proveedor |
| `venta` | resta | **sí** | venta del día |
| `devolucion` | suma | resta (igual que NC en el lector) | un cliente devolvió |
| `salida` | resta | no | daño, consumo interno, traslado |
| `conteo` | **fija** la cantidad de ese día | no | conteo físico |

Es la misma separación que ya hace la pregunta de documentos (venta, devolución, no cuenta), así que el modelo trata igual un archivo y lo registrado a mano.

### Datos

```sql
CREATE TABLE IF NOT EXISTS productos (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  clave TEXT NOT NULL,              -- claveCodigo (valores.js): la misma identidad del reporte
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL DEFAULT '',
  unidad TEXT,
  costo NUMERIC,
  proveedor TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, clave)
);
CREATE TABLE IF NOT EXISTS movimientos (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,   -- quién lo registró
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'venta', 'devolucion', 'salida', 'conteo')),
  cantidad NUMERIC NOT NULL CHECK (cantidad >= 0),
  fecha TEXT NOT NULL,              -- YYYY-MM-DD en hora de Bogotá, como recordatorios
  nota TEXT NOT NULL DEFAULT '',
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  anulado_en TIMESTAMPTZ            -- no se borra: se anula, para que el historial cuadre
);
CREATE INDEX IF NOT EXISTS movimientos_empresa ON movimientos(empresa_id, fecha);
CREATE INDEX IF NOT EXISTS movimientos_producto ON movimientos(producto_id, fecha);
ALTER TABLE exports ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'archivo';  -- 'archivo' | 'movimientos'
ALTER TABLE exports ADD COLUMN IF NOT EXISTS base_export_id INTEGER;                  -- el archivo del que partió
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS movimientos_cambiaron_en TIMESTAMPTZ;
```

Las existencias **no se guardan**: se calculan sumando movimientos desde el último conteo o desde el export base. Así no hay saldos descuadrados por dos personas registrando a la vez.

### Lógica pura (`server/saldos.js`, nuevo, sin base de datos, con pruebas)

- `saldos({ base, movimientos })` → existencias por clave: parte de las existencias del export base (día H) o de cero; un `conteo` reemplaza el saldo de ese día; los demás suman o restan en orden de fecha y luego de `id`.
- `ventasDeMovimientos(movimientos)` → `[{ codigo, nombre, dia, cantidad }]` como las de `leerExport` (ventas en positivo, devoluciones en negativo, para que `seriesSemanales` las descuente con `descontarDevoluciones`).
- `combinar({ ventasBase, existenciasBase, hasta, movimientos })` → `{ ventas, existencias, avisos }`. Los movimientos con fecha ≤ H se ignoran con un aviso ("Hay 3 movimientos del 12 de octubre o antes: ese día ya está en tu archivo del 12 de octubre").

### Servidor (`server/movimientos.js`, montado en `/api/movimientos` y `/api/catalogo`)

- `GET /api/catalogo?q=` → productos de la empresa (para el buscador). Al guardar un export, `procesarExport` agrega al catálogo los productos nuevos del archivo (código, nombre, costo, proveedor), sin pisar lo que la empresa editó a mano.
- `POST /api/catalogo` / `PUT /api/catalogo/:id` → crear o corregir un producto (código único por `claveCodigo`).
- `POST /api/movimientos` `{ movimientos: [{ codigo, tipo, cantidad, fecha, nota }] }` → uno o muchos (pegados desde Excel). Valida todo antes de guardar y responde los errores con la fila ("Fila 4: la cantidad está vacía"). Un código que no está en el catálogo se rechaza con "¿Quieres crearlo?" y la pantalla ofrece crearlo. Fecha: no en el futuro, no más de 2 años atrás. Guarda en una transacción, marca `empresas.movimientos_cambiaron_en` y registra el evento `movimientos_registrados` (con cuántos y de qué tipo).
- `GET /api/movimientos?desde=&hasta=&producto=` → historial paginado.
- `POST /api/movimientos/:id/anular` → anula (no borra). Filtra por `empresa_id`.
- `GET /api/existencias` → por producto: existencias de hoy, último movimiento, si quedó en negativo (D7) y el estado del último inventario calculado.
- `GET /api/existencias/:clave` → kardex: saldo día por día con cada movimiento.
- **Recalcular** (`inventarioAlDia(empresaId)` en `inventario-rutas.js`): `GET /api/inventario` mira si `movimientos_cambiaron_en` es posterior al último export de origen `movimientos`. Si lo es, recalcula:
  1. Lee las ventas del export base de archivo (como ya hace `completarSeries`: vuelve a leer `archivos` con `leerExport`). Si con archivos grandes (Helisa, 35.000 filas) esto tarda más de 2 segundos, guardar al procesar el export las ventas ya agrupadas por producto y día en una columna nueva y leer de ahí.
  2. `combinar` con los movimientos posteriores.
  3. `calcularRotacion`, `seriesSemanales` y el catálogo, con el umbral de la empresa.
  4. Escribe el resultado en el export de origen `movimientos` más reciente **si ningún pedido lo usa**; si algún pedido ya lo tomó (`pedidos.export_id`), crea uno nuevo. Así el reporte que vio un pedido nunca cambia (regla de `CLAUDE.md`: el reporte se calcula una vez).
- `GET /api/inventario` responde además `fuente.origen` y `fuente.movimientosDesde` para que el panel diga "Archivo del 12 de octubre + 54 movimientos hasta hoy".
- En el paso 2 de un pedido, "Usar mi inventario al día" toma ese export (es otra opción junto a subir el archivo y usar el último).

### Web

- `app/(app)/movimientos/page.tsx` + `components/app/movimientos.tsx` (operador):
  - Registro rápido: fecha (hoy por defecto), tipo con botones grandes (Entrada · Venta · Devolución · Salida · Conteo), producto con buscador por código o nombre, cantidad, nota. Enter guarda y deja el cursor listo para el siguiente.
  - Varias líneas: la hoja de `hoja.tsx` (pegar desde Excel con código y cantidad).
  - Lo registrado hoy, con "Anular".
- `app/(app)/existencias/page.tsx` + `components/app/existencias.tsx`: tabla con existencias de hoy, aviso de negativos y kardex al abrir un producto. Conteo físico: elegir productos, escribir lo contado, ver la diferencia y guardar como `conteo`.
- `datos.tsx`: "Cómo llevas tu inventario": subir el archivo de tu programa (lo de siempre) o registrar movimientos cada día; los dos se pueden combinar.
- `panel.tsx`: la fecha de los datos dice de dónde salen (archivo, movimientos o los dos).
- `lib/tipos.ts`: `Movimiento`, `ProductoCatalogo`, `Existencia`, `fuente.origen`.

### Pruebas (`test/saldos.test.js`, `test/movimientos.test.js`)

- Saldos: entrada + venta + devolución + salida; conteo en la mitad reemplaza el saldo; anulados no cuentan; orden por fecha y `id`.
- Combinar: movimientos anteriores o iguales a H se ignoran con aviso; las ventas posteriores alargan el periodo y entran a las series.
- API: lote con una fila mala no guarda nada y dice la fila; un usuario de otra empresa recibe 404 al anular; recalcular dos veces sin movimientos nuevos no crea otro export; con un pedido usando el export de movimientos, el siguiente recálculo crea uno nuevo y el del pedido queda igual.
- Sin export y solo movimientos: el inventario sale y trae el aviso de pocas semanas.

---

## Fase 5 · Boletín diario

### Cómo se dispara

- `inventory-forecasting-landing-page/vercel.json`: `"crons": [{ "path": "/api/tareas/boletin", "schedule": "0 11 * * *" }]` (11:00 UTC = 6:00 en Bogotá; en el plan Hobby Vercel corre la tarea en algún momento de esa hora).
- `server/boletin.js`, montado en `/api/tareas` **antes** de `cargarUsuario`: exige `Authorization: Bearer ${CRON_SECRET}` (si no, 401). Sin `BREVO_API_KEY` responde `{ enviados: 0, motivo: 'sin correo' }`.
- En local o en un servidor propio: `npm run boletin` (`scripts/enviar-boletin.js`), que llama la misma función. El equipo tiene además "Enviarme el boletín de hoy" en `/equipo` para revisarlo.

### Datos

```sql
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS boletin BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS boletines (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL,                 -- YYYY-MM-DD en Bogotá
  empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
  resumen JSONB,                       -- conteos del día, para decir qué cambió desde ayer
  estado TEXT NOT NULL,                -- 'enviado' | 'error' | 'sin_datos'
  error TEXT,
  enviado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, fecha)
);
```

La llave `(usuario_id, fecha)` hace que correr la tarea dos veces el mismo día no mande dos correos. Si la función se corta por tiempo, la siguiente corrida sigue con los que faltan.

### Qué hace la tarea

1. Busca los usuarios con `boletin = true`, agrupados por empresa, que no tengan fila hoy.
2. Por empresa, calcula el inventario una sola vez (`inventarioAlDia` + `construirInventario`, con la caché de siempre).
3. Por usuario, arma el correo según su **perfil** y su **unidad de tiempo**:
   - **Operador**: cuántos en cero, cuántos se agotan, los 10 más urgentes y "Ayer no registraste movimientos" si es el caso, con un botón a Movimientos.
   - **Analista**: lo mismo más "pide ya" por proveedor, dinero quieto, qué cambió desde ayer (productos que pasaron a "se agota" o a "en cero", comparando con `resumen` de ayer) y un botón al panel.
   - Si la empresa todavía no tiene inventario, no se manda el correo y la fila queda como `sin_datos`. Quien activó el boletín ya sabe que llega cuando haya datos, porque así lo dice el interruptor en Mi cuenta.
4. Envía con Brevo y guarda la fila (`enviado` o `error` con el mensaje).
5. Procesa en tandas de 20 y se detiene antes de 50 segundos para no pasar el límite de la función.

### Correo

- `server/correo.js`: `enviarCorreo` acepta `html` además de `texto` y `encabezados` (para `List-Unsubscribe`).
- `server/boletin-correo.js`: plantilla HTML con estilos en línea y tablas (los clientes de correo no leen CSS externo), colores de SINESC y el logo como imagen servida por la app (Gmail no muestra imágenes en base64). Siempre con versión de texto. Español sencillo, sin jerga.
- Enlaces con `?desde=boletin`: `cargarUsuario` registra el ingreso con `como: 'boletin'`, así la vista del equipo sabe si el boletín trae a la gente de vuelta (vacío 15, stickiness).
- "Dejar de recibirlo": `GET /api/boletin/baja?u=<id>&f=<firma>` con HMAC de `BOLETIN_SECRETO`, sin iniciar sesión, de un clic.

### Web

- `cuenta.tsx`: "Boletín diario" con interruptor y la hora a la que llega.
- `crear-cuenta`: casilla "Recibir el boletín diario" (marcada al crear una empresa nueva, D6).
- `equipo.tsx`: por probador, si tiene el boletín, cuántos le llegaron y cuántas veces entró desde uno.

### Pruebas (`test/boletin.test.js`)

- Sin `CRON_SECRET` correcto → 401.
- Con `fetch` simulado: dos corridas el mismo día mandan un solo correo por usuario.
- El correo del operador no trae datos de detalle; el del analista sí; los dos usan la unidad del usuario.
- "Qué cambió desde ayer" con dos resúmenes inventados.
- El enlace de baja con firma mala no cambia nada.

---

## Fase 6 · Documentos y Entregable

- `CLAUDE.md`: arquitectura (empresas, perfiles, movimientos, boletín, la regla de `empresa_id`), la excepción al "sin cron" y los comandos nuevos (`npm run boletin`).
- `README.md`: tabla "Cómo se cumple el documento" y variables nuevas. `docs/PUBLICAR.md`: `CRON_SECRET`, `BOLETIN_SECRETO`, la rama de Neon para *Preview*.
- `docs/modelo-rotacion.md`: inventario desde movimientos (cómo se combinan con el archivo) y unidades al mostrar.
- `docs/ENTREGABLE_Y_APP.md` y filas nuevas en "4 · Cambios y Reflexión":
  1. Cuentas de empresa con invitación (evidencia: Disferral tiene dos personas; vacío 13).
  2. Perfiles analista y operador (evidencia: quien ingresa el inventario no es quien decide el pedido; Claudia Mueces prepara el informe y no está claro si decide).
  3. Registro diario de movimientos (evidencia: el export mensual llega viejo; aviso de archivo de más de 30 días en el reporte).
  4. Días, semanas o meses (evidencia: lo que pidió el equipo o los probadores; poner la fuente).
  5. Boletín diario y fin de la regla "sin cron" (evidencia: Claudia Mueces pide alertas en vez de informes que hay que descargar; vacío 15).
- `npm run texto` sobre los textos nuevos.
- `docs/HANDOFF.md`: entrada por cada fase.

## Riesgos

| Riesgo | Qué hacer |
|---|---|
| Pasar los datos de `usuario_id` a `empresa_id` deja una consulta sin filtrar y una empresa ve datos de otra | Prueba de aislamiento por cada ruta nueva o cambiada; buscar `FROM exports` y `FROM archivos` en `server/` y revisar cada una. |
| El relleno de empresas corre en cada arranque de Vercel | Las tres sentencias no hacen nada si no hay usuarios sin empresa; medir el arranque en la vista previa. |
| Recalcular con el archivo base grande en cada cambio de movimientos | Se recalcula solo al abrir el inventario y si hubo movimientos nuevos; si tarda, guardar las ventas agrupadas (fase 4, paso 1). |
| El operador registra la misma venta que después trae el export | Los movimientos anteriores al export base se ignoran con aviso. Si suben un export nuevo, ese pasa a ser la base y los movimientos anteriores a su fecha dejan de contar. Decirlo en Movimientos. |
| Brevo gratis: 300 correos al día | Suficiente para la Alpha. Contar en `/equipo` cuántos boletines salen por día. |
| Correos en spam | Remitente verificado en Brevo; `List-Unsubscribe`; texto plano además del HTML. |
| Un probador ve algo nuevo durante su prueba | No desplegar en producción hasta cerrar las 5 ventanas (inicio de este documento). |
