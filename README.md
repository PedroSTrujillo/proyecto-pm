# SINESC · Rotación de inventario

SINESC es para gerentes y administradores de inventario que coordinan el reabastecimiento en distribuidoras y comercializadoras. El usuario sube el informe de ventas y existencias que ya saca de su programa contable y ve sus productos ordenados por **semanas de inventario restantes**. Arriba aparece lo que se agota primero y, marcado aparte, lo que sobra.

En línea: **https://sinesc.vercel.app** (Vercel + Neon).

## Qué se está probando

El MVP (Alpha 0.1, Grupo 1, Diseño de Productos, Uniandes) existe para probar una sola hipótesis:

> Creemos que un reporte de rotación por producto calculado desde el export del software contable, para gerentes y administradores de inventario que coordinan el reabastecimiento, logrará que **3 de 5 cambien 5 o más líneas de su pedido en 14 días**, medido por las líneas que agrega, quita o ajusta.

**Pivote:** 3 o más de los 5 cambian 0 o 1 línea, o cambian líneas por probar la herramienta y no porque el dato les sirvió.

Para medirlo, cada pedido es un flujo de 5 pasos y sus reglas las hace cumplir el servidor:

1. **Lo que ibas a pedir:** el usuario anota su pedido antes de ver cualquier número. Al guardarlo queda fijo.
2. **Ventas y existencias:** sube el informe de su programa contable.
3. **El reporte:** ve sus productos por semanas de inventario.
4. **Tu lista final:** arranca como copia de la inicial y la cambia con el reporte al lado. La columna "Cambio" muestra la diferencia.
5. **¿Por qué cambió?:** texto libre. Con eso el pedido queda terminado.

La app compara las dos listas por código y cuenta las líneas agregadas, quitadas y con otra cantidad. El veredicto de la prueba sale de la base de datos, en "Resultados de la prueba". En la lista final (paso 4), al lado de cada producto, SINESC muestra la cantidad que sugiere pedir el modelo, con el tiempo de entrega y cada cuánto pide el usuario (los puede cambiar ahí mismo). El usuario decide: puede llevar las sugeridas a su lista, agregar lo que se agota o dejar lo suyo. Desde el 2026-10-14 los probadores ven todo desde el primer día:
- un panel con lo que hay que atender;
- la ficha de cada producto con su pronóstico;
- el riesgo de agotarse antes de que llegue un pedido;
- el pedido sugerido por proveedor, en Excel, PDF o WhatsApp.

Documentos:
- [`docs/modelo-rotacion.md`](docs/modelo-rotacion.md): el modelo matemático, la métrica y el pronóstico. Es la fuente de verdad.
- [`docs/ENTREGABLE_Y_APP.md`](docs/ENTREGABLE_Y_APP.md): qué de lo que declara el Entregable 2 corregido hace la app y en qué se aparta.
- [`docs/PUBLICAR.md`](docs/PUBLICAR.md): cómo publicar y actualizar en Vercel + Neon.
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
| `npm test` | Corre las 103 pruebas automáticas: cálculo, pronóstico, comparación de listas, recordatorios, lector de archivos, demo y API. No necesitan la web. |
| `npm run ejemplos` | Regenera en `ejemplos/` los archivos inventados (CSV estilo Siigo, Excel estilo SAP, ventas por mes, un catálogo de 3.000 productos y un informe de mínimos). |
| `npm run texto` | Revisa los textos de la interfaz buscando frases de relleno. |
| `npm run borrar-datos -- --todos` | Muestra qué cuentas de prueba se borrarían; con `--confirmar` las borra. `--email correo@empresa.co` borra una sola. Las del equipo no se tocan. |

`node inventory-forecasting-landing-page/node_modules/typescript/bin/tsc --noEmit -p inventory-forecasting-landing-page` revisa los tipos de la web. No hay linter.

## Variables de entorno

