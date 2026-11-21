# SINESC · Rotación de inventario

SINESC es para gerentes y administradores de inventario que coordinan el reabastecimiento en distribuidoras y comercializadoras. El usuario sube el informe de ventas y existencias que ya saca de su programa contable y ve sus productos ordenados por **semanas de inventario restantes**. Arriba aparece lo que se agota primero y, marcado aparte, lo que sobra.

En línea: **https://sinesc.vercel.app** (Vercel + Neon).

**Stack:** Next.js 16 (React 19, Tailwind 4) para la interfaz; API en Express 5 dentro del mismo proyecto; PostgreSQL en Neon (PGlite en local); correo con Brevo; un Vercel Cron para el boletín diario; PostHog para el embudo y los Core Web Vitals.

## Cuenta de prueba y guion

- **Cuenta con datos de uso:** `p.sanin@uniandes.edu.co` / `12345678`. La crea el equipo en producción con un correo que **no** esté en `TEAM_EMAILS` (las cuentas del equipo ven la pantalla Cuentas con los datos de los demás).
- **Guion del flujo central** (desde una cuenta nueva, en celular o en computador; el detalle está en [`docs/GUIA_PRUEBAS_USUARIO.md`](docs/GUIA_PRUEBAS_USUARIO.md)):
  1. Crear la cuenta con el nombre de la empresa → ve "suba su inventario" y la tarjeta "Invite a su equipo".
  2. Subir en Datos el export del programa contable o la plantilla de ejemplo → ve el panel con lo que se agota, lo que hay que pedir ya y el dinero quieto.
  3. "Preparar pedido" → ve lo sugerido por proveedor, ajusta una línea, lo cierra y descarga el PDF.
  4. Registrar un movimiento en Movimientos → el panel y Existencias muestran las existencias nuevas.
  5. "Invite a su equipo" → copia el enlace; quien lo abre entra a la misma empresa y ve el mismo inventario.

## Qué se está probando

**Piloto de Alpha 0.2** (cerca de un mes, [`docs/PLAN_ALPHA_02.md`](docs/PLAN_ALPHA_02.md)):

> Si SINESC permite registrar entradas y salidas a diario, **X de Y usuarios califican su satisfacción con 4 o más sobre 5 y aceptan el pedido sugerido sin cambios en Z % de las líneas.**

X, Y y Z son provisionales (3 de 5 y 70 %, en `server/equipo.js`) y el equipo las fija antes de empezar. Por defecto, cada pedido arranca con todas las líneas que sugiere el modelo, agrupadas por proveedor ("Preparar pedido"); la persona quita, ajusta o agrega y lo cierra (o lo envía a aprobación). Al cerrarlo, el servidor guarda cuántas líneas sugeridas quedaron igual. Nadie ve ese número en la app durante el piloto. La satisfacción sale de una encuesta de una pregunta dentro de la app, y el uso, de los días hábiles con movimientos. Todo se lee con `npm run resultados -- --piloto` (§4.4 de [`docs/modelo-rotacion.md`](docs/modelo-rotacion.md)).

**Antecedente: la prueba de Alpha 0.1** (cerrada el 2026-10-29). El MVP existía para probar:

> Creemos que un reporte de rotación por producto calculado desde el export del software contable, para gerentes y administradores de inventario que coordinan el reabastecimiento, logrará que **3 de 5 cambien 5 o más líneas de su pedido en 14 días**, medido por las líneas que agrega, quita o ajusta.

**Pivote:** 3 o más de los 5 cambian 0 o 1 línea, o cambian líneas por probar la herramienta y no porque el dato les sirvió.

Para medirlo, cada pedido era un flujo de 5 pasos, con reglas que hace cumplir el servidor. Sigue en la app como "Comparar con mi propia lista":

1. **Lo que iba a pedir:** el usuario anota su pedido antes de ver cualquier número. Al guardarlo queda fijo.
2. **Ventas y existencias:** sube el informe de su programa contable o usa el último.
3. **El reporte:** ve sus productos por semanas de inventario.
4. **Su lista final:** arranca como copia de la inicial y la cambia con el reporte y la cantidad sugerida al lado. La columna "Cambio" muestra la diferencia.
5. **Su pedido:** el pedido queda terminado y sale la orden de compra. Antes, una pregunta opcional: "¿Qué tuvo en cuenta para decidir su pedido?".

