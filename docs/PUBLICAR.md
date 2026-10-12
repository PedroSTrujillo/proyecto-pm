# Publicar una versión nueva

Cómo pasar lo que está en una rama a lo que ven los probadores. Son tres servicios:

| Servicio | Qué tiene | Cómo se actualiza |
|---|---|---|
| **GitHub** (`PedroSTrujillo/proyecto-pm`) | El código. `main` es lo que está publicado. | Con un merge a `main`. |
| **Render** (`rotacion-inventario`) | El servidor: la API y la página con la aplicación (Next.js). Es la dirección que se les da a los probadores. | Solo, cuando cambia `main` (si *Auto-Deploy* está en *Yes*). Si no, *Manual Deploy → Deploy latest commit*. |
| **Neon** | La base de datos PostgreSQL. | No hay que hacer nada: al arrancar, el servidor crea las tablas y columnas nuevas (`ESQUEMA` en `server/db.js`, sin migraciones). |
| **Vercel** (`proyecto-pm.vercel.app`) | La misma página, publicada aparte. Manda `/api` y `/plantillas` a Render. | Solo, cuando cambia `main`. |

## 1. Antes de subir

```bash
npm test
npm run texto
node inventory-forecasting-landing-page/node_modules/typescript/bin/tsc --noEmit -p inventory-forecasting-landing-page
npm run build --prefix inventory-forecasting-landing-page
```

Las 81 pruebas tienen que pasar y el build no puede dar errores. Si `npm run build` (el de la raíz) falla en Windows con "Cannot read properties of null (reading 'matches')", es un error de npm con `node_modules` ya creado: el segundo comando compila igual. Después del build, borren `inventory-forecasting-landing-page/.next` si van a seguir con `npm run dev`.

Revisen que nada privado quedó en el código ni en los mensajes de commit (datos reales de un probador, contraseñas, archivos de `data/`).

## 2. Subir la rama y hacer el merge

```bash
git push origin mejoras-modelo
```

Luego abran el pull request de `mejoras-modelo` a `main` en GitHub (o con `gh pr create --base main --head mejoras-modelo`), que alguien más del grupo lo revise y hagan el merge desde GitHub. Si prefieren hacerlo desde la terminal:

```bash
git checkout main
git pull
git merge --no-ff mejoras-modelo
git push origin main
```

## 3. Render

1. Al llegar el merge a `main`, Render empieza a desplegar solo. En el panel de `rotacion-inventario`, pestaña *Events*, se ve el progreso. Tarda unos minutos porque compila la página.
2. Revisen que en *Environment* estén:
   - `DATABASE_URL`: la de Neon.
   - `TEAM_EMAILS`: los correos del equipo, separados por coma.
   - `NODE_ENV`: `production`.
   - `APP_URL`: la dirección que usan los probadores (por ejemplo, `https://rotacion-inventario.onrender.com`). Sale en los enlaces para cambiar la contraseña y en los recordatorios.
   - Opcionales: `BREVO_API_KEY` y `CORREO_REMITENTE`, para mandar el recordatorio por correo.
   - `LANDING_URL` ya no se usa; se puede borrar.
3. Si el despliegue falla en *Build* por falta de memoria (el plan gratis tiene 512 MB y compilar Next.js es pesado), sigue funcionando la versión anterior. Opciones: volver a intentar con *Manual Deploy → Clear build cache & deploy*, o subir el servicio al plan Starter mientras dura la prueba.
4. Cuando diga *Live*, abran `/salud` (tiene que responder `{"ok":true}`), luego `/`, `/demo` y entren con una cuenta del equipo: el menú tiene que mostrar "Resultados de la prueba" y "Ejemplos".

## 4. Neon

- No hay que correr nada: las tablas nuevas (`errores`) y las columnas nuevas se crean al arrancar el servidor.
- Antes de desplegar conviene sacar una copia: en la consola de Neon, *Branches → Create branch* desde `main`. Si algo sale mal, se puede volver a esa rama.
- Antes de empezar con los 5 probadores, borren las cuentas de prueba (las del equipo no se tocan). Con la `DATABASE_URL` de Neon en la terminal:

```bash
npm run borrar-datos -- --todos
```

Eso solo muestra qué se borraría. Para borrarlo de verdad:

```bash
npm run borrar-datos -- --todos --confirmar
```

En PowerShell, la variable se pone antes con `$env:DATABASE_URL="postgresql://…"`; en Git Bash, con `export DATABASE_URL="postgresql://…"`.

## 5. Vercel

- Si el proyecto de Vercel está conectado al repositorio con *Root Directory* `inventory-forecasting-landing-page`, despliega solo al cambiar `main`. Se ve en *Deployments*.
- No necesita variables: sin `API_URL`, manda `/api` y `/plantillas` a `https://rotacion-inventario.onrender.com`. Si la dirección de Render cambia, pongan `API_URL` en *Settings → Environment Variables* y vuelvan a desplegar.
- Vercel no deja subir archivos de más de 4,5 MB. A los probadores denles la dirección de Render, y dejen la de Vercel para mostrar la página.

## 6. Si algo sale mal

- Render: *Events → Rollback* a un despliegue anterior.
- Vercel: *Deployments*, el anterior, *Promote to Production*.
- Código: `git revert -m 1 <commit del merge>` en `main` y `git push`; Render y Vercel vuelven a desplegar solos.
- Base de datos: la rama de Neon que crearon en el paso 4.
