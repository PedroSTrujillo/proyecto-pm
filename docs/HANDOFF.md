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

## 2026-11-03 (51) — Claude (con David) — Página principal en "usted" y al día con Alpha 0.2; Web Vitals con PostHog
- **Rama:** `main`, en los dos remotos.
- **Estado:** listo.
  - Se quitó Vercel Speed Insights (el equipo lo desactivó en Vercel). Los Core Web Vitals de los usuarios reales los mide PostHog, que ya estaba integrado: `capture_performance: { web_vitals: true }` en `instrumentation-client.ts`. Se ven en PostHog → Web analytics → Web vitals.
  - Página principal en "usted", con tono formal, y describiendo Alpha 0.2:
    - el hero y su vista previa muestran un pedido desde lo sugerido por proveedor, en días, con "Por aprobar";
    - Cómo funciona: subir una vez, registrar lo que entra y sale, preparar el pedido;
    - una sección nueva, `equipo-section.tsx` (roles, aprobación, boletín e invitación), que reemplaza la comparación de listas de Alpha 0.1 (se borró `comparison-section.tsx`);
    - el precio y el FAQ, sin "simulado" y sin "anotar antes".
  - `npm run texto` ahora también le revisa el tuteo a la página principal: 49 frases, 0 con tuteo.
  - "Bien" sale en verde en las etiquetas de estado.
  - README: stack, cuenta de prueba (por llenar) y guion de 5 pasos para el monitor.
- **Archivos tocados:** `app/layout.tsx`, `app/page.tsx`, `instrumentation-client.ts`, `package.json` (sin `@vercel/speed-insights`), `components/landing/*`, `components/app/ui.tsx`, `scripts/revisar-texto.js`, `README.md`, `CLAUDE.md`, `docs/ENTREGABLE_Y_APP.md` (fila 15).
- **Base de datos:** sin cambios.
- **Verificación:** `npm test` → 202/202. `tsc` limpio. axe sin errores en la página principal, en computador y en celular, y sin scroll horizontal ni errores en la consola.
- **Siguiente paso exacto:** crear en producción la cuenta de prueba para el monitor (con un correo que no sea del equipo), cargarle datos y escribir el correo y la contraseña en el README y en la hoja de la Entrega 4.
- **Notas y bloqueos:** PageSpeed no se pudo medir desde aquí (la página no cargó y la API sin clave no tenía cuota). Hay que medirlo a mano en pagespeed.web.dev.

## 2026-11-03 (50) — Claude (con David) — Panel al día con los movimientos, días por defecto, invitar desde el panel y accesibilidad
- **Rama:** `main`, en los dos remotos.
- **Estado:** listo para las pruebas de usuario de hoy (guía en `docs/GUIA_PRUEBAS_USUARIO.md`).
  - **Arreglo (lo reportó Jose):** después de varios movimientos, el panel mostraba una fecha y unas existencias viejas mientras Existencias estaba al día. Tenía dos causas:
    1. El caché en memoria de `GET /api/inventario` usaba como llave el `id` del export, pero `inventarioAlDia` recalcula el export de movimientos en el mismo `id`. Ahora la llave lleva también `subido_en`. En Vercel cada servidor tenía su propio caché viejo, y por eso la fecha cambiaba al refrescar.
    2. "Al día" se decidía comparando horas, y `now()` es la hora en que empieza la transacción. Un lote grande que se confirmaba mientras el panel calculaba no se volvía a sumar. Ahora se compara una firma: cuántos movimientos hay, el último `id`, los anulados y el archivo base (`empresas.inventario_firma`). Las empresas que ya existen se recalculan solas en su primera visita.
  - Las cuentas nuevas ven el tiempo en días (Francisco). Las de antes siguen como estaban.
  - "Invite a su equipo" en el panel y en la pantalla sin inventario: a quien administra y sigue sola en su empresa. El formulario se sacó a `components/app/invitar.tsx` y lo usa también Mi empresa (antes el campo decía "Su correo").
  - Movimientos explica "Un movimiento" y "Varios a la vez".
  - Accesibilidad: axe (WCAG 2.1 AA y tamaño de toque 2.2) sin errores en todas las pantallas, en computador y en celular. Se corrigió el contraste del contador de `Pildoras`, 12 textos de la página principal (más opacidad, sin cambiar el diseño), las dos tablas con desplazamiento (se recorren con teclado) y la lista de definiciones de Cuentas.
- **Archivos tocados:** `server/inventario-rutas.js`, `server/movimientos.js`, `server/db.js` (columna nueva), `server/cuentas.js`, `components/app/invitar.tsx` (nuevo), `empresa.tsx`, `panel.tsx`, `sin-inventario.tsx`, `movimientos.tsx`, `ui.tsx`, `cuentas-equipo.tsx`, `components/landing/{method,pricing,comparison}-section.tsx`, `pedido-preview.tsx`, `test/inventario-al-dia.test.js` (nuevo; reproducía el error antes del arreglo), `docs/ENTREGABLE_Y_APP.md` (fila 15 de Cambios), `docs/GUIA_PRUEBAS_USUARIO.md` (nuevo).
- **Base de datos:** `ALTER TABLE empresas ADD COLUMN IF NOT EXISTS inventario_firma TEXT`.
- **Verificación:** `npm test` → 202/202. `tsc` limpio. `npm run texto` igual que antes (52, 0 con tuteo). En el navegador, con la base en memoria: el panel sale en días, la tarjeta de invitar crea el enlace y axe no encuentra errores.
- **Siguiente paso exacto:** pedirle a Jose que abra el panel de su cuenta y confirme que ya dice al día hasta el 13 de octubre, con las 72 unidades.
- **Notas y bloqueos:** un movimiento con fecha igual o anterior al último día del archivo subido no se suma (ese día ya está en el archivo), y el panel lo avisa. Si a alguien "no le cambia", revisar esa fecha primero.

## 2026-11-03 (49) — Claude (con David) — Pantalla Cuentas para el equipo y borrado que no deja empresas sin inventario
- **Rama:** `main`, en los dos remotos (`origin` y `mio`).
- **Estado:** listo. El equipo tiene una página nueva, **Cuentas** (`/cuentas`, en el menú debajo de Ejemplos):
  - Estado de cada cuenta: activa (algo en 7 días), sin volver (8 a 30), inactiva (más de 30) o sin datos. Muestra el último ingreso, los pedidos cerrados, los movimientos, los archivos, las sesiones abiertas, su empresa con sus personas y lo último que hizo. Nunca muestra el inventario, los productos, las listas ni la aceptación (D16).
  - Las invitaciones del growth loop (Entrega 4): enviadas, aceptadas, empresas que invitaron y aceptadas por cuenta activa.
  - Cerrar las sesiones de una cuenta.
  - Borrar una cuenta con sus datos. La ventana muestra antes qué se va y qué se queda. Pide el correo exacto de la cuenta y la contraseña de quien borra. No deja borrar cuentas del equipo ni la propia, tiene un límite de 10 por hora, y queda como `cuenta_borrada` en la actividad de quien borró, con el correo enmascarado.
  - **Arreglo en `borrar.js` (también afecta a `npm run borrar-datos`):** `exports.usuario_id` y `archivos.usuario_id` se borran en cascada. Antes, borrar a una persona de una empresa con más personas borraba los archivos de inventario que esa persona había subido, y las demás se quedaban sin inventario. Ahora esos archivos pasan a quien queda (quien administra, o la persona más antigua), y si nadie queda administrando, esa persona pasa a administrar. Todo va en una transacción. El script ya no imprime "undefined foto(s)".
- **Archivos tocados:** `server/cuentas-equipo.js` (nuevo), `server/borrar.js`, `server/app.js`, `server/cuentas.js` (exporta `verificarClave`), `scripts/borrar-datos.js`, `components/app/cuentas-equipo.tsx` (nuevo), `app/(app)/cuentas/page.tsx` (nuevo), `components/app/marco.tsx` (menú), `test/cuentas-equipo.test.js` (nuevo, 5 pruebas), `CLAUDE.md`, `README.md`.
- **Base de datos:** sin cambios.
- **Verificación:** `npm test` → 201/201. `tsc` sin errores nuevos (solo los conocidos de `.next` viejo). `npm run texto` igual que antes (52, 0 con tuteo). En el navegador, con la base en memoria: la lista, los filtros y el detalle funcionan; con una contraseña equivocada no borra nada; con la correcta borró la cuenta y la otra persona de la empresa pasó a administrarla. En celular (375 px) no hay scroll horizontal.
- **Siguiente paso exacto:** que quien sea del equipo entre a sinesc.vercel.app/cuentas con su cuenta (tiene que estar en `TEAM_EMAILS` de Vercel) y revise el estado de los probadores.
- **Notas y bloqueos:** la página ve datos de otras cuentas (actividad y conteos). Si se le agrega algo, que siga siendo actividad y no datos comerciales. La cuenta de prueba que se le da al monitor de la Entrega 4 **no** puede ser del equipo, porque vería esta página.

