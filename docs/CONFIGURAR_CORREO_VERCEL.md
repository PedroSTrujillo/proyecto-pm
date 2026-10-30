# Configurar los correos y el boletín diario en Vercel

Esta guía es para quien tenga acceso a la cuenta de Vercel del proyecto. Sin esta configuración la app funciona, pero no manda correos: el recordatorio solo se descarga, las invitaciones a la empresa se copian a mano y el boletín diario no sale.

Tiempo estimado: 15 minutos, más lo que tarde un despliegue.

## Qué se va a configurar

| Qué | Para qué sirve |
|---|---|
| Una clave de Brevo y un remitente verificado | Mandar los correos (recordatorio, invitaciones y boletín). |
| Dos claves al azar | Proteger la ruta que dispara el boletín y firmar el enlace "Dejar de recibirlo". |
| El Cron de Vercel | Llamar todos los días a la ruta del boletín. Ya está escrito en el código; solo hay que comprobar que quedó activo. |

No hace falta tocar código. Todo se hace en el panel de Vercel.

## 0. Qué necesita esta persona de quien pide la configuración

Quien pide la configuración (el equipo) ya tiene la cuenta de Brevo. Tiene que pasarte estos dos datos, por un canal privado (administrador de contraseñas o mensaje directo; no en un chat de grupo ni en el repositorio):

1. `BREVO_API_KEY`: la clave de Brevo. `xkeysib-0c`.
2. `CORREO_REMITENTE`: `sinesc.avisos@gmail.com`

Las otras claves las generas tú en el paso 1.

## 1. Generar las dos claves al azar

En una terminal (Mac o Linux):

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Cada comando imprime una cadena de 64 caracteres. Úsalas así:

- La primera será `CRON_SECRET`.
- La segunda será `BOLETIN_SECRETO`.

Sin terminal, sirve cualquier generador de contraseñas de 40 caracteres o más, sin espacios. Guárdalas en el administrador de contraseñas del equipo: si se pierden hay que generar otras y los enlaces de baja de correos ya enviados dejan de funcionar.

## 2. Crear las variables en Vercel

1. Entra a vercel.com y abre el proyecto de la app.
2. Ve a **Settings → Environment Variables**.
3. Agrega una por una, con el botón **Add New**:

| Name | Value | Environments |
|---|---|---|
| `BREVO_API_KEY` | la clave de Brevo | Production |
| `CORREO_REMITENTE` | el remitente verificado | Production |
| `CRON_SECRET` | la primera cadena al azar | Production |
| `BOLETIN_SECRETO` | la segunda cadena al azar | Production |
| `APP_URL` | solo si usan dominio propio, por ejemplo `https://app.algo.co` (con `https://` y sin `/` al final) | Production |

Notas:

- Marca **Production**. Si el equipo también quiere probar desde las vistas previas (Preview), marca además **Preview** en `BREVO_API_KEY` y `CORREO_REMITENTE`. El Cron solo corre en producción.
- Si la lista ya tiene alguna de estas variables, edítala en vez de crear otra.
- `APP_URL` define los enlaces que llevan los correos. Si no la creas, la app usa la dirección de producción de Vercel, y está bien.
- Marca como **Sensitive** las claves, si Vercel ofrece la opción: después de guardarlas ya no se pueden ver.
- Comprueba que no quedaron espacios ni saltos de línea al pegar. Es el error más frecuente.

## 3. Comprobar que existen las variables de la base de datos

En la misma pantalla debe existir `DATABASE_URL` (la integración con Neon la crea sola). Si falta, la app no tiene dónde guardar nada y esto es un problema aparte: avisa al equipo.

## 4. Redesplegar

Las variables nuevas solo aplican a despliegues hechos después de crearlas.

1. Ve a **Deployments**.
2. En el último despliegue de **Production**, abre el menú **⋯** y elige **Redeploy**.
3. Espera a que el estado sea **Ready**.

Si el despliegue sale **Canceled** o no aparece uno nuevo, mira el paso 8: el proyecto tiene una condición que puede cancelar los despliegues.

## 5. Comprobar que el Cron quedó activo

1. Ve a **Settings → Cron Jobs**.
2. Debe aparecer una fila con:
   - Path: `/api/tareas/boletin`
   - Schedule: `0 11 * * *`
3. Si el panel dice que los Cron Jobs están deshabilitados, actívalos.

