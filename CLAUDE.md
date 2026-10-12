# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este proyecto

MVP Alpha 0.1 del Grupo 1 (curso Diseño de Productos, Uniandes). Es una app web donde un gerente o administrador de inventario sube el export de ventas y existencias de su software contable y ve sus productos ordenados por **semanas de inventario restantes**.

El producto existe para probar una sola hipótesis (Entregable 2, pestaña 2):

> Creemos que un reporte de rotación por producto calculado desde el export del software contable, para gerentes y administradores de inventario que coordinan el reabastecimiento, logrará que **3 de 5 cambien 5 o más líneas de su pedido en 14 días**, medido por las líneas que agrega, quita o ajusta.

**Pivote:** 3 o más de los 5 cambian 0 o 1 línea, o cambian líneas "por probar la herramienta" y no porque el dato les pareciera correcto.

Cualquier cambio se juzga por si ayuda o estorba a medir esa hipótesis. Una funcionalidad que no sirve para medirla no entra en Alpha 0.1.

Fuentes de contexto fuera del repo, en la carpeta padre (`../`):
- `../Entregable 2.xlsx`: ICP + JTBD revisado, hipótesis MVP, plan de prueba, Market Product Fit, cambios y reflexión, rúbrica. **El plan de prueba de la pestaña 2 es lo que se califica en la Entrega 3.**
- `../Conversaciones Grupo 1.xlsx`: registro de entrevistas, con fecha, actor y hallazgo clave. Las transcripciones están en un Drive enlazado desde el Entregable 2.
- No son legibles con las herramientas de texto. Para leerlos: `node -e 'const X=require("xlsx");const wb=X.readFile("../Entregable 2.xlsx");for(const s of wb.SheetNames)console.log(s,X.utils.sheet_to_csv(wb.Sheets[s]))'` desde la raíz del repo, después de `npm install`. Las fechas salen como números seriales de Excel: 46281 = 2026-09-16.

**Al empezar una sesión, lee la entrada de más arriba de `docs/HANDOFF.md`; al terminar, agrega una entrada nueva arriba con la plantilla de ese archivo** (estado, archivos, verificación y siguiente paso exacto).

`README.md` documenta el despliegue (Render + Neon), las variables de entorno y la tabla "Cómo se cumple el documento", que relaciona cada requisito con el archivo donde se implementa. `docs/modelo-rotacion.md` es la fuente de verdad del modelo matemático y de la métrica.

## Comandos

Requiere Node.js 20 o superior. Las pruebas fallan si no se ha corrido `npm install`.

```bash
npm install
npm install --no-package-lock --prefix inventory-forecasting-landing-page   # la web (Next.js); pnpm se colgaba en Windows
TEAM_EMAILS=tu-correo@ejemplo.com npm run dev    # http://localhost:3000: API + Next.js en modo desarrollo; PGlite en data/pglite/
npm run build && NODE_ENV=production npm start  # como en Render
npm test                                         # node --test test/*.test.js (72 pruebas; no necesitan la web)
node --test test/rotacion.test.js                # un solo archivo
node --test --test-name-pattern="M = 5" test/listas.test.js   # una prueba por nombre
npm run ejemplos                                 # regenera los exports inventados de ejemplos/
npm run texto                                    # revisa los textos buscando marcas de IA (reglas de stop-slop)
```

No hay linter, formateador ni paso de compilación. `DATA_DIR=memory://` deja la base en memoria (lo usan las pruebas). Para empezar con la base local vacía, borra `data/pglite/`.

## Arquitectura

**Backend** (`server/`, CommonJS con `'use strict'`): Express 5. Usa PostgreSQL con `pg` si existe `DATABASE_URL`; si no, usa PGlite embebido. `db.js` expone la misma interfaz para los dos (`query`, `uno`, `tx`). El esquema es una lista de `CREATE TABLE IF NOT EXISTS` que se corre al arrancar. **No hay migraciones**: para cambiar una columna existente hay que agregar un `ALTER TABLE … IF NOT EXISTS` a `ESQUEMA`, porque la base de Neon ya tiene las tablas creadas.

**Un solo servidor** (`server/index.js`): Express atiende `/api`, `/plantillas` y `/salud`; todo lo demás lo atiende Next.js (`inventory-forecasting-landing-page/`, cargado con `require.resolve('next', { paths: [WEB] })`). Si Next no está instalado o, en producción, no está compilado, se sirve la versión anterior de `public/` (las pruebas automáticas usan esa: `crearApp()` sin `web`). La CSP estricta (`default-src 'self'`) se aplica a la API; las páginas de Next llevan una que permite sus scripts en línea.