## 2026-11-02 (48) — Claude — Kardex de Siigo al importar movimientos, códigos que no están en el catálogo y pantalla de Movimientos
- **Rama:** `empresas-inventario-diario`, solo en local y sin commit. Antes de empezar se trajo la rama del equipo (`origin`, hasta 82189c0).
- **Estado:** arreglado lo que describe `CORRECCIONES.docx` (archivos reales de un probador en `data/siigo/`, que no se versiona).
  - "Importar de un archivo" en Movimientos (y la lista de un pedido) usa `leerLista`. Con el "Movimiento de productos" de Siigo, cada fila "Código producto: 31010002 …" (encabezado del grupo, con los totales) entraba como un producto que pedía crearse, y cada movimiento de un mismo producto quedaba como una línea aparte. Ahora `leerLista` salta las filas de grupo y las páginas repetidas, y junta las filas con el mismo código: suma la cantidad, o toma la última si la columna elegida es un saldo. La pantalla avisa que se juntaron.
  - Movimientos: arriba se elige "Un movimiento" o "Varios a la vez" y solo se ve ese formulario (el otro se esconde sin perder lo escrito; la elección se recuerda en el navegador). Cada formulario tiene el botón de guardar arriba y abajo.
  - Un código que no está en el catálogo ya no frena el guardado. Si se parece a productos existentes (`server/parecidos.js`), la pantalla pregunta "¿se refiere a…?" con hasta tres opciones o "es un producto nuevo", sin guardar nada mientras tanto. Si no se parece a ninguno, se crea al guardar con el nombre de la fila, y se avisa. El recuadro también dice antes de guardar cuáles se van a crear.
- **Archivos tocados:** `server/lector.js` (`leerLista`, `sumar`), `server/parecidos.js` (nuevo), `server/movimientos.js` (`resolverDesconocidos`, `POST /api/movimientos` con `resolver`, `creados`), `components/app/movimientos.tsx` (`ProductosNoEncontrados` reemplaza a `CrearProducto`; la hoja manda también el nombre), `components/app/pedido-flujo.tsx` (aviso de filas juntadas), `test/lector.test.js`, `test/empresas.test.js`, `CLAUDE.md`.
- **Base de datos:** sin cambios.
- **Verificación:** `npm test` → 196/196 (dos pruebas nuevas; la de movimientos ya no espera error con un código nuevo). `tsc --noEmit` limpio, `next build` bien, `npm run texto` igual que antes (52, 0 con tuteo). Con los dos archivos reales: 0 filas de grupo y 0 códigos repetidos; la salida del primer producto suma 46, como el total de su fila de grupo, y su saldo da 5. En el navegador (compilado, base en memoria): "tor 0610" preguntó por TOR-0610, "ZZ-900" se avisó y se creó al guardar.
- **Siguiente paso exacto:** revisar el diff y hacer commit. Después, probar "Importar de un archivo" en Movimientos con los dos archivos de `data/siigo/` en la vista previa.
- **Notas y bloqueos:** al importar el kardex como movimientos, la persona sigue eligiendo una sola columna de cantidad (entrada o salida) y un solo tipo de movimiento para todo el archivo; no se separan solas las entradas de las salidas. `/api/catalogo/lote` (familia, múltiplo…) sigue respondiendo error con un código desconocido, a propósito: edita productos, no los crea. Lo nuevo lo ven los probadores en Movimientos.

## 2026-10-29 (47) — Claude — Las 2 pruebas rotas de empresas.test.js: el "hoy" de la plantilla iba en UTC
- **Rama:** `empresas-inventario-diario`, solo en local y sin commit (junto con lo de la entrada 46).
- **Estado:** arreglado. Las pruebas de `empresas.test.js` (líneas 251 y 339) fallaban **solo de 7 p. m. a medianoche en Bogotá**. La plantilla de ventas (`ventasEjemplo` en `plantillas.js`) termina "ayer" contado en UTC (`Math.floor(Date.now() / MS_DIA)`), y la prueba registra movimientos con `fechaBogota()`. De noche, "ayer UTC" es "hoy en Bogotá", así que `combinar` (`saldos.js`) los ignoraba por ser "del día del archivo o antes". La de la línea 339 caía de rebote, porque la anterior se detenía antes del cuarto movimiento. A un usuario le pasaba lo mismo si descargaba la plantilla de noche y registraba movimientos ese día.
- **Archivos tocados:** `server/valores.js` (nuevo `diaHoy()`: número de día de hoy en Bogotá, sin dependencias), `server/plantillas.js` (`ventasEjemplo` lo usa; se quitó `hoyDia`), `server/movimientos.js` (el `hoy` que va a `calcularRotacion`), `scripts/generar-ejemplos.js` (el `hoy` de los ejemplos).
- **Base de datos:** sin cambios.
- **Verificación:** `node --test test/*.test.js` → 194/194 a las 22:00 de Bogotá (antes, 192/194 a esa hora). También 194/194 con el reloj corrido 4 h atrás y 6 h adelante (`Date` sustituido con `--require`). `npm run texto` → 0 con tuteo. Sin navegador.
- **Siguiente paso exacto:** revisar el diff de las entradas 44 a 47 y hacer commit. Después, lo de la entrada 46: `docs/CONFIGURAR_CORREO_VERCEL.md`.
- **Notas y bloqueos:** si aparece otro `Date.now() / MS_DIA` para decir "hoy", use `diaHoy()`. Ya no queda ninguno en `server/` ni en `scripts/`.

---

## 2026-10-29 (46) — Claude — Prueba local del boletín por correo y guía para configurarlo en Vercel
- **Rama:** `empresas-inventario-diario`, solo en local; los cambios de esta entrada no tienen commit.
- **Estado:** el boletín llegó bien por Brevo desde local (`npm run boletin -- --email …`). Se corrigió un error de `enviarBoletines`: con `--email` la consulta pasaba `hoy` como `$1` sin usarlo y Postgres respondía `could not determine data type of parameter $1`; ahora solo se pasan los parámetros que la consulta usa. Guía nueva para quien tenga acceso a Vercel: `docs/CONFIGURAR_CORREO_VERCEL.md`.
- **Archivos tocados:** `server/boletin.js` (arma `params` según `soloUsuario` y `forzar`), `docs/CONFIGURAR_CORREO_VERCEL.md` (nuevo), `docs/HANDOFF.md`.
- **Base de datos:** sin cambios.
- **Verificación:** `boletin.test.js` y `alertas.test.js` pasan. En `empresas.test.js` fallan 2 pruebas (línea 251, "movimientos del día…", y línea 339, resultados del equipo) que ya fallaban sin este cambio; no se investigaron. Simulación con el `fetch` de Brevo interceptado: dos correos (un miércoles y un lunes) con `List-Unsubscribe` y enlace de baja. Envío real a un Hotmail en local: llegó. No se corrió `npm test` completo.
- **Siguiente paso exacto:** que quien tenga Vercel siga `docs/CONFIGURAR_CORREO_VERCEL.md` (4 variables, redeploy, **Run** del Cron). Antes, revisar las 2 pruebas rotas de `empresas.test.js` y hacer commit.
- **Notas y bloqueos:** falla típica de Brevo si el remitente no coincide con el verificado: `400 valid sender email required` (queda en `boletines.error`). El `ignoreCommand` de `vercel.json` cancela los despliegues si el dueño del repo no es `DavidAlvarez26`.

---

## 2026-10-29 (45) — Claude — SP8 de PLAN_ALPHA_02: cierre de documentos, Entregable y uso de IA
- **Rama:** `empresas-inventario-diario`, solo en local y sin commit (encima del SP7, entrada 44, que tampoco tiene commit).
- **Estado:** SP8 completo; con esto, SP1 a SP8 están hechos. Solo documentos, sin código.
  - `CLAUDE.md`: "Qué es este proyecto" con la hipótesis del piloto de Alpha 0.2 como vigente, la de 0.1 como antecedente (cerrada, D10) y un párrafo con lo que trajo cada SP; la regla de "Cambios" pasa de "14 días del probador" a "ventana de 30 días del piloto", y los Hitos 9 y 10 quedan fuera de alcance.
  - `modelo-rotacion.md`: título "Alpha 0.1 y 0.2"; §4 aclara qué es de 0.1; **§4.4 nueva** (aceptación por pedido y por usuario, satisfacción, uso en días hábiles, veredicto, sugerido contra ocurrido, encuesta); §7.6 corregida (decía que los probadores no veían el pronóstico; eso cambió el 2026-10-14); **§7.7 nueva** con la fórmula completa del sugerido (días hábiles, proyectos, en camino, paquete, mínimo, sobrestock).
  - `README.md`: "Qué se está probando" con el piloto primero y los 5 pasos como antecedente (en "usted"); filas nuevas en "Cómo se cumple el documento" para SP1, SP2, SP3 y SP6 (las de SP4, SP5 y SP7 ya estaban); "Cambio de alcance" al día; enlaces a `PLAN_ALPHA_02.md` y `USO_DE_IA.md`.
  - `ENTREGABLE_Y_APP.md`: tabla "Hipótesis del piloto (Alpha 0.2)" con dónde se mide cada parte; fila de "real o simulado" al día; **fila 14** para el SP1 (antes iba como una línea dentro de la 9); "Resumen por sub-plan" con fila, quién lo pidió y fecha de publicación (todas "por fijar").
  - `PLAN_ALPHA_02.md`: estado final y sección "Backlog" (Hitos 6.4, 7, 8, 9 y 10, y los pendientes técnicos de cada SP).
  - `docs/USO_DE_IA.md` (nuevo): herramientas, qué decidió el equipo y qué hizo Claude por sub-plan, dónde ayudó y dónde falló.
