# Plan: integrar "Correcciones cambios en SINESC" en la app

## Contexto

El equipo revisó la ronda T1–T14 (en local, rama `cambios-sinesc`, sin publicar) y escribió `../Correcciones cambios en SINESC.docx`. Pide siete cosas:

1. **Precio por línea al cerrar el pedido.** El valor cambia con lo que se negocia con el proveedor. Ya lo había pedido y no quedó.
2. **Que cada persona pueda eliminar su propia cuenta.**
3. **El gerente como rol aparte:** los permisos de antes, las mismas vistas que el administrador y dos complementos: la **actividad de su equipo** (archivos subidos con fecha y nombre, pedidos hechos) y una sección de **noticias**: aranceles e importaciones con la UE, China y EE. UU. (importante), regulación por sector (opcional) y la **TRM** de dólar, euro y yuan (clave).
4. **Operador con permisos separados:** registrar movimientos y hacer conteos, cada uno por aparte, además del de subir datos que ya existe. Un operador puede ver existencias y productos sin poder registrar nada.
5. **Precios:** que se vean calculados y con otros nombres. Usuario 82.500, equipo completo 89.700, usuario adicional 9.800.
6. **Tarjetas de precio:** "Administrador" en lugar de "Una persona"; "Equipo completo" (Gerente, administrador y un operador) en lugar de "Con un operador"; "Cada usuario adicional".
7. **Código de acceso después del registro:** la persona crea su cuenta sin código, cae en una sola ventana que explica cómo pagar (enlace a un chat con un asesor) y ahí escribe el código que le dan.

### Decisiones tomadas (respuestas del usuario y criterio de menor código)

- **Noticias:** el servidor trae la TRM y titulares por RSS (Google Noticias), con caché en memoria. No se agrega ninguna dependencia: `fetch` nativo (como `server/correo.js`) y el RSS se lee con expresiones regulares.
- **TRM:** el dólar es la TRM oficial (datos.gov.co, sin llave). El euro y el yuan se calculan con la TRM y el cambio del Banco Central Europeo (frankfurter.app). Solo el dólar tiene TRM oficial en Colombia, y el Banco de la República no ofrece una API abierta para las demás monedas (solo descarga de series desde su portal, revisado el 2026-11-22). Es la misma cuenta que se usa en la práctica: TRM × cambio frente al dólar. La pantalla lo presenta como "calculado", no como "aproximado".
- **Sector:** sí. Es un campo en Mi empresa con una lista corta, y cada sector tiene una búsqueda de noticias de regulación y dos o tres enlaces fijos (INVIMA, SIC, MinCIT).
- **Borrar la cuenta siendo gerente con otros miembros:** no se puede hasta **pasar la gerencia a mano** a un miembro. No hay ascenso automático.
- **Chat de pago:** WhatsApp `wa.me/<número>` con un mensaje ya escrito. El número va en `NEXT_PUBLIC_WHATSAPP_VENTAS`. Si no está configurado, la ventana dice "escríbanos" sin enlace.
- **Quien entra por invitación también necesita código** (sigue la regla de T10: nadie se exime). La ventana le dice que lo pida a quien lo invitó.
- **Sin backfill para "pendiente de código":** la columna nueva es `usuarios.pendiente_codigo BOOLEAN NOT NULL DEFAULT false`. Las cuentas que ya existen quedan activas sin tocar nada, y solo `/crear` la pone en `true`. (Un `activada_en` con backfill se volvería a correr en cada arranque.)
- **El precio editado vale solo para ese pedido.** No cambia el costo del catálogo ni el dinero quieto, ni entra en `medirAceptacion`, que solo mide cantidades.
- **Gerente:** se conserva el selector vista principal / vista maestro de T3, y las páginas Actividad y Noticias se agregan en las dos vistas. Mismos permisos de servidor que el administrador, más estas dos rutas solo para él.
- **Permisos nuevos del operador:** quedan en `false` por defecto, como `sube_datos`. Esto aún no está publicado, así que no le quita nada a nadie.
- **Fuera de alcance:** cobro automático, divisas fuera de las tres pedidas, alertas de noticias en el boletín y titulares guardados en la base.

## Tareas

