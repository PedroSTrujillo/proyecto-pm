# HANDOFF — Bitácora de relevo

> **Es el archivo que evita perder el contexto entre sesiones** (de cualquier persona del grupo o de cualquier IA).
> - Al **empezar**: lee la entrada de más arriba. Ahí está el estado real y el siguiente paso.
> - Al **terminar** (o si se te acaba el tiempo o los tokens): agrega una entrada nueva **arriba de todo**.
>
> Entradas cortas y accionables. Lo viejo se puede podar; lo que importa es que la entrada de arriba
> diga fielmente cómo quedó todo y **qué hacer primero**.
>
> Si varias personas trabajan a la vez: `git pull --rebase` antes de escribir aquí. El número de tu
> entrada es el de la de más arriba + 1, tomado después del pull. Di quién eres y en qué rama trabajas.

---

## Plantilla (copiar para cada entrada nueva)

```
## AAAA-MM-DD (N) — <quién> — <título corto>
- **Rama:** (y si ya está en GitHub o solo en local)
- **Estado:** (qué quedó funcionando y qué no)
- **Archivos tocados:** (una línea por archivo o grupo)
- **Base de datos:** (tablas o columnas nuevas; recuerda que no hay migraciones: van en ESQUEMA de server/db.js)
- **Verificación:** npm test → resultado; qué se miró en el navegador
- **Siguiente paso exacto:** (lo primero que debe hacer la próxima sesión)
- **Notas y bloqueos:** (decisiones pendientes, cosas que debe hacer una persona, variables por configurar)
```

---

## 2026-10-14 (32) — Claude — Helisa se importa de verdad; anular un pedido sin borrarlo
- **Rama:** `main` y `mejoras-modelo`, en los dos repos.
- **Estado:**
  - **Helisa:** sus .xls son BIFF "sueltos" (sin el contenedor OLE; empiezan con 09 08) y `esLibroBinario` los tomaba por texto: ningún informe de Helisa se leía. Ahora se abren como Excel. Además, si el informe empieza con el año cortado ("01/OCT/202"), el año sale de la primera fecha completa (`fechaConAnioCortado` con `siguiente`), y FCA se sugiere como venta y DFCA como devolución. Probado con un Movimiento detalle real (35.000 filas) y con una réplica de 12 meses, de punta a punta en la app.
  - La guía de Helisa en el paso 2 muestra primero los dos informes probados (Movimiento detalle + listado de inventario).
  - "Así leímos tu archivo" muestra el título más cercano cuando el de la columna está corrido (Helisa).
  - **Anular un pedido** (`POST /api/pedidos/:id/anular` y `/reactivar`, columnas `pedidos.anulado_en` y `anulado_motivo`): queda a la vista con su motivo, no se edita (`pedidoActivo` responde 409) y no cuenta en el veredicto ni en "cada cuánto pide". Se puede anular en cualquier paso, también con la lista final guardada. El equipo también anula y reactiva desde "Resultados de la prueba" (`/api/equipo/pedidos/:id/anular`).
- **Base de datos:** `pedidos.anulado_en` y `pedidos.anulado_motivo` (ALTER en ESQUEMA).
- **Verificación:** `npm test` → 108/108; `tsc` sin errores; en el navegador (local): réplica de Helisa subida, pregunta de documentos con FCA/DFCA/DSE ya marcados, reporte.
- **Textos y landing (segundo commit):** textos de la app más cortos y directos (pedidos, panel, productos, pedido de la semana, paso 1, 4 y 5, Datos, cuenta). La landing muestra en el hero el paso 4 de hoy (`pedido-preview.tsx`: te alcanza, ibas a pedir, SINESC sugiere, tu cantidad final y la orden en PDF, Excel o WhatsApp); en celular cabe sin desplazar. Precio y preguntas frecuentes ya dicen que el sugerido está desde el primer día. Se quitó `report-preview.tsx`, que ya no se usaba.
- **Siguiente paso exacto:** hacer las pruebas grabadas. Para un probador con Helisa: Movimiento detalle (de este mes del año pasado a hoy) + listado de inventario, los dos en el paso 2.
- **Notas y bloqueos:** si alguien recarga la página en la pregunta de documentos, tiene que volver a subir el archivo (la pregunta no se guarda). Anular cambia el tratamiento de la prueba: va como fila en "Cambios" si un probador lo usa.

## 2026-10-14 (31) — Claude — la app revisada como cada probador: venta de una sola vez, proveedores en el paso 4, orden de compra
- **Rama:** `main` y `mejoras-modelo`, en los dos repos.
- **Estado:**
  - **Venta de una sola vez** (`ventaUnica` en `server/inventario.js`, §7.4 del modelo): si todo lo vendido cae en 1 o 2 semanas seguidas, en un archivo de 26 semanas o más, y no se vendió en las últimas 4, no se pronostica y el sugerido es 0, con la explicación y la fecha. Con los archivos reales de refrigeración salía pedir 216 paneles (unos $250 M) por una venta de 390 en dos semanas de junio. `esNuevo` (`rotacion.js`) tampoco toma esa venta como producto nuevo (solo aplica a archivos que se suban desde ahora).
  - **Paso 4:** columnas "Te alcanza hoy · Ibas a pedir · SINESC sugiere (con "Usar") · Tu cantidad final (verde, con lápiz) · Cambio · Con tu cantidad, dura". Si el archivo trae proveedores, se cambia ahí mismo cuánto tarda cada uno (queda en Datos). La importación de otro Excel quedó plegada debajo de la tabla.
  - **Paso 3:** "Tu pedido frente al reporte" (cuántas líneas de su lista se agotan, sobran, están bien, y lo que se agota y no pidió).
  - **Paso 5 terminado:** "Tu orden de compra" con PDF para aprobar, Excel por proveedor y mensaje para WhatsApp (usa proveedor y costo del archivo).
  - **Panel:** tarjeta "Ventas que se te escapan" (productos en cero que se venden: unidades y plata a costo por semana); en cero dice "Ya está en cero" en vez de un porcentaje de riesgo.
  - **Productos:** columnas "Venderás en 4 semanas" (con rango) y "Pedir"; la ficha de un producto en cero lo dice y la tabla ya no se corta con la ficha abierta.
  - **Pedido de la semana:** ya no se corta la columna Valor; lo más vendido primero; "Mensaje para tu proveedor" cuando el archivo no trae proveedor.
  - **Pedidos vacío:** guía de los 5 pasos. **Datos:** "Archivo subido el…" en vez de "Al día desde…".
  - **Para el equipo:** en el paso 2 de una cuenta del equipo, "ensayar con un negocio de ejemplo" sube el archivo de la demo sin descargarlo; en "Resultados de la prueba", la guía de la llamada (antes, durante, las tres preguntas, después).
- **Archivos tocados:** `server/inventario.js`, `server/rotacion.js`, `server/pedidos.js` (costo, ventaUnica y entregas en `/sugerido`); `components/app/{pedido-flujo,hoja,panel,productos,pedido-sugerido,pedidos,datos,subir,equipo,marco}.tsx`, `lib/tipos.ts`; `docs/modelo-rotacion.md`; pruebas en `test/pronostico.test.js` y `test/rotacion.test.js`.
- **Base de datos:** sin cambios.
- **Verificación:** `npm test` → 105/105; `tsc` sin errores. En el navegador (local): pedido completo de punta a punta con el negocio de ejemplo de refrigeración (Polar a 9 semanas: el sugerido del R-410A pasa de 23 a 183 y "con tu cantidad, dura 2,3 sem · no alcanza"), PDF y Excel de la orden descargados; panel, productos y pedido de la semana con los archivos reales del probador de refrigeración.
- **Siguiente paso exacto:** las 5 pruebas grabadas. Antes de cada una, ensayar en una cuenta del equipo con "ensayar con un negocio de ejemplo".
- **Notas y bloqueos:** la venta de una sola vez cambia lo que se sugiere y debe ir como fila en "Cambios" del Entregable (evidencia: archivo real de refrigeración).

