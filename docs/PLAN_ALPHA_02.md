# Plan Alpha 0.2 → piloto: lo que falta de la retroalimentación de las pruebas

Escrito el 2026-10-29. Rama: `empresas-inventario-diario` (cada sub-plan puede ir en su propia rama, que sale de esta). Es el plan de trabajo de las próximas sesiones, y el estado de cada sub-plan va en `docs/HANDOFF.md`.

**Estado final (2026-10-29):** SP1 a SP8 hechos (entradas 38 a 45 de `HANDOFF.md`). Queda solo lo que hacen personas: el SP0 (rama de Neon para *Preview*, variables en Vercel, copia de la base y el PR a `main`), fijar X, Y y Z en `server/equipo.js`, publicar y anotar la fecha de inicio del piloto, y confirmar con Claudia los informes de Siigo (1.7). Lo que quedó fuera está en "Backlog", al final.

## Contexto

`docs/PLAN_EMPRESAS_INVENTARIO.md` (fases 1 a 6) quedó implementado y en commit (`be1fa50`, entradas 35 y 36 de `docs/HANDOFF.md`): empresas con invitación, perfiles analista/operador, días-semanas-meses, movimientos diarios con existencias y kardex, boletín diario e interfaz autocontenida. Solo falta la fase 0 (rama de Neon y variables en Vercel), que hace una persona.

`docs/Retroalimentación Pruebas.md` (profesor, Jose, Claudia, María Luisa, Luis Carlos, Orlando y la reunión del 27 oct.) trae un backlog de 10 hitos y una **hipótesis nueva para un piloto de cerca de un mes**: si SINESC permite registrar entradas y salidas a diario, X de Y usuarios califican su satisfacción con 4 o más sobre 5 y aceptan el pedido sugerido sin cambios en Z % de las líneas. Hoy la app no puede medir eso: el sugerido del paso 4 no se guarda, "Pedido de la semana" vive solo en memoria y el único pedido que se guarda es el de 5 pasos, que empieza por una lista escrita a mano.

Este plan cubre lo que falta. Es demasiado para una sesión, así que se divide en 9 sub-planes encadenados (0 a 8). Cada uno cabe en una sesión, deja `npm test` en verde y termina con su entrada en `HANDOFF.md`.

## Decisiones tomadas en esta sesión (2026-10-29)

| # | Decisión |
|---|---|
| D9 | **Dos flujos de pedido.** Por defecto, "Preparar pedido" arranca con todas las líneas sugeridas, agrupadas por proveedor. El flujo de 5 pasos queda como opción: "Comparar con mi propia lista". |
| D10 | **La prueba de Alpha 0.1 ya cerró**: se puede publicar en producción. Antes de cada publicación se revisa con `npm run resultados`. |
| D11 | **Aprobación sencilla.** El administrador marca a quién le toca aprobar. Quien prepara el pedido lo envía, y quien aprueba lo aprueba o lo devuelve. Queda la traza de quién cambió qué. El perfil sigue siendo una vista (D3), y la única regla que hace cumplir el servidor es quién puede aprobar. |
| D12 | **Proyectos contra comercialización, por columna del archivo** (tipo de documento, centro de costo, OT o cliente), con el mismo mecanismo de la pregunta de documentos. Una venta registrada en Movimientos también se puede marcar como de proyecto. |
| D13 | **"Usted"** en la app, los errores del servidor, los correos, el PDF y el Excel. La página principal (`components/landing`) no se toca. |
| D14 | **Los Hitos 9 y 10 quedan fuera** (analítica, varias bodegas, importados, varios proveedores por producto, IA y carpeta local); se anotan como backlog. |
| D15 | **La encuesta de satisfacción va dentro de la app**: una pregunta de 1 a 5 que no menciona la prueba. |
| D16 | **Las metas X, Y y Z son constantes provisionales** en `server/equipo.js`, y el equipo las fija antes del piloto. **La aceptación no se le muestra a nadie durante el piloto**; después se puede activar para el administrador con una bandera. |

## Estado del backlog

Hecho = ya existe. Parcial = existe una parte. Columna SP = el sub-plan que lo cubre.