Cada tarea se revisa por aparte, deja `npm test` en verde y actualiza lo que toca:
- su sección de `CLAUDE.md`
- su fila en "Cambios" de `docs/ENTREGABLE_Y_APP.md`
- una entrada en `docs/HANDOFF.md`
- `npm run texto` si cambia texto visible

Dependencias: **T21** usa el ítem de menú y el guardia de **T20**. Todas las demás son independientes y se pueden hacer en paralelo.

---

### T15 · Precio en la página principal
**Objetivo:** precios que se ven calculados y nombres que hablan del ICP.

- `components/landing/pricing-section.tsx`, arreglo `planes`:
  - `{ nombre: 'Administrador', para: 'Un usuario', precio: '$82.500' }`
  - `{ nombre: 'Equipo completo', para: 'Gerente, administrador y un operador', precio: '$89.700', destacado: true }`
  - `{ nombre: 'Cada usuario adicional', para: 'Sin importar su rol', precio: '+$9.800' }`
- Se reescribe la nota del código de acceso con el flujo nuevo de T16: "Cree su cuenta y un asesor le da su código de acceso por WhatsApp cuando confirme el pago".
- Se actualizan los precios en `CLAUDE.md` y en `docs/ENTREGABLE_Y_APP.md`. El T9 del plan anterior decía 90.000 y 10.000.

### T16 · El código de acceso pasa a después del registro
**Objetivo:** crear la cuenta no pide código. La cuenta queda en espera, en una sola ventana con las instrucciones de pago, hasta que se escribe el código.

- **Base de datos** (`server/db.js`, `ESQUEMA`): `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pendiente_codigo BOOLEAN NOT NULL DEFAULT false`.
- **Servidor** (`server/cuentas.js`):
  - `POST /crear` deja de exigir `codigo` e inserta con `pendiente_codigo = true`. La empresa o la invitación siguen igual en la misma `db.tx`.
  - `POST /api/cuenta/activar { codigo }` mueve aquí el consumo que hoy hace `/crear`: el mismo `UPDATE codigos_acceso … WHERE usado_en IS NULL RETURNING`, más `usado_por`. Pone `pendiente_codigo = false` y registra el evento `cuenta_activada`. Lleva el mismo límite de intentos que `/crear` (`app.js:63`).
  - `pendiente_codigo` se agrega a `COLUMNAS_USUARIO`, y `publico()` devuelve `pendienteCodigo`.
  - Guardia en `app.js`, después de `cargarUsuario`: si `req.usuario?.pendiente_codigo` y la ruta no empieza por `/api/cuenta/`, responde 403 `{ error, pendienteCodigo: true }`. `yo`, `salir`, `activar` y `borrar` (T17) siguen abiertas.
  - `boletin.js` salta a quien tiene `pendiente_codigo`, como ya salta a las suspendidas.
  - `cuentas-equipo.js`: estado "Esperando código" en la lista de cuentas.
- **Web:**
  - `cuenta-formularios.tsx`: se quita el campo "Código de acceso" de `CrearCuenta`.
  - `components/app/activar.tsx`, nuevo. Es una sola tarjeta con:
    - las instrucciones (escribir al asesor, transferir, enviar el comprobante y recibir el código)
    - el botón de WhatsApp (`https://wa.me/${NEXT_PUBLIC_WHATSAPP_VENTAS}?text=` con el correo de la cuenta)
    - el campo `XXXX-XXXX` y "Salir"
    - para quien entró por invitación (`usuario.empresa` no es suya), la indicación de pedirle el código a quien lo invitó
  - `marco-cuenta.tsx` (`ConSesion`): si `usuario.pendienteCodigo`, muestra `<Activar/>` en lugar de `<Marco>`. Al activar, recarga `/cuenta/yo`.
  - `lib/tipos.ts`: `Usuario.pendienteCodigo`.
- **Pruebas:**
  - `conCodigo` (`test/codigo.js`) pasa a ser "crear la cuenta y activarla". Los 22 llamados siguen funcionando sin cambiarse.
  - Pruebas nuevas: la cuenta recién creada recibe 403 en `/api/inventario`; un código inválido o ya usado en `/activar` responde 400; después de activar, todo responde.
- **Docs:** `README`/`docs/PUBLICAR.md` agregan la variable `NEXT_PUBLIC_WHATSAPP_VENTAS`.