## 2026-10-14 (30) — Claude — el sugerido explica por qué y para cuánto dura; veredicto el mismo día
- **Rama:** `main` y `mejoras-modelo`, en los dos repos.
- **Estado:**
  - Paso 4: la columna "Sugerido" dice la cantidad y para cuánto dura ("99 · dura 12 sem"); al hacer clic se abre el detalle con lo que sugiere, lo que va a pedir y lo que iba a pedir (cada uno con para cuánto le dura), el porqué paso a paso (venta por semana, semanas a cubrir, lo más probable y lo que alcanza 9 de cada 10 veces, lo que tiene), la gráfica de ventas con el pronóstico y sus últimas 8 semanas. Arriba de "Guardar", el resumen de cuántas líneas lleva cambiadas.
  - Lo que sobra (más de 12 semanas) ya no trae sugerido (era contradictorio con el reporte); el detalle lo explica.
  - `detalleSugerido` en cada producto de `construirInventario`; `/api/pedidos/:id/sugerido` trae además la serie, el pronóstico y las fechas.
  - Veredicto: con los 5 probadores terminados y sin meta ni pivote, ahora dice "No se cumplió la meta" (`meta_no_cumplida`) en vez de quedarse "en curso". El veredicto sale el mismo día de las pruebas: no espera los 14 días.
- **Verificación:** `npm test` → 103/103 (casos nuevos en "meta y pivote"); en el navegador (local) con los archivos reales del probador: detalle de la tubería flexible (sugiere 99, dura unas 12 semanas, explica por qué dura más de las 7 que cubre) y de la unión 7/8 (sobra, sugerido 0).
- **Siguiente paso exacto:** hacer las 5 pruebas grabadas; en "Resultados de la prueba" sale el veredicto contra 3 de 5.
- **Notas y bloqueos:** ninguno.

## 2026-10-14 (29) — Claude — la lista final sugiere cuánto pedir
- **Rama:** `main` y `mejoras-modelo`, en los dos repos.
- **Estado:** decisión del equipo: la app sugiere el stock con el modelo (§7) también en la prueba. `permisos` da `alcance: 'completo'` a todos desde el primer día (la ventana de 14 días sigue). Ruta nueva `GET /api/pedidos/:id/sugerido` (después de ver el reporte) con la cantidad sugerida de cada producto, usando el umbral del pedido y los tiempos de Datos. En el paso 4: columna "Sugerido" y recuadro "Lo que sugiere SINESC" con el tiempo de entrega y cada cuánto pide (se cambian ahí y guardan en Datos), "Usar las cantidades sugeridas en mi lista" y "Agregar lo que se agota y no está en mi lista". La lista final la sigue escribiendo el usuario.
- **Archivos tocados:** `server/pedidos.js`, `server/inventario-rutas.js`, `components/app/pedido-flujo.tsx`, pruebas de API, CLAUDE.md, README, ENTREGABLE_Y_APP.
- **Verificación:** `npm test` → 103/103; en el navegador (local) con los archivos reales del probador: sugeridos coherentes (en cero → 26; 4 semanas → 14; sobra → 0); subir el tiempo de entrega a 3 sube los sugeridos; el botón lleva las sugeridas a la lista y "Cambio" lo muestra.
- **Siguiente paso exacto:** en el Entregable 3, escribir en "Si cambió" de la Solución que la lista final muestra el sugerido desde el 2026-10-14, y por qué.
- **Notas y bloqueos:** con "Usar las cantidades sugeridas" un probador puede cambiar muchas líneas de un clic; por eso pesa más que nunca marcar cada "¿por qué?" (dato contra probar la herramienta).

## 2026-10-14 (28) — Claude — rama de Santiago integrada en main
- **Rama:** `main` y `mejoras-modelo` en los dos repos, con `santiago` (umbral de "se agota" que elige cada cuenta) integrada.
- **Estado:** la rama venía de antes de las entradas 21 a 27 y chocaba en `server/pedidos.js`, `server/rotacion.js`, dos archivos de pruebas, README y esta bitácora. Se conservó todo: `calcularRotacion` recibe `semanasAgota` (Santiago) y `hoy` (avisos de archivo viejo y meses sin ventas); las pruebas de los dos quedan; la entrada de Santiago queda como (20b). Se ajustó el texto del paso 2 cuando el usuario ya cambió el umbral ("Está en 4, también para tus próximos pedidos").
- **Verificación:** `npm test` → 103/103; `tsc` sin errores; en el navegador (local): el paso 2 muestra el selector, subirlo a 4 lo guarda y el reporte dice "se agotan en menos de 4 semanas".
- **Siguiente paso exacto:** declarar en el Entregable 3 que el umbral de "se agota" ahora lo puede elegir cada probador (fila 5 de "Filas que conviene agregar" en `docs/ENTREGABLE_Y_APP.md`) y decidir si los probadores que no usen 2 se leen aparte.
- **Notas y bloqueos:** ninguno.

## 2026-10-14 (27) — Claude — la prueba completa como el probador, con sus archivos reales
- **Rama:** `mejoras-modelo` (y `main`), en los dos repos.
- **Estado:** se hizo el pedido de punta a punta en el navegador (local) como el probador de Siigo Nube, con sus dos archivos reales servidos solo en este equipo. Lo que confundía y se arregló:
  - **Pregunta de documentos:** contaba solo el primer archivo (decía RM 275 cuando eran 1.398, y el tipo NT del segundo archivo no aparecía). Ahora cuenta y pregunta por todas las hojas y archivos juntos.
  - **Antes de esa pregunta,** "Así leímos tu archivo" dice qué columna se tomó para cada cosa (unidades vendidas = "Cantidad salida", existencias = "Saldo cantidades"…), por qué se pregunta por los documentos y deja elegir las columnas a mano.
  - **Paso 4:** columnas "Vas a pedir", "Ibas a pedir" y "Cambio" (+15, igual, agregado); el texto explica por qué al comienzo son iguales; lo que se quitó se lista debajo; los productos escritos sin nombre toman el del archivo (también en el paso 5).
  - **Reporte:** los avisos de archivo viejo o de meses sin ventas van arriba, a la vista; "Qué leímos" no repite la misma línea por cada archivo y nombra los campos en español; también dice qué documentos se contaron como venta y cuáles como devolución.
  - **Panel:** dice hasta cuándo llegan las ventas (no el día en que se subió) y avisa si es de hace más de 30 días; "Ventas: últimas 4 semanas del archivo".
  - **Guía de Siigo Nube:** la otra opción ya no dice que con dos informes se ve cada semana (el informe único ya trae fechas).
  - **README** reescrito completo.
- **Archivos tocados:** `server/lector.js`, `components/app/{subir,pedido-flujo,hoja,reporte,panel}.tsx`, `lib/sistemas.ts` y `public/js/sistemas.js`, `README.md`, pruebas.
- **Verificación:** `npm test` → 98/98; `tsc` sin errores; el flujo completo en el navegador con los archivos reales: 784 productos, 1.645 filas de venta, 363 unidades devueltas restadas, 5 líneas cambiadas en el paso 5.
- **Siguiente paso exacto:** que el probador vuelva a subir sus archivos en producción (la pregunta de documentos le vuelve a salir con los conteos de los dos archivos) y que saque el informe hasta hoy.
- **Notas y bloqueos:** para probar con archivos reales en el navegador integrado hace falta servirlos desde el mismo origen (un proxy local); los archivos nunca van al repo.

## 2026-10-13 (26) — Claude — las devoluciones de clientes se restan
- **Rama:** `mejoras-modelo` (y `main`), en los dos repos.
- **Estado:** en la pregunta de documentos cada tipo es "Venta", "Devolución" o "No cuenta" (NC, DV, DEV se sugieren como devolución). La devolución resta lo que entró (campo nuevo `entrada`, "Cantidad entrada") o el valor absoluto de la cantidad; se guarda `{ ventas, devoluciones }` en `exports.documentos` y en los mapeos (una lista vieja se lee como solo ventas). En las series semanales una semana negativa se descuenta de las anteriores (`descontarDevoluciones`, series.js). Aviso en el reporte con las unidades restadas. Con los archivos reales del probador: 363 unidades restadas (igual al total de "Cantidad entrada" de sus NC).
- **Archivos tocados:** `server/lector.js`, `server/formatos.js`, `server/series.js`, `server/pedidos.js` (`leerDocumentos`), `server/inventario-rutas.js`, `components/app/subir.tsx`, `docs/modelo-rotacion.md` §3.5, pruebas.
- **Verificación:** `npm test` → 97/97; en el navegador (local), un kardex inventado con FV, RM, NC, FC y NT: la pregunta sugiere bien cada uno y el reporte resta la devolución (5 + 7 − 2 = 10).
- **Siguiente paso exacto:** que el probador vuelva a subir sus archivos (la elección de documentos que ya guardó se pregunta otra vez solo si no la tiene).
- **Notas y bloqueos:** una elección recordada de antes (solo la lista de ventas) se vuelve a preguntar si el archivo trae NC u otro tipo de devolución; la de un archivo ya guardado se respeta para no cambiar reportes viejos.