| Hito · punto | Estado | SP |
|---|---|---|
| 1.1 Una carga histórica y después movimientos diarios | Hecho (movimientos + `inventarioAlDia`) | — |
| 1.2 Quitar la carga manual del pedido | Falta: el flujo de 5 pasos empieza por la lista inicial | 2 |
| 1.3 Entradas automáticas desde los pedidos | Falta: los pedidos y los movimientos no se conectan | 5 |
| 1.4 Ventas de un periodo (desde y hasta, más unidades) | Parcial: solo se puede al subir un archivo (`leerPeriodo`) | 5 |
| 1.5 Cierres diarios | Hecho (movimientos por día) | — |
| 1.6 Validar que los códigos coincidan entre ventas y existencias | Parcial: avisa cuántos, no cuáles, y no alerta si casi no coinciden | 5 |
| 1.7 Qué informes de Siigo usar | Tarea del equipo con Claudia (regla de fuentes de `sistemas.ts`) | 5 (solo documentar) |
| 1.8 Decir que la calidad depende de tener los datos al día | Falta | 5 |
| 2 Proyectos contra comercialización | Parcial: solo se recorta el pico y se detecta la venta única | 4 |
| 2 Cálculo de rotación más robusto (presentación) | Parcial: hay desglose por producto | 4 |
| 2 Clasificar productos (frecuente, esporádico, proyecto, venta alta) | Falta | 4 |
| 2 Mínimos de pedido y múltiplos de empaque | Parcial: el lote se deduce de las ventas (`loteDe`) y no se puede escribir | 4 |
| 2 Tiempo de entrega en días hábiles por proveedor | Parcial: va en semanas por proveedor | 4 |
| 2 Etiqueta "pedido reciente" (2 semanas) | Falta | 4 |
| 3 Repartir el pedido por proveedor | Parcial: el PDF y el Excel ya agrupan, pero el pedido no se guarda | 2 |
| 3 Editar el informe y el pedido final | Parcial: la lista final se puede editar hasta terminar el pedido | 2, 6 |
| 3 PDF con logo de la empresa, fecha y responsable | Parcial: logo de SINESC, nombre de la persona (no de la empresa) y firma en blanco | 2, 6 |
| 4 Usted en vez de tú | Falta (unas 650 apariciones de "tú", ninguna de "usted") | 1 |
| 4 Lo obligatorio arriba a la izquierda | Falta: la acción principal va a la derecha | 1 |
| 4 Letra más grande | Falta: hay mucho texto entre 0,7 y 0,82 rem | 1 |
| 4 Desplegables visibles y explicar antes de usar | Falta: 11 `<details>` sin chevron | 1 |
| 4 Quitar "Real o simulado" | Falta | 2 |
| 4 Seleccionar todo, excluir excepciones y filtrar | Falta (en el paso 4 se agregan como máximo 10) | 2 (familia en 4) |
| 5.1 Varios usuarios por empresa | Hecho | — |
| 5.2 Un flujo para cada perfil | Hecho (vista analista/operador) | — |
| 5.3–5.4 Permisos y aprobación | Falta | 6 |
| 5.5 Trazabilidad de cambios | Parcial: tabla `eventos` sin el antes y el después | 6 |
| 6.1–6.2 Notificaciones para crear hábito | Parcial: boletín diario | 7 |
| 6.3–6.7 Alertas por tipo, frecuencia y rol, más "información no cargada" | Parcial: solo existe "Ayer no se registraron movimientos" | 7 |
| 7 Sugerido contra decidido contra ocurrido, y % aceptado | Falta (solo `medirAcierto` sobre el archivo) | 3 |
| 7 Piloto de cerca de un mes | Falta medirlo | 3 |
| 8 Diagnóstico por empresa (cargo y rol) | Falta | 6 (cargo) |
| 8 Mensajes por perfil, segmento y eslogan | Decisión del equipo; la landing no se toca | — |
| 9, 10 | Fuera (D14) | — |
| Pendientes de 0.2: campos en la unidad elegida, la hoja para pegar movimientos, `mapeos` por empresa | Falta | 4, 5 |

## Orden y dependencias

| SP | Qué | Depende de | Sesiones |
|---|---|---|---|
| 0 | Publicar Alpha 0.2 y dejar el plan en el repo | — | personas + 0,5 |
| 1 | Experiencia y tono | 0 | 1 |
| 2 | Pedido desde el sugerido | 1 | 1–2 |
| 3 | Medición del piloto y encuesta | 2 | 1 |
| — | **El piloto puede empezar aquí** | | |
| 4 | Catálogo y motor de reabastecimiento | 2 | 1–2 |
| 5 | Entradas, salidas y datos al día | 2 (y 4 para "en camino") | 1 |
| 6 | Aprobación, trazabilidad y PDF de la empresa | 2 | 1–2 |
| 7 | Alertas configurables | 4, 6 | 1 |
| 8 | Cierre: documentos y Entregable | todos | 0,5 |

**Riesgo de calendario:** si el piloto de un mes espera a que terminen todos los sub-planes, no cabe en el semestre. La recomendación es empezarlo después del SP3. Los SP4 a SP7 se publican durante el piloto, cada uno con su fecha en "Cambios", y `npm run resultados` separa los pedidos de antes y de después de cada publicación con `creado_en`.

Reglas que valen para todos los sub-planes: no hay migraciones (solo `ADD COLUMN IF NOT EXISTS` al final de `ESQUEMA` en `server/db.js`). El inventario se filtra por `empresa_id` y los pedidos por `usuario_id`. Los textos nuevos van en "usted" y pasan `npm run texto`. Si un sub-plan cambia `lib/tipos.ts`, cambia también `server/inventario.js`. Cada sub-plan termina con `npm test`, `tsc --noEmit`, una revisión en el navegador (skill `run`) y su entrada en `HANDOFF.md`.