- **Archivos tocados:** `CLAUDE.md`, `README.md`, `docs/{modelo-rotacion,ENTREGABLE_Y_APP,PLAN_ALPHA_02,HANDOFF}.md`, `docs/USO_DE_IA.md` (nuevo).
- **Base de datos:** sin cambios.
- **Verificación:** `npm test` → 194/194; `npm run texto` → 0 con tuteo. Las fórmulas de §4.4 y §7.7 se cotejaron con `evaluarPiloto`/`resumirPiloto` (`equipo.js`), `medirAceptacion` (`listas.js`) y el redondeo al mínimo de `inventario.js` (el mínimo también se redondea a la caja). Sin navegador (no hubo cambios de pantalla).
- **Siguiente paso exacto:** revisar el diff de las entradas 44 y 45 y hacer commit. Después, lo que es de personas: SP0 (rama de Neon *Preview*, `CRON_SECRET` y `BOLETIN_SECRETO`, copia de la base), fijar X, Y y Z en `server/equipo.js`, probar en *Preview* y abrir el PR a `main` (solo con aprobación), publicar y anotar en `ENTREGABLE_Y_APP.md` la fecha de publicación de cada SP y la de inicio del piloto.
- **Notas y bloqueos:**
  - Copiar al Excel del Entregable, en "4 · Cambios y Reflexión", las filas 9 a 14 de `ENTREGABLE_Y_APP.md`, y la hipótesis del piloto con sus X, Y y Z definitivas.
  - `docs/USO_DE_IA.md` es un borrador para la declaración de la entrega: el equipo debe sumar las herramientas que usó cada persona.
  - Siigo (1.7) sigue pendiente de Claudia.

## 2026-10-29 (44) — Claude — SP7 de PLAN_ALPHA_02: alertas configurables del boletín
- **Rama:** `empresas-inventario-diario`, solo en local y sin commit (las entradas 37 a 42 ya estaban en el commit `8e2b9f0`).
- **Estado:** SP7 completo según el plan de la entrada 43.
  - **Alertas** (`server/alertas.js`, nuevo y sin base de datos): 8 tipos, frecuencias diario / semanal (lunes) / mensual (primer día hábil) / nunca, sin festivos, valores por perfil de la tabla del plan. `preferencias.alertas` guarda solo lo que la persona cambió; `publico()` devuelve la tabla completa y `alertasPropias`. `PUT /api/cuenta/preferencias { alertas }` valida tipo y frecuencia (400) y `alertas: null` vuelve al perfil. Si alguien cambia de perfil, cambia lo que no tocó.
  - **Boletín** (`boletin.js`, `boletin-correo.js` reescrito por secciones): `tiposDeHoy` + `seccionesDelDia`; `porAprobar` solo a quien aprueba, `sinDatos` (más de 3 días hábiles sin movimientos ni archivos) solo a quien administra y a los operadores, `dineroQuieto` solo con costos. Sin nada que decir: no se manda y la fila queda `sin_novedad`. Asunto = la sección más urgente ("Pedir ya: 4 productos y 2 avisos más · Empresa"). "Qué cambió" compara con la última revisión de cada tipo (`resumen.tipos`, se arrastra lo que no tocaba). Enlaces por sección con `?desde=boletin`. Se quitó el aviso "Ayer no se registraron movimientos" (lo reemplaza `sinDatos`) y las cuatro cifras de arriba.
  - **Entregas atrasadas** (`atrasadosDe` / `porRecibirAtrasados` en `recepcion.js`): por proveedor de cada pedido en camino, fecha esperada = día del pedido + días hábiles del proveedor (escritos o semanas × 5).
  - **Sobrestock por producto:** `productos.sobra_semanas` (1 a 104) en la ficha (`EditarCatalogo`), en `PUT /api/catalogo/:id` y como quinta columna del pegado por lote (`sobra`). `conSobraPropia` en `inventario.js` lo aplica sobre la fila guardada; cambia estado, sugerido (0) y dinero quieto. `umbrales.sobra` sigue en 12.
  - **Web:** tabla "Qué avisos trae y cada cuánto" en Mi cuenta (la tarjeta del boletín ocupa el ancho; se guarda al elegir; "Volver a los valores de su perfil"); `productos.tsx` lee `?estado=` (validado contra los estados).
  - **`npm run boletin -- --email x --fecha AAAA-MM-DD`** para simular un día (un lunes, un primer día hábil).
- **Archivos tocados:** server: `alertas.js` (nuevo), `boletin.js`, `boletin-correo.js`, `cuentas.js`, `recepcion.js`, `inventario.js`, `movimientos.js`, `db.js`; `scripts/enviar-boletin.js`; web: `components/app/{cuenta,catalogo,productos}.tsx`, `lib/tipos.ts`; pruebas: `test/boletin.test.js` (reescrita, 13), `test/alertas.test.js` (nueva, 5), `test/empresas.test.js` (2 aserciones al formato nuevo); docs: `CLAUDE.md`, `README.md`, `modelo-rotacion.md` (§11 y notas en §3.4 y §7), `ENTREGABLE_Y_APP.md` (fila 13), `PLAN_ALPHA_02.md`.
- **Base de datos:** `productos.sobra_semanas NUMERIC`. Las alertas van en `usuarios.preferencias` (JSONB, sin columna). `boletines.estado` admite `sin_novedad`; `boletines.resumen` pasa a `{ tipos: { tipo: { fecha, n, claves } } }` (los resúmenes viejos se ignoran al comparar).
- **Verificación:** `npm test` → 194/194; `tsc --noEmit` limpio; `npm run texto` → 0 con tuteo. En el navegador (`npm run dev` con PGlite en el scratchpad, Playwright con el Chromium en caché): cuenta nueva con la plantilla; Mi cuenta muestra 7 filas (sin "por aprobar" porque no aprueba); cambiar "Sobrestock" a "Los lunes" guarda y aparece "Volver a los valores de su perfil", que lo devuelve a "Primer día hábil del mes"; `/productos?estado=agota` abre filtrado (2 de 2); en la ficha de LIJ-0120 (5,4 semanas) "sobra desde 4" la pasa a sobrestock; correo de un lunes armado con ese inventario (en cero, se van a agotar, por aprobar, datos sin actualizar, sobran) revisado como imagen. Celular (390 px): Mi cuenta y el correo sin desbordes. Sin errores en la consola. No se mandó ningún correo real (Brevo no está configurado en local).
- **No se hizo o no se verificó:**
  - Un lunes o un primer día hábil real con Brevo: las pruebas simulan el día con `hoy` y capturan el correo.
  - El correo no se probó en Gmail ni Outlook de verdad (solo la imagen del HTML).
  - La ficha muestra el campo en semanas aunque la persona use días o meses (el plan dice "semanas").
  - Una frecuencia cambiada hoy no se aplica a un boletín que ya salió hoy (sale al día siguiente según la tabla).
- **Siguiente paso exacto:** revisar y hacer commit del SP7. Después, SP8 (cierre: documentos, Entregable y declaración de uso de IA).
- **Notas y bloqueos:** copiar la fila 13 de `ENTREGABLE_Y_APP.md` a "Cambios" del Entregable. Diferencia con el plan: el enlace para preparar el pedido es `/pedidos/sugerido` (no existe `/pedidos/nuevo`); quedó anotado en `PLAN_ALPHA_02.md`.

## 2026-10-29 (43) — Claude — Plan del SP7 definido (solo boletín diario)
- **Rama:** `empresas-inventario-diario`, solo en local y sin commit.
- **Estado:** solo se reescribió la sección SP7 de `docs/PLAN_ALPHA_02.md`; no se tocó código. Decisiones del equipo: único canal el boletín diario (sin avisos inmediatos), tipo nuevo `porRecibir`, tabla de valores por defecto por perfil, sin festivos, `usuarios.boletin` sigue de interruptor general, `sobran` con umbral por producto (`productos.sobra_semanas`, 12 por defecto) y `sinDatos` solo para el administrador y los operadores.
- **Archivos tocados:** `docs/PLAN_ALPHA_02.md`, `docs/HANDOFF.md`.
- **Verificación:** ninguna (solo documentos).
- **Siguiente paso exacto:** implementar el SP7 según el plan: columna `productos.sobra_semanas` (ALTER en `ESQUEMA`), `preferencias.alertas` con los valores por defecto, secciones nuevas en `boletin-correo.js` y `resumen` por tipo en `boletin.js`, tabla en Mi cuenta, pruebas. Antes, commit de las entradas 37 a 42.
- **Notas y bloqueos:** `sobra_semanas` cambia lo que ve el usuario en Productos y el panel: fila en "Cambios". El plan no agrega otra tarea programada.

