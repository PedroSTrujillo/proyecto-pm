# Rotación de inventario · MVP Alpha 0.1

Reporte de rotación por producto calculado desde el export del software contable, para gerentes y administradores de inventario que coordinan el reabastecimiento. El usuario sube su export y ve sus productos ordenados por **semanas de inventario restantes**: arriba lo que se agota primero y, marcado aparte, lo que sobra.

El MVP existe para probar una hipótesis: *3 de 5 usuarios cambian 5 o más líneas de su pedido en 14 días*. Por eso el flujo obliga a registrar la lista de pedido **antes** de ver el reporte, y el producto calcula solo la métrica.

- Backend: Node.js (Express) + PostgreSQL.
- Frontend: HTML, CSS y JavaScript sin frameworks ni paso de compilación.
- Modelo matemático e investigación: [`docs/modelo-rotacion.md`](docs/modelo-rotacion.md).

## Correr en local

Requisitos: Node.js 20 o superior.

```bash
npm install
```

```bash
TEAM_EMAILS=tu-correo@ejemplo.com npm start
```

Abre http://localhost:3000. En local no hace falta instalar PostgreSQL: si no hay `DATABASE_URL`, la app usa PGlite (PostgreSQL embebido) y guarda los datos en `data/pglite/`.

Otros comandos:

```bash
npm test
```

```bash
npm run ejemplos
```

`npm test` corre 59 pruebas automáticas: cálculo, comparación de listas, recordatorios, lector de archivos y API. `npm run ejemplos` crea en `ejemplos/` exports inventados con formatos distintos (CSV estilo Siigo, Excel estilo SAP, informe con una columna por mes, un catálogo de 3.000 productos y un informe de mínimos), para hacer demos y pruebas.

## Landing page

La carpeta `inventory-forecasting-landing-page/` tiene la página de presentación, hecha en Next.js. Usa los mismos colores, el mismo logo, los mismos umbrales (2 y 12 semanas) y los mismos textos que la aplicación, y sus botones llevan a crear cuenta, a entrar y a la plantilla de ejemplo.

```bash
cd inventory-forecasting-landing-page
pnpm install
NEXT_PUBLIC_APP_URL=http://localhost:3000 pnpm dev -p 3001
```

Al publicarla (por ejemplo en Vercel), configura `NEXT_PUBLIC_APP_URL` con la URL de la aplicación en Render. Sin esa variable, los botones apuntan a `http://localhost:3000`.

## Variables de entorno