---

## SP0 · Publicar Alpha 0.2 y dejar el plan en el repo

- **Personas del equipo:** fase 0 de `PLAN_EMPRESAS_INVENTARIO.md`: crear la rama de Neon para *Preview*, poner `CRON_SECRET` y `BOLETIN_SECRETO` en Vercel, y sacar una copia de la base de producción antes de que corra el relleno de empresas.
- **Claude:**
  - ~~Escribir `docs/PLAN_ALPHA_02.md` con este plan y las decisiones D9 a D16.~~ Hecho el 2026-10-29.
  - Actualizar el estado en `PLAN_EMPRESAS_INVENTARIO.md`.
  - Revisar con `npm run resultados` que no quede ningún probador en su ventana.
  - Después de probar en *Preview*, abrir el PR de `empresas-inventario-diario` a `main`, solo con la aprobación del usuario.

## SP1 · Experiencia y tono (Hito 4)

Va primero porque fija las convenciones que siguen los demás sub-planes. `pedido-sugerido.tsx` no se toca aquí, porque lo reemplaza el SP2.

1. **Regla de tuteo en `scripts/revisar-texto.js`:** agregar una entrada a `REGLAS` con las formas de "tú" como palabras completas (tu, tus, te, tienes, puedes, quieres…) y los imperativos más comunes (sube, escribe, elige, revisa, abre, pide, toca, arma, -lo/-la). Sumar `server/*.js` y `lib/sistemas.ts` a `PREDETERMINADOS`. La meta es que la regla no encuentre nada.
2. **Reescribir a "usted".** Por orden de volumen:
   - `pedido-flujo.tsx`, `panel.tsx`, `cuenta-formularios.tsx`, `productos.tsx`, `pedidos.tsx`, `datos.tsx`, `subir.tsx`, `sin-inventario.tsx` y el resto de `components/app`.
   - Los mensajes de `ErrorUsuario` (`server/pedidos.js`, `cuentas.js`, `listas.js`, `plantillas.js`, `empresas.js` y los demás).
   - El correo de invitación en `empresas.js`, `boletin-correo.js`, `pdf.js` y `excel.js`.
   - `lib/sistemas.ts` y su copia `public/js/sistemas.js`.
   - Los encabezados de tabla pasan a ser impersonales ("Existencias", "Alcanza para"), igual que `ESTADOS` en `ui.tsx`.
   - `public/js/app.js` (la interfaz antigua) solo se toca donde lo exijan las pruebas.
   - Actualizar las pruebas que comparan textos.
3. **Tipografía:** definir en `app/globals.css` (`.tema-app`) una escala con tokens: nada por debajo de 0,875 rem, salvo las etiquetas en mayúsculas, que quedan en 0,8 rem. Reemplazar los tamaños arbitrarios (`text-[0.7rem]` a `text-[0.82rem]`, y `text-xs` en el texto que se lee). Subir el `h1` de `Titulo` (`ui.tsx`) un paso.
4. **Componente `Desplegable`** en `ui.tsx`: un `<details>` con chevron que gira, siguiendo el patrón de `components/landing/faq-section.tsx`, con borde y texto en el color principal. Reemplaza los 11 `<details>` (`pedido-flujo.tsx`, `reporte.tsx`, `productos.tsx` y `subir.tsx`).
5. **Explicar antes de usar:** una línea de "para qué sirve" debajo del título de cada sección que se usa por primera vez (Movimientos, Conteo, Proveedores y tiempos, Umbral, Mi empresa). `Titulo` ya recibe `sub`.
6. **Lo obligatorio arriba a la izquierda (regla del profesor):**
   - En `Titulo` (`ui.tsx`), la acción principal va primero, a la izquierda, debajo del título, y las secundarias a su derecha.
   - En los pasos de `pedido-flujo.tsx`, el botón principal queda a la izquierda y "Volver" y lo opcional a la derecha.
   - En Datos, la subida del archivo sigue arriba a la izquierda y los ajustes opcionales a la derecha o abajo.
   - El orden se revisa en el celular.
- **Verificación:** `npm run texto` sin tuteo, `npm test`, `tsc` y una recorrida por todas las pantallas en el celular y en el escritorio.

## SP2 · Pedido desde el sugerido (D9; Hitos 1.2, 3, 4.5, 4.6)

**Datos (`ESQUEMA`):**
- `pedidos.modo TEXT NOT NULL DEFAULT 'lista'`, que vale `'lista'` (5 pasos) o `'sugerido'`.
- `pedidos.sugerido JSONB`: la foto de lo sugerido al crear el pedido. Por línea: código, nombre, proveedor, cantidad, estado, semanas y familia.
- `pedidos.empresa_id`, más un relleno idempotente desde `usuarios.empresa_id`.
- `pedidos.observaciones TEXT`.
- Cada línea de la lista final puede llevar `nota`.