## 2026-10-29 (42) — Claude — SP6 de PLAN_ALPHA_02: aprobación, trazabilidad y PDF de la empresa
- **Rama:** `empresas-inventario-diario`, solo en local y sin commit (encima de las entradas 37 a 41, que tampoco tienen commit).
- **Estado:** SP6 completo.
  - **Aprobación (D11), solo desde lo sugerido:** quien administra marca "Puede aprobar pedidos" y el cargo de cada persona en Mi empresa. Con alguien que aprueba, quien no aprueba envía el pedido (`POST /:id/enviar`) y ya no lo puede cambiar; quien aprueba lo ve en "Por aprobar" (Pedidos, con contador en el menú), ajusta líneas y lo aprueba (`/aprobar`: cerrado y en camino) o lo devuelve con un comentario obligatorio (`/devolver`: vuelve a editable, con aviso ámbar). Quien aprueba cierra los suyos con "Aprobar y cerrar" y queda como aprobado por él. Sin nadie que apruebe, todo queda como antes (cerrar directamente, PDF con la firma en blanco).
  - **Medición:** la aceptación se mide al enviar (`POST /lista-final` justo antes). Lo de quien aprueba va en `comparacion.aprobacion` (contra `pedidos.lista_enviada`). Ninguna de las dos se devuelve a la pantalla.
  - **Trazabilidad:** `server/trazas.js` + tabla `pedido_cambios`. Cada `PUT`/`POST /lista-final` y "Agregar al pedido" anotan lo que cambió; misma persona y código en 10 minutos = una fila (si vuelve a lo de antes, se borra). Desplegable "Historial" en el pedido con cambios y estados (enviado, devuelto con motivo, aprobado…). `catalogo_editado` (lote) guarda el antes y el después.
  - **PDF y Excel:** logo de la empresa arriba (o el de SINESC si no hay), "Hecho con SINESC" con el monograma al pie, título "Pedido N aprobado" o "para aprobar", y "Preparado por" / "Aprobado por" con nombre, cargo y fecha escritos. Logo en Mi empresa (PNG o JPG ≤ 300 KB; se valida abriéndolo con pdfkit). Cargo al crear la cuenta, en Mi cuenta y en Mi empresa.
- **Archivos tocados:** server: `trazas.js` (nuevo), `db, cuentas (cargo, aprueba en la sesión), empresas (miembros, logo), pedidos (aprobación, pedidoVisible/pedidoEditable/pedidoParaAprobar, vistaPedido con usuario), pdf (abrirImagen, firmas), excel (logo), exportar, movimientos (antes en el lote)`; web: `pedido-preparar` (aprobar, devolver, enviar, historial), `pedido-flujo` (tipos, sin Anular/Borrar en pedidos ajenos), `pedidos` (Por aprobar, estados), `marco` (contador, `EVENTO_POR_APROBAR`), `empresa`, `cuenta`, `cuenta-formularios`, `ui` (`ChipAprobacion`), `lib/tipos.ts`; pruebas nuevas `test/aprobacion.test.js` (9); docs `CLAUDE.md`, `ENTREGABLE_Y_APP.md` (fila 12), `PLAN_ALPHA_02.md`.
- **Base de datos:** `usuarios.{aprueba, cargo}`, `pedidos.{enviado_en, lista_enviada, aprobado_en, aprobado_por, devuelto_en, devuelto_motivo}`, `empresas.{logo, logo_tipo}`, tabla `pedido_cambios` con índice.
- **Verificación:** `npm test` → 181/181; `tsc --noEmit` limpio; `npm run texto` → 0 con tuteo. En el navegador (`npm run dev` con PGlite en el scratchpad, Playwright 1.63): Gloria crea la empresa con cargo, sube el inventario e invita a Carlos (se une con su cargo); Gloria se marca como aprobadora y sube el logo; Carlos prepara, cambia una cantidad y envía; Gloria ve "Por aprobar" y el contador 1, ajusta una línea y devuelve con motivo; Carlos ve el aviso y reenvía; Gloria aprueba; historial con 7 entradas; PDF con logo, "Pedido 1 aprobado" y las dos firmas con nombre, cargo y fecha. Celular (390 px): el pedido, Mi empresa y Pedidos sin desbordes. En la consola solo el script de Speed Insights bloqueado por la CSP en desarrollo (ya conocido).
- **No se hizo o no se verificó:**
  - El modo "Comparar con mi propia lista" no tiene aprobación ni historial (no estaba en el plan).
  - Quien prepara no puede "retirar" un pedido enviado: si hace falta cambiarlo, quien aprueba lo devuelve.
  - El boletín no avisa de pedidos por aprobar: es el tipo `porAprobar` del SP7.
  - No se probó en el navegador un logo JPG ni uno muy ancho (la prueba de la API usa PNG; el Excel limita el ancho del logo a 110 px).
- **Siguiente paso exacto:** revisar y hacer commit de las entradas 37 a 42. Después, SP7 (alertas configurables, con `porAprobar`).
- **Notas y bloqueos:** copiar la fila 12 de `ENTREGABLE_Y_APP.md` a "Cambios" del Entregable. Si el SP6 se publica durante el piloto, la aceptación de los pedidos enviados sigue midiendo a quien prepara (no cambia el tratamiento), pero el equipo debe anotar la fecha.

## 2026-10-29 (41) — Claude — SP5 de PLAN_ALPHA_02: entradas, salidas y datos al día
- **Rama:** `empresas-inventario-diario`, solo en local y sin commit (encima de las entradas 37 a 40, que tampoco tienen commit).
- **Estado:** SP5 completo, salvo lo de Siigo (1.7), que es del equipo.
  - **Llegada y en camino** (`server/recepcion.js`): al cerrar un pedido real, `pedidos.recibido = {}`. "Por recibir" en Pedidos (cualquiera de la empresa) y "Llegada del pedido" en el pedido cerrado, por proveedor, con lo pedido precargado; 0 = no llegó. `POST /api/pedidos/:id/recibir` crea entradas con `movimientos.pedido_id` (crea el producto en el catálogo si falta). Anular la entrada la deja otra vez en camino. Lo pendiente se descuenta del sugerido y quita el "pedir ya"; chip "En camino: N · pedido el 29 oct" en Productos, la ficha, el panel y Preparar pedido. No cuentan los cerrados antes del SP5, anulados, simulados ni los de hace más de 120 días.
  - **Ventas de un periodo** en Movimientos ("Varios a la vez" → "Ventas de un periodo"): `movimientos.desde`, repartidas por día; si empiezan antes del archivo base se cuenta la parte proporcional, con aviso (también en el kardex).
  - **Hoja e importar:** "Varios a la vez" usa la hoja de `hoja.tsx` (pegar de Excel, errores marcados por fila) e "Importar de un archivo" (`POST /api/movimientos/importar`, reutiliza `importarLista`; no guarda nada). Las dos tarjetas de Movimientos quedaron una debajo de la otra para que la hoja tenga ancho.
  - **Códigos que no coinciden:** `revisarCodigos` en el reporte (`codigos`); alerta si menos de la mitad de los códigos vendidos están en las existencias (5 o más), con el aviso primero. `SubirArchivos` la muestra antes de seguir ("Seguir con estos datos"); Datos muestra la lista plegada aunque no haya alerta. CSV para descargar y parejas probables.
  - **Datos al día:** etiqueta "Datos de hoy / de ayer / de hace N días" en el panel (verde, ámbar o rojo por días hábiles; lleva a Movimientos); texto en Datos y en la primera pantalla (`sin-inventario.tsx`).
  - **`empresas.mapeos`:** las columnas, documentos y canales recordados son de la empresa; se lee lo de la persona debajo.
