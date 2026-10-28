# Publicar (Vercel + Neon)

Todo corre en **Vercel**: la página, la aplicación y la API. La base de datos es **Neon** (PostgreSQL).

| Servicio | Qué tiene | Cómo se actualiza |
|---|---|---|
| **GitHub** | El código. `main` es lo publicado. | Con un merge o un push a `main`. |
| **Vercel** | La página, la aplicación (Next.js) y la API de Express, que corre como la función `pages/api/[[...ruta]].js`. | Solo, con cada push a `main`. |
| **Neon** | La base de datos. | No hay que hacer nada: la API crea las tablas y columnas nuevas al arrancar (`ESQUEMA` en `server/db.js`, sin migraciones). |

En local todo sigue igual: `npm run dev` levanta la API y la página juntas con `server/index.js`.

## Primera vez

1. **El repositorio.** En GitHub, *Fork* del repositorio del grupo a tu cuenta, o súbelo a un repositorio tuyo. Vercel despliega solo los commits de los repositorios de tu cuenta.
2. **El proyecto en Vercel.** (`vercel.json` solo deja compilar el repositorio de `DavidAlvarez26`: en otros, Vercel salta el despliegue. Si cambia el dueño, cambien `ignoreCommand`.) En vercel.com: *Add New → Project*, importa el repositorio y en *Root Directory* elige `inventory-forecasting-landing-page`. El resto lo trae `inventory-forecasting-landing-page/vercel.json`, que instala también las librerías de la API (las de la raíz del repositorio). Todavía no le des *Deploy*.
3. **La base de datos.** Hay dos caminos:
   - *Nueva y conectada sola (lo más fácil):* en el proyecto de Vercel, *Storage → Create Database → Neon*, plan gratis, en la región más cercana (por ejemplo, Washington D.C.). Vercel crea `DATABASE_URL` por su cuenta.
   - *La que ya tienen en Neon:* en la consola de Neon, *Connect*, copien la cadena **con pooling** (el host lleva `-pooler`) y pónganla en Vercel como `DATABASE_URL`.

   Pongan la región de las funciones de Vercel igual a la de Neon (*Settings → Functions → Function Region*): si quedan lejos, cada pedido tarda más.
4. **Variables** (*Settings → Environment Variables*, para *Production*):
   - `DATABASE_URL`: la de Neon (si usaron *Storage*, ya está).
   - `TEAM_EMAILS`: los correos del equipo, separados por coma. Esas cuentas ven "Ejemplos" y no cuentan como probadores. Los resultados de la prueba no están en la aplicación: se leen con `npm run resultados` (README).
   - Opcional, `NEXT_PUBLIC_POSTHOG_KEY` (y `NEXT_PUBLIC_POSTHOG_REGION=eu` si el proyecto de PostHog está en Europa): embudo y grabaciones de sesión. Se lee al compilar, así que después de ponerla hay que hacer *Redeploy*.
   - Opcionales: `BREVO_API_KEY` y `CORREO_REMITENTE`, para mandar por correo el recordatorio, las invitaciones a la empresa y el boletín diario. `APP_URL` solo si usan un dominio propio; si no, se usa sola la dirección de producción de Vercel.
   - Para el boletín diario: `CRON_SECRET` (Vercel lo manda solo al llamar el Cron de `vercel.json`, todos los días a las 11:00 UTC, 6:00 en Bogotá) y `BOLETIN_SECRETO` (firma el enlace para darse de baja). En el plan Hobby, Vercel corre el Cron en algún momento de esa hora. Para probarlo antes: `npm run boletin -- --email tu@correo.co` con la `DATABASE_URL` de la vista previa (te llega aunque hoy ya te haya llegado).
   - Para las vistas previas (*Preview*) de la rama `empresas-inventario-diario`: con Neon conectado desde *Storage* de Vercel, marquen *Preview* en *Create database branch for deployment* **antes** de subir la rama. Cada vista previa recibe su rama de Neon (`preview/<rama de git>`), una copia de producción que no la toca; sin esa casilla, la vista previa usaría la base de producción, y su arranque crea las tablas nuevas y la "empresa vacía" de cada usuario. Antes de abrir la vista previa, confirmen en Neon que existe `preview/empresas-inventario-diario`.
5. *Deploy*. Cuando termine, revisen:
   - `/salud` responde `{"ok":true}`.
   - `/` y `/demo` cargan.
   - Crear una cuenta funciona. Con un correo de `TEAM_EMAILS`, el menú muestra "Ejemplos".
   - En "Ejemplos", "Cargar en mi cuenta" deja el panel con ese negocio.

## Cada versión nueva

```bash
npm test
npm run texto
node inventory-forecasting-landing-page/node_modules/typescript/bin/tsc --noEmit -p inventory-forecasting-landing-page
```

Las pruebas tienen que pasar. Luego, suban a `main` (directo o con un pull request) y Vercel despliega solo. En *Deployments* se ve el avance y, si falla, el registro.

Si además trabajan sobre el repositorio del grupo, suban a los dos (`mio` es el remoto de tu repositorio: `git remote add mio https://github.com/<tu-usuario>/proyecto-pm.git`):

```bash
git push origin main
git push mio main
```

## Antes de los probadores

Borren las cuentas de prueba para que el resumen cuente solo a los 5 probadores (las del equipo no se tocan). Con la `DATABASE_URL` de Neon en la terminal:

```bash
npm run borrar-datos -- --todos
```

Eso solo muestra qué se borraría. Para borrarlo de verdad:

```bash
npm run borrar-datos -- --todos --confirmar
```

En PowerShell la variable se pone antes con `$env:DATABASE_URL="postgresql://…"`; en Git Bash, con `export DATABASE_URL="postgresql://…"`.

## Límites de Vercel

- **4,5 MB por petición.** El navegador comprime con gzip los archivos de más de 1 MB antes de subirlos (`prepararArchivo` en `lib/api.ts`) y la API los descomprime (`archivoSubido` en `server/pedidos.js`). Un `.xls` o un `.csv` de 6 MB baja a menos de 1 MB, así que pasa. Un `.xlsx` ya viene comprimido: si pesa más de 4,5 MB, la app pide guardarlo como `.xls` o `.csv`, o subir un periodo más corto. Las descargas tienen el mismo límite: en "Ejemplos", el CSV del catálogo grande no se puede descargar, pero sí cargar.
- **60 segundos por pedido** (`maxDuration` en la función). Leer un archivo de 26.000 filas toma unos pocos segundos.
- Después de un rato sin uso, la primera visita tarda uno o dos segundos más mientras arranca la función. Neon también se duerme en el plan gratis y despierta en menos de un segundo.

## Si algo sale mal

- Vercel: *Deployments*, el anterior, *Promote to Production*.
- Código: `git revert` del commit y push; Vercel vuelve a desplegar.
- Base de datos: en Neon, *Branches → Create branch* antes de cambios grandes, para poder volver.