| Variable | Para qué | Ejemplo |
|---|---|---|
| `DATABASE_URL` | PostgreSQL en producción. Sin ella se usa PGlite local. | `postgresql://usuario:clave@host/db?sslmode=require` |
| `TEAM_EMAILS` | Correos con acceso a "Resultados de la prueba", separados por coma. | `ana@grupo1.co,juan@grupo1.co` |
| `NODE_ENV` | En `production`, la cookie de sesión exige HTTPS. | `production` |
| `PORT` | Puerto (lo pone el hosting). | `3000` |
| `DATA_DIR` | Carpeta de PGlite. `memory://` la deja en memoria. | `./data/pglite` |
| `BREVO_API_KEY` | Opcional. Para que el recordatorio de calendario llegue también por correo, con [Brevo](https://www.brevo.com) (gratis hasta 300 correos al día). Sin ella, el recordatorio solo se descarga. | `xkeysib-…` |
| `CORREO_REMITENTE` | El correo que verificaron en Brevo como remitente. | `avisos@grupo1.co` |
| `APP_URL` | La dirección pública de la app, para el enlace de los recordatorios y de "cambiar contraseña". | `https://rotacion-inventario.onrender.com` |
| `LANDING_URL` | La página de presentación, para el enlace "Página principal". | `https://proyecto-pm.vercel.app` |

Una cuenta queda con rol de **equipo** si su correo está en `TEAM_EMAILS` al crearla o al iniciar sesión. Las cuentas del equipo no cuentan como usuarios de prueba.

## Publicar en línea (gratis: Render + Neon)

1. **Base de datos.** En https://neon.tech crea un proyecto y copia la *connection string*: `postgresql://...?sslmode=require`. Las tablas se crean solas al arrancar.
2. **Código.** Sube esta carpeta a un repositorio de GitHub. `node_modules/` y `data/` ya están en `.gitignore`.
3. **Servidor.** En https://render.com elige *New → Blueprint* y selecciona el repositorio: `render.yaml` ya trae la configuración. Cuando lo pida, llena `DATABASE_URL` con la de Neon y `TEAM_EMAILS` con los correos del equipo.
4. Render te da una URL `https://….onrender.com`. Esa es la que se comparte con los probadores.

Notas:

- El plan gratis de Render apaga el servidor tras 15 minutos sin uso, y la primera visita tarda unos 50 segundos en despertarlo. Antes de una sesión con un probador, abran la página un minuto antes. Para evitarlo del todo, usen el plan Starter de Render.
- No usen PGlite en Render: el disco del plan gratis se borra en cada despliegue. Por eso se pide `DATABASE_URL`, y el servidor avisa al arrancar si falta.
- Cualquier hosting de Node sirve igual (Railway, Fly.io, un VPS): `npm install` y `npm start` con las variables de arriba.

### Recordatorios

El recordatorio (stickiness del Entregable) es un archivo de calendario que el usuario descarga desde el reporte: no hay tareas programadas ni cron. Si además quieren que llegue por correo, creen una cuenta gratis en Brevo, verifiquen un remitente (un clic en el correo que les llega), saquen una API key en *SMTP & API* y pónganlas en Render como `BREVO_API_KEY` y `CORREO_REMITENTE`, junto con `APP_URL`. Es opcional: sin eso todo funciona igual con la descarga.

## Antes de la prueba con los 5 probadores

El documento pide que las plantillas sean iguales al export real de cada probador. Eso no se puede hacer sin sus archivos, así que queda pendiente para el equipo:

1. **Conseguir un export de ejemplo y una lista de pedido de ejemplo de cada probador.**
2. Subirlos en un pedido de prueba con una cuenta del equipo:
   - Si los lee solos, no hay que hacer nada.
   - Si no, la app dice qué columna falta. Agreguen el nombre exacto de esa columna a la lista de sinónimos del campo en [`server/formatos.js`](server/formatos.js) (en minúscula, sin tildes).
3. Si todos usan el mismo software, cambien `PLANTILLA_EXPORT` y `PLANTILLA_LISTA` en ese mismo archivo, para que la plantilla descargable quede idéntica a su export.
4. Si un probador tiene un formato muy distinto, también puede elegir las columnas una vez desde la pantalla. La app lo recuerda para sus siguientes archivos.
5. Antes de empezar, borren los datos de prueba (o usen una base de datos nueva), para que el resumen cuente solo a los 5 probadores.

## Cómo se cumple el documento

| Requisito | Dónde |
|---|---|
| Crear cuenta, iniciar y cerrar sesión; cada usuario ve solo lo suyo | `server/cuentas.js`; todas las consultas filtran por usuario (`server/pedidos.js`) |
| Rol de equipo que ve los resultados de todos | `TEAM_EMAILS`, `server/equipo.js`, pantalla "Resultados de la prueba" |
| Flujo de 5 pasos con indicador; no se salta al reporte; se retoma donde quedó | Indicador de pasos en `public/js/app.js`. Reglas en el servidor: sin lista inicial guardada, subir el export o pedir el reporte responde 403. Los borradores se guardan solos. |
| Lista inicial tipo Excel (pegar filas) o importando Excel/CSV; sin imágenes; real o simulado | `public/js/hoja.js`, `leerLista` en `server/lector.js` |
| La lista inicial queda fija al guardarla | `UPDATE … WHERE inicial_guardada_en IS NULL`; editarla después responde 409 |
| Export CSV o Excel con ventas (1–2 años) y existencias; plantilla descargable con ejemplo | `/plantillas/export.xlsx`, `server/plantillas.js` |
| Reconoce formatos distintos sin reorganizar columnas; errores con fila y columna | `server/lector.js` + `server/formatos.js` (sinónimos, búsqueda de la fila de encabezados, CSV con `;` o `,`, ANSI o UTF-8, fechas y números colombianos, varias hojas o archivos, columnas por mes); si falta algo, el usuario elige la columna |
| Cada archivo subido queda guardado con su fecha | Tabla `archivos` (contenido y fecha) |
| Cálculo de rotación y casos borde | `server/rotacion.js`, `docs/modelo-rotacion.md` |
| Reporte ordenado, menos de 2 semanas resaltado, lo que sobra visible, filtros, explicación con un ejemplo de su archivo | `public/js/reporte.js` |
| Lista final como copia de la inicial y reporte visible mientras se edita | Paso 4: botón "Mostrar el reporte" y columnas "Ibas a pedir" y "Semanas de inventario" |
| Comparación por código (agregadas, quitadas, cantidad cambiada, total) y "¿Por qué cambiaste lo que cambiaste?" | `compararListas` en `server/listas.js`, paso 5 |
| Vista del equipo con resumen (cuántos cambiaron 5 o más; cuántos 0 o 1) calculado de los datos | `server/equipo.js`, `vistaEquipo` en `public/js/app.js` |
| Registro con fecha de cada ingreso, archivo subido y pedido | Tabla `eventos`. Volver con la sesión abierta después de 30 minutos sin actividad cuenta como un nuevo ingreso. |
| Stickiness corregido (2026-10-07): recordatorio 3 días antes de que un producto con más de 4 semanas llegue a 2 | `server/recordatorios.js` (cálculo y archivo de calendario), `server/correo.js` (opcional), tarjeta en el paso 3, cifras de stickiness en la vista del equipo |
| Cálculo de semanas más completo, explicado desglosado (pendiente del equipo) | Tres ajustes en `server/rotacion.js` (§3.6 del modelo) y explicación paso a paso en `public/js/reporte.js` |
| Guía para sacar los archivos según el programa contable (paso 2) | `public/js/sistemas.js`: Siigo Nube, Alegra, World Office, Helisa, SAP Business One y guía general. Cada ruta de menú lleva su fuente; lo que no se pudo confirmar se dice. La elección se guarda en `usuarios.sistema` y el equipo la ve |
| Importar casi cualquier formato | `server/lector.js`: informes de impresora (títulos corridos, "Página X de Y", totales), código entre paréntesis en el nombre, años cortados ("01/MAR/202"), informes que mezclan compras y ventas (pregunta qué documentos son ventas y lo recuerda), columnas sugeridas por su contenido cuando el título no se reconoce |
| Plantilla para quien lleva el inventario en Excel | `/plantillas/inventario.xlsx` (`plantillaInventario`): hoja Productos con existencias y una columna por mes; las hojas Ejemplo e Instrucciones no se leen |
| Ventas como total de un periodo (sin fecha por venta) | `server/lector.js` (`necesitaPeriodo`), `exports.periodo`, `POST /:id/export/:exportId/periodo` |
| Página de cuenta, cambiar y restablecer contraseña | `server/cuentas.js` (`/datos`, `/clave`, `/olvide`, `/restablecer`), tabla `restablecimientos`; el equipo genera el enlace desde su vista |
| Ayuda para el segundo criterio de pivote | Coherencia con el reporte y magnitud del cambio en `server/listas.js`, columnas en la vista del equipo |
| Todo en español sencillo | Textos de la interfaz y mensajes del servidor |

**Lo que el producto no hace, a propósito** (sección 1 y sección 6 del documento): no sugiere cuánto pedir, no ajusta por temporada ni por tiempo de entrega y no se conecta al software contable. Los recordatorios sí entraron: son el stickiness que pidió la corrección del Entregable 2.

## Estructura

```
server/
  index.js        arranque
  app.js          Express: rutas, encabezados de seguridad, errores en español
  db.js           PostgreSQL (pg) o PGlite, y el esquema
  cuentas.js      cuentas, sesiones (cookie HttpOnly), eventos
  pedidos.js      flujo de 5 pasos y sus reglas
  equipo.js       resultados de la prueba
  recordatorios.js  recordatorio de calendario antes de que un producto se agote
  correo.js       envío opcional del recordatorio por correo (Brevo)
  lector.js       lectura de exports y listas (Excel/CSV)
  valores.js      códigos, números y fechas
  formatos.js     sinónimos de columnas y plantillas  ← lo que el equipo ajusta
  rotacion.js     modelo de rotación
  listas.js       validación y comparación de listas
  plantillas.js   plantillas descargables
public/           index.html, estilos.css, js/ (app, hoja tipo Excel, reporte)
inventory-forecasting-landing-page/   página de presentación (Next.js)
docs/             modelo matemático
test/             pruebas automáticas (node --test)
scripts/          generador de archivos de ejemplo
```

## Limitaciones conocidas

- La autenticación es básica (correo y contraseña), sin recuperación de contraseña. El documento deja la autenticación completa para el cierre del semestre.
- El reconocimiento de columnas se basa en nombres habituales de Siigo, SAP, SIESA, CGUNO y World Office. Hay que validarlo con los exports reales de los probadores (ver arriba).
- **Helisa:** el detalle de facturas se lee bien (su columna "Cantidad Disponible" es la venta neta de devoluciones, no existencias), pero no trae existencias: hay que subir también el informe de inventario o saldos. Los informes de "Movimiento detalle" de Helisa vienen armados como página de impresión (los títulos no caen sobre sus columnas y se repite "Página X de Y") y todavía no se leen solos. Muchos usuarios de Helisa sacan además el listado de inventario con la casilla de salidas de un periodo, sin una fecha por venta: ese formato tampoco se lee todavía.
- Un kardex que mezcla entradas y salidas en una sola columna de cantidad (con una columna de "tipo") se leería como si todo fueran ventas. Si un probador exporta así, hay que filtrar por tipo antes, o agregar esa regla para su formato.