**Servidor (`server/pedidos.js`):**
- `POST /api/pedidos { modo: 'sugerido' }`:
  - Toma el export al día de la empresa (`inventarioAlDia` de `movimientos.js`) como `export_id` y arma el inventario con `construirInventario` (como hace hoy `GET /:id/sugerido`).
  - Guarda la foto con el mismo filtro de `pedido-sugerido.tsx:48` (sugerido > 0 y estado `agota`, `pide` o `normal`) y precarga la lista final con todas esas líneas.
  - Responde 403 si la empresa todavía no tiene inventario.
- `pasoDe(p)` depende del modo. En `sugerido`, el pedido está "preparando" hasta que se guarda la lista final y "terminado" cuando tiene `terminado_en`. Sigue sin columna de estado.
- Las reglas del flujo de 5 pasos (403 sin lista inicial, la lista inicial inmutable con 409) se aplican solo a `modo = 'lista'`. `exigirListaFinalEditable` acepta el modo `sugerido` aunque no exista `reporte_visto_en`.
- `POST /:id/lista-final` en modo `sugerido`: `compararListas(sugerido, final)` (`listas.js`, reutilizado tal cual) se guarda en `comparacion.aceptacion` (líneas sugeridas, sin cambios, ajustadas, quitadas y agregadas). `vistaPedido` lo quita de la respuesta, igual que hace con `coherencia` (D16).
- **"Real o simulado":** sale de la interfaz y el servidor asume `'real'` cuando no viene (`tipoValido`). La columna queda, porque `equipo.js` la lee para los pedidos de Alpha 0.1.
- Exportar desde el pedido guardado:
  - Rutas nuevas: `GET /api/pedidos/:id/pedido.pdf` y `.xlsx`, con un filtro opcional `?proveedor=`. Reutilizan `server/pdf.js` y `server/exportar.js`.
  - El PDF lleva el **nombre de la empresa** (hoy recibe `usuario.nombre`), el número del pedido, su fecha (no la de hoy), quién lo preparó, las observaciones y la nota de cada línea.
  - `/api/exportar/*` queda para la demo.

**Web:**
- `components/app/pedido-preparar.tsx` (nuevo) reemplaza la pantalla en memoria de `pedido-sugerido.tsx`. De ahí se reutilizan el mensaje de WhatsApp por proveedor, los botones de exportar y el buscador para agregar productos.
  - Las líneas van agrupadas por proveedor en `Desplegable`, y solo se dibujan las filas del grupo abierto. Así funciona con unas 1.000 líneas de 10 a 15 proveedores sin dependencias nuevas.
  - Hay una casilla por línea, "Seleccionar todas / ninguna" por proveedor y para todo el pedido, y totales por proveedor siempre a la vista.
  - Filtros por código o nombre, proveedor y estado. La familia se agrega en el SP4.
  - Se puede editar la cantidad y la nota. El borrador se guarda solo con `PUT /lista-final`.
  - La pantalla termina con "Cerrar pedido". El "¿Qué tuvo en cuenta?" opcional se reutiliza de `POST /:id/por-que`.
- En `pedidos.tsx`, la acción principal es "Preparar pedido" (modo `sugerido`). "Comparar con mi propia lista" queda como secundaria y abre el flujo de 5 pasos de siempre.
- `/pedidos/[id]` elige la pantalla según el modo. "Agregar al pedido" en Productos (hoy `ponerEnPedido` en `contexto.tsx`) agrega la línea al borrador abierto en modo `sugerido`; si no hay uno, lo crea.
- Quitar el radio de real o simulado del paso 1 de `pedido-flujo.tsx`.

**Pruebas (`test/pedidos-sugerido.test.js` y `api.test.js`):**
- El pedido nace con todas las líneas sugeridas.
- Las reglas de 5 pasos no se aplican al modo `sugerido`, y siguen aplicándose al modo `lista`.
- La aceptación se calcula bien y no aparece en la respuesta al usuario.
- Un usuario de otra empresa recibe 404.
- El PDF de un proveedor trae solo sus líneas y el nombre de la empresa.

## SP3 · Medición del piloto y encuesta (Hito 7, hipótesis nueva, D15 y D16)

- **`server/equipo.js`:**
  - Constantes provisionales al comienzo del archivo: `PILOTO_DIAS = 30`, `META_PILOTO_USUARIOS`, `TOTAL_PILOTO`, `META_SATISFACCION = 4`, `META_ACEPTACION_PCT` y `ACEPTACION_VISIBLE = false`.
  - `resumirPiloto()`, por usuario:
    - **Aceptación:** líneas sugeridas sin cambio sobre líneas sugeridas, en los pedidos `sugerido` terminados dentro de su ventana.
    - **Satisfacción.**
    - **Uso:** días con movimientos de su empresa sobre días hábiles de lunes a viernes. No se descuentan los festivos (queda anotado).
  - El veredicto sale contra las metas.