- **Archivos tocados:** server: `recepcion.js` (nuevo), `db, saldos, movimientos, pedidos, inventario, inventario-rutas, boletin, rotacion`; web: `components/app/recepcion.tsx` (nuevo), `movimientos, pedidos, pedido-flujo (ImportarLista con ruta y campos; tipo Pedido.recepcion), pedido-preparar, productos, panel, datos, subir, sin-inventario, ui (ChipsProducto)`, `lib/tipos.ts`; pruebas nuevas `test/recepcion-datos.test.js` (11); docs `CLAUDE.md`, `modelo-rotacion.md` (§10), `ENTREGABLE_Y_APP.md` (fila 11), `PLAN_ALPHA_02.md`.
- **Base de datos:** `movimientos.{pedido_id, desde}`, `pedidos.recibido`, `empresas.mapeos`, índice `movimientos_pedido`.
- **Verificación:** `npm test` → 172/172; `tsc --noEmit` limpio; `npm run texto` → 0 con tuteo. En el navegador (`npm run dev` con PGlite en el scratchpad, Playwright 1.63): negocio "ferretería" cargado, pedido sugerido de 22 líneas cerrado, "Por recibir" con 6 proveedores, llegada de Cementos registrada (una cantidad cambiada a 1), entradas en Movimientos como "llegada de un pedido", chips "En camino" en Productos y "Pedir ya 0", panel con "Datos de hoy", 2 ventas de un periodo guardadas desde la hoja, y en Datos dos CSV con códigos distintos mostraron la alerta y 6 parejas. Celular (390 px): Pedidos, Movimientos, Panel, Productos, el pedido y Datos sin desbordes. Sin errores en la consola.
- **No se hizo o no se verificó:**
  - Una llegada parcial cierra la línea (lo que falte se registra como entrada en Movimientos si llega). Si el equipo prefiere que lo faltante siga en camino, se cambia en `recibidaDe`/`sumarEnCamino`.
  - No se probó en el navegador el formulario de columnas de "Importar de un archivo" en Movimientos (la prueba de la API sí lee un CSV).
  - El boletín no tiene sección de "por recibir" (es del SP7).
  - Siigo (1.7): nada nuevo en `sistemas.ts`; falta que el equipo confirme con Claudia qué informes usar.
- **Siguiente paso exacto:** revisar y hacer commit de las entradas 37 a 41. Después, SP6 (aprobación, trazabilidad y PDF de la empresa).
- **Notas y bloqueos:** copiar la fila 11 de `ENTREGABLE_Y_APP.md` a "Cambios" del Entregable. Los pedidos de Alpha 0.1 ya cerrados no aparecen en "Por recibir" (tienen `recibido` NULL), a propósito.

## 2026-10-29 (40) — Claude — SP4 de PLAN_ALPHA_02: catálogo y motor de reabastecimiento
- **Rama:** `empresas-inventario-diario`, solo en local y sin commit (encima de las entradas 37 a 39, que tampoco tienen commit).
- **Estado:** SP4 completo, salvo lo que dice "No se hizo".
  - **Catálogo:** `productos.{familia, multiplo, minimo_pedido}`. La familia se lee del archivo (columna `familia` en `formatos.js`; solo si trae letras) y `agregarAlCatalogo` la llena sin pisar lo escrito. Se editan en la ficha (`EditarCatalogo`) o pegando código, familia, caja y mínimo (`CatalogoEnLote`, `POST /api/catalogo/lote`: todo o nada, celda vacía borra, columna ausente no toca). `catalogoConEscrito` los aplica en `/api/inventario`, Preparar pedido, el sugerido del paso 4, la exportación y el boletín. `empresas.catalogo_cambio_en` invalida el caché.
  - **Sugerido:** con múltiplo, `aLote(multiplo)` en vez de `loteDe` (también el máximo; admite decimales). Si queda entre 0 y el mínimo, sube al mínimo. `detalleSugerido` trae `falta`, `lote`, `loteOrigen` y `minimoPedido`.
  - **Días hábiles:** `ajustes.entregasDias` y `entregaPorDefectoDias` (semanas = días ÷ 5); sin días se usan las semanas de antes. Datos los escribe en días hábiles, con los ejemplos de Orlando. "Cada cuánto pide" y el umbral se muestran y se mueven en la unidad elegida (`Contador` con `unidad`). El paso 4 todavía manda semanas y `PUT /ajustes` las convierte.
  - **Proyectos (D12):** opción "De proyecto" en la pregunta de documentos; columna `canal` (centro de costo, OT, proyecto, cotización, cliente) con `necesitaCanal` si trae de 2 a 50 valores (`PreguntaCanal`, rutas `/export/:id/canales` en pedidos e inventario, `exports.canales`, `mapeos.canales`); casilla "Es para un proyecto" en las ventas de Movimientos (`movimientos.proyecto`). `rotacion.js` guarda `vendidoProyecto` y la señal `proyecto`; `series.js`, `series.proyecto` aparte; `saldos.js` conserva la marca; el gráfico del catálogo las suma como proyectos.
  - **Clasificación:** `clasificar` (frecuente, esporádico, proyecto, única) y `ventaAlta` (20 % que más vende por semana). Etiquetas (`ChipsProducto`) y filtros "Familia" y "Cómo se vende" en Productos y en Preparar pedido. La foto del pedido guarda `familia` y `clase`.
  - **Pedido reciente:** `pedidosRecientes` / `conPedidosRecientes` (`inventario-rutas.js`): lo cerrado por la empresa en 14 días, sin borrados ni anulados, se pone después del caché. Etiqueta "Pedido hace N días" en Productos (y una línea en la ficha), el panel y Preparar pedido; filtro "Pedidos en las últimas 2 semanas".
  - **Cómo se calcula** (`ComoSeCalcula` en `components/app/catalogo.tsx`): reemplaza "¿De dónde sale el número?" en la ficha; en el paso 3 aparece con el producto de ejemplo si el inventario de la empresa es el mismo archivo del reporte.
  - **Arreglos de paso:** `/pedidos/sugerido` creaba dos borradores en desarrollo (el efecto corre dos veces): `abrir-pedido.tsx` reutiliza la misma petición. La tabla de Movimientos desbordaba en celular (`relative`, como en Pedidos). La ficha muestra el tiempo del proveedor en días hábiles si está escrito.
- **Archivos tocados:** server: `db, formatos, lector, rotacion, series, saldos, pronostico (aLote), inventario, inventario-rutas, movimientos, pedidos, boletin`; web: `components/app/catalogo.tsx` (nuevo), `productos, pedido-preparar, panel, datos, movimientos, subir, reporte, ui, contexto, pedido-flujo (tipo LineaSugerida), abrir-pedido`, `lib/tipos.ts`; pruebas nuevas `test/catalogo-motor.test.js` (12); docs `CLAUDE.md`, `README.md`, `modelo-rotacion.md` (§9 y nota en §8.2), `ENTREGABLE_Y_APP.md` (fila 10), `PLAN_ALPHA_02.md`.
- **Base de datos:** `productos.{familia, multiplo, minimo_pedido}`, `empresas.catalogo_cambio_en`, `exports.canales`, `movimientos.proyecto`.
- **Verificación:** `npm test` → 161/161; `tsc --noEmit` limpio; `npm run texto` → 0 con tuteo (46 frases de stop-slop para revisar a mano). En el navegador (`npm run dev` con PGlite en el scratchpad, Playwright): negocio de ejemplo "ferretería" cargado; familia, caja de 24 y mínimo de 200 pegados por la API; Productos con los filtros y la etiqueta "Venta alta"; ficha de CEM-050 con "Cómo se calcula" (faltaban 676, redondeado a cajas de 24 = 696, máximo 792); filtro por familia (3 de "Pinturas"); Datos en días hábiles y guardado (`entregasDias`); venta de proyecto de 30 registrada desde la pantalla; Preparar pedido con los filtros nuevos; pedido cerrado y 21 productos con "Pedido hoy"; panel. En celular (390 px) Productos, Datos, Movimientos y Pedidos no desbordan. Sin errores en la consola.
- **No se hizo o no se verificó:**
  - El pegado de familia, caja y mínimo es un cuadro de texto con vista previa, no la hoja de `hoja.tsx`: esa hoja está hecha para código, nombre, proveedor y cantidad, y volverla genérica era un cambio grande.
  - No se vieron en el navegador la pregunta de canal ni la opción "De proyecto" de la pregunta de documentos (las pruebas del lector cubren las dos; la pantalla se revisó solo con `tsc`).
  - La demo no trae familias (sus negocios no tienen esa columna), así que ahí no aparece el filtro de familia.
  - "Pedido reciente" no descuenta lo que va en camino del sugerido: eso es el SP5.
- **Siguiente paso exacto:** revisar y hacer commit de las entradas 37 a 40. Después, SP5 (recibir pedidos y "en camino", ventas de un periodo, la hoja para pegar movimientos, códigos que no coinciden, `mapeos` por empresa).
- **Notas y bloqueos:** si el SP4 se publica durante el piloto, anotar la fecha en la fila 10 de `ENTREGABLE_Y_APP.md`. Copiar las filas 9 y 10 a "Cambios" del Entregable. La columna `canal` reconoce "Cliente": en un archivo con 2 a 50 clientes la app va a preguntar cuáles son de proyecto; si eso estorba con los archivos reales, se quita ese sinónimo en `formatos.js`.