**Frontend** (`inventory-forecasting-landing-page/`, Next.js 16 + Tailwind 4): leer `AGENTS.md` de esa carpeta antes de tocar APIs de Next. Rutas en `app/`: la página (`page.tsx`), `demo/` (sin cuenta), `(cuenta)/` (entrar, crear cuenta, olvidé, restablecer) y `(app)/` (con sesión: panel, productos, pedidos, datos, cuenta, equipo). Las pantallas son componentes de cliente en `components/app/` que llaman a la API con `lib/api.ts`. `contexto.tsx` tiene la sesión y el inventario (de la cuenta o de un negocio de ejemplo: las mismas pantallas sirven para los dos). `hoja.tsx` es la hoja tipo Excel; `pedido-flujo.tsx`, los 5 pasos; `reporte.tsx`, el reporte de la prueba. `lib/tipos.ts` copia la forma de las respuestas de `server/inventario.js`: si cambias una, cambia la otra. Los colores y las fuentes (Figtree y Plus Jakarta Sans) están en `app/globals.css` y `app/layout.tsx` y los comparten la página y la aplicación. Movimiento: criterios de Emil Kowalski (`.claude/skills`), clases `presionable`, `aparecer`, `entrar-lado` en `globals.css`.

**Inventario guardado y pronóstico** (`server/inventario.js`, `pronostico.js`, `series.js`, `inventario-rutas.js`): al procesar un export se guardan también las ventas por semana de cada producto (`exports.series`) y su costo y proveedor si venían (`exports.catalogo`). `GET /api/inventario` arma, con el último export bueno del usuario y sus tiempos de entrega (`usuarios.inventario`), el panel: riesgo de agotarse, "pide ya", sugerido, dinero quieto, gráfico y acierto medido. No cambia las semanas del reporte. Un probador no puede ver su inventario antes de guardar su primera lista inicial ni ve la cantidad sugerida durante sus 14 días (`permisos`). La demo (`server/demo.js`) genera cinco negocios inventados con semilla fija y los pasa por el mismo cálculo; `GET /api/demo/:id?ajustes=` deja probar otros tiempos de entrega.

**El flujo de 5 pasos es la herramienta de medición, y sus reglas se hacen cumplir en el servidor** (`server/pedidos.js`), no solo en pantalla:
1. Lista inicial: se autoguarda como borrador con `PUT` y se fija con `POST`. Después de eso queda inmutable (`WHERE inicial_guardada_en IS NULL`; editarla responde 409).
2. Subir export: sin lista inicial guardada responde 403. Los archivos se guardan crudos en `archivos` (BYTEA). `procesarExport` los lee con `lector.js`, calcula con `rotacion.js` y guarda el reporte ya calculado en `exports.reporte` (JSONB).
3. Ver reporte: la primera vez que se pide marca `reporte_visto_en`. Ahí mismo se ofrece el recordatorio (`GET/POST /:id/recordatorio` y `GET /:id/recordatorio.ics`, `server/recordatorios.js`); responderlo no cambia el paso.
4. Lista final: es editable solo después de ver el reporte. Al guardarla, `compararListas` (`listas.js`) calcula la métrica y la magnitud, y `coherenciaConReporte` la coherencia con el reporte; todo se guarda en `pedidos.comparacion`. La coherencia no se le devuelve al usuario (`vistaPedido` la quita) para no sugerirle la respuesta del paso 5.
5. ¿Por qué cambió?: texto libre. Al enviarlo, el pedido queda terminado.

`pasoDe(p)` deduce el paso a partir de las marcas de tiempo del pedido. No existe una columna de estado.