- **"Sugerido contra decidido contra ocurrido"** (solo para el equipo): por cada pedido `sugerido` terminado cuyo horizonte (entrega + cada cuánto pide) ya pasó, se compara lo que se vendió de verdad (movimientos o el export siguiente) con el rango del pronóstico de la foto. Reutiliza la lógica de `medirAcierto` (`pronostico.js`).
- **`scripts/resultados.js`:** sección `--piloto` (también en `--json`) y `--encuesta abrir [--email x]`.
- **Encuesta en la app:**
  - Tabla `encuestas (usuario_id, puntaje 1–5, comentario, mostrada_en, respondida_en)` y `usuarios.encuesta_pedida_en`.
  - Aparece una vez, cuando el equipo la abre o a los 21 días de su primer pedido `sugerido` terminado.
  - Pregunta: "¿Qué tan útil le ha resultado SINESC para preparar sus pedidos?", más un "¿Qué mejoraría?" opcional.
  - Con "Ahora no" vuelve a aparecer a los 3 días, como máximo dos veces.
  - No menciona la prueba. Rutas `GET` y `POST /api/encuesta` y un componente en el panel (`panel.tsx`).
- **Pruebas:** aceptación agregada con pedidos inventados, uso en días hábiles y que la encuesta no se repita después de responderla.
- **Al cerrar el SP3:** primeras filas en `ENTREGABLE_Y_APP.md` (hipótesis nueva, dos flujos, encuesta en la app, real o simulado quitado) y fecha de inicio del piloto en `HANDOFF.md`.

## SP4 · Catálogo y motor de reabastecimiento (Hito 2)

- **Catálogo:**
  - Columnas `productos.{familia, multiplo, minimo_pedido}`.
  - Sinónimos de familia en `formatos.js` (línea, grupo, categoría, familia, sublínea), sin tocar `lector.js`, más allá de pasar el campo al catálogo. `agregarAlCatalogo` (`movimientos.js`) los llena sin pisar lo editado a mano.
  - Se editan en la ficha de Productos y también pegando código, familia, múltiplo y mínimo en una hoja (`hoja.tsx`).
- **Sugerido (`inventario.js`, §7 de `modelo-rotacion.md`):**
  - Si el producto tiene múltiplo escrito, `aLote(multiplo)` se usa en vez de `loteDe`. Si el resultado queda entre 0 y el mínimo, se sube al mínimo.
  - El desglose dice "redondeado a cajas de 80".
- **Tiempo de entrega en días hábiles:**
  - `ajustes.entregasDias[proveedor]`. Las semanas salen de días ÷ 5; si no hay días escritos, se usa `entregas`, así que los ajustes guardados siguen sirviendo.
  - Ayuda en pantalla con los ejemplos de Orlando (Bogotá 1, Cali 2, Barranquilla 3–4, máximo 8).
  - Se cierra el pendiente de 0.2: "cada cuánto pide" y el umbral se escriben en la unidad elegida y se guardan en semanas.
- **Proyectos (D12):**
  - A la pregunta de tipos de documento se le suma la opción "venta de proyecto": baja existencias y no cuenta en el promedio.
  - Columna opcional de canal (centro de costo, OT, orden de trabajo, proyecto, cotización, cliente). Si trae 50 valores distintos o menos, devuelve `necesitaCanal` y el usuario marca cuáles son de proyecto. Se guarda en `exports.canales` y se recuerda por firma.
  - `rotacion.js` y `series.js` excluyen esas ventas y guardan `vendidoProyecto` en el desglose.
  - Movimientos: `movimientos.proyecto BOOLEAN`, con la casilla "Es para un proyecto" en las ventas. `ventasDeMovimientos` (`saldos.js`) no las cuenta en el promedio.
  - Los reportes ya guardados no se recalculan (regla de `CLAUDE.md`).
- **Clasificación** (`inventario.js`, pura):
  - `frecuente`: vende en el 50 % de las semanas o más.
  - `esporadico`: vende en menos de la mitad.
  - `proyecto`: más de la mitad de lo vendido es de proyecto.
  - `unica`: la venta única que ya existe.
  - Marca aparte `ventaAlta` para el 20 % de productos que más unidades vende.
  - Se muestra como chip y filtro en Productos y en Preparar pedido.
- **Pedido reciente:** cada producto trae `pedidoReciente: { fecha, cantidad, numero }`, tomado de los pedidos terminados de la empresa en los últimos 14 días (sin borrados ni anulados). Se muestra como chip "Pedido hace 5 días" en Productos, el panel y Preparar pedido.
- **Presentación del cálculo (Jose):** una sección "Cómo se calcula" en la ficha (y en el paso 3) que explica con un producto del propio archivo, en orden: promedio con los ajustes, temporada, rango del pronóstico y sugerido al 90 %. Reutiliza el desglose que ya existe (`elegirEjemplo`).
- **Pruebas:** múltiplo y mínimo en el sugerido, conversión de días hábiles con compatibilidad hacia atrás, ventas de proyecto fuera del promedio (por documento, por columna y por movimiento), la clasificación y la ventana de 14 días de "pedido reciente".

## SP5 · Entradas, salidas y datos al día (Hito 1)