La app compara las dos listas por código y cuenta las líneas agregadas, quitadas y con otra cantidad. El veredicto sale de la base de datos con `npm run resultados`; la aplicación no lo muestra.

Además del pedido, la app tiene un panel con lo que hay que atender, la ficha de cada producto con su pronóstico, el riesgo de agotarse antes de que llegue un pedido, el registro diario de entradas y salidas, lo ya pedido que todavía no entra y un boletín por correo con los avisos que cada persona elige.

Documentos:
- [`docs/modelo-rotacion.md`](docs/modelo-rotacion.md): el modelo matemático, la métrica y el pronóstico. Es la fuente de verdad.
- [`docs/ENTREGABLE_Y_APP.md`](docs/ENTREGABLE_Y_APP.md): qué de lo que declara el Entregable 2 corregido hace la app y en qué se aparta.
- [`docs/PUBLICAR.md`](docs/PUBLICAR.md): cómo publicar y actualizar en Vercel + Neon.
- [`docs/PLAN_ALPHA_02.md`](docs/PLAN_ALPHA_02.md): el plan de Alpha 0.2 (SP0 a SP8), sus decisiones y el backlog que quedó fuera.
- [`docs/USO_DE_IA.md`](docs/USO_DE_IA.md): la declaración de uso de IA de Alpha 0.2.
- [`docs/HANDOFF.md`](docs/HANDOFF.md): la bitácora de cada sesión de trabajo. La entrada de arriba dice cómo quedó todo y qué sigue.

## Correr en local

Requisito: Node.js 20 o superior. No hace falta instalar PostgreSQL: sin `DATABASE_URL`, la app usa PGlite (PostgreSQL embebido) y guarda los datos en `data/pglite/`.

```bash
npm install
```

```bash
npm install --no-package-lock --prefix inventory-forecasting-landing-page
```

```bash
TEAM_EMAILS=tu-correo@ejemplo.com npm run dev
```

Abre http://localhost:3000. La página, la demo, las cuentas y la aplicación salen del mismo servidor (Express con Next.js en modo desarrollo). Para correrlo como en producción: `npm run build` y después `NODE_ENV=production npm start`.

| Comando | Qué hace |
|---|---|
| `npm test` | Corre las 208 pruebas automáticas: cálculo, pronóstico, comparación de listas, recordatorios, lector de archivos, demo y API. No necesitan la web. |
| `npm run ejemplos` | Regenera en `ejemplos/` los archivos inventados (CSV estilo Siigo, Excel estilo SAP, ventas por mes, un catálogo de 3.000 productos y un informe de mínimos). |
| `npm run texto` | Revisa los textos de la interfaz buscando frases de relleno. |
| `npm run borrar-datos -- --todos` | Muestra qué cuentas de prueba se borrarían; con `--confirmar` las borra. `--email correo@empresa.co` borra una sola. Las del equipo no se tocan. |

`node inventory-forecasting-landing-page/node_modules/typescript/bin/tsc --noEmit -p inventory-forecasting-landing-page` revisa los tipos de la web. No hay linter.

## Variables de entorno