| Variable | Para qué | Ejemplo |
|---|---|---|
| `DATABASE_URL` | PostgreSQL en producción (Neon). Sin ella se usa PGlite. | `postgresql://usuario:clave@host/db?sslmode=require` |
| `TEAM_EMAILS` | Correos del equipo, separados por coma. Esas cuentas ven "Resultados de la prueba" y "Ejemplos" y no cuentan como probadores. | `ana@grupo1.co,juan@grupo1.co` |
| `APP_URL` | Opcional. La dirección pública, para los enlaces de los recordatorios y de "cambiar contraseña". En Vercel, sin ella, se usa la dirección de producción. | `https://sinesc.vercel.app` |
| `BREVO_API_KEY` y `CORREO_REMITENTE` | Opcionales. Para que el recordatorio llegue también por correo con [Brevo](https://www.brevo.com). Sin ellas, el recordatorio solo se descarga. | `xkeysib-…`, `avisos@grupo1.co` |
| `NEXT_PUBLIC_POSTHOG_KEY` | Opcional. La clave del **proyecto** de PostHog (empieza por `phc_`, nunca la personal `phx_`). Sin ella no se carga nada. Se lee al compilar: después de ponerla hay que volver a desplegar. | `phc_…` |
| `NEXT_PUBLIC_POSTHOG_REGION` | `eu` si el proyecto de PostHog está en Europa; si no, Estados Unidos. | `us` |
| `NODE_ENV`, `PORT`, `DATA_DIR` | `production` exige HTTPS para la cookie de sesión; el puerto lo pone el hosting; `DATA_DIR=memory://` deja PGlite en memoria (lo usan las pruebas). | |

**Alguien del grupo creó su cuenta con un correo que no está en `TEAM_EMAILS`:** en "Resultados de la prueba", en su tarjeta, el botón "Es del equipo, no un probador" lo pasa al equipo para siempre, sin tocar la variable.

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
3. **Durante la prueba,** "Resultados de la prueba" muestra cada probador con:
   - sus pedidos y las líneas que cambió;
   - la coherencia con el reporte y las unidades movidas;
   - cuánto le cuesta equivocarse (productos en cero, los que se agotan, lo que sobra);
   - el recordatorio y si volvió.
   
   Ahí mismo el equipo marca cada "¿por qué?" como "el dato le sirvió" o "por probar la herramienta" (el segundo criterio de pivote).
4. **PostHog** (si está configurado) graba las sesiones para ver dónde se traba alguien. Las tablas y lo que se escribe quedan tapados. La métrica sigue saliendo de la base de datos.
5. Al terminar, si un probador lo pide (sus archivos son datos de su empresa): `npm run borrar-datos -- --email correo@empresa.co --confirmar`.

## Demo y ejemplos

- `/demo` muestra la aplicación sin cuenta con seis negocios inventados: ferretería, muebles, mobiliario de oficina, refrigeración, papelería y una distribuidora mayorista. Se basan en lo que contaron los entrevistados.
- Con una cuenta del equipo, la página **Ejemplos** deja descargar o cargar en esa cuenta cualquiera de esos negocios o los archivos de `ejemplos/`. Los probadores no la ven.

## Cómo se cumple el documento

| Requisito | Dónde |
|---|---|
| Crear cuenta, iniciar y cerrar sesión; cada usuario ve solo lo suyo | `server/cuentas.js`; todas las consultas filtran por usuario (`server/pedidos.js`) |
| Rol de equipo que ve los resultados de todos | `TEAM_EMAILS` o el botón "Es del equipo" (`usuarios.es_equipo`), `server/equipo.js`, pantalla "Resultados de la prueba" |
| Flujo de 5 pasos con indicador; no se salta al reporte; se retoma donde quedó | `components/app/pedido-flujo.tsx`. En el servidor: sin lista inicial guardada, subir el export o pedir el reporte responde 403. Los borradores se guardan solos |
| Lista inicial tipo Excel (pegar filas) o importando Excel/CSV; sin imágenes; real o simulado | `components/app/hoja.tsx`, `leerLista` en `server/lector.js`. Una lista con solo los productos de ejemplo de la plantilla no se acepta |
| La lista inicial queda fija al guardarla | `UPDATE … WHERE inicial_guardada_en IS NULL`; editarla después responde 409 |
| Borrar un pedido sin terminar | `DELETE /api/pedidos/:id` antes de la lista final; borrado suave (`borrado_en`), no cuenta en el veredicto |
| Export CSV o Excel con ventas y existencias; plantillas descargables | `/plantillas/*.xlsx`, `server/plantillas.js` |
| Reconoce formatos distintos sin reorganizar columnas; errores con fila y columna | `server/lector.js` + `server/formatos.js` (ver "Qué archivos lee") |
| Cada archivo subido queda guardado con su fecha | Tabla `archivos` (contenido y fecha) |
| Cálculo de rotación, casos borde y devoluciones | `server/rotacion.js`, `docs/modelo-rotacion.md` §2–3 |
| Reporte ordenado, lo que se agota (menos del umbral; 2 semanas si no se elige) resaltado, lo que sobra visible, filtros, explicación con un producto del archivo | `components/app/reporte.tsx`; "Qué leímos de tu archivo" dice qué columnas y qué documentos se usaron |
| Umbral de "se agota" que elige cada cuenta (2 semanas si no elige; agregado el 2026-10-13, ver §3.4.1 del modelo) | Paso 2 del pedido (`UmbralDelPedido` en `pedido-flujo.tsx`, `PUT /api/pedidos/:id/semanas-agota`, `pedidos.semanas_agota`, fijo al ver el reporte) y tarjeta en Datos (`datos.tsx`, `semanasAgota` en `leerAjustes`); `conUmbral` y `calcularRotacion` (`server/rotacion.js`), `planearAvisos` (`server/recordatorios.js`); la vista del equipo muestra el de cada probador y de cada pedido |
| Lista final como copia de la inicial, con el reporte visible mientras se edita | Paso 4: "Vas a pedir", "Ibas a pedir", "Cambio" y "Semanas de inventario", y el botón "Mostrar el reporte" |
| Comparación por código (agregadas, quitadas, cantidad cambiada, total) y "¿Por qué cambiaste lo que cambiaste?" | `compararListas` en `server/listas.js`, paso 5 |
| Vista del equipo con el resumen (cuántos cambiaron 5 o más; cuántos 0 o 1) calculado de los datos | `server/equipo.js`, `components/app/equipo.tsx` |
| Registro con fecha de cada ingreso, archivo subido y pedido | Tabla `eventos`. Volver después de 30 minutos sin actividad cuenta como un nuevo ingreso |
| Stickiness corregido (2026-10-07): recordatorio 3 días antes de que un producto con más de 4 semanas llegue a 2 | `server/recordatorios.js` (archivo de calendario, sin tareas programadas), `server/correo.js` (opcional), tarjeta en el paso 3 |
| Cálculo de semanas explicado desglosado | Tres ajustes en `server/rotacion.js` (§3.6 del modelo); explicación en el reporte y en la ficha de cada producto |
| Guía para sacar los archivos según el programa contable | `lib/sistemas.ts` (copia en `public/js/sistemas.js`), con fuentes |
| Ayuda para el segundo criterio de pivote | Coherencia con el reporte y magnitud del cambio (`server/listas.js`); clasificación del "¿por qué?" en la vista del equipo |
| Página de cuenta, cambiar y restablecer contraseña | `server/cuentas.js` (`/datos`, `/clave`, `/olvide`, `/restablecer`); sin correo, el equipo genera el enlace desde su vista |
| Todo en español sencillo | Textos de la interfaz y mensajes del servidor |
| Stack declarado en el plan de prueba (Next.js con Postgres y autenticación) | Interfaz en Next.js (`inventory-forecasting-landing-page/`); API en Express dentro del mismo proyecto; PostgreSQL en Neon |
| Panel, ficha de producto, pronóstico y pedido sugerido (después de la prueba) | `server/inventario.js`, `pronostico.js`, `series.js`, `inventario-rutas.js`; §7 del modelo y `docs/PLAN_REESTRUCTURACION.md` |
| Proveedores, mínimos y máximos | Proveedor por producto o por comienzo de código (`usuarios.inventario`); mínimos y máximos en la ficha y en Excel (`/api/exportar/minimos.xlsx`) |
| Demo sin cuenta | `server/demo.js` (el mismo cálculo que un archivo real), `/demo` |

**Cambio de alcance (2026-10-11 y 2026-10-14):** el producto sugiere cuánto pedir y ajusta por temporada y por el tiempo de entrega de cada proveedor (§7 del modelo). Desde el 2026-10-14 el probador lo ve desde el primer día, también en la lista final. Sigue sin ver su inventario antes de guardar su primera lista inicial, y la lista final la escribe él. Este cambio va en la columna "Si cambió" de la Solución en el Entregable 3. Sigue sin conectarse al software contable.

## Estructura

```
server/                 la API (Express 5, CommonJS)
  index.js              arranque en local: API + Next.js en un solo servidor
  app.js                rutas, encabezados de seguridad, errores en español
  db.js                 PostgreSQL (pg) o PGlite, y el esquema
  cuentas.js            cuentas, sesiones (cookie HttpOnly), eventos
  limites.js            límite de intentos (entrar, crear cuenta, contraseña)
  pedidos.js            el flujo de 5 pasos y sus reglas
  listas.js             validación y comparación de listas (la métrica)
  equipo.js             resultados de la prueba y veredicto
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
  errores.js            registro de errores (se ve en Resultados de la prueba)
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
scripts/                compilar la web, generar ejemplos, revisar textos, borrar datos
ejemplos/               archivos inventados con formatos de distintos programas
```

## Limitaciones conocidas

- La autenticación es básica: correo y contraseña. Recuperar la contraseña es un enlace de un solo uso que manda el correo (si hay Brevo) o el equipo.
- Los sinónimos de columnas salen de nombres habituales de Siigo, SAP, Siesa, CGUNO, World Office, Alegra, Helisa, Loggro y ContaPyme. Solo dos formatos se han probado con archivos reales (Helisa y Siigo Nube). Cada export nuevo de un probador hay que pasarlo antes de la prueba.
- El tipo de documento se pregunta por su prefijo (FV, RM, NC…). Si una empresa usa el mismo prefijo para cosas distintas, la app no las separa.
- El reporte se calcula una vez, al subir el archivo. Si cambia el modelo, los reportes viejos no se recalculan (los archivos originales sí quedan guardados).
- "Se agota" es menos de 2 semanas para todos los productos en el reporte de la prueba. El tiempo de entrega de cada proveedor solo se usa en el panel.