**Hecho el 2026-10-29** (entrada 41 de `HANDOFF.md`). Diferencias con lo planeado: `pedidos.recibido` se guarda por producto (no por proveedor; la pantalla agrupa por proveedor), y una llegada parcial cierra la línea.

- **Recibir un pedido:**
  - En un pedido terminado, "Registrar llegada" por proveedor, con las cantidades precargadas y editables y la fecha. `POST /api/pedidos/:id/recibir` crea movimientos `entrada` con `movimientos.pedido_id` (columna nueva) y guarda `pedidos.recibido` (JSONB por proveedor).
  - Lo pedido que todavía no llegó cuenta **en camino**: el sugerido descuenta existencias + en camino (posición de inventario, §7 del modelo). La línea dice "ya pedido el 20 oct., no ha llegado".
- **Ventas de un periodo:**
  - Pestaña en Movimientos con desde, hasta y una hoja de código y cantidad. Crea ventas con `movimientos.desde` (columna nueva).
  - `ventasDeMovimientos` las reparte por partes iguales entre los días, igual que `leerPeriodo`.
  - Los movimientos anteriores al archivo base se ignoran con aviso, como ya pasa hoy.
- **Pegar e importar movimientos:**
  - El `<textarea>` de `movimientos.tsx` se cambia por `hoja.tsx` (pendiente de 0.2).
  - "Importar de un archivo" reutiliza el lector de listas de `POST /:id/importar-lista` (`CAMPOS_LISTA`).
- **Códigos que no coinciden** (`rotacion.js`, `subir.tsx`):
  - Si menos de la mitad de los códigos de ventas aparecen en existencias, sale un aviso fuerte al subir el archivo.
  - Se muestra la lista de los que no coinciden en cada lado, para descargar.
  - Se sugieren parejas probables: misma `claveCodigo` sin guiones ni sufijos.
- **Datos al día:**
  - Chip en el panel: "Datos de hoy" o "Datos de hace N días", con color.
  - Texto en Datos y al crear la empresa: las recomendaciones dependen de tener los movimientos al día (Claudia).
- **`mapeos` por empresa** (pendiente de 0.2): `empresas.mapeos`, que lee primero el de la empresa y después el de la persona.
- **Siigo (1.7):** el equipo confirma con Claudia qué informes usar (órdenes de compra, pendientes por cruzar). Solo entra a `sistemas.ts` lo que tenga una fuente.
- **Pruebas:** la llegada crea entradas y deja de contar en camino, el periodo se reparte bien, el aviso de códigos con dos archivos inventados y el aislamiento por empresa en `/recibir`.

## SP6 · Aprobación, trazabilidad y PDF de la empresa (Hito 5, Hito 3 PDF, Hito 8 cargo)

**Hecho el 2026-10-29** (entrada 42 de `HANDOFF.md`). Diferencias con lo planeado: la lista tal como se envió se guarda en `pedidos.lista_enviada` (para medir aparte lo que cambia quien aprueba); `pedido_cambios` lleva también el nombre del producto; quien aprueba ve los pedidos de su empresa por `GET /api/pedidos/:id` (cae en `pedidoParaAprobar` si no es suyo) en vez de rutas aparte; cerrar sin enviar solo marca "aprobado" si quien cierra aprueba (si nadie aprueba en la empresa, el PDF sigue con la firma en blanco).

- **Datos:**
  - `usuarios.aprueba BOOLEAN` (lo marca el administrador en Mi empresa) y `usuarios.cargo TEXT` (al crear la cuenta o aceptar la invitación, editable).
  - `pedidos.{enviado_en, aprobado_en, aprobado_por, devuelto_en, devuelto_motivo}`.
  - `empresas.{logo BYTEA, logo_tipo}`: PNG o JPG de hasta 300 KB.
- **Flujo (solo modo `sugerido`):**
  - Preparando → "Enviar a aprobación" → aprobado o devuelto (si lo devuelven, vuelve a preparando, con el motivo).
  - Si la empresa no tiene quien apruebe, o quien prepara puede aprobar, aparece "Aprobar".
  - `GET /api/pedidos/por-aprobar` lista los pedidos de la empresa (`empresa_id`) y `pedidoParaAprobar` exige `aprueba`. Esta es la única regla de permiso que hace cumplir el servidor (D11). `pedidoDe` no cambia.
  - Quien aprueba puede ajustar líneas.
- **Medición:** la aceptación se guarda al **enviar**, porque es la decisión de quien prepara. Lo que cambia quien aprueba va aparte, en `comparacion.aprobacion`.
- **Trazabilidad:**
  - Tabla `pedido_cambios (pedido_id, usuario_id, codigo, antes, despues, nota, creado_en)`. La llena el servidor comparando cada `PUT /lista-final`; los cambios de la misma persona sobre el mismo código en 10 minutos se juntan en una fila.
  - Sección "Historial" en el pedido: quién cambió qué, cuándo y por qué.
  - Las ediciones del catálogo quedan en `eventos`, con el antes y el después.