## 2026-10-13 (25) — Claude — importación más robusta para cualquier programa
- **Rama:** `mejoras-modelo` (y `main`), en los dos repos.
- **Estado:**
  - Los dos archivos reales de Siigo Nube del probador pasan por la API de punta a punta (subir juntos → marcar FV y RM → reporte con 784 productos).
  - Formatos probados con la misma tabla: xlsx, xls, ods, CSV, TXT, TSV con extensión .xls (antes leía 05/01 como 1 de mayo), HTML con extensión .xls o .htm, XML de Excel 2003 (.xml o .xls), con y sin marca UTF-8. Todos dan las mismas ventas y existencias.
  - Hasta 24 archivos por subida (antes 5: no alcanzaba para quien exporta mes por mes); los de más de 300 KB se comprimen en el navegador.
  - Avisos nuevos en el reporte (`avisosDelPeriodo`, rotacion.js): el archivo llega hasta hace más de 30 días (las existencias son de ese día) y un hueco de más de 45 días sin ninguna venta (falta un archivo). Solo los reportes de pedidos pasan `hoy`; la demo no.
  - "¿Qué documentos son ventas?": cada prefijo dice lo que suele ser (FV, RM, NC, FC, CC…) y los sugeridos van primero.
  - Guía de Siigo Nube: el Movimiento de productos solo basta (`unInforme`).
- **Archivos tocados:** `server/lector.js`, `server/rotacion.js`, `server/pedidos.js`, `server/inventario-rutas.js`, `server/app.js`, `components/app/subir.tsx`, `components/app/pedido-flujo.tsx`, `lib/api.ts`, `lib/sistemas.ts` y `public/js/sistemas.js`, pruebas.
- **Verificación:** `npm test` → 94/94; en el navegador (local), un kardex inventado con la forma de Siigo: la pregunta de documentos con sus significados y el reporte.
- **Siguiente paso exacto:** pedirle a cada probador su export real antes de la prueba y pasarlo por `flujo-api.js` (o subirlo con una cuenta del equipo).
- **Notas y bloqueos:** las notas crédito (devoluciones) no se restan de las ventas.

## 2026-10-13 (24) — Claude — "Movimiento de productos" de Siigo Nube
- **Rama:** `mejoras-modelo` (y `main`), en los dos repos.
- **Estado:** un export real de Siigo Nube ("Movimiento de productos", kardex de la A a la N) salía con "solo una columna": el archivo declara la hoja como A1:A3935. Ahora:
  - `ajustarRango` (lector) recalcula el rango con las celdas reales.
  - "Saldo cantidades" se reconoce como existencias.
  - Las filas "Código producto: …" (grupo con totales) se saltan; la fila de un producto sin movimientos aporta su saldo y no aparece como tipo de documento.
  - RM y REM (remisión) se sugieren como venta, junto a FV.
  - Probado en local con los dos archivos reales (no se copian al repo): 784 productos, 1.564 ventas con FV y RM.
- **Archivos tocados:** `server/lector.js`, `server/formatos.js`, `test/lector.test.js` (datos inventados con la misma forma).
- **Verificación:** `npm test` → 93/93.
- **Siguiente paso exacto:** que el probador vuelva a subir sus dos archivos y marque FV y RM como ventas.
- **Notas y bloqueos:** NC (notas crédito, devoluciones) no se restan de las ventas.

## 2026-10-13 (23) — Claude — comentarios de los monitores a la landing y "es del equipo"
- **Rama:** `mejoras-modelo` (y `main`), en los dos repos.
- **Estado:**
  - Landing, por los comentarios de los monitores (13-oct): el plan pasó de 5 a 3 pasos (`how-it-works.tsx`); "Crear mi cuenta" se repite después del plan y después de la comparación de listas (`cta-en-linea.tsx`); "Para quién es" quedó justo debajo de "El problema" (`app/page.tsx`, sugerencia del monitor).
  - Resultados de la prueba: botón "Es del equipo, no un probador" (`POST /api/equipo/usuarios/:id/equipo`, columna `usuarios.es_equipo`). El inicio de sesión lo respeta aunque el correo no esté en `TEAM_EMAILS`.
  - PostHog en producción: carga por `/ingest`. La clave puesta en Vercel empieza por `phx_` (clave personal, secreta) y no por `phc_` (la del proyecto): PostHog responde 401 y hay que cambiarla y revocar la personal.
- **Base de datos:** `usuarios.es_equipo` (ALTER en ESQUEMA).
- **Verificación:** `npm test` → 91/91. Landing medida en el navegador a 1280 y 375 px: 3 pasos en una fila, 5 botones de crear cuenta, sin desborde.
- **Siguiente paso exacto:** marcar a Jose Manuel con el botón nuevo en Resultados; pedirle a Nicolás que borre su Pedido 1 (o borrarlo en Neon); cambiar la clave de PostHog.
- **Notas y bloqueos:** ninguno.

## 2026-10-13 (22) — Claude — PostHog opcional
- **Rama:** `mejoras-modelo` (y `main`), en los dos repos.
- **Estado:** PostHog listo pero apagado hasta que se ponga `NEXT_PUBLIC_POSTHOG_KEY` en Vercel y se vuelva a desplegar. Sin la clave carga el paquete y no manda nada (revisado en local: ninguna petición a `/ingest`).
- **Archivos tocados:** `instrumentation-client.ts` (nuevo: el cargador oficial de PostHog, sin paquete de npm), `next.config.mjs` (rewrites `/ingest`), `components/app/contexto.tsx` (identify y reset), README, PUBLICAR, CLAUDE.md.
- **Verificación:** `tsc --noEmit` sin errores. En local con una clave de mentira: `/ingest/static/array.js` responde 200, PostHog queda cargado y sus peticiones llegan (401 por la clave falsa).
- **Siguiente paso exacto:** crear el proyecto en PostHog, poner la clave en Vercel y hacer *Redeploy*; abrir sinesc.vercel.app y ver que llegan eventos en PostHog → Activity.
- **Notas y bloqueos:** un primer intento con el paquete `posthog-js` hizo fallar el despliegue en Vercel (instalación con pnpm); por eso se cambió al cargador sin paquete.

## 2026-10-13 (21) — Claude — plantillas sin llenar no se cuelan en la prueba
- **Rama:** `mejoras-modelo` (y `main`), en los dos repos.
- **Estado:** el primer probador real (13 de octubre) subió en el paso 1 la plantilla de lista sin llenar y quedó guardado el ejemplo como su lista inicial; en el paso 2 subió la plantilla de inventario vacía y el error ("No encontramos ninguna venta") no le dijo qué hacer. Ahora:
  - La plantilla de lista trae la hoja "Pedido" vacía y el ejemplo en la hoja "Ejemplo" (el lector ignora las hojas de ayuda también en las listas).
  - Un archivo con solo encabezados responde "solo trae los encabezados, sin productos…" (export y lista), sin pedir columnas.
  - Importar una lista que solo trae los códigos de ejemplo (plantilla vieja) se rechaza con un mensaje claro.
- **Archivos tocados:** `server/plantillas.js` (`plantillaLista`, `soloEjemplo`), `server/lector.js` (`SIN_LLENAR`, `esHojaDeAyuda` a nivel de módulo), `server/pedidos.js` (importar-lista), pruebas.
- **Base de datos:** nada nuevo.
- **Verificación:** `npm test` → 90/90.
- **Siguiente paso exacto:** pedirle al probador que borre su pedido 1 (la lista inicial tiene los productos de ejemplo) y lo repita con su lista real. Correr las 5 pruebas de usuario grabadas antes del jueves 15 (Entrega 3).
- **Notas y bloqueos:** la plantilla de ventas y existencias (`/plantillas/export.xlsx`) sigue con el ejemplo en las hojas de datos: las pruebas la usan como archivo de muestra. Si alguien la sube sin cambiar, ve un reporte de ferretería inventado.