### T17 · Borrar mi cuenta y pasar la gerencia
**Objetivo:** cada quien elimina su cuenta. El gerente con miembros primero pasa la gerencia a mano.

- **Pasar la gerencia:** `PUT /api/empresa/gerente { usuarioId }` (`server/empresas.js`, `requiereRol('gerente')`). En una `db.tx`:
  - el miembro, que debe ser de la misma empresa y no ser uno mismo, queda con `admin_empresa = true, perfil = 'analista', aprueba = true`
  - quien pasa la gerencia queda como administrador (`admin_empresa = false, perfil = 'analista'`)
  - se registra el evento `gerencia_pasada`
- **Borrarse:** `DELETE /api/cuenta { clave, confirmacion }` (`server/cuentas.js`).
  - Exige que `confirmacion` sea el correo propio y verifica la clave, igual que `borrarCuenta` (`cuentas-equipo.js:219`).
  - Si es gerente y hay otros miembros, responde 409: "Antes de borrar su cuenta, pase la gerencia a otra persona en Mi empresa".
  - Si no, llama a `borrarDatos({ email, confirmar: true })` (`server/borrar.js`), que ya mueve exports y archivos al gerente y borra la empresa si queda vacía, y cierra la sesión.
  - Lleva el límite de intentos de `cuentas-equipo.js:294`.
- **Web:**
  - `empresa.tsx`: en cada miembro, el botón "Pasar la gerencia" con confirmación. Solo lo ve el gerente.
  - `cuenta.tsx`: una sección "Eliminar mi cuenta" con el correo, la clave y la confirmación. Si es gerente con miembros, el botón queda desactivado y lleva un enlace a Mi empresa.
- **Pruebas** (`test/empresas.test.js`):
  - el gerente con miembros recibe 409
  - después de pasar la gerencia se puede borrar, y el otro queda como gerente
  - el operador se borra y sus archivos pasan al gerente
  - una clave mala responde 403
- **Riesgo:** los pedidos de quien se borra se borran en cascada y salen de la medición del piloto. Hay que anotarlo en Cambios.

### T18 · Permisos del operador: movimientos y conteos
**Objetivo:** subir datos, registrar movimientos y hacer conteos se otorgan cada uno por aparte.

- **Base de datos:** `usuarios.registra_movimientos` y `usuarios.hace_conteos` (`BOOLEAN NOT NULL DEFAULT false`), junto a `sube_datos` (`db.js:286`). Van en `COLUMNAS_USUARIO` y en `publico()`.
- **Servidor:**
  - `movimientos.js`: una función `exigirPermisoMovimientos(usuario, lineas)` que solo aplica al operador. Si hay líneas que no son `conteo`, exige `registra_movimientos`; si hay líneas de `conteo`, exige `hace_conteos`. Responde 403 con un mensaje claro.
  - Se usa en `POST /`, en `POST /importar` (pide `registra_movimientos`) y en `POST /:id/anular` (según el `tipo` del movimiento).
  - `empresas.js` `PUT /miembros/:id` acepta `registraMovimientos` y `haceConteos`, igual que `subeDatos`, y los devuelve en la lista de miembros.
- **Web:**
  - `empresa.tsx`: dos casillas más junto a "Puede subir datos", solo para operadores.
  - `marco.tsx` (`itemsDe`): Movimientos aparece para el operador solo si tiene alguno de los dos permisos.
  - `movimientos.tsx`: `TIPOS` se filtra según los permisos.
  - `existencias.tsx`: "Hacer un conteo" solo con `haceConteos`.
  - `vista.tsx` (`INICIO`): el operador sin permisos empieza en `/existencias`.
  - `lib/tipos.ts`: los campos nuevos.
- **Pruebas** (extender la de operador en `test/empresas.test.js`):
  - sin permisos: 403 en venta y en conteo
  - con solo conteos: el conteo pasa y la venta da 403
  - con los dos permisos: todo pasa

### T19 · Cambiar el precio de cada línea al preparar el pedido
**Objetivo:** el valor unitario negociado queda en el pedido, en su PDF y en su Excel.