- **PDF y Excel:** logo de la empresa (con SINESC pequeño al pie), "Preparado por", "Aprobado por" con nombre y fecha ya escritos, y el cargo de cada uno. Se sube en Mi empresa; `GET /api/empresa/logo`.
- **Web:** en `empresa.tsx`, quién aprueba, el cargo de cada persona y el logo. "Por aprobar" en Pedidos, con un contador en el menú.
- **Pruebas:**
  - Quien no tiene `aprueba` recibe 403 al aprobar.
  - Alguien de otra empresa recibe 404.
  - Devolver deja el pedido editable.
  - La traza junta los cambios y guarda el antes y el después.
  - El logo de más de 300 KB se rechaza.
  - El PDF lleva el nombre de quien aprobó.

## SP7 · Alertas configurables (Hito 6)

**Decisiones (2026-10-29):** el único canal es el boletín diario por correo; no hay avisos inmediatos ni otra tarea programada. Quien aprueba ve su pendiente al instante en el contador "Por aprobar" del menú (SP6), y el boletín se lo recuerda al día siguiente.

- **Preferencias:** `usuarios.preferencias.alertas` define la frecuencia de cada tipo: `diario`, `semanal` (lunes), `mensual` (primer día de lunes a viernes) o `nunca`. Los festivos no cuentan. Si el Cron falla ese día, la alerta espera al siguiente turno.
  - Tipos: `pideYa`, `seAgota`, `enCero`, `porRecibir` (pedidos en camino que ya pasaron la fecha esperada, según el tiempo de entrega del proveedor; la sección que el SP5 dejó para este sub-plan), `dineroQuieto`, `sobran` (baja rotación), `sinDatos` y `porAprobar`.
  - Valores por defecto según el perfil:

| Tipo | Analista | Operador |
|---|---|---|
| `pideYa` | diario | diario |
| `seAgota` | diario | diario |
| `enCero` | semanal | diario |
| `porRecibir` | semanal | diario |
| `porAprobar` | diario | diario |
| `dineroQuieto` | semanal | nunca |
| `sobran` | mensual | nunca |
| `sinDatos` | semanal | diario |

  - Hoy nadie recibe el boletín, así que estos valores rigen desde el comienzo y no hay nada que migrar.
- **Interruptor:** `usuarios.boletin` sigue siendo el interruptor general. La tabla solo afina qué secciones lleva el correo y con qué frecuencia. Con todo en `nunca` no sale nada, pero la persona sigue activada. El enlace de baja y el botón "Cancelar suscripción" de Gmail apagan el interruptor sin tocar la tabla, que conserva lo configurado.
- **`sobran` por producto:** el umbral de 12 semanas es el valor por defecto y cada producto puede tener el suyo (`productos.sobra_semanas`, en la ficha y en el pegado por lote de `POST /api/catalogo/lote`, que sigue siendo todo o nada). Se aplica sobre el reporte guardado, como `conUmbral`, sin recalcular. Lo usan el boletín, Productos y el panel; el reporte del flujo de 5 pasos sigue con 12. Como lo ve el usuario, entra en la fila de "Cambios".
- **`server/boletin.js` y `boletin-correo.js`:**
  - Cada correo arma solo las secciones que tocan ese día. Si no hay nada que mostrar, no se manda (estado `sin_novedad`).
  - El asunto es lo más urgente: "Pide ya: 4 productos".
  - "Qué cambió" compara cada sección con su última aparición, no con el boletín de ayer: `resumen` guarda el estado de cada tipo y la fecha en que salió.
  - `porAprobar` le llega a quien tiene `aprueba`. `sinDatos` ("Hace N días hábiles que no se registran movimientos ni archivos", cuando pasan más de 3) le llega solo al administrador y a los operadores. `dineroQuieto` aparece solo si hay costos.
  - Enlaces directos: `/productos?estado=pide` (`productos.tsx` lee `?estado`), `/pedidos/sugerido` (la ruta que abre o crea el pedido; `/pedidos/nuevo` no existe), `/pedidos` (por aprobar y por recibir) y `/movimientos`.
  - Sigue habiendo un solo Cron (regla de `CLAUDE.md`).
- **Web:** en Mi cuenta, una tabla con cada tipo de alerta y su frecuencia, debajo del interruptor. En la ficha del producto, el campo "Se considera que sobra desde (semanas)".
- **Pruebas:** qué secciones salen cada día (lunes, día 1, día cualquiera), el correo sin novedad, los valores por defecto de cada perfil, que `sinDatos` no llegue a quien no corresponde, que con todo en `nunca` no salga nada, que el enlace de baja no borre la tabla, `porRecibir` con un pedido atrasado, `sobran` con un umbral propio y que no salga ningún correo dos veces.

## SP8 · Cierre: documentos y Entregable

**Hecho el 2026-10-29** (entrada 45 de `HANDOFF.md`). La declaración de uso de IA quedó en `docs/USO_DE_IA.md`. Las fechas de publicación siguen "por fijar" en el resumen de `ENTREGABLE_Y_APP.md`: se llenan al publicar.