## 2026-10-13 (20) — Claude — revisión por tipo de usuario y más casos de pedidos borrados
- **Estado:** un pedido ya no se puede borrar después de guardar la lista final (antes sí: un probador podía borrar un resultado). Los borrados no cuentan en el veredicto ni en "cada cuánto pide". Prueba nueva que recorre visitante, probador nuevo, en prueba, después de la prueba y equipo.
- **Verificación:** `npm test` → 88/88; en el navegador, borrar un pedido con archivo deja el Panel y Datos sin ese archivo.

## 2026-10-14 (20b) — Santiago (con Claude) — umbral de "se agota" que elige cada cuenta
- **Rama:** `santiago` (integrada en `main` el 2026-10-14, entrada 28).
- **Estado:** el usuario elige el umbral (1 a 11 semanas; 2 si no elige) en el **paso 2 de cada pedido**, antes de subir el archivo, o en Datos (tarjeta "¿Cuándo te avisamos que algo se agota?"). Cada pedido guarda el suyo (`pedidos.semanas_agota`) y queda fijo al ver el reporte; con "Usar ese inventario" `conUmbral` vuelve a marcar el reporte guardado con el umbral del pedido. Aplica al panel y a productos (en vivo), al reporte del paso 3, a la coherencia y a los recordatorios. En Datos la tarjeta solo aparece si ya hay inventario; un probador nuevo lo elige en el paso 2. Aplica también a los probadores durante sus 14 días (decisión de Santiago): la vista del equipo muestra el umbral de cada probador y marca los reportes que no usaron 2.
- **Archivos tocados:** `server/rotacion.js` (`estadoPorSemanas`, `conUmbral`, parámetro `semanasAgota`), `server/inventario.js` (`leerAjustes`), `server/pedidos.js` (`PUT /:id/semanas-agota`), `server/db.js`, `server/recordatorios.js`, `server/equipo.js`; `components/app/datos.tsx` (tarjeta), `pedido-flujo.tsx` (paso 2), `ui.tsx` (`Contador`), `panel.tsx`, `productos.tsx`, `equipo.tsx`, `contexto.tsx`, `lib/tipos.ts`; `public/js/app.js`; docs: modelo §3.4.1 y §5, README, `ENTREGABLE_Y_APP.md`, CLAUDE.md.
- **Base de datos:** columna `pedidos.semanas_agota` (ALTER IF NOT EXISTS en `ESQUEMA`); el de Datos va en `usuarios.inventario` (JSONB). Hay que reiniciar el servidor para que se cree.
- **Verificación:** `npm test` → 92/92 (5 nuevas); tipos sin errores; `npm run texto` igual que antes. No se miró en el navegador.
- **Siguiente paso exacto:** reiniciar el servidor, crear un pedido nuevo, cambiar el umbral en el paso 2 y ver que el reporte lo use; después, agregar en el Excel del Entregable la fila 5 de "Filas que conviene agregar" de `docs/ENTREGABLE_Y_APP.md`.
- **Notas y bloqueos:** si un probador cambia el umbral, su resultado no es comparable con los demás; decidir si se lee aparte.

## 2026-10-13 (19) — Claude — lo que reportó Jose Manuel al probar
- **Rama:** `main` en el fork (`mio`) y en el repo del grupo.
- **Estado:** el archivo de un pedido borrado ya no aparece en Panel ni en Datos (`db.EXPORT_VIGENTE`), salvo que otro pedido vivo lo use; la pantalla se actualiza al borrar. Confirmado que una lista con el mismo código en varias filas se suma al guardar y se avisa (`revisarLista`).
- **Pendiente del equipo:** dos probadores de Jose Manuel son de la misma empresa (vacío 13 de CLAUDE.md): decidir si se cambia uno o se cuentan como una sola empresa.
- **Verificación:** `npm test` → 87/87 (nueva: archivo de pedido borrado).

## 2026-10-12 (18) — Claude — borrar pedidos sin terminar (pedido de Jose Manuel)
- **Rama:** `main` en el fork (`mio`) y en el repo del grupo.
- **Estado:** botón "Borrar" con confirmación en la lista de pedidos y dentro de cada pedido sin terminar. Los terminados no se borran (son resultados). Borrado suave: `pedidos.borrado_en` (ALTER IF NOT EXISTS); no corre los 14 días y el equipo lo ve marcado.
- **Base de datos:** columna `pedidos.borrado_en`.
- **Verificación:** `npm test` → 86/86 (nueva prueba de borrar); en el navegador, borrar desde la lista con confirmación.

## 2026-10-12 (17) — Claude — cargar datos con menos pasos, guía por programa y plantilla más clara
- **Rama:** `main` en el fork (`mio`) y en el repo del grupo.
- **Estado:**
  - **Guía por programa** (`lib/sistemas.ts` y su copia `public/js/sistemas.js`), revisada con fuentes: Siigo Nube y Alegra (ayudas oficiales), Siigo Pyme (Balance de inventarios, un solo archivo), SAP Business One (Análisis de ventas y Status de inventario), Loggro (Saldos al día por bodega), Siesa (Existencias a la fecha por bodega), ContaPyme (Movimiento detallado de elementos y Saldos de inventario) y Helisa (de exports reales). World Office sigue sin una ruta confirmada para ventas.
  - **Un solo informe primero** donde existe (`unInforme`): Helisa y Siigo Pyme; los dos informes quedan desplegables.
  - **Sinónimos nuevos** para esos informes (`formatos.js`): Nuevo saldo, Cant. Física, Cant. Disp., Número de artículo, Código/Nombre elemento.
  - **Plantilla de inventario** rehecha: título, grupos de columnas por color (obligatorio, meses, opcional), notas en cada encabezado, validación de números, 200 filas marcadas y encabezado fijo. Los encabezados van en la fila 4 (el lector los encuentra).
- **Verificación:** `npm test` → 85/85 (nueva: Balance de inventarios de Siigo Pyme en un archivo); tipos sin errores; guía vista en el navegador.
- **Siguiente paso exacto:** pedir a cada probador su programa y un export real; si es World Office, confirmar con él el informe de ventas por producto y agregarlo con su fuente.

## 2026-10-12 (16) — Claude — última pasada como cliente
- **Rama:** `main` en el fork (`mio`) y en el repo del grupo.
- **Estado:** los pedidos se numeran por usuario ("Pedido 1", no el id de la base: `numero` en `vistaPedido`); la portada dice "archivo" en vez de "export"; la guía de Helisa y la genérica ya no suenan a advertencia; Vercel Analytics solo con `ANALITICA_VERCEL=1` (sin activarlo daba error en la consola); la vista previa de la portada se lee a 1024 px.
- **Verificación:** `npm test` → 84/84; tipos sin errores; en línea, sin desbordes a 375, 1024 y 1280 px y sin errores en la consola.
- **Siguiente paso exacto:** `npm run borrar-datos` no hace falta (la base solo tiene la cuenta del equipo). Empezar con los probadores.

## 2026-10-12 (15) — Claude — Excel y PDF con la marca, gráfica legible y paquetes en el sugerido
- **Rama:** `main` en tu fork (`mio`, despliega `sinesc.vercel.app`) y en el repo del grupo.
- **Estado:**
  - **Excel** (pedido, mínimos y máximos, plantillas) con logo, colores, encabezado fijo, filas alternas, totales y formato de pesos (`server/excel.js`). Las plantillas mantienen el encabezado en la fila 1 para el lector y traen hoja de instrucciones.
  - **PDF del pedido para gerencia:** ya no es imprimir la página; el servidor arma un PDF tamaño carta con logo, resumen, una tabla por proveedor (se repite con "continúa" si sigue en otra página), total, firmas y número de página, y se descarga (`server/pdf.js`, `POST /api/exportar/pedido.pdf`).
  - **Gráfica de ventas:** se dibuja a escala 1:1 (texto de 12 px, antes 5 a 7), cinco líneas guía, el pronóstico escrito ("~800 por semana") y por defecto sin proyectos.
  - **Modelo:** revisado; se agrega el paquete (§7.4): si un producto siempre se vende en múltiplos de un número, el sugerido y el máximo van en paquetes completos (`loteDe`, `aLote` en `pronostico.js`). Lo demás queda igual.
- **Verificación:** `npm test` → 84/84; tipos sin errores; copia limpia con `next start` (como Vercel): PDF, Excel y plantillas responden; en el navegador, el botón descarga el PDF. En línea: la cuenta del equipo existe y no hay errores en la tabla `errores`.
- **Siguiente paso exacto:** cambiar la contraseña de Neon (quedó en el chat) y actualizar `DATABASE_URL` en Vercel.