- **Servidor:**
  - `costo` opcional por línea en `lista_final`. Se conserva en los tres lugares que hoy lo descartan: `lineasDelCuerpo` (`pedidos.js:255`), `revisarLista` (`listas.js:59`) y `/borrador/linea`. Se valida como número ≥ 0; vacío vuelve al costo del catálogo.
  - `lineasParaExportar` (`pedidos.js:1084`) usa `l.costo ?? d.costo`.
- **Trazabilidad:**
  - `ALTER TABLE pedido_cambios ADD COLUMN IF NOT EXISTS campo TEXT`. NULL significa cantidad.
  - `diferencias` (`trazas.js:28`) emite también los cambios de precio con `campo = 'costo'`.
  - `anotarCambios` agrupa por persona, código y campo.
  - El historial muestra "Precio: $X → $Y".
- **Web** (`pedido-preparar.tsx`): el valor unitario se vuelve un campo editable en cada fila, con el mismo patrón del campo de cantidad. Se precarga con `s.costo` o `p?.costo`, se envía en las líneas, y los totales usan el precio editado.
- **Pruebas:**
  - el `costo` editado sobrevive a `PUT` y a `POST /lista-final`
  - el `.xlsx` del pedido trae el precio editado
  - `pedido_cambios` registra el cambio de precio
  - `comparacion.aceptacion` no cambia
- **Docs:** `CLAUDE.md` (SP6) y `docs/modelo-rotacion.md` §4.4 aclaran que el precio no entra en la métrica.

### T20 · Actividad del equipo (solo gerente)
**Objetivo:** el gerente ve qué archivos subió cada persona y qué pedidos hizo.

- `GET /api/empresa/actividad?dias=30` (`empresas.js`, `requiereRol('gerente')`):
  - `eventos e JOIN usuarios u ON u.id = e.usuario_id WHERE u.empresa_id = $1`
  - tipos `archivo_subido`, `export_reusado`, `movimientos_registrados`, `pedido_enviado`, `pedido_aprobado`, `pedido_devuelto`, `pedido_terminado`
  - `LIMIT 300`
  - devuelve `{ quien, cargo, tipo, nombreArchivo (detalle.archivos o detalle.nombre), pedido (número), cantidad, fecha }`
  - Es el mismo patrón que `historial` (`trazas.js:98`). Aquí sí se muestran los nombres de archivo, porque son de su propia empresa.
- **Web:**
  - `app/(app)/actividad/page.tsx` + `components/app/actividad.tsx`, con `SoloRol permite={['gerente']}`. Muestra una tabla con fecha, persona, qué hizo y archivo o pedido, y un filtro de "Archivos / Pedidos / Movimientos" con `Pildoras`.
  - Ítem "Actividad" en `itemsDe` para el gerente, en las dos vistas.
- **Prueba:** el gerente ve el archivo que subió el operador con su nombre, y el administrador recibe 403.

### T21 · Noticias, TRM y sector de la empresa (solo gerente)
**Objetivo:** el gerente ve en un solo lugar la TRM del día y los titulares que afectan lo que importa y vende.

- **Sector:**
  - `ALTER TABLE empresas ADD COLUMN IF NOT EXISTS sector TEXT`.
  - `PUT /api/empresa` acepta `sector` de una lista fija, `SECTORES` en `server/noticias.js`: alimentos, salud y cosméticos, construcción y ferretería, muebles y hogar, textil y confección, tecnología, otro.
  - Un selector en `empresa.tsx`.
- **`server/noticias.js`**, nuevo, montado como `GET /api/noticias` con `requiereRol('gerente')`:
  - `trm()`:
    - el dólar sale de `datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde DESC&$limit=1`
    - el euro y el yuan salen de `api.frankfurter.app/latest?from=USD&to=EUR,CNY`, con COP por divisa = TRM ÷ divisas por dólar
  - `titulares(consulta)`:
    - Google Noticias RSS (`news.google.com/rss/search?q=…&hl=es-419&gl=CO&ceid=CO:es-419`)
    - consultas: aranceles Colombia con China, con Estados Unidos y con la Unión Europea, y la regulación del sector de la empresa
    - `leerRss(xml)` es una función pura con regex: los cinco primeros `<item>`, con título, enlace (solo `https://`), fuente y fecha
  - Cada fuente con `AbortSignal.timeout(5000)` y `Promise.allSettled`: si una falla, esa sección dice "No se pudo cargar ahora" y las demás siguen.
  - Caché en un `Map` del módulo: 6 horas para titulares y hasta el día siguiente para la TRM. `shortcut: caché por instancia de Vercel, cada función fría vuelve a pedir; pasar a la base si las fuentes empiezan a limitar`.
  - Enlaces fijos por sector (INVIMA, SIC reglamentos técnicos, MinCIT/VUCE).