## 2026-10-29 (39) — Claude — SP2 y SP3 de PLAN_ALPHA_02: pedido desde lo sugerido, medición del piloto y encuesta
- **Rama:** `empresas-inventario-diario`, solo en local y sin commit (encima de las entradas 37 y 38, que tampoco tienen commit).
- **Estado:** SP2 y SP3 completos.
  - **Pedido desde lo sugerido (D9):** `POST /api/pedidos { modo: 'sugerido' }` toma el inventario de la empresa, guarda la foto (`pedidos.sugerido`, con `cubre` y `rango` para medir después) y precarga la lista final. 403 si la empresa no tiene inventario. Las reglas de los 5 pasos solo aplican al modo `lista` (`exigirModoLista`; 409 en el otro). Al cerrar, `comparacion.aceptacion` (`medirAceptacion`, que reutiliza `compararListas`) y `vistaPedido` no la devuelve. Notas por línea, observaciones, `GET /:id/pedido.pdf|.xlsx?proveedor=` con el nombre de la empresa, el número y la fecha del pedido y quién lo preparó. `GET/POST /api/pedidos/borrador(/linea)` para "Agregar al pedido" desde Productos.
  - **Web:** `pedido-preparar.tsx` (grupos por proveedor en `Desplegable`, solo se dibujan los abiertos; casillas con todas/ninguna por proveedor y para el filtro; filtros por texto, proveedor y estado; cantidad y nota con autoguardado; totales; PDF, Excel y WhatsApp por proveedor; "Cerrar pedido" con el "¿Qué tuvo en cuenta?" opcional). `pedidos.tsx`: "Preparar pedido" (o "Seguir con el Pedido N") y "Comparar con mi propia lista"; columnas Cómo, Estado y Productos. `/pedidos/sugerido` abre o crea el borrador (`abrir-pedido.tsx`). La orden de compra del paso 5 descarga desde el pedido guardado. `pedido-sugerido.tsx` queda solo para la demo. `useAutoguardado` pasó a `autoguardado.ts`; `Desplegable` tiene `alCambiar`.
  - **Real o simulado** salió de la pantalla; el servidor guarda `real`.
  - **Inventario sin lista inicial:** `permisos` da `puedeSubir: true` a todos (consecuencia de D9 y D10; sin esto el flujo por defecto no se podía usar). `sin-inventario.tsx` quedó como "suba su inventario o registre movimientos".
  - **Piloto (SP3):** metas provisionales en `server/equipo.js` (30 días; X = 3, Y = 5, satisfacción 4, Z = 70 %, `ACEPTACION_VISIBLE = false`, que todavía no conecta nada). `evaluarPiloto`, `resumirPiloto`, `compararConLoOcurrido` (lo vendido en las semanas que cubría el pedido contra el rango de 8 de cada 10) y `piloto()`. `npm run resultados -- --piloto`, `--json` lo incluye, `--encuesta abrir [--email x]`. La evaluación de Alpha 0.1 cuenta solo pedidos `modo = 'lista'`.
  - **Encuesta (D15):** `server/encuesta.js` (`GET/POST /api/encuesta`, `debeMostrarse`), `components/app/encuesta.tsx` debajo del título del panel.
- **Archivos tocados:** server: `db, pedidos, listas, inventario (detalleSugerido.bajo), inventario-rutas, equipo, encuesta (nuevo), app, pdf, exportar, excel`; `scripts/resultados.js`; web: `components/app/{pedido-preparar,abrir-pedido,encuesta,autoguardado}` (nuevos), `pedido-flujo, pedidos, contexto, productos, panel, datos, sin-inventario, pedido-sugerido, ui`, `lib/descargar.ts`, `app/(app)/pedidos/sugerido/page.tsx`; pruebas nuevas `test/pedidos-sugerido.test.js` (7) y `test/piloto.test.js` (6), y `api.test.js` ajustada; docs `CLAUDE.md`, `ENTREGABLE_Y_APP.md` (fila 9), `PLAN_ALPHA_02.md`.
- **Base de datos:** `pedidos.{modo, sugerido, empresa_id, observaciones}` (con relleno de `empresa_id`), tabla `encuestas`, `usuarios.{encuesta_pedida_en, encuesta_mostrada_en}`, índices `pedidos_empresa` y `encuestas_usuario`.
- **Verificación:** `npm test` → 149/149; `tsc --noEmit` limpio; `npm run texto` → 0 con tuteo. En el navegador (`npm run dev` con PGlite en el scratchpad, Playwright): negocio de ejemplo cargado, "Preparar pedido" con 22 líneas de 6 proveedores, 3 desmarcadas, 2 cantidades cambiadas, una nota y un producto agregado; al recargar quedaron 20 líneas con la nota; PDF de un proveedor descargado (`pedido-1-tornilleria-industrial.pdf`); pedido cerrado con observaciones; "Agregar al pedido" desde Productos abrió un pedido nuevo; celular sin desbordes. Encuesta abierta con `npm run resultados -- --encuesta abrir --email`, respondida en el panel y no vuelve al recargar. Las pruebas leen el texto del PDF (nombre de la empresa, "Preparado por", observaciones, nota y solo las líneas del proveedor).
- **Siguiente paso exacto:** revisar y hacer commit de las entradas 37 a 39. Antes del piloto: el equipo fija X, Y y Z (`META_PILOTO_*`, `META_ACEPTACION_PCT` en `server/equipo.js`), hace el SP0 (Neon *Preview*, variables) y publica. **Fecha de inicio del piloto: por fijar.** Después, SP4.
- **Notas y bloqueos:**
  - No se recorrió en el navegador "Comparar con mi propia lista" hasta el paso 5 después de estos cambios (las pruebas de la API sí cubren los 5 pasos y la descarga del paso 5 usa la ruta nueva).
  - "Sugerido contra ocurrido" usa la serie del último inventario de la empresa; cuenta las semanas que empiezan dentro del horizonte (aproximado) y no descuenta festivos en el uso.
  - Copiar la fila 9 de `ENTREGABLE_Y_APP.md` a "Cambios" del Entregable.

## 2026-10-29 (38) — Claude — SP1 de PLAN_ALPHA_02: "usted", letra más grande, desplegables y acciones a la izquierda
- **Rama:** `empresas-inventario-diario`, solo en local y sin commit (encima de la entrada 37, que tampoco tiene commit).
- **Estado:** el SP1 de `docs/PLAN_ALPHA_02.md` está completo.
  - **Usted (D13):** la app, la demo, `lib/api.ts`, los errores del servidor, los correos (invitación, contraseña, boletín, recordatorios), el PDF, las plantillas de Excel y `lib/sistemas.ts` con su copia `public/js/sistemas.js`. Los encabezados quedaron impersonales ("Existencias", "Alcanza para", "Venta en", "Iba a pedir") y el estado `pide` ahora dice **"Pedir ya"** en la web y en el boletín. La landing y `public/js/app.js` no se tocaron.
  - **Regla de tuteo** en `scripts/revisar-texto.js` (`TUTEO`): pronombres, verbos en segunda persona e imperativos. Los imperativos que se escriben igual que la tercera persona ("revisa", "usa") solo cuentan al comienzo de una frase. Ahora revisa también `server/*.js` y `lib/sistemas.ts`. `npm run texto` → 0 con tuteo. Exporta `TUTEO` y `fragmentos` para usarlos desde otros scripts.
  - **Letra:** escala con tokens en `.tema-app` (`globals.css`): `text-etiqueta` 0,8 rem (solo las etiquetas en mayúsculas), `text-nota` 0,875, `text-chico` 0,9375 y `text-cuerpo` 1 rem. Ya no queda ningún `text-[0.7–1rem]` ni `text-xs` en la app. `cn()` (`lib/utils.ts`) usa `extendTailwindMerge` para que esos tamaños no se borren al lado de un color. El `h1` de `Titulo` subió a 2,1 / 2,35 rem.
  - **`Desplegable`** (`ui.tsx`): borde, título en el color principal y una flecha que gira. Reemplaza los 11 `<details>` (paso 3, paso 4, paso 5, reporte, ficha del producto, guía de Subir). Admite `tono="ambar"` y `abierto`.
  - **Acciones a la izquierda:** `Titulo` pone las acciones debajo del título, la principal primero (Panel y Existencias se reordenaron). En los pasos 1, 3, 4 y 5 el botón principal queda a la izquierda, y "Volver" y el estado del autoguardado a su derecha. En la ventana de confirmación el botón de confirmar va primero.
  - **Explicar antes de usar:** Existencias explica para qué sirve el conteo en el subtítulo. Movimientos, Umbral, Proveedores y Mi empresa ya traían su explicación.
  - **Celular:** se corrigió lo que se salía de la pantalla: la tabla de Existencias y la lista de proveedores del paso 4 (`grid-cols-1`), un `sr-only` de la tabla de Pedidos (`relative`) y los dos botones largos del paso 4 (ahora pasan a dos líneas).