## 2026-10-12 (14) — Claude — todo en Vercel + Neon, sin Render
- **Rama:** `main` y `mejoras-modelo` iguales, en GitHub.
- **Estado:**
  - Render no compilaba la página (el build de Next llega a ~2 GB y el plan gratis tiene 512 MB) y el proyecto de Vercel del grupo no despliega commits de otros. Se pasó todo a **Vercel + Neon**: la API de Express corre como la función `pages/api/[[...ruta]].js` dentro del proyecto de Next. En local nada cambia (`npm run dev` con `server/index.js`).
  - `next.config.mjs`: `serverExternalPackages` (express, multer, pg, xlsx, pglite), raíz del repo para el rastreo de archivos, `ejemplos/` incluido en la función, `/plantillas` y `/salud` reescritos a `/api/…`. `vercel.json` instala también las dependencias de la raíz. La función pesa ~50 MB.
  - Archivos de más de 1 MB: el navegador los comprime con gzip (`prepararArchivo`, `lib/api.ts`) y la API los descomprime (`archivoSubido`, `server/pedidos.js`), por el límite de 4,5 MB de Vercel. Los `.xls` reales de 4 a 6 MB bajan a menos de 1 MB. Un 413 da un mensaje claro.
  - Enlaces de correo y de calendario: sin `APP_URL`, usan la dirección de producción de Vercel (`VERCEL_PROJECT_PRODUCTION_URL`).
  - Se borró `render.yaml`; `docs/PUBLICAR.md` reescrito para Vercel + Neon.
- **Verificación:** `npm test` → 82/82 (nueva: archivo `.gz` se guarda como el original, `.gz` roto da 400, `/api/salud` y `/api/plantillas`); tipos sin errores; en una copia limpia del repo, `next build` + `next start` solos (como en Vercel) con crear cuenta, pedido, archivo comprimido, reporte, ejemplos del equipo (incluido el de 3.000 productos) y resultados. En local con `server/index.js`, todo igual.
- **Siguiente paso exacto:** David hace fork del repo y crea el proyecto en Vercel siguiendo `docs/PUBLICAR.md` (Root Directory `inventory-forecasting-landing-page`, Neon desde *Storage*, `TEAM_EMAILS`). Luego, probar en línea y `npm run borrar-datos -- --todos --confirmar` antes de los probadores.
- **Notas y bloqueos:** el servicio de Render del grupo ya no se usa; el dueño lo puede suspender. El proyecto de Vercel del grupo (`proyecto-pm.vercel.app`) tampoco: queda el nuevo.

## 2026-10-12 (13) — Claude — sexto negocio de ejemplo y guía para publicar
- **Rama:** `mejoras-modelo`. En GitHub está una versión anterior; falta `git push origin mejoras-modelo`.
- **Estado:**
  - **Sexto negocio de ejemplo:** `distribuidora` en `server/demo.js` (Surtiferretería del Eje Ltda., inventada), armado con lo que contó en su entrevista el probador de la distribuidora mayorista de ferretería: pide cada semana a cada proveedor (`cadaCuanto: 1`), saca de Helisa el listado de inventario con las salidas del periodo, una línea se dispara de un día para otro y una compra de promoción sigue quieta. Nombre, productos, proveedores y cifras son inventados; no hay datos de ninguna empresa real.
  - En **Ejemplos**, ese negocio también se baja o se carga como **listado de inventario con salidas de 3 meses** (formato de Helisa, sin fecha por venta): se carga con su periodo, sin preguntar.
  - Un producto que "se agota" pero cuyo sugerido es 0 (pide cada semana y el proveedor llega rápido) ya no dice "va en el pedido de esta semana".
  - Cada página de cuenta (crear, olvidé, restablecer) tiene su propio subtítulo; "Export de Helisa" ahora dice "Archivo de Helisa"; después de cargar un ejemplo, la página sube al aviso.
  - **`docs/PUBLICAR.md`:** pasos para subir la rama, el merge, Render, Neon (copia con una rama y `borrar-datos`) y Vercel, y cómo deshacer.
- **Verificación:** `npm test` → 81/81 (la demo tiene 6 negocios; el listado se carga con su periodo y deja `cadaCuanto` en 1); tipos y `next build` sin errores; el servidor arranca en producción. En el navegador: la demo de la distribuidora, su pedido sugerido semanal, cargar el listado desde Ejemplos y su panel, y las páginas de cuenta.
- **Siguiente paso exacto (equipo):** seguir `docs/PUBLICAR.md` de arriba abajo.
- **Notas y bloqueos:** si el build de Render se queda sin memoria en el plan gratis, la versión anterior sigue en línea (ver la guía).

## 2026-10-12 (12) — Claude — ejemplos para el equipo, sin foto de la lista y textos revisados como cliente
- **Rama:** `mejoras-modelo` (solo en local).
- **Estado:**
  - **Ejemplos (solo equipo):** página `/ejemplos` en el menú del equipo (`components/app/ejemplos.tsx`, `server/ejemplos.js`). Los cinco negocios de la demo se bajan como Excel (hoja de ventas con fecha y de existencias con costo y proveedor) o se cargan directo como el inventario de la cuenta, con los tiempos de entrega de sus proveedores. Lo mismo con los archivos de `ejemplos/` (Siigo, SAP, ventas por mes, catálogo grande); la lista inicial de mínimos solo se descarga, para importarla en el paso 1.
  - **Solo el equipo ve "Resultados de la prueba" y "Ejemplos":** un probador que entra a `/equipo` o `/ejemplos` vuelve a su panel (`solo-equipo.tsx`); la API ya respondía 403.
  - **Sin foto de la lista inicial:** se quitó (pantalla, rutas, tabla `imagenes_lista` y su prueba). Leerla con OCR falla con listas a mano y en el primer pedido no hay catálogo para corregir los códigos. Queda como fila de Cambios (`docs/ENTREGABLE_Y_APP.md`).
  - **Textos revisados como cliente:** "pide ya" ya no dice "te quedas sin él antes de que llegue" cuando sí alcanza; el panel explica el margen de una semana; el pedido sugerido explica por qué unas líneas vienen llenas; el mensaje de WhatsApp; los datos del archivo en Datos; la ferretería de la demo ya no dice "más de 3.000 referencias" con 37 productos. En la página principal (solo frases): ya no dice que la herramienta nunca sugiere cuánto pedir ni que no ajusta por temporada; el botón secundario lleva a la demo; se quitaron frases de relleno.
  - `npm run texto` revisa también las pantallas de la aplicación.
- **Base de datos:** se quitó `imagenes_lista` del esquema (la rama no se ha desplegado, así que Neon no la tiene).
- **Verificación:** `npm test` → 81/81 (sale la de la foto, entra la de ejemplos: el archivo de la ferretería da las mismas semanas que la demo y un probador recibe 403); tipos y `next build` sin errores. En el navegador: cargar ejemplos y su panel, pedido sugerido, ficha, Datos; un probador no entra a `/equipo` ni a `/ejemplos`; sin desbordes a 375 px en la página principal, la demo, el panel, los resultados y los ejemplos.
- **Siguiente paso exacto (equipo):** el de la entrada 10, más la fila de Cambios por la imagen de la lista.
- **Notas y bloqueos:** en desarrollo, la recarga automática de Next (websocket `/_next/hmr`) no conecta a través del servidor propio; hay que recargar la página a mano. No afecta producción.

## 2026-10-12 (11) — Claude — página principal como estaba y repaso completo de la aplicación
- **Rama:** `mejoras-modelo` (solo en local).
- **Estado:**
  - **Página principal:** vuelve a ser la de antes de la reestructuración (componentes de `components/landing/` y `app/page.tsx` como en `2119f9a`, con su letra y sus colores). Se quitó `/expo`, `panel-section.tsx` y el QR. Se conservan los enlaces relativos (`lib/app.ts`), la redirección de los enlaces viejos `#/` y los rewrites para Vercel.
  - **Tema de la aplicación:** los colores y las letras nuevas van solo dentro de `.tema-app` (`globals.css`), en la raíz del marco, la demo, las pantallas de cuenta y la de error. La página principal no los hereda.
  - **Arreglos encontrados al recorrer el flujo completo con una cuenta de probador:** "Seguir: arma tu lista final" no avanzaba la primera vez que se veía el reporte (ahora recarga el pedido antes de pasar al paso 4); el campo "Proveedor o nombre del pedido" quedaba apretado; el filtro "Pide ya" salía durante la prueba; en la vista del equipo, "cada 0 días" y "1 cambiaron".
  - Se quitó el recorrido de tres pasos de la demo y toda mención de la feria en código y documentos.