- **Web:** `app/(app)/noticias/page.tsx` + `components/app/noticias.tsx`, con `SoloRol` de gerente:
  - tres cifras grandes de TRM con su fecha y la nota "Euro y yuan: calculados con la TRM y el cambio internacional del día"
  - una `Tarjeta` por tema con sus titulares, como enlaces `target=_blank rel="noopener noreferrer"` que muestran solo texto
  - si no hay sector, un aviso para elegirlo en Mi empresa
  - ítem "Noticias" en `itemsDe`
- **Pruebas** (`test/noticias.test.js`, con `global.fetch` reemplazado):
  - `leerRss` con un XML de muestra: descarta enlaces que no son https y decodifica entidades
  - la conversión de la TRM
  - si una fuente falla, las demás siguen
  - el administrador recibe 403
- **Seguridad:** el RSS no es confiable. Solo se muestran texto y enlaces https, nunca HTML.

---

## Verificación

- Por tarea: `npm test` en verde y `node inventory-forecasting-landing-page/node_modules/typescript/bin/tsc --noEmit -p inventory-forecasting-landing-page` cuando toca la web. `npm run texto` después de T15, T16, T17 y T21.
- De punta a punta, en local (`TEAM_EMAILS=… NEXT_PUBLIC_WHATSAPP_VENTAS=57… npm run dev`):
  1. Crear una cuenta sin código: cae en la ventana de activación con el botón de WhatsApp. Un código inválido da error. El equipo genera un código en Cuentas, se escribe, y entra al panel como gerente.
  2. Página principal: las tres tarjetas con 82.500, 89.700 y +9.800 y los nombres nuevos.
  3. El gerente invita a un operador, que se registra y activa con su propio código. Sin permisos solo ve Productos, Existencias y Datos. Con "Puede hacer conteos" aparece el botón de conteo y la venta sigue bloqueada.
  4. Preparar un pedido, cambiar el precio de una línea, cerrarlo: el PDF y el Excel traen el precio nuevo y el historial muestra "Precio: … → …".
  5. Actividad: el gerente ve el archivo que subió el operador, con nombre y fecha.
  6. Noticias: TRM de las tres divisas y titulares. Elegir un sector en Mi empresa trae su sección.
  7. El operador elimina su cuenta. El gerente intenta eliminar la suya y se lo impide; pasa la gerencia al administrador y ya puede.
- **Antes de publicar:** como T1–T14, nada de esto se publica mientras siga abierto el piloto de Alpha 0.2. T16 cambia el registro y va junto con T10. Cada tarea necesita su fila en "Cambios" con la fecha.

## Notas para las sesiones que implementen

- `eventos` y `archivos` no tienen `empresa_id`: hay que filtrar uniendo con `usuarios.empresa_id`. `detalleCuenta` (`cuentas-equipo.js:169`) quita los nombres de archivo a propósito, porque el equipo no debe verlos. La actividad del gerente sí los muestra, porque es su empresa.
- `borrarDatos` (`borrar.js`) borra los pedidos del usuario en cascada y su ascenso automático (`herederosDe`) no mira el rango. T17 evita llegar ahí con un gerente que tiene miembros.
- `DELETE /api/empresa/miembros/:id` no borra a la persona: la manda a una empresa vacía donde queda como gerente. No es lo mismo que "Eliminar mi cuenta".
- `leerAjustes` no aplica aquí. Nada de esto vive en `empresas.inventario`.
- La única llamada externa que existe hoy es `server/correo.js` (Brevo, `fetch` nativo). `noticias.js` sigue ese patrón.
- `/cuenta/*` está fuera del evento `sesion-cerrada` de `lib/api.ts:32`, así que el 403 de "pendiente de código" no saca a nadie de la sesión.