- **Archivos tocados:** `scripts/revisar-texto.js`; web: `app/globals.css`, `lib/{utils,api,sistemas}.ts`, `app/demo/page.tsx`, casi todo `components/app/` (`ui.tsx` con `Desplegable` y `Titulo`); `public/js/sistemas.js`; server: los mensajes de `app, boletin, boletin-correo, cuentas, demo, empresas, exportar, inventario-rutas, lector, limites, movimientos, pdf, pedidos, plantillas, recordatorios, rotacion, saldos`; `test/empresas.test.js` (un texto).
- **Base de datos:** sin cambios.
- **Verificación:** `npm test` → 136/136; `tsc --noEmit` limpio; `npm run texto` → 0 con tuteo (y 42 frases de stop-slop para revisar a mano, 2 menos que antes). En el navegador (`npm run dev`, base en memoria, Playwright desde el scratchpad): cuenta del equipo con un negocio de ejemplo y un pedido llevado hasta el paso 4; capturas de Panel, Productos (y la ficha), Pedidos, pasos 3 y 4 (con un `Desplegable` abierto), Datos, Movimientos, Existencias, Mi empresa, Mi cuenta y Entrar en escritorio, y Panel, Pedidos, paso 4, Datos y Existencias en celular (390 px). Ninguna página es más ancha que la pantalla. En la consola solo aparecen el script de Speed Insights bloqueado por la CSP en desarrollo (viene del PR de Speed Insights) y un aviso de hidratación en `/entrar` la primera vez que compila, que no se repite al recargar.
- **Siguiente paso exacto:** SP2 (pedido desde el sugerido). Antes, revisar el diff de las entradas 37 y 38 y hacer commit si el equipo lo aprueba.
- **Notas y bloqueos:**
  - `pedido-sugerido.tsx` también pasó a "usted" aunque el plan decía no tocarlo: el SP2 reutiliza su mensaje de WhatsApp y sus avisos. Solo cambió el texto, no la pantalla.
  - Para correr `tsc` hubo que instalar `@vercel/speed-insights` en local (estaba en `package.json` pero no en `node_modules`) y borrar `.next/dev/types`, que tenía una referencia vieja a `/equipo`.
  - Falta la fila de "Cambios" en `ENTREGABLE_Y_APP.md` para "usted", la letra y "Pedir ya". El plan la deja para el SP8.

## 2026-10-29 (37) — Claude — plan Alpha 0.2 → piloto (retroalimentación de las pruebas)
- **Rama:** `empresas-inventario-diario`, solo en local y sin commit.
- **Estado:** solo el plan, sin código. `docs/PLAN_ALPHA_02.md` cruza el backlog de `docs/Retroalimentación Pruebas.md` con lo que ya existe y lo reparte en 9 sub-planes (SP0 a SP8), cada uno de una sesión más o menos. Las decisiones D9 a D16 se acordaron con Santiago el 2026-10-29:
  - Dos flujos de pedido: el sugerido por defecto y los 5 pasos como "Comparar con mi propia lista".
  - La prueba de Alpha 0.1 ya cerró.
  - Aprobación sencilla.
  - Los proyectos se separan por una columna del archivo.
  - "Usted" en la app, los correos y el PDF; la landing no se toca.
  - Los Hitos 9 y 10 quedan fuera.
  - La encuesta va dentro de la app.
  - Las metas son constantes provisionales, y la aceptación no se le muestra a nadie durante el piloto.
- **Archivos tocados:** `docs/PLAN_ALPHA_02.md` (nuevo), `docs/PLAN_EMPRESAS_INVENTARIO.md` (estado), esta bitácora. `docs/Retroalimentación Pruebas.md` sigue sin versionar.
- **Base de datos:** sin cambios (el plan lista las columnas y tablas de cada sub-plan).
- **Verificación:** no aplica (no hay código).
- **Siguiente paso exacto:** SP0. Una persona del equipo hace la rama de Neon para *Preview*, pone `CRON_SECRET` y `BOLETIN_SECRETO` y saca una copia de la base de producción; después se publica Alpha 0.2. En paralelo, Claude puede empezar el SP1 (experiencia y tono).
- **Notas y bloqueos:** si el piloto de un mes espera a todos los sub-planes, no cabe en el semestre. La recomendación es empezarlo después del SP3 y publicar los SP4 a SP7 durante el piloto, cada uno con su fecha en "Cambios". El equipo tiene que fijar X, Y y Z (`META_PILOTO_*` en `equipo.js`) antes de arrancarlo.

## 2026-10-28 (36) — Claude — Interfaz autocontenida: sin resultados de la prueba en la aplicación
- **Rama:** `empresas-inventario-diario`, sin commit (encima de la entrada 35, que tampoco tiene commit).
- **Estado:** la aplicación es el producto para el usuario, sin nada de la clase ni de la hipótesis (pedido del equipo).
  - Se quitaron la pantalla "Resultados de la prueba" (`/equipo`, `components/app/equipo.tsx`), su enlace en el menú, las rutas `/api/equipo/*` (salvo `/api/equipo/ejemplos`) y `GET /api/errores`. También en la interfaz antigua de `public/`.
  - Lo del equipo pasó a la terminal: `npm run resultados` (`scripts/resultados.js`) con `--json`, `--errores`, `--clasificar`, `--anular`, `--reactivar`, `--equipo` y `--restablecer`. `server/equipo.js` ahora exporta funciones, sin rutas. `npm run boletin -- --email` reemplaza el botón "Enviarme el boletín de hoy".
  - Textos: ninguno habla de "la prueba", "probadores" o "14 días" (panel, pedido sugerido, pedidos, datos, olvidé mi contraseña, ejemplos, FAQ de la página principal sobre quién ve los datos).
  - Paso 4: sin el marcador "llevas N líneas cambiadas" (queda "Tu pedido: N productos, unidades" y la columna "Cambio" de cada fila). Paso 5: se llama "Tu pedido", el resumen de lo que cambió va plegado y la pregunta es opcional ("¿Qué tuviste en cuenta para decidir tu pedido?"); sin texto, `por_que` queda en NULL.
- **Archivos tocados:** `server/equipo.js`, `server/errores.js`, `server/app.js`, `server/pedidos.js` (paso 5 opcional), `server/boletin.js` (comentario), `scripts/resultados.js` (nuevo), `scripts/enviar-boletin.js`, `package.json`; web: `marco.tsx`, `solo-equipo.tsx`, `panel.tsx`, `pedido-sugerido.tsx`, `pedidos.tsx`, `datos.tsx`, `cuenta-formularios.tsx`, `ejemplos.tsx`, `pedido-flujo.tsx`, `landing/faq-section.tsx`; borrados `app/(app)/equipo/` y `components/app/equipo.tsx`; `public/js/app.js`; pruebas `api.test.js` y `empresas.test.js`; docs `CLAUDE.md`, `README.md`, `PUBLICAR.md`, `ENTREGABLE_Y_APP.md` (fila 8 de Cambios), `modelo-rotacion.md`.
- **Base de datos:** sin cambios.
- **Verificación:** `npm test` → 136/136 (las de resultados llaman las funciones; una nueva para terminar sin respuesta). `tsc --noEmit` limpio y `next build` bien. En el navegador (compilado, base en memoria): el paso 4 sin conteo de líneas, el paso 5 "Tu pedido" terminado sin respuesta, `/equipo` y `/api/equipo/resultados` dan 404, el menú del equipo muestra solo Ejemplos y ninguna pantalla dice "prueba". `npm run resultados` probado con una base vacía.
- **Siguiente paso exacto:** hacer commit de las entradas 35 y 36 cuando el equipo lo apruebe. La respuesta del paso 5 queda opcional (decisión del equipo, 2026-10-28); falta copiar la fila 8 de Cambios al Entregable.
- **Notas y bloqueos:** cambia el tratamiento de la prueba (fila 8). Sin respuesta escrita no hay nada que clasificar para el segundo criterio de pivote: en la llamada con cada probador hay que preguntarle en voz alta qué tuvo en cuenta. Los comentarios del código siguen hablando de la prueba y del Entregable (son para el equipo, no para el usuario).