Consecuencias que no se ven leyendo un solo archivo:
- El reporte se calcula **una vez, al subir el archivo**. Si cambias `rotacion.js`, los reportes ya guardados no se recalculan. Los exports originales sí quedan en `archivos`, así que se pueden reprocesar.
- `equipo.js` calcula el veredicto de la prueba a partir de los datos guardados: una ventana de 14 días desde la primera lista inicial de cada usuario y el pedido con mayor M dentro de esa ventana. Las constantes de la hipótesis (`META_LINEAS`, `DIAS_PRUEBA`, etc.) están al comienzo de ese archivo. Cambiarlas cambia el resultado del experimento, así que hay que reflejar el cambio en el Entregable.
- La identidad de un producto es `claveCodigo` (`valores.js`): sin espacios, sin importar mayúsculas y sin ceros a la izquierda. La usan igual el reporte y la comparación de listas. Si la cambias en un lado, cámbiala en el otro, y también en la copia de `public/js/util.js`.
- El rol `equipo` se asigna con `TEAM_EMAILS` al crear la cuenta o al iniciar sesión. Las cuentas del equipo no cuentan como probadores.
- Cada consulta sobre datos de usuario filtra por `usuario_id`. Las rutas nuevas tienen que hacerlo también (ver `pedidoDe`).
- La tabla `eventos` registra los ingresos, los archivos subidos y los pedidos. Volver con la sesión abierta después de 30 minutos sin actividad cuenta como un nuevo ingreso (`cuentas.js`).
- **Recordatorios** (`recordatorios.js`, tabla `recordatorios`): una fila por usuario con su última respuesta y la fecha de su primer recordatorio. **No hay tareas programadas ni cron, a propósito** (decisión del equipo, 2026-10-11): el recordatorio es un archivo .ics que el usuario descarga y que su calendario dispara. Si hay `BREVO_API_KEY` y `CORREO_REMITENTE`, al decir que sí se le manda además la misma invitación por correo, en ese momento. Las fechas son texto `YYYY-MM-DD` en hora de Bogotá.

**Programas contables** (`inventory-forecasting-landing-page/lib/sistemas.ts`, copia de `public/js/sistemas.js`: si cambias una, cambia la otra): la guía que ve el usuario en el paso 2 para sacar los archivos de su programa. **Regla: un paso solo nombra un menú si se confirmó en una fuente, y la fuente va en `fuentes`.** Lo que no se pudo confirmar se marca así (`ventas: null` usa la guía general). No inventen nombres de menús.

**Formatos difíciles** (`lector.js`): antes de pedirle algo al usuario, el lector intenta resolverlo solo. Salta el ruido de los informes de impresora (`esFilaDeRuido`, `esFilaQueSeSalta`), corre una columna reconocida hacia la vecina que sí tiene datos del tipo correcto (`realinearColumnas`), saca el código de los paréntesis del nombre (`codigoEnNombre`) y completa años cortados con las filas vecinas (`fechaConAnioCortado`). Si una tabla de ventas tiene tipo de documento con dos o más prefijos (FV, FC, NC…), devuelve `necesitaDocumentos`; la elección se guarda en `exports.documentos` y en `usuarios.mapeos.documentos` por firma, así que se pregunta una sola vez. En un kardex, el saldo de hoy es el del último movimiento de cualquier tipo. Las hojas llamadas "Instrucciones" o "Ejemplo" se ignoran. Cuando falta una columna, `sugeridas` trae la que parece por su contenido y el formulario la deja marcada. Todo esto se probó con un informe real de Helisa ("Movimiento detalle", 26.000 filas) que no se versiona: las pruebas usan datos inventados con la misma forma.

**Ventas como total de un periodo:** si una tabla trae código y cantidad pero ninguna fecha, `leerExport` devuelve `necesitaPeriodo` y la app le pregunta al usuario desde y hasta cuándo (se guarda en `exports.periodo`). Con eso, `calcularRotacion` usa el promedio simple sobre ese periodo (`periodo.totales`). Solo se considera así si no vino ninguna tabla de ventas con fecha.

**Cuentas:** `/api/cuenta/datos` (nombre y programa contable), `/clave` (cambiar), `/olvide` y `/restablecer` (enlace de un solo uso, 24 horas, tabla `restablecimientos` con el hash del token). Sin correo configurado, el enlace lo genera el equipo desde "Resultados de la prueba".

**Lector de archivos** (`lector.js` + `formatos.js`): busca la fila de encabezados y reconoce las columnas por sinónimos normalizados (minúsculas, sin tildes, sin palabras vacías). Acepta CSV con `;` o `,` en UTF-8 o ANSI, varias hojas o archivos, columnas por mes, y fechas y números en formato colombiano. Si falta un campo, devuelve las hojas con columnas de muestra para que el usuario elija la columna desde la pantalla, y el mapeo se recuerda por firma de encabezados en `usuarios.mapeos`. **Para adaptar un formato nuevo se agregan sinónimos en `formatos.js`, sin tocar `lector.js`.** Rechaza imágenes y PDFs a propósito.