- **`CLAUDE.md`:** "Qué es este proyecto" con la hipótesis de Alpha 0.2 (la de 0.1 queda como antecedente), los dos flujos, la aprobación, en camino, proyectos y alertas.
- **`docs/modelo-rotacion.md`:** §4 con la métrica de aceptación y el uso; §7 con en camino, mínimos y múltiplos, días hábiles y proyectos.
- **`README.md`:** la tabla "Cómo se cumple el documento".
- **`ENTREGABLE_Y_APP.md`:** una fila de "Cambios" por cada sub-plan, con su evidencia (quién lo pidió según la retroalimentación) y su fecha de publicación.
- **`docs/PLAN_ALPHA_02.md`:** estado final y el backlog de los Hitos 8 a 10 que quedó fuera.
- **Declaración de uso de IA:** lo que construyó Claude en cada sub-plan.

## Verificación de punta a punta (al terminar el SP3, y de nuevo al final)

1. Correr `npm test` y `node inventory-forecasting-landing-page/node_modules/typescript/bin/tsc --noEmit -p inventory-forecasting-landing-page`, y después `npm run texto`.
2. Ver la app en local con `TEAM_EMAILS=… npm run dev` (skill `run`):
   - Crear una empresa e invitar a un operador.
   - Cargar un negocio de Ejemplos.
   - Preparar un pedido desde el sugerido: quitar 3 líneas, ajustar 2, agregar 1 y cerrarlo.
   - Revisar que el PDF por proveedor traiga el nombre de la empresa.
   - Abrir "Comparar con mi propia lista" y llegar al paso 5.
3. Correr `npm run resultados -- --piloto` para ver la aceptación (sugeridas, sin cambios, %) y `--encuesta abrir` para ver la encuesta en el panel.
4. Con los SP5 a SP7: recibir el pedido (las entradas aparecen en Existencias y sale de en camino), enviarlo a aprobación con un usuario sin permiso (403), aprobarlo con otro y ver el PDF, y correr `npm run boletin -- --email x` con alertas semanales un lunes simulado.
5. En *Preview* de Vercel con la rama de Neon, antes de cada publicación en producción.

## Backlog: lo que quedó fuera

Ordenado por hito. Nada de esto se empieza sin decisión del equipo, y lo que vea un usuario durante el piloto necesita su fila en "Cambios".

**Hito 6 y 7 (parcial):**
- "Ventas que se escapan" (Claudia, 6.4): demanda que no se atendió por estar en cero. Requiere un dato que el archivo no trae (§6 del modelo).
- Mostrar al administrador el porcentaje aceptado sin cambios (Claudia, Hito 7). Se apagó a propósito durante el piloto (D16, `ACEPTACION_VISIBLE`).

**Hito 8 · Implementación y posicionamiento:**
- Diagnóstico inicial por empresa (quién carga, analiza, aprueba y compra). Del SP6 quedó el cargo de cada persona y quién aprueba.
- Mensajes por perfil, revisar el segmento (por nivel de ventas) y un eslogan: son de la página principal, que no se toca sin pedido del equipo.

**Hito 9 · Analítica de negocio (D14):**
- Margen contra rotación para depurar el catálogo; costeo completo (proveedor, transporte, bodegaje, administración) antes de mostrar rentabilidad (Luis Carlos).
- Convertir "dinero quieto" en acciones comerciales: promociones, descuentos, uso en proyectos o bajas (Claudia).
- Analítica comercial: clientes que más compran, que dejaron de comprar y picos de consumo (Claudia).

**Hito 10 · Escenarios avanzados (D14):**
- Varias bodegas o puntos de venta, con pedido por tienda (Luis Carlos).
- Importados: moneda extranjera y tiempos largos; importador directo contra distribuidor (Luis Carlos, Orlando).
- Un producto con varios proveedores: plazo de pago, convenio, costo y tiempo de entrega (Orlando, Luis Carlos).
- Unidad de compra distinta a la de venta (granel contra bolsas) (Orlando).
- IA para las particularidades de cada negocio y lectura de una carpeta local (Jose). La IA generativa sigue fuera de alcance (`CLAUDE.md`).

**Pendientes técnicos que dejaron los sub-planes** (detalle en `HANDOFF.md`):
- El pegado de familia, caja y mínimo es un cuadro de texto, no la hoja de `hoja.tsx` (SP4).
- Una llegada parcial cierra la línea; lo que falte se registra a mano en Movimientos (SP5).
- "Comparar con mi propia lista" no tiene aprobación ni historial, y quien prepara no puede retirar un pedido enviado (SP6).
- El campo de sobrestock de la ficha va en semanas aunque la persona use días o meses (SP7).
- No se ha probado el boletín en Gmail ni Outlook de verdad, ni un lunes real con Brevo (SP7).
- Los festivos no se descuentan del uso ni de las alertas.