## 2026-10-28 (35) — Claude — Alpha 0.2 implementada: empresas, perfiles, inventario diario, horizonte y boletín
- **Rama:** `empresas-inventario-diario`, en local y **sin commit** (el usuario pidió no hacerlo todavía).
- **Estado:** las fases 1 a 6 de `docs/PLAN_EMPRESAS_INVENTARIO.md`, con D1 a D8 como se acordaron.
  - **Empresas:** `server/empresas.js` (GET/PUT `/api/empresa`, invitaciones de un solo uso por 7 días, sacar a alguien). `POST /api/cuenta/crear` exige `empresa` o `invitacion`. Los usuarios de antes quedan con su empresa vacía (relleno idempotente al final de `ESQUEMA`) y no invitan hasta ponerle nombre. El inventario (exports, catálogo, movimientos, ajustes) pasó a la empresa; los pedidos y la métrica siguen por persona.
  - **Perfiles:** `usuarios.perfil`, `PUT /api/cuenta/perfil`, `resumirParaOperador`. Selector en el menú lateral; el menú del operador empieza por Movimientos y Existencias, y su panel muestra "Sobran" y "Ya en cero" en vez de dinero quieto y tendencia. Datos: el operador ve los ajustes sin editarlos.
  - **Horizonte:** `usuarios.preferencias` (`unidad`, `horizonte`), `PUT /api/cuenta/preferencias`, `?horizonte=` en `/api/inventario` y en la demo, `ventaHorizonte` por producto. En la web, `fijarUnidad` en `lib/formato.ts` y `SelectorTiempo` (`components/app/vista.tsx`) en Panel, Productos, el reporte del paso 3 y Mi cuenta.
  - **Inventario diario:** `server/saldos.js` (puro) y `server/movimientos.js` (`/api/catalogo`, `/api/movimientos`, `/api/existencias`, `inventarioAlDia`). Pantallas `movimientos.tsx` (uno por uno o pegado desde Excel; crear el producto si falta) y `existencias.tsx` (kardex y conteo físico). `calcularRotacion` y `seriesSemanales` aceptan `hastaDia`.
  - **Boletín:** `server/boletin.js` y `boletin-correo.js`, tabla `boletines`, Cron en `inventory-forecasting-landing-page/vercel.json` (11:00 UTC), `npm run boletin`, interruptor en Mi cuenta y al crear la cuenta, "Enviarme el boletín de hoy" en Resultados de la prueba, baja firmada de un clic.
  - La versión vieja de `public/` pide el nombre de la empresa al crear la cuenta (si no, ya no podía crear cuentas).
- **Archivos tocados:** server: `db, cuentas, empresas (nuevo), movimientos (nuevo), saldos (nuevo), boletin (nuevo), boletin-correo (nuevo), inventario, inventario-rutas, pedidos, equipo, ejemplos, demo, borrar, correo, rotacion, series, app`; web: `components/app/{contexto,cuenta,cuenta-formularios,datos,equipo,marco,panel,productos,reporte}.tsx`, nuevos `{empresa,existencias,movimientos,vista}.tsx`, rutas `app/(app)/{empresa,existencias,movimientos}`, `lib/{formato,tipos}.ts`, `vercel.json`; `scripts/enviar-boletin.js`, `package.json`; pruebas nuevas `test/{empresas,saldos,boletin}.test.js` y `test/api.test.js` (las cuentas de prueba llevan empresa); docs: `CLAUDE.md`, `README.md`, `docs/{PUBLICAR,ENTREGABLE_Y_APP,modelo-rotacion,PLAN_EMPRESAS_INVENTARIO}.md`.
- **Base de datos:** tablas `empresas`, `invitaciones`, `productos`, `movimientos`, `boletines`; columnas `usuarios.{empresa_id, admin_empresa, perfil, preferencias, boletin}` y `exports.{empresa_id, origen, base_export_id, movimientos}`; tres sentencias de relleno al final de `ESQUEMA`. `usuarios.inventario` queda sin borrar (los ajustes se copiaron a `empresas.inventario`).
- **Verificación:** `npm test` → 135/135 (24 nuevas); `tsc` sin errores. En el navegador (local, base PGlite aparte en el scratchpad): crear cuenta con empresa, cargar un negocio de ejemplo, panel en días, semanas y meses, cambio a operador (menú y Existencias), pantalla de Movimientos; una venta y una entrada registradas por la API desde la página (106 − 6 + 40 = 140) y el panel quedó "al día" con origen `movimientos`. Sin errores en el servidor.
- **No se hizo o no se verificó:**
  - Fase 0: la rama de Neon y `CRON_SECRET` / `BOLETIN_SECRETO` en Vercel (*Preview*). La tiene que hacer alguien con acceso.
  - Los campos que se escriben en semanas (tiempo de entrega, cada cuánto pide, umbral) siguen en semanas; el plan decía aceptarlos en la unidad elegida. El Excel, el PDF y `exportar.js` también siguen en semanas.
  - Pegar varios movimientos es un cuadro de texto (código y cantidad), no la hoja de `hoja.tsx`.
  - `usuarios.mapeos` (columnas recordadas) sigue por persona, no por empresa.
  - No se vio en el navegador después de los últimos ajustes: Existencias con el kardex abierto, los botones de tipo de movimiento ya con su nuevo acomodo, Mi empresa con una invitación y crear cuenta con `?invitacion=`. Las pruebas de API sí cubren invitaciones y kardex.
  - El boletín no se ha visto en un programa de correo real (sin Brevo configurado en local); las pruebas revisan el texto, el HTML y los encabezados.
- **Siguiente paso exacto:** revisar el diff y hacer commit en la rama; luego la fase 0 y probar en *Preview* con "Enviarme el boletín de hoy".
- **Notas y bloqueos:** no publicar en producción hasta que `/equipo` muestre a los 5 probadores con la ventana cerrada. Agregar las filas de la entrada 7 de `docs/ENTREGABLE_Y_APP.md` en "Cambios" del Entregable 3.

## 2026-10-28 (34) — Claude — plan: empresas, perfiles, inventario diario, horizonte y boletín
- **Rama:** `empresas-inventario-diario` (sale de `main` en `06770b4`), solo en local.
- **Estado:** solo el plan, sin código. `docs/PLAN_EMPRESAS_INVENTARIO.md` tiene las 6 fases, el modelo de datos de cada una, las rutas, las pantallas y las pruebas. Las 8 decisiones (D1 a D8) quedaron acordadas el 2026-10-28 tal como se recomendaron.
- **Archivos tocados:** `docs/PLAN_EMPRESAS_INVENTARIO.md` (nuevo), esta bitácora.
- **Base de datos:** sin cambios todavía (el plan lista las tablas y columnas nuevas).
- **Verificación:** no aplica (no hay código).
- **Siguiente paso exacto:** fase 0 (rama de Neon solo con el esquema para el entorno *Preview* de Vercel) y después fase 1 (empresas).
- **Notas y bloqueos:** con D5 se deja atrás la regla "sin cron" del 2026-10-11, solo para el boletín; `CLAUDE.md` se corrige en la fase 6. Nada de esto se despliega en producción mientras un probador siga en sus 14 días.

## 2026-10-14 (33) — Claude — lo que salió de la primera prueba: proveedores en el pedido, "+" en el paso 3, existencias y etiquetas
- **Rama:** `main` y `mejoras-modelo`, en los dos repos.
- **Estado:**
  - **Proveedor en la lista:** el archivo de pedido puede traer una columna Proveedor (`CAMPOS_LISTA` de `lector.js`), y la tabla del paso 1 la muestra (`conProveedor` en `hoja.tsx`, con los proveedores conocidos para elegir). Al guardar la lista inicial o la final, cada producto queda atado a su proveedor en `usuarios.inventario.asignaciones` (`asignarProveedores` en `pedidos.js`): lo mismo que asignarlo en Datos o en la ficha. Arriba de la tabla, el panel "Proveedores" muestra los de Datos y los de la lista, cada uno con cuánto tarda (se guarda en los mismos ajustes), y deja agregar uno nuevo. `GET /api/inventario` devuelve los ajustes aunque todavía no haya archivo.
  - **Paso 3:** "Se agotan y no están en tu lista" trae los 15 que más se venden, cada uno con su cantidad (la sugerida, o la que escriba) y un botón "+" que lo agrega a la lista final (`PUT /lista-final`). El pedido se recarga al cambiar de paso para que el paso 4 los muestre.
  - **Paso 4:** columna "Tienes" (existencias del archivo). "Con tu cantidad, dura" usa la misma venta por semana del reporte que "Te alcanza hoy" (antes usaba el pronóstico y con 0 no daba lo mismo). El detalle dice "Hoy tienes X y vendes Y por semana: te alcanza para Z".
  - **Días:** menos de una semana se muestra en días (`alcance` y `alcancePartes` en `lib/formato.ts`), en el panel, productos, reporte, pedido de la semana y los pasos.
  - **Etiquetas:** Agotado (existencias en 0), Se va a agotar, Pide ya, Bien, Sobrestock, Sin ventas (`textoEstado` y `ChipEstado` con `existencias` en `ui.tsx`).
- **Base de datos:** sin cambios (las asignaciones van en `usuarios.inventario`).
- **Verificación:** `npm test` → 111/111; `tsc` sin errores; en el navegador (local): pedido importado con columna de proveedor (23 productos, 5 proveedores), tiempo de un proveedor cambiado desde el paso 1 y visto en el inventario, dos productos agregados con "+" en el paso 3 y vistos en el paso 4, cuentas de "Te alcanza" y "dura" revisadas a mano.
- **Siguiente paso exacto:** seguir las pruebas con usuarios.
- **Notas y bloqueos:** el "+" del paso 3 y el sugerido cambian lo que ve el probador: van en "Cambios" del Entregable.

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