- **Verificación:** `npm test` → 81/81; tipos sin errores; `next build` pasa. En el navegador: la página principal con su letra y colores originales; los 5 pasos de punta a punta con una cuenta de probador (lista inicial, archivo de Siigo de `ejemplos/`, reporte y recordatorio, lista final, ¿por qué?), panel, productos y datos en modo prueba, la vista del equipo y la demo en 375 px sin desbordes.
- **Siguiente paso exacto (equipo):** el mismo de la entrada 10: subir la rama, desplegar en Render, `npm run borrar-datos -- --todos --confirmar` contra Neon, exports reales de los probadores y las filas de Cambios del Excel.
- **Notas y bloqueos:** en Windows, `npm install --prefix inventory-forecasting-landing-page` con `node_modules` ya creado puede fallar con "Cannot read properties of null (reading 'matches')" (error de npm); `npm run build --prefix inventory-forecasting-landing-page` compila igual. En Render la instalación es limpia.

## 2026-10-11 (10) — Claude — lo que faltaba para salir: seguridad, velocidad, errores y borrar datos

- **Rama:** `mejoras-modelo` (solo en local).
- **Estado:** el plan está terminado en el código. Lo que falta depende del equipo (ver "Siguiente paso").
  - **Límite de intentos** al entrar (8 por correo cada 15 min), crear cuenta y pedir enlace (`server/limites.js`).
  - **Velocidad:** respuestas JSON grandes comprimidas (el inventario de 3.000 productos baja de 2,7 MB a 262 KB) y el inventario calculado queda en memoria por archivo, alcance y ajustes.
  - **Errores:** tabla `errores` con los del servidor y los de las pantallas (pantalla de error amable en la app, la demo y las de cuenta); se ven al final de "Resultados de la prueba".
  - **Borrar datos:** `npm run borrar-datos` (`--todos` o `--email`, con `--confirmar`), en cascada y sin tocar al equipo. Sirve para limpiar antes de la prueba y para borrar los datos de un probador al terminar.
  - **Helisa, listado de inventario con salidas del periodo:** ya se leía (pregunta el periodo); ahora además propone el periodo que trae el título del informe ("Del 01/ENE/2026 al 30/SEP/2026").
  - **Vercel:** si la página sigue publicada allá sin configurar nada, `/api` y `/plantillas` van a la app de Render; los botones de entrar y crear cuenta funcionan en las dos direcciones.
- **Base de datos:** tabla `errores` (IF NOT EXISTS).
- **Verificación:** `npm test` → 81/81; tipos sin errores. En el navegador (375 px): la demo; respuesta comprimida comprobada con curl.
- **Siguiente paso exacto (equipo):** 1) subir la rama y desplegar en Render; si el build se queda sin memoria en el plan gratis, subir de plan o avisar; 2) probar con una cuenta del equipo y una de probador; 3) `npm run borrar-datos -- --todos --confirmar` contra Neon antes de los 5 probadores; 4) pedirle a cada probador un export real y subirlo con una cuenta del equipo; 5) las filas de Cambios del Excel (`docs/ENTREGABLE_Y_APP.md`).
- **Notas y bloqueos:** el correo del recordatorio sigue saliendo al aceptar (sin cron); si quieren el correo el mismo día del aviso, hay que aceptar una tarea programada (por ejemplo, GitHub Actions una vez al día).

## 2026-10-11 (9) — Claude — la app contra el Entregable 2 corregido

- **Rama:** `mejoras-modelo` (solo en local).
- **Estado:** se revisó la app punto por punto contra `(Corrección) Entregable 2 - Grupo 1.xlsx` (sin editarlo). El resultado está en `docs/ENTREGABLE_Y_APP.md`.
  - **Alcance de la prueba:** el plan dice que el Alpha 0.1 no dice cuánto pedir ni proyecta por temporada ni usa el tiempo de entrega. Ahora, durante sus 14 días, un probador ve solo eso: semanas, "se agota" y "sobra" (`alcance: 'prueba'`), con un aviso en el panel de cuándo se activa el resto. Antes veía pronóstico y "pide ya".
  - **"La importa o adjunta una imagen":** foto o PDF de la lista en el paso 1 (tabla `imagenes_lista`, hasta 5, solo antes de ver el reporte). El equipo la ve junto al pedido. La métrica sigue saliendo de lo escrito.
  - **Segundo criterio de pivote:** el equipo marca cada "¿por qué?" como "el dato le sirvió" o "por probar la herramienta" (`pedidos.clasificacion`). Los marcados por probar no cuentan para la meta y sí para el pivote; el resumen avisa cuántos que cumplen faltan por clasificar.
  - **"Qué seguimos sin saber":** por probador, productos en cero, que se agotan, que sobran, dinero quieto (si hay costos) y cada cuánto pide.
  - **Stickiness:** se dejó como estaba (calendario + correo al aceptar, sin cron). Brevo solo programa correos 72 horas antes. Quedó anotado como diferencia con el Entregable.
- **Base de datos:** `pedidos.clasificacion`, tabla `imagenes_lista` (con IF NOT EXISTS).
- **Verificación:** `npm test` → 78/78. En el navegador (375 px), con una cuenta de probador en su prueba: el panel muestra el aviso, "Ya en cero" en vez de "Pide esta semana", la tabla sin riesgo y el gráfico sin pronóstico; el paso 1 tiene "Foto de tu lista".
- **Siguiente paso exacto:** subir la rama, desplegar en Render y probar con una cuenta del equipo y una de probador. El grupo agrega en el Excel las filas de Cambios que lista `docs/ENTREGABLE_Y_APP.md` (al final).
- **Notas y bloqueos:** la cuenta local `probador3-…@grupo1.test` quedó con un pedido #133 vacío de esta prueba.

## 2026-10-11 (8) — Claude — lo que faltaba del plan: proveedores, mínimos y máximos, panel y página

- **Rama:** `mejoras-modelo` (solo en local).
- **Estado:**
  - **Proveedores asignables:** casi ningún export trae el proveedor, así que "pide ya" no servía con datos reales. Ahora se dice desde la ficha (producto por producto) o en Datos (proveedor nuevo con su tiempo y, si quieren, "sus códigos empiezan por…"). Manda lo asignado a mano, después el archivo, después el comienzo de código.
  - **Mínimos y máximos** (lo que pidieron los entrevistados que trabajan con el informe de mínimos): en la ficha y en un Excel para cargarlos al programa contable. Solo cuando hay cantidad sugerida (no para probadores en su prueba).
  - **Panel:** cobertura típica, inventario a costo, productos sin proveedor (con enlace a Datos) y una tarjeta de recordatorio (cuándo llega el aviso, o qué productos llegan a 2 semanas en 3 meses). "Atender hoy" muestra máximo 4 tarjetas.
  - **Página principal (fase 6):** sección "Además del reporte" con un adelanto del panel y enlace a la demo; "El panel" en el menú; "en rojo" pasó a "en naranja" (el color nuevo); titular más contenido.
  - **Interacción:** en Productos, las flechas recorren la lista y la ficha abierta las sigue; Escape cierra la ficha.
  - Guardar ajustes ahora mezcla con lo guardado (antes, cambiar un tiempo habría borrado los proveedores asignados).
- **Archivos tocados:** `server/inventario.js`, `inventario-rutas.js`, `exportar.js`, `demo.js`; `components/app/` (panel, productos, datos, contexto), `components/landing/` (panel-section nueva, hero, header, textos de color), `lib/tipos.ts`, `lib/descargar.ts`; pruebas; modelo §7.4, README, CLAUDE.md.
- **Base de datos:** sin cambios de esquema (todo va en `usuarios.inventario`).
- **Verificación:** `npm test` → 75/75. En el navegador (375 px): cambiar el proveedor del compresor en la demo de refrigeración recalcula entrega, mínimo, máximo y sugerido; agregar un proveedor con comienzo de código en Datos; panel con la tarjeta "Lo que viene". La sección nueva de la página se midió en el DOM a 1280 px (dos columnas); la captura de pantalla del navegador interno falla a ese ancho.
- **Siguiente paso exacto:** el mismo de la entrada 7: subir la rama, desplegar en Render y probar con una cuenta del equipo y una de probador.
- **Notas y bloqueos:** la fila de "Cambios" del Entregable debería mencionar también mínimos y máximos y los proveedores asignables.

