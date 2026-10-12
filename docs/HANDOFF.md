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

## 2026-10-11 (5) — Claude — landing revisada para Expoandes y prueba con archivos de World Office

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