## Lineamientos

- **El documento del MVP manda sobre las decisiones técnicas** (regla escrita en `docs/modelo-rotacion.md`). El modelo implementa S = existencias ÷ ventas por semana. Desde el 2026-10-11 las ventas por semana llevan tres ajustes (lo reciente cuenta doble, un mes pico aislado se recorta y los productos nuevos se promedian desde su primera venta), descritos en §3.6 del modelo; sin ajustes que aplicar dan el promedio simple vendido ÷ T. Los umbrales son 2 semanas para "se agota" y 12 para "sobra". Cada fila del reporte guarda el desglose (`vendidoAjustado`, `vendidoReciente`, `semanasProducto`, `semanasRecientes`, `pico`, `promedioSimple`) y `reporte.js` lo explica paso a paso; los reportes guardados antes no traen `ajustes` y se explican con el texto anterior.
- **Alcance (cambió el 2026-10-11, `docs/PLAN_REESTRUCTURACION.md`):** el producto ya sugiere cuánto pedir y ajusta por temporada y por tiempo de entrega (§7 del modelo), pero la cantidad sugerida queda apagada para los probadores durante su prueba. Sigue fuera de alcance conectarse al software contable y cualquier IA generativa. Cualquier cosa nueva que un probador vea durante sus 14 días cambia el tratamiento de la prueba: avisa antes de construirla y que quede su fila en "Cambios".
- **Todo lo que ve el usuario va en español sencillo**, sin jerga financiera. Esto viene de la ansiedad "caja negra" que señalaron Sandra Sánchez, Daniel Coral y Francisco Lozano. Los errores para el usuario se lanzan con `new ErrorUsuario(mensaje, estado)` y el manejador de `app.js` los devuelve como `{ error }`. Los errores de archivo tienen que decir la fila y la columna.
- El reporte siempre explica el cálculo con un producto del propio archivo del usuario (`elegirEjemplo`). No lo quites: es la respuesta al requisito de que el número se entienda.
- El código, los identificadores, los comentarios y los mensajes de commit están en español. Hay que mantener el estilo: funciones pequeñas, comentarios que explican el porqué y sin dependencias nuevas salvo que sean necesarias. El stack es deliberadamente mínimo.
- Si cambias el modelo, la métrica o el flujo, actualiza `docs/modelo-rotacion.md` y la tabla "Cómo se cumple el documento" del README. Cualquier diferencia con el Entregable tiene que quedar como fila en "4 · Cambios y Reflexión", con la evidencia que la causó. Si no, la rúbrica la cuenta como **desconexión**.
- El equipo debe declarar el uso de IA en cada entrega (herramientas, dónde ayudó y dónde falló). Lo que Claude construya aquí entra en esa declaración.

## Vacíos en el planteamiento que hay que atender

Están ordenados por cuánto ponen en riesgo la prueba o la Entrega 3.

**Diferencias entre lo declarado y lo construido** (se califican en la Entrega 3):
1. **Stack.** El plan de prueba declara "Next.js con Postgres y autenticación". *Atendido (2026-10-11):* la interfaz ya es Next.js; la API sigue en Express dentro del mismo servidor. Conviene decirlo así en Cambios.
2. **Lista inicial por imagen.** El plan dice que el usuario "la importa o adjunta una imagen". La app rechaza imágenes a propósito, porque no se pueden comparar por código. Hay que declarar el recorte.
3. **"Dos pantallas"** en el plan contra un flujo de 5 pasos en la app. Es compatible, pero hay que explicarlo.
4. En el Entregable 2 quedaron vacíos el campo "Qué sostiene lo que no cambió" y la columna de sustentación (ninguna fila marcada Sí, así que no hay bono de revisión).

**Formatos de los probadores, todavía sin validar:**
5. No hay ningún export real de los 5 probadores. Los sinónimos se basan en nombres habituales de Siigo, SAP, SIESA, CGUNO y World Office.
6. **Juan José Aya (Muebles Aya) usa Helisa** (entrevista del 2026-09-17), y Helisa no está entre los formatos considerados. Claudia Mueces usa Siigo. No se sabe qué usan Ecorac ni Disferral. *Actualización 2026-10-11:* el detalle de facturas de Helisa ya se lee bien (ver README, "Limitaciones conocidas"); los informes de Helisa con forma de página de impresión y el listado de inventario con salidas del periodo siguen pendientes.
7. Un kardex que mezcla entradas y salidas en una columna con un "tipo" se leería como si todo fueran ventas. Hay que confirmar cómo exporta cada probador.