## 2026-10-11 (7) — Claude — app nueva en Next.js, pronóstico, pedido sugerido y demo

- **Rama:** `mejoras-modelo` (solo en local).
- **Estado:** la reestructuración (`docs/PLAN_REESTRUCTURACION.md`) quedó en una primera versión completa.
  - **Un solo servidor:** `server/index.js` carga Next.js (`inventory-forecasting-landing-page/`) dentro de Express. La página, `/demo`, las pantallas de cuenta y la aplicación salen de la misma dirección. Sin la web instalada o compilada se sirve `public/` como antes.
  - **Aplicación nueva** (`components/app/`): panel "Tu inventario hoy", productos con ficha (gráfico, pronóstico, riesgo, "¿de dónde sale el número?"), los 5 pasos de la prueba con el diseño nuevo, pedido sugerido (Excel, WhatsApp, PDF para gerencia), Datos (subir, guía por programa, tiempos de entrega por proveedor, historial), Mi cuenta y Resultados de la prueba.
  - **Pronóstico** (`server/pronostico.js`, §7 del modelo): Gamma-Poisson con dispersión, temporada del catálogo con 18 meses o más, riesgo de agotarse antes de reponer, cantidad sugerida al 90 % y acierto medido escondiendo las últimas 8 semanas. No cambia las semanas del reporte.
  - **Reglas de la prueba:** un probador no ve su inventario (ni puede subirlo desde Datos) antes de guardar su primera lista inicial, y no ve la cantidad sugerida durante sus 14 días. El equipo sí.
  - **Demo:** `server/demo.js`, cinco negocios inventados (ferretería, muebles, mobiliario de oficina, refrigeración, papelería) armados con lo que contaron los entrevistados, sin nombres reales. La página principal enlaza "Verlo con datos de ejemplo".
  - **Lector:** columnas opcionales de costo, costo total y proveedor (`formatos.js`); la plantilla para Excel las trae. Se arregló `PREFIJO_DE_SECCION`, que había perdido las barras invertidas.
  - Paleta de la misma familia, mejorada (coral = se agota, ámbar = pide ya, azul = sobra) y fuentes Figtree + Plus Jakarta Sans, también en la página principal.
- **Archivos tocados:** `server/` (index, app, inventario, inventario-rutas, pronostico, series, demo, exportar, pedidos, lector, formatos, plantillas, db, cuentas, recordatorios, equipo); la carpeta de la web completa (`app/`, `components/app/`, `lib/`); `test/pronostico.test.js` y casos nuevos en `test/api.test.js`; README, CLAUDE.md, modelo §6–7, plan; `package.json` y `render.yaml` (build de la web).
- **Base de datos:** `exports.series`, `exports.catalogo`, `usuarios.inventario` e índice `exports_usuario` (en ESQUEMA, con IF NOT EXISTS). Los exports viejos se completan solos la primera vez que se pide el inventario, sin tocar el reporte que vio el probador.
- **Verificación:** `npm test` → 72/72. `next build` sin errores. En el navegador (escritorio y 375 px): demo de los 5 negocios, productos y ficha, pedido, datos con cambio de tiempos; con una cuenta de probador nueva, los 5 pasos de punta a punta (403 antes de la lista inicial, sin sugerido). Los enlaces viejos con `#/` se redirigen.
- **Siguiente paso exacto:** subir la rama y desplegar en Render (el build ahora es `npm install && npm run build`, ya en `render.yaml`). Probar en Render con una cuenta del equipo y una de probador. Decidir si Vercel sigue publicando la página sola (entonces configurar `API_URL`) o si basta la de Render.
- **Notas y bloqueos:** falta la fila en "4 · Cambios y Reflexión" del Entregable (lo hace el equipo): cambio de stack a Next.js, panel y pronóstico, y cómo se protege la métrica (inventario después de la lista inicial y sugerido apagado 14 días). El primer arranque de Render tarda más por el build de Next.

## 2026-10-11 (6) — Claude — plan de reestructuración y prototipo en Stitch