| Variable | Para qué | Ejemplo |
|---|---|---|
| `DATABASE_URL` | PostgreSQL en producción (Neon). Sin ella se usa PGlite. | `postgresql://usuario:clave@host/db?sslmode=require` |
| `TEAM_EMAILS` | Correos del equipo, separados por coma. Esas cuentas ven "Ejemplos" y "Cuentas" (estado de cada cuenta, cerrar sesiones y borrar una cuenta con confirmación) y no cuentan como probadores. | `ana@grupo1.co,juan@grupo1.co` |
| `APP_URL` | Opcional. La dirección pública, para los enlaces de los recordatorios y de "cambiar contraseña". En Vercel, sin ella, se usa la dirección de producción. | `https://sinesc.vercel.app` |
| `BREVO_API_KEY` y `CORREO_REMITENTE` | Opcionales. Para que el recordatorio, las invitaciones a la empresa y el boletín diario lleguen por correo con [Brevo](https://www.brevo.com). Sin ellas, el recordatorio solo se descarga, la invitación se copia y el boletín no sale. | `xkeysib-…`, `avisos@grupo1.co` |
| `CRON_SECRET` | La clave con la que el Cron de Vercel llama `/api/tareas/boletin` (boletín diario). Sin ella la ruta responde 401. Vercel la manda sola en el encabezado `Authorization`. | una cadena larga al azar |
| `BOLETIN_SECRETO` | Firma los enlaces "Dejar de recibirlo" del boletín. Si falta se usa `CRON_SECRET`. | una cadena larga al azar |
| `NEXT_PUBLIC_POSTHOG_KEY` | Opcional. La clave del **proyecto** de PostHog (empieza por `phc_`, nunca la personal `phx_`). Sin ella no se carga nada. Se lee al compilar: después de ponerla hay que volver a desplegar. | `phc_…` |
| `NEXT_PUBLIC_POSTHOG_REGION` | `eu` si el proyecto de PostHog está en Europa; si no, Estados Unidos. | `us` |
| `NODE_ENV`, `PORT`, `DATA_DIR` | `production` exige HTTPS para la cookie de sesión; el puerto lo pone el hosting; `DATA_DIR=memory://` deja PGlite en memoria (lo usan las pruebas). | |

**Alguien del grupo creó su cuenta con un correo que no está en `TEAM_EMAILS`:** `npm run resultados -- --equipo su@correo.co` lo pasa al equipo para siempre, sin tocar la variable.

## Publicar

Los pasos completos están en [`docs/PUBLICAR.md`](docs/PUBLICAR.md). En corto: un proyecto de Vercel con *Root Directory* `inventory-forecasting-landing-page`, una base de Neon en `DATABASE_URL` y `TEAM_EMAILS`. Las tablas se crean solas al arrancar. No hay migraciones: una columna nueva se agrega como `ALTER TABLE … IF NOT EXISTS` en `server/db.js`.

- En Vercel, la API de Express corre dentro del proyecto de Next como la función `pages/api/[[...ruta]].js`.
- Vercel limita cada petición a 4,5 MB, así que los archivos de más de 300 KB se comprimen en el navegador antes de subirlos.
- Vercel despliega desde el fork (`DavidAlvarez26/proyecto-pm`). Los cambios del grupo llegan con "Sync fork".

## Qué archivos lee

El usuario sube el informe tal como sale de su programa. No tiene que reorganizar columnas.

- **Formatos:** Excel (`.xlsx`, `.xls`, `.xlsm`, `.xlsb`), `.ods`, CSV con `;` o `,` en UTF-8 o ANSI, texto tabulado (`.txt`, `.tsv`, `.prn`), Excel 2003 en XML y "Excel" que en realidad es una página web (`.htm`, `.html`). Un texto plano con extensión `.xls` se lee con fechas día/mes. Hasta 24 archivos a la vez (por ejemplo, dos años sacados mes por mes).
- **Columnas:** se reconocen por sinónimos ([`server/formatos.js`](server/formatos.js)), buscando la fila de encabezados aunque haya títulos arriba. Si falta una, la app sugiere la columna que parece por su contenido y el usuario la elige una vez. La elección se recuerda.
- **Informes de impresora:**
  - salta títulos, "Página X de Y", totales y filas de grupo;
  - corre una columna mal alineada hacia la que tiene los datos;
  - saca el código del paréntesis del nombre;
  - completa años cortados ("01/MAR/202").
- **Kardex (movimientos de entrada y salida):** la cantidad vendida es la de salidas y el saldo de hoy es el del último movimiento. Antes de leerlo, la app muestra qué columna tomó para cada cosa y pregunta qué tipo de documento es cada uno (FV, RM, NC, FC…): **venta**, **devolución de un cliente** o **no cuenta**. Sugiere lo que suele ser cada uno y lo recuerda para la próxima vez. Las devoluciones se restan de lo vendido, en la fecha en que se hicieron. Los productos sin movimientos en el periodo conservan su saldo.
- **Ventas como total de un periodo** (sin fecha por venta): la app pregunta desde y hasta cuándo.
- **Avisos:** el reporte avisa si el archivo llega hasta hace más de un mes (las existencias son las de ese día) o si hay un hueco de más de 45 días sin ninguna venta (casi siempre falta un archivo).
- **Lo que rechaza:** imágenes y PDFs, a propósito (una foto no se compara por código), y las plantillas de SINESC subidas sin llenar.

La guía del paso 2 explica cómo sacar los archivos en Siigo Nube, Siigo Pyme, Alegra, World Office, Helisa, SAP Business One, Siesa, Loggro y ContaPyme ([`lib/sistemas.ts`](inventory-forecasting-landing-page/lib/sistemas.ts)). Cada ruta de menú lleva su fuente, y lo que no se pudo confirmar se dice. Para quien lleva el inventario en Excel hay plantillas descargables: inventario con una columna por mes, ventas y existencias, y lista de pedido. La hoja que se llena viene vacía y el ejemplo va aparte.

Probado con archivos reales: el "Movimiento detalle" de Helisa (26.000 filas) y el "Movimiento de productos" de Siigo Nube (un kardex que declara una sola columna aunque trae de la A a la N). Los archivos reales nunca se versionan: las pruebas usan datos inventados con la misma forma.

## Antes y durante la prueba con los probadores

1. **Pidan a cada probador su export real antes de la prueba** y súbanlo con una cuenta del equipo en un pedido de prueba (o en la página Ejemplos). Si lo lee solo, listo. Si no, la app dice qué columna falta: agreguen su nombre exacto a los sinónimos de ese campo en `server/formatos.js` (en minúscula, sin tildes).
2. **Antes de empezar, borren los datos de prueba,** para que el resumen cuente solo a los probadores: `npm run borrar-datos -- --todos --confirmar` con la `DATABASE_URL` de Neon en la terminal.
3. **Durante la prueba,** `npm run resultados` (con la `DATABASE_URL` de Neon en la terminal) imprime el veredicto y cada probador con:
   - sus pedidos y las líneas que cambió;
   - la coherencia con el reporte y las unidades movidas;
   - cuánto le cuesta equivocarse (productos en cero, los que se agotan, lo que sobra);
   - el recordatorio y si volvió.
   
   Cada respuesta a "¿qué tuviste en cuenta?" sale con el número del pedido, y el equipo la marca con `npm run resultados -- --clasificar <pedido> dato` (o `probar`, el segundo criterio de pivote). Otras opciones: `--json`, `--errores`, `--anular <pedido> "motivo"`, `--reactivar <pedido>` y `--restablecer correo` (enlace para una contraseña nueva cuando no hay correo configurado). La aplicación es un producto para el usuario: no tiene ninguna pantalla con datos de otras cuentas ni con la hipótesis.
4. **PostHog** (si está configurado) graba las sesiones para ver dónde se traba alguien. Las tablas y lo que se escribe quedan tapados. La métrica sigue saliendo de la base de datos.
5. Al terminar, si un probador lo pide (sus archivos son datos de su empresa): `npm run borrar-datos -- --email correo@empresa.co --confirmar`.

## Demo y ejemplos

- `/demo` muestra la aplicación sin cuenta con seis negocios inventados: ferretería, muebles, mobiliario de oficina, refrigeración, papelería y una distribuidora mayorista. Se basan en lo que contaron los entrevistados.
- Con una cuenta del equipo, la página **Ejemplos** deja descargar o cargar en esa cuenta cualquiera de esos negocios o los archivos de `ejemplos/`. Los probadores no la ven.

## Cómo se cumple el documento

| Requisito | Dónde |
|---|---|
| Crear cuenta, iniciar y cerrar sesión; cada usuario ve solo lo suyo | `server/cuentas.js`; los pedidos filtran por usuario (`server/pedidos.js`) y el inventario por empresa |
| Cuenta de empresa (Alpha 0.2, `docs/PLAN_EMPRESAS_INVENTARIO.md`): toda cuenta nueva crea su empresa o entra con una invitación; las de antes quedaron con una "empresa vacía" | `server/empresas.js`, `POST /api/cuenta/crear` (`server/cuentas.js`), relleno en `ESQUEMA` (`server/db.js`), pantalla "Mi empresa" (`components/app/empresa.tsx`) |
| Perfiles analista (detalle) y operador (métricas gruesas e ingreso de inventario), sin separarse por contraseña | `usuarios.perfil`, `PUT /api/cuenta/perfil`, `resumirParaOperador` (`server/inventario.js`), `SelectorPerfil` (`components/app/vista.tsx`) y el menú (`marco.tsx`) |
| Entradas y salidas del día y manejo básico de inventario (catálogo, existencias, kardex, conteo), sin reemplazar la subida del archivo | `server/movimientos.js` y `server/saldos.js`; pantallas `movimientos.tsx` y `existencias.tsx`. El inventario "al día" es un export más (origen `movimientos`) |
| Horizonte en días, semanas o meses | `usuarios.preferencias`, `PUT /api/cuenta/preferencias`, `?horizonte=` en `/api/inventario`; `fijarUnidad` y `horizonteTexto` en `lib/formato.ts`, `SelectorTiempo` en `components/app/vista.tsx` |
| Boletín diario por correo | `server/boletin.js` y `server/boletin-correo.js`, Cron en `inventory-forecasting-landing-page/vercel.json`, `npm run boletin [-- --email x --fecha AAAA-MM-DD]`; se activa en "Mi cuenta" o al crear la cuenta |
| Alertas configurables (SP7): qué avisos trae el boletín y cada cuánto, por perfil; sobrestock por producto | `server/alertas.js` (tipos, frecuencias y valores por perfil), secciones en `server/boletin-correo.js`, `productos.sobra_semanas` en `server/inventario.js`; tabla en Mi cuenta (`components/app/cuenta.tsx`) y campo en la ficha (`components/app/catalogo.tsx`); §11 de `docs/modelo-rotacion.md` |
| Rol de equipo (ve Ejemplos y no cuenta como probador) | `TEAM_EMAILS` o `npm run resultados -- --equipo` (`usuarios.es_equipo`) |
| Proveedores (tabla): productos, tiempo de entrega y cada cuánto se le pide a cada uno en días hábiles, calendario o semanas, y ficha para asignarle productos de varios en varios y escribir el paquete y el mínimo de sus productos y su mínimo de envío; extensión opcional de contenedores para importadores (T14, `server/contenedores.js`) (T12 y T13; gerente y administrador) | `components/app/proveedores.tsx`, `app/(app)/proveedores/page.tsx`, `leerAjustes` en `server/inventario.js` |
| Cuentas para el equipo: estado de cada cuenta, invitaciones del growth loop, códigos de acceso de un solo uso para crear cuentas, suspender y reactivar cuentas, cerrar sesiones y borrar una cuenta (correo exacto + contraseña de quien borra) | `server/cuentas-equipo.js`, `components/app/cuentas-equipo.tsx`, `test/cuentas-equipo.test.js` |
| Flujo de 5 pasos con indicador; no se salta al reporte; se retoma donde quedó | `components/app/pedido-flujo.tsx`. En el servidor: sin lista inicial guardada, subir el export o pedir el reporte responde 403. Los borradores se guardan solos |
| Lista inicial tipo Excel (pegar filas) o importando Excel/CSV; sin imágenes ("real o simulado" ya no se pregunta desde el SP2: el servidor guarda real) | `components/app/hoja.tsx`, `leerLista` en `server/lector.js`. Una lista con solo los productos de ejemplo de la plantilla no se acepta |
| La lista inicial queda fija al guardarla | `UPDATE … WHERE inicial_guardada_en IS NULL`; editarla después responde 409 |
| Borrar un pedido sin terminar | `DELETE /api/pedidos/:id` antes de la lista final; borrado suave (`borrado_en`), no cuenta en el veredicto |
| Export CSV o Excel con ventas y existencias; plantillas descargables | `/plantillas/*.xlsx`, `server/plantillas.js` |
| Reconoce formatos distintos sin reorganizar columnas; errores con fila y columna | `server/lector.js` + `server/formatos.js` (ver "Qué archivos lee") |
| Cada archivo subido queda guardado con su fecha | Tabla `archivos` (contenido y fecha) |
| Cálculo de rotación, casos borde y devoluciones | `server/rotacion.js`, `docs/modelo-rotacion.md` §2–3 |
| Reporte ordenado, lo que se agota (menos del umbral; 2 semanas si no se elige) resaltado, lo que sobra visible, filtros, explicación con un producto del archivo | `components/app/reporte.tsx`; "Qué leímos de tu archivo" dice qué columnas y qué documentos se usaron |
| Umbral de "se agota" que elige cada cuenta (2 semanas si no elige; agregado el 2026-10-13, ver §3.4.1 del modelo) | Paso 2 del pedido (`UmbralDelPedido` en `pedido-flujo.tsx`, `PUT /api/pedidos/:id/semanas-agota`, `pedidos.semanas_agota`, fijo al ver el reporte) y tarjeta en Datos (`datos.tsx`, `semanasAgota` en `leerAjustes`); `conUmbral` y `calcularRotacion` (`server/rotacion.js`), `planearAvisos` (`server/recordatorios.js`); `npm run resultados` muestra el de cada probador y de cada pedido |
| Lista final como copia de la inicial, con el reporte visible mientras se edita | Paso 4: "Vas a pedir", "Ibas a pedir", "Cambio" y "Semanas de inventario", y el botón "Mostrar el reporte" |
| Comparación por código (agregadas, quitadas, cantidad cambiada, total) y "¿Por qué cambiaste lo que cambiaste?" | `compararListas` en `server/listas.js`, paso 5 |
| Resumen del equipo (cuántos cambiaron 5 o más; cuántos 0 o 1) calculado de los datos, fuera de la aplicación | `server/equipo.js`, `scripts/resultados.js` (`npm run resultados`) |
| Registro con fecha de cada ingreso, archivo subido y pedido | Tabla `eventos`. Volver después de 30 minutos sin actividad cuenta como un nuevo ingreso |
| Stickiness corregido (2026-10-07): recordatorio 3 días antes de que un producto con más de 4 semanas llegue a 2 | `server/recordatorios.js` (archivo de calendario, sin tareas programadas), `server/correo.js` (opcional), tarjeta en el paso 3 |
| Cálculo de semanas explicado desglosado | Tres ajustes en `server/rotacion.js` (§3.6 del modelo); explicación en el reporte y en la ficha de cada producto |
| Guía para sacar los archivos según el programa contable | `lib/sistemas.ts` (copia en `public/js/sistemas.js`), con fuentes |
| Ayuda para el segundo criterio de pivote | Coherencia con el reporte y magnitud del cambio (`server/listas.js`); clasificación del "¿por qué?" con `npm run resultados -- --clasificar` |
| Página de cuenta, cambiar y restablecer contraseña | `server/cuentas.js` (`/datos`, `/clave`, `/olvide`, `/restablecer`); sin correo, el equipo genera el enlace desde su vista |
| Todo en español sencillo | Textos de la interfaz y mensajes del servidor |
| Stack declarado en el plan de prueba (Next.js con Postgres y autenticación) | Interfaz en Next.js (`inventory-forecasting-landing-page/`); API en Express dentro del mismo proyecto; PostgreSQL en Neon |
| Panel, ficha de producto, pronóstico y pedido sugerido (después de la prueba) | `server/inventario.js`, `pronostico.js`, `series.js`, `inventario-rutas.js`; §7 del modelo y `docs/PLAN_REESTRUCTURACION.md` |
| Proveedores, mínimos y máximos | Proveedor por producto o por comienzo de código (`usuarios.inventario`); mínimos y máximos en la ficha y en Excel (`/api/exportar/minimos.xlsx`) |
| Reportes por rango de fechas (T7): más y menos vendidos, de proyectos, de venta única y pedidos; solo gerente y administrador | `GET /api/reportes/:tipo?desde=&hasta=` y `/:tipo.xlsx` (`server/reportes.js`, `ventasEnRango` en `server/series.js`) |
| Demo sin cuenta | `server/demo.js` (el mismo cálculo que un archivo real), `/demo` |
| Catálogo y motor de reabastecimiento (SP4, Hito 2 de la retroalimentación): familia, múltiplo de empaque y mínimo de pedido; tiempo de entrega en días hábiles; ventas de proyecto fuera del promedio; clasificación (frecuente, esporádico, de proyecto, venta única, venta alta); "pedido hace N días"; "Cómo se calcula" | `server/inventario.js` (`leerAjustes`, `clasificar`), `server/movimientos.js` (`POST /api/catalogo/lote`, `catalogoConEscrito`), `server/lector.js` (columnas `familia` y `canal`, `necesitaCanal`), `server/rotacion.js` y `series.js` (`vendidoProyecto`, `series.proyecto`), `pedidosRecientes` en `server/inventario-rutas.js`; pantallas `catalogo.tsx`, `productos.tsx`, `pedido-preparar.tsx`, `datos.tsx`, `movimientos.tsx`, `subir.tsx`; §9 del modelo |
| Entradas, salidas y datos al día (SP5, Hito 1 de la retroalimentación): descontar del sugerido lo ya pedido que todavía no entra (T5: sin registrar la llegada); ventas de un periodo; pegar e importar movimientos; códigos que no coinciden entre ventas y existencias; "Datos de hace N días"; columnas recordadas por empresa | `server/en-camino.js` (`pedidosRecientes`, `enCaminoDe`), `server/saldos.js` (`desde`, `recortarAlArchivo`), `server/movimientos.js` (`POST /api/movimientos/importar`), `server/rotacion.js` (`revisarCodigos`), `mapeosDe` en `server/pedidos.js`; pantallas `existencias.tsx`, `movimientos.tsx`, `subir.tsx`, `panel.tsx`; §10 del modelo |

| Experiencia y tono (SP1, Hito 4): "usted" en la app, los errores, los correos, el PDF y el Excel; letra más grande; desplegables visibles; lo obligatorio arriba a la izquierda; "Pedir ya" | Regla `TUTEO` en `scripts/revisar-texto.js` (`npm run texto`); escala `text-etiqueta`/`text-nota`/`text-chico`/`text-cuerpo` en `app/globals.css`; `Desplegable` y `Titulo` en `components/app/ui.tsx` |
| Pedido desde lo sugerido (SP2, D9): arranca con todas las líneas sugeridas, por proveedor; seleccionar todas y excluir; filtros; notas y observaciones; PDF y Excel del pedido guardado con el nombre de la empresa; "Agregar al pedido" desde Productos | `POST /api/pedidos { modo: 'sugerido' }`, `pedidos.sugerido`, `GET /:id/pedido.pdf` y `.xlsx` (`?proveedor=`), `/api/pedidos/borrador` (`server/pedidos.js`); `components/app/pedido-preparar.tsx`, `abrir-pedido.tsx` |
| Medición del piloto y encuesta (SP3, D15, D16): aceptación del sugerido, satisfacción de 1 a 5, uso en días hábiles, sugerido contra decidido contra ocurrido; la aceptación no se muestra | `medirAceptacion` (`server/listas.js`), `evaluarPiloto`, `resumirPiloto`, `compararConLoOcurrido` (`server/equipo.js`), `npm run resultados -- --piloto`; `server/encuesta.js`, `components/app/encuesta.tsx`; §4.4 del modelo |
| Aprobación y trazabilidad (SP6, D11): quien administra marca quién aprueba; enviar, aprobar o devolver con motivo; historial de quién cambió qué; logo, cargo, "Preparado por" y "Aprobado por" en el PDF y el Excel | `usuarios.aprueba` y `usuarios.cargo`, `POST /:id/enviar`, `/aprobar` y `/devolver`, `GET /api/pedidos/por-aprobar` (`server/pedidos.js`), `server/trazas.js` (`pedido_cambios`), `PUT/GET/DELETE /api/empresa/logo` (`server/empresas.js`), `server/pdf.js`, `server/excel.js`; pantallas `pedido-preparar.tsx`, `pedidos.tsx`, `empresa.tsx` |

**Cambio de alcance (2026-10-11, 2026-10-14 y 2026-10-29):** el producto sugiere cuánto pedir y ajusta por temporada y por el tiempo de entrega de cada proveedor (§7 del modelo). Desde el 2026-10-14 el probador lo ve desde el primer día, también en la lista final. Desde el 2026-10-29 (D9) el pedido por defecto arranca con lo sugerido y la persona lo edita; ya no hace falta una lista inicial para ver el inventario. Este cambio va en la columna "Si cambió" de la Solución en el Entregable 3. Sigue sin conectarse al software contable.

## Estructura

```
server/                 la API (Express 5, CommonJS)
  index.js              arranque en local: API + Next.js en un solo servidor
  app.js                rutas, encabezados de seguridad, errores en español
  db.js                 PostgreSQL (pg) o PGlite, y el esquema
  cuentas.js            cuentas, sesiones (cookie HttpOnly), eventos, perfil y preferencias
  empresas.js           empresa, miembros e invitaciones
  movimientos.js        catálogo, entradas y salidas, existencias e inventario al día
  saldos.js             existencias y ventas desde los movimientos (sin base de datos)
  boletin.js            boletín diario (tarea programada) y baja de un clic
  boletin-correo.js     el correo del boletín (texto y HTML), por secciones
  alertas.js            tipos de alerta, frecuencias y valores por perfil del boletín
  limites.js            límite de intentos (entrar, crear cuenta, contraseña)
  pedidos.js            el flujo de 5 pasos y sus reglas
  listas.js             validación y comparación de listas (la métrica)
  equipo.js             resultados de la prueba y veredicto
  cuentas-equipo.js     pantalla Cuentas del equipo: estado de cada cuenta y borrar una cuenta
  lector.js             lectura de exports y listas (Excel, CSV, XML, HTML)
  formatos.js           sinónimos de columnas  ← lo que el equipo ajusta
  valores.js            códigos, números y fechas
  rotacion.js           modelo de rotación (el número del reporte)
  series.js             ventas por semana de cada producto
  pronostico.js         Gamma-Poisson, temporada y acierto medido
  inventario.js         panel: riesgo, sugerido, mínimos, dinero quieto
  inventario-rutas.js   /api/inventario y /api/demo
  recordatorios.js      recordatorio de calendario
  correo.js             envío opcional del recordatorio (Brevo)
  plantillas.js         plantillas descargables
  excel.js, pdf.js, logo.js, exportar.js   archivos con el diseño de SINESC
  demo.js, ejemplos.js  negocios inventados y página Ejemplos
  errores.js            registro de errores (se ve con npm run resultados -- --errores)
  borrar.js             borrado de datos de probadores
inventory-forecasting-landing-page/   página y aplicación (Next.js 16)
  app/                  rutas: página, demo, cuenta y aplicación
  components/landing/   la página principal
  components/app/       pantallas de la aplicación
  lib/                  llamadas a la API, formatos, guías por programa contable
  pages/api/            la API en Vercel
  instrumentation-client.ts   PostHog (solo con su clave)
public/                 versión anterior de la aplicación, sin compilar; se usa si falta la web
docs/                   modelo, entregable, publicación y bitácora
test/                   pruebas automáticas (node --test)
scripts/                compilar la web, generar ejemplos, revisar textos, borrar datos, boletín
ejemplos/               archivos inventados con formatos de distintos programas
```

## Limitaciones conocidas

- La autenticación es básica: correo y contraseña. Recuperar la contraseña es un enlace de un solo uso que manda el correo (si hay Brevo) o el equipo.
- Los sinónimos de columnas salen de nombres habituales de Siigo, SAP, Siesa, CGUNO, World Office, Alegra, Helisa, Loggro y ContaPyme. Solo dos formatos se han probado con archivos reales (Helisa y Siigo Nube). Cada export nuevo de un probador hay que pasarlo antes de la prueba.
- El tipo de documento se pregunta por su prefijo (FV, RM, NC…). Si una empresa usa el mismo prefijo para cosas distintas, la app no las separa.
- El reporte se calcula una vez, al subir el archivo. Si cambia el modelo, los reportes viejos no se recalculan (los archivos originales sí quedan guardados).
- "Se agota" es menos de 2 semanas para todos los productos en el reporte de la prueba. El tiempo de entrega de cada proveedor solo se usa en el panel.
