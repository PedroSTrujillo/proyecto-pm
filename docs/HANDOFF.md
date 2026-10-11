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