- **Rama:** `mejoras-modelo` (solo en local).
- **Estado:** se acordó reestructurar la app (ver `docs/PLAN_REESTRUCTURACION.md`): Next.js junto con la landing,
  panel, ficha de producto, pedido sugerido detrás de un interruptor (apagado para probadores durante la prueba),
  pronóstico Gamma-Poisson, sin IA generativa. La prueba con los 5 probadores no ha empezado.
  Fase 0 en curso: proyecto de Stitch "SINESC · Rotación de inventario" (id 11994230030974630149) con el sistema de
  diseño SINESC (verde azulado #0F766E, coral para "se agota", azul para "sobra", Plus Jakarta Sans + Inter).
  Además: la explicación del cálculo en el reporte quedó en dos líneas; skills de Emil Kowalski instaladas.
- **Siguiente paso exacto:** terminar las 4 pantallas en Stitch (panel, productos con ficha, preparar pedido, datos),
  aprobarlas en grupo y arrancar la fase 1 (base Next.js).

## 2026-10-11 (5) — Claude — landing revisada y prueba con archivos de World Office

- **Rama:** `mejoras-modelo`, lista para subir (solo en local).
- **Estado:**
  - **Landing:** se corrigió lo que ya no coincidía con la app: "¿Qué archivo necesito?" (ahora acepta totales del
    periodo, informes mezclados y la plantilla para Excel), la lista de programas en "Cómo funciona", los tres
    ajustes en "El cálculo", la calculadora ("la cuenta básica del reporte") y el punto de la plantilla en Precio.
    `next build` pasa sin errores.
  - **Importador:** probado con las plantillas oficiales de World Office (worldoffice.com.co/descargas). Ahora
    entiende los títulos con prefijo ("Detalle: Cantidad", "Encab: Tipo Documento") y una columna "Producto" que
    trae códigos. Esos archivos no se versionan; la prueba usa datos inventados con las mismas columnas.
  - Guía de Alegra con la ruta confirmada del inventario: Reportes › Reportes administrativos › Inventario valorizado.
  - No se encontraron en internet exports públicos de Siigo ni de Alegra para probar: queda pendiente con un archivo
    real de un probador.
- **Verificación:** `npm test` → 60/60; landing compila (`next build`).
- **Siguiente paso exacto:** subir la rama (`git push -u origin mejoras-modelo`) y abrir el pull request.

## 2026-10-11 (4) — Claude — importar cualquier formato, plantilla, logo y reporte más claro

- **Rama:** `mejoras-modelo` (solo en local).
- **Estado:**
  - **Importador:** lee informes de impresora con títulos corridos, ruido de página y totales; saca el código de
    los paréntesis del nombre; completa años cortados; pregunta una vez qué documentos son ventas cuando el informe
    mezcla compras y ventas, y lo recuerda; sugiere columnas por su contenido. Probado con el "Movimiento detalle"
    real de Helisa: 26.335 filas, 3.662 productos, 10.341 años completados, sin tocar nada a mano.
  - **Plantilla para llenar a mano** (`/plantillas/inventario.xlsx`): existencias y una columna por mes. En el paso 2
    hay una opción "Lo llevo en Excel o a mano" y un enlace a la plantilla siempre visible.
  - **Guías del paso 2** más cortas: dos columnas (ventas, existencias), dos o tres pasos cada una.
  - **Logo:** monograma S (opción B) en la app, el favicon y la landing (SVG y PNG).
  - **Reporte:** semanas de inventario en negrita y más grandes; la explicación queda plegada.
- **Base de datos:** `ALTER TABLE exports ADD COLUMN documentos` (se aplica sola al arrancar).
- **Verificación:** `npm test` → 59/59. Navegador: guías, plantilla, pregunta de documentos con un kardex,
  formulario con columnas sugeridas, reporte; sin desborde a 390 px.
- **Siguiente paso exacto:** probar con un export real de Alegra y de Siigo Nube para confirmar los nombres de
  sus columnas, y subir la rama.

## 2026-10-11 (3) — Claude — programas contables, ventas por periodo y pendientes del profesor

- **Rama:** `mejoras-modelo` (tres commits sobre `main`, solo en local).
- **Estado:**
  - **Guía por programa contable** (paso 2, `public/js/sistemas.js`): el usuario elige su programa y ve cómo sacar
    los dos archivos. Con rutas confirmadas: Siigo Nube y Alegra (ayuda oficial), World Office (existencias, por una
    guía de usuario y un boletín oficial) y Helisa (cómo lo hacen sus usuarios, sin ruta pública). SAP Business One,
    Siigo Pyme, Siesa, Loggro, ContaPyme y "Otro" muestran la guía general. Cada guía cita su fuente; lo no
    confirmado se dice. La elección queda en `usuarios.sistema` y el equipo la ve.
  - **Ventas como total de un periodo:** si la tabla trae código y cantidad sin fechas (Ventas por ítems de Alegra,
    listado de inventario con salidas), la app pregunta el periodo y usa el promedio simple sobre él. Probado en el
    navegador de punta a punta.
  - **Pendientes del profesor (TODO.md):** nombre SINESC en app y landing, "Ventas/semana", sin "plata", nuevo título
    de "El problema", más contraste y letra más grande, página "Mi cuenta", cambiar y restablecer contraseña (el
    equipo genera el enlace), botón claro para crear cuenta, enlace a la página principal. Texto de la portada
    revisado con las reglas de stop-slop; quedó como `npm run texto`.
- **Base de datos:** `ALTER TABLE` para `exports.periodo` y `usuarios.sistema`, tabla nueva `restablecimientos`.
  Se aplican solas al arrancar, también en Neon.
- **Verificación:** `npm test` → 53/53. Navegador: entrar, olvidé mi contraseña, Mi cuenta, guía de Alegra, subir
  un listado sin fechas → periodo → reporte, vista del equipo con el enlace para restablecer; sin desborde a 390 px.
  Landing compila sin errores de consola.
- **Siguiente paso exacto:** responder las preguntas abiertas del TODO (tocineta, frase cortada, Clerk, logo,
  despliegue) y probar la guía con un export real de Alegra: no sabemos los nombres exactos de sus columnas, y si
  "Inventario valorizado" trae la existencia como "Cantidad", la app pedirá elegir las columnas.
- **Notas y bloqueos:** el detalle de facturas de Helisa no trae existencias; la guía pide el listado con saldo.

## 2026-10-11 (2) — Claude — recordatorio sin cron, lectura de facturas de Helisa y alcance cerrado

- **Rama:** `mejoras-modelo` (dos commits sobre `main`, solo en local; todavía no está en GitHub).
- **Decisión del equipo:** el modelo matemático y lo demás **quedan así** para la prueba. No se agregan funciones nuevas;
  lo que sigue son correcciones para que los probadores puedan usarlo (ver "Siguiente paso").
- **Estado:**
  - **Recordatorio sin cron:** ya no hay tareas programadas, ruta para cron ni workflow de GitHub. Al decir que sí,
    el usuario descarga un archivo de calendario (.ics) con un recordatorio por semana (8 a. m., 3 días antes de
    que cada producto llegue a 2 semanas, solo para los próximos 3 meses). Si se configura Brevo, la invitación
    llega además al correo en ese momento. Probado en el navegador: 23 productos → 8 recordatorios.
  - **Helisa, detalle de facturas:** el lector tomaba la columna "Cantidad Disponible" como existencias (en ese
    informe es lo facturado menos lo devuelto) y el reporte salía con el inventario inventado, sin avisar. Ahora
    es la cantidad vendida, y la app pide el archivo de existencias aparte. Regla en `SEGUN_CONTEXTO`
    (`server/formatos.js`); prueba con datos inventados en `test/lector.test.js`.
- **Archivos tocados:** `server/{recordatorios,correo,pedidos,equipo,db,formatos,lector}.js`, `public/js/app.js`,
  pruebas, `docs/modelo-rotacion.md` §5, `README.md`, `CLAUDE.md`, `render.yaml`, texto de la landing. Se borró
  `.github/workflows/recordatorios.yml`.
- **Base de datos:** la tabla `recordatorios` ahora tiene `primer_aviso` y desapareció `avisos`. Nunca llegaron
  a Neon, así que no hace falta migrar nada. En local hubo que borrar `data/pglite/`.
- **Verificación:** `npm test` → 48/48. En el navegador: tarjeta del recordatorio, descarga del .ics (text/calendar,
  8 eventos), vista del equipo.
- **Siguiente paso exacto (en este orden):**
  1. Subir la rama, revisarla en grupo y fusionarla con `main` antes de la prueba.
  2. Leer los formatos de Helisa que faltan: (a) el listado de inventario con la casilla de salidas de un periodo
     (sin fecha por venta: hay que pedirle al usuario el periodo) y (b) los informes con forma de página de impresión.
  3. Pedirle a cada probador su export real y subirlo con una cuenta del equipo antes de empezar.
  4. Borrar los datos de prueba de Neon antes de empezar (README, "Antes de la prueba").
- **Notas y bloqueos:** los datos reales de cualquier empresa se miran solo en local. Nunca se copian al repo,
  ni siquiera en pruebas: los ejemplos de prueba se inventan con las mismas columnas.

## 2026-10-11 (1) — Claude — modelo con ajustes, coherencia y aviso por correo

- **Rama:** `mejoras-modelo`, sacada de `main` (4271337). Commit solo en local; **todavía no está en GitHub**.
- **Estado:** todo funciona en local (app en `localhost:3000`, landing en `localhost:3001`).
  - **Modelo** (`server/rotacion.js`, §3.6 de `docs/modelo-rotacion.md`): ventas por semana con tres ajustes:
    lo reciente (13 semanas) cuenta doble, un mes pico aislado se recorta a 3× lo normal y los productos nuevos
    se promedian desde su primera venta (mínimo 13 semanas). El reporte lo explica paso a paso. Los reportes
    viejos guardados en la base no se recalculan y se siguen explicando con el promedio simple.
  - **Medición** (`server/listas.js`, `server/equipo.js`, §4.3): coherencia con el reporte y magnitud del cambio
    en la vista del equipo. No cambian el veredicto y el probador no las ve.
  - **Stickiness** (`server/recordatorios.js`, `server/correo.js`, §5): aviso por correo 3 días antes de que un
    producto con más de 4 semanas llegue a 2. Se ofrece en el paso 3. En local los correos se imprimen en la
    consola del servidor (no hay `BREVO_API_KEY`).
  - Landing: textos actualizados (ya no dice "no manda alertas").
- **Archivos tocados:** `server/{rotacion,listas,pedidos,equipo,app,index,db}.js`, nuevos `server/recordatorios.js`
  y `server/correo.js`; `public/js/{reporte,app}.js`, `public/estilos.css`; pruebas en `test/`; `docs/modelo-rotacion.md`,
  `README.md`, `CLAUDE.md`, `render.yaml`, `.github/workflows/recordatorios.yml`; dos componentes de la landing.
- **Base de datos:** tablas nuevas `recordatorios` y `avisos` (se crean solas al arrancar). `pedidos.comparacion`
  ahora guarda también `magnitud` y `coherencia`; los pedidos viejos se completan solos al abrir la vista del equipo.
- **Verificación:** `npm test` → 48/48. En el navegador: reporte desglosado (cuentas revisadas a mano), tarjeta del
  aviso (activar y desactivar), vista del equipo con coherencia y magnitud, sin desborde a 390 px.
- **Siguiente paso exacto:** que el equipo revise la rama y decida si se sube y se fusiona con `main`. Después:
  decidir el despliegue (seguir con Vercel + Render + Neon o pasar todo a Vercel + Supabase) antes de empezar la
  prueba con los 5 probadores.
- **Notas y bloqueos:**
  - Para que los correos salgan en producción hay que crear la cuenta de Brevo y configurar `BREVO_API_KEY`,
    `CORREO_REMITENTE`, `APP_URL` y `CRON_SECRET` en Render, y `APP_URL` y `CRON_SECRET` como secretos de GitHub
    Actions (pasos en el README). El cron de GitHub solo corre desde `main`.
  - El envío real por la API de Brevo no se ha probado (no hay clave). El resto está cubierto por pruebas.
  - Pendiente para después: lector de los informes de Helisa (lo usan dos probadores).
  - Los ejemplos de `ejemplos/` son inventados y estables: el efecto real de los ajustes del modelo solo se verá
    con exports de los probadores.