**Validez de la métrica:**
8. **Tiempo de entrega contra umbral fijo.** "Se agota" es menos de 2 semanas para todos los productos. Para un importador (Muebles Aya, Ecorac), un producto con 8 semanas puede ya estar tarde. El reporte puede confirmar un pedido equivocado o no mover líneas que sí debería mover. *Atendido en parte (2026-10-11):* el panel marca "pide ya" con el tiempo de entrega que el usuario escribe en Datos; el reporte de la prueba (paso 3) sigue con el umbral fijo.
9. **El umbral de 12 semanas para "sobra"** sale de benchmarks de distribuidores, no de los usuarios. No se ha validado con ninguno.
10. **Demanda de proyectos.** Claudia Mueces (2026-09-24) y Ricardo Osorio separan la demanda de comercialización de la de proyectos o clientes puntuales. Una venta grande por proyecto infla el promedio. *Atendido en parte (2026-10-11):* un mes pico aislado se recorta a 3 veces lo normal. Una venta por proyecto que se reparte en varios meses sigue contando.
11. **No hay grupo de control.** Reescribir la lista ya puede producir cambios sin el reporte. Además, ajustar una sola unidad cuenta igual que quitar una referencia, y M no distingue un cambio relevante de ruido. Conviene decidir antes de la prueba si se reporta también la magnitud del cambio. *Atendido (2026-10-11):* la vista del equipo muestra las unidades movidas sobre las de la lista inicial. El grupo de control sigue sin existir.
12. **El pivote "cambió por probar la herramienta"** lo juzga el equipo leyendo el "¿por qué?". No hay un criterio escrito para clasificar esas respuestas. *Apoyo desde el 2026-10-11:* la coherencia con el reporte (§4.3 del modelo) dice qué parte de los cambios fue en la dirección que indicaba el dato. El criterio de clasificación del texto sigue pendiente.
13. **Independencia de los probadores.** Orlando Álvarez y Nohora Rodríguez son de la misma empresa (Disferral) y pueden compartir export y pedido. Claudia Mueces es asesora y prepara el informe de mínimos, pero no está claro si es quien decide el pedido.
14. **Pedidos simulados.** No se sabe cada cuánto pide cada probador (lo dice el Entregable 2 en "Qué seguimos sin saber"). Si la mayoría simula, la evidencia es débil, aunque la app marca real o simulado.

**Producto y adopción:**
15. **Stickiness es el eslabón más débil** (lo declara el mismo Entregable). Claudia Mueces pide explícitamente alertas en vez de "informes pasivos que alguien tiene que descargar". *Atendido (2026-10-11):* el recordatorio de la corrección del Entregable está construido como archivo de calendario (sin cron), y la vista del equipo mide quién lo pidió y quién volvió desde la fecha de su primer recordatorio. El envío por correo es opcional (Brevo).
16. **Contraste con su Excel.** Claudia Mueces pide poder comparar el resultado con el análisis que ya hacen. Tomás Buendía (2026-09-24) acepta ayuda solo si se mantiene el criterio del equipo. El flujo actual no muestra junto al reporte los mínimos y máximos que ya trae su informe.
17. **Costo de equivocarse, sin cuantificar.** Nadie ha dicho cuántos agotados tiene ni cuánto capital tiene quieto. Sin eso no hay argumento de valor después de la prueba.

**Operación de la prueba:**
18. **El repo no tiene `.gitignore`**, aunque el README dice que sí. Hay que crearlo con `node_modules/`, `data/` y `.DS_Store` (este último ya está versionado) antes de que alguien suba `data/pglite/` con datos de prueba.
19. **No hay recuperación de contraseña.** Si un probador olvida la suya, el equipo tiene que restablecerla a mano en la base de datos, y no hay script para hacerlo.
20. **Datos comerciales de terceros.** Los exports de los probadores se guardan completos en la base. No hay acuerdo de uso de datos ni un procedimiento para borrarlos al terminar la prueba.
21. En el plan gratuito de Render, el servidor se apaga tras 15 minutos sin uso y la primera visita tarda unos 50 segundos (ver README). Antes de la prueba hay que borrar los datos de prueba o usar una base nueva, para que el resumen cuente solo a los 5 probadores.