`0 11 * * *` significa todos los días a las 11:00 UTC, que son las 6:00 a. m. en Bogotá. En el plan gratis (Hobby) Vercel lo ejecuta en cualquier momento dentro de esa hora, por lo que puede llegar entre las 6:00 y las 6:59.

El Cron solo corre sobre el despliegue de **producción**. Si no hay un despliegue de producción listo, no corre.

## 6. Probar sin esperar a mañana

1. En **Settings → Cron Jobs**, pulsa **Run** en la fila de `/api/tareas/boletin`.
2. Ve a **Logs** (menú del proyecto), filtra por la ruta `/api/tareas/boletin` y abre la entrada más reciente.

Cómo leer el resultado:

| Respuesta | Qué significa |
|---|---|
| 200 con algo como `enviados: N` | Funciona. `N` es la cantidad de boletines mandados. |
| 200 con `enviados: 0` y `sinNovedad` o `sinDatos` mayor que 0 | Funciona, pero hoy no había nada que avisar o la empresa aún no tiene inventario. No es un error. |
| 200 con `enviados: 0`, sin otro número | Nadie tiene el boletín activado todavía (ver paso 7). |
| 200 con `motivo: sin correo` | Faltan `BREVO_API_KEY` o `CORREO_REMITENTE`, o no se redesplegó después de crearlas. |
| 200 con `errores` mayor que 0 | Brevo rechazó el envío. Lo más común: el remitente no es exactamente el que está verificado en Brevo. |
| 401 | Falta `CRON_SECRET` o no se redesplegó. |

Si hay `errores`, el motivo exacto queda guardado en la tabla `boletines` de la base (columna `error`). Quien tenga acceso a la base o al script `npm run boletin` puede leerlo. El mensaje más típico es `Brevo respondió 400: valid sender email required`, que casi siempre es un remitente mal escrito o no verificado.

## 7. Quién recibe el boletín

Cada persona lo activa en la app: **Cuenta → Boletín diario**. Además:

- Su empresa tiene que haber subido inventario.
- Solo llega si ese día hay algo que avisar (productos que se agotan, etc.). Los días sin novedades no se manda nada, a propósito.

Para ver llegar un correo de verdad el día de la prueba, una cuenta con inventario debe tener el boletín activado antes del Run del paso 6.

## 8. Cosas que pueden bloquear el despliegue

Revisa estas dos antes de dar el trabajo por terminado:

1. **El proyecto cancela despliegues según quién sea el dueño del repositorio.** En `inventory-forecasting-landing-page/vercel.json` hay un `ignoreCommand` que solo deja construir si el dueño del repositorio en Git es `DavidAlvarez26`. Si el repositorio está bajo otra cuenta u organización, todos los despliegues salen **Canceled**. En ese caso no cambies nada por tu cuenta: avisa al equipo para que ajusten esa línea.
2. **Protección de despliegues.** Si en **Settings → Deployment Protection** la producción exige iniciar sesión en Vercel, los usuarios y el Cron podrían recibir una página de acceso en lugar de la app. La producción normalmente debe ser pública; si no lo es, avisa al equipo antes de cambiarla.

## 9. Antes de publicar: pregunta al equipo

Según las reglas del proyecto, las novedades de Alpha 0.2 (empresas, alertas y boletín) no se publican en producción mientras algún probador siga dentro de sus 14 días de prueba, porque cambian lo que ven y alteran la medición. Si no sabes si ese plazo ya terminó, pregúntalo antes de hacer el merge a `main` o el redespliegue.

## Lista de comprobación

- [ ] Recibí `BREVO_API_KEY` y `CORREO_REMITENTE` por un canal privado.
- [ ] Generé `CRON_SECRET` y `BOLETIN_SECRETO` y las guardé en el administrador de contraseñas.
- [ ] Creé las 4 variables (y `APP_URL` si hay dominio propio) en **Production**.
- [ ] Redesplegué producción y quedó **Ready**.
- [ ] En **Settings → Cron Jobs** aparece `/api/tareas/boletin` con `0 11 * * *`.
- [ ] Pulsé **Run** y el resultado fue 200 sin `motivo: sin correo` ni `errores`.
- [ ] Confirmé con el equipo que no hay probadores dentro de sus 14 días.

## Dónde está esto en el código

- Cron: `inventory-forecasting-landing-page/vercel.json`
- Ruta del boletín y su protección: `server/boletin.js` (`exigirCron`)
- Envío por Brevo: `server/correo.js`
- Todas las variables: tabla de variables de entorno del `README.md` y `docs/PUBLICAR.md`
