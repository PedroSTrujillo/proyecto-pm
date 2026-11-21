# Plan: integrar "Cambios SINESC" en la app

## Contexto

El equipo revisó la app y escribió `../Cambios SINESC.md`. Los cambios caen en seis frentes:

1. **Roles reales.** Hoy el perfil (analista/operador) se cambia con un clic. El documento pide una jerarquía: gerente > administrador > operador, donde ningún rol puede subirse a sí mismo.
2. **SINESC informa, no lleva la contabilidad.** Cerrar un pedido no debe tocar existencias ni dejar pendientes para "marcar la llegada". El pedido solo genera el documento y se muestra al lado de las existencias.
3. **Sección de Reportes** con reportes predefinidos, cada uno con su rango de fechas y botones "Ver" y "Descargar".
4. **Monetización:** precios en la página principal, códigos de acceso de un solo uso para crear cuenta y la posibilidad de que el equipo le quite el acceso a una cuenta.
5. **Pestaña Proveedores:** tiempo de entrega con unidad, condiciones de pedido, y para importadores, contenedores.
6. **Movimientos:** la subida de varios a la vez queda por defecto.

### Decisiones tomadas (respuestas del equipo y criterio de menor código)

- **El rol sale de columnas que ya existen.** No se crea una columna nueva:
  - Gerente = `usuarios.admin_empresa` (el fundador; hay uno por empresa).
  - Administrador = `perfil = 'analista'`.
  - Operador = `perfil = 'operador'`.
  - El valor `'analista'` se queda en la base para no tocar alertas ni boletín. En pantalla se llama "Administrador".
- **Regla única de permisos:** una persona solo invita, saca o cambia a alguien de rango estrictamente menor, y solo asigna roles menores al suyo. Nadie toca al gerente.
- **Color:** cada color es su propio código. El "mínimo por color" es el `minimo_pedido` por producto que ya existe, más un valor por defecto para cada proveedor.
- **Contenedores:** se muestra la ocupación y, si el pedido se pasa, se recortan primero los productos con más semanas de inventario (llenado greedy). No hay acomodo 3D.
- **Operador sin Reportes en esta ronda.** Va al backlog junto con el acceso temporal y el registro de lo que vio.
- **Reportes también en la vista principal del gerente.** Es la función que el documento pensó para él.
- **Fuera de alcance esta ronda:**
  - Divisas, alertas de legislación e importaciones como fuente de noticias.
  - Cobro automático (el cobro sigue siendo manual con los códigos).
  - El permiso de Datos "por cada vez".
  - Acomodo 3D en contenedores.

## Tareas

Cada tarea se revisa por aparte, deja `npm test` en verde y actualiza lo que toca:
- su sección de `CLAUDE.md`
- su fila en "Cambios" de `docs/ENTREGABLE_Y_APP.md`
- `docs/modelo-rotacion.md`, si cambia el cálculo
- una entrada en `docs/HANDOFF.md`

Dependencias: **T1** va antes de T2, T3, T4, T7 y T12. **T12** va antes de T13, y T13 antes de T14. T8 usa el guardia de T3. T5, T6, T9, T10 y T11 no dependen de nada y se pueden hacer desde ya, en paralelo.

---

### T1 · Roles en el servidor: gerente, administrador y operador
**Objetivo:** el rol es un permiso que se hace cumplir en el servidor, y nadie se lo cambia a sí mismo.

- En `server/cuentas.js`:
  - `rolEmpresa(u)` devuelve `'gerente' | 'administrador' | 'operador'`, junto con `RANGO`.
  - `requiereRol(...roles)` es una fábrica con la misma forma que `requiereAdminEmpresa`. Esta pasa a ser `requiereRol('gerente','administrador')`.
  - Se borra `PUT /api/cuenta/perfil`.
  - En `POST /crear`, quien funda la empresa queda como gerente con `aprueba = true`. Quien entra por invitación toma el rol guardado en la invitación, no el que mande el cuerpo.
  - `publico()` devuelve `rolEmpresa`.
- En `server/db.js` (`ESQUEMA`):
  - `ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS rol TEXT`.
  - Backfill idempotente: `UPDATE usuarios SET perfil='analista', aprueba=true WHERE admin_empresa`.
- En `server/empresas.js`:
  - `POST /invitaciones` recibe `rol` y valida el rango.
  - `PUT /miembros/:id` acepta `rol` además de `aprueba` y `cargo`, y valida el rango de quien edita sobre el miembro y sobre el rol nuevo. El gerente no se puede editar.
  - `DELETE /miembros/:id` valida igual.
  - Quien es sacado y queda en su propia empresa vacía pasa a ser gerente (con `perfil='analista'`). Lo mismo para el ascenso automático de `borrar.js`.
- Pruebas:
  - Ajustar `test/empresas.test.js`: la prueba de cambiar el perfil pasa a esperar 404, porque la ruta ya no existe.
  - Ajustar `test/aprobacion.test.js`.
  - Una prueba nueva de la regla de rangos: el administrador no edita a otro administrador ni al gerente, y el operador no invita.

### T2 · Invitar con rol y gestionar miembros (web)
**Objetivo:** como en Google Docs, el rol se elige al invitar y se cambia desde Mi empresa.

- `components/app/invitar.tsx` (`FormInvitar`): un selector de rol con solo los roles menores al de quien invita.
- `components/app/empresa.tsx`: el selector de rol por miembro aparece solo si quien mira tiene rango mayor. "Puede aprobar" y "Sacar" siguen la misma condición. El gerente aparece como fijo.
- `cuenta-formularios.tsx`: se quita `ElegirPerfil` del registro. `vista.tsx`: `TEXTO_PERFIL` pasa a Gerente, Administrador y Operador, y se quita `SelectorPerfil` de `marco.tsx` y de `cuenta.tsx`.
- `lib/tipos.ts`: se agregan `rolEmpresa` y `Invitacion.rol`.

### T3 · Navegación por rol y vista principal/maestro del gerente
**Objetivo:** cada rol ve solo lo suyo, y el gerente cambia con un clic entre la vista principal y la maestro.

- `marco.tsx` → `itemsDe(demo, rutas, equipo, rol, vista)`:
  - **Operador:** Productos, Movimientos, Existencias, Datos y Mi cuenta.
  - **Administrador:** lo de hoy, más Proveedores y Reportes cuando existan.
  - **Gerente, vista principal:** Panel, Productos, Pedidos, Reportes, Mi empresa y Mi cuenta.
  - **Gerente, vista maestro:** lo mismo que el administrador, más Mi empresa.
- La vista del gerente reemplaza a `SelectorPerfil` en el pie del menú (mismo patrón de botones). Se guarda en `localStorage` (try/catch, como `movimientos-modo`). Un comentario `shortcut:` anota que no se sincroniza entre dispositivos.
- Se generaliza `components/app/solo-equipo.tsx` en `SoloRol({ permite })`, que manda a la primera página permitida. Se usa en las `page.tsx` de panel, pedidos, empresa, proveedores y reportes.
- La demo sigue con su `?perfil=` actual.

### T4 · El operador restringido en el servidor y sin valores en dinero
**Objetivo:** lo que el operador no ve tampoco lo puede pedir a la API, y nunca recibe dinero.

- Se aplica `requiereRol('gerente','administrador')` a:
  - `/api/pedidos/*` y `/api/empresa/*` (menos `GET /api/empresa`, que necesita el menú)
  - `PUT /api/inventario/ajustes`
  - las escrituras del catálogo escrito (`/api/catalogo/lote`, `PUT /api/catalogo/:id`)
- **Datos para el operador:** columna nueva `usuarios.sube_datos BOOLEAN DEFAULT false`, que marca un rol superior en Mi empresa (igual que "Puede aprobar"). Las rutas de subir archivo (`inventario-rutas.js`) responden 403 al operador que no la tiene.
- **Dinero:**
  - `resumirParaOperador` (`server/inventario.js`) también quita `costo`.
  - `vistaProducto` (`movimientos.js`) quita `costo` para el operador.
  - En `alertas.js`, `alertasDe` fuerza `dineroQuieto` y `sobran` a `'nunca'` para el operador, aunque los haya pedido en sus preferencias.
- Pruebas: extender la prueba de `test/empresas.test.js:168` con `costo` en null, un 403 en pedidos y ajustes, y la subida con y sin `sube_datos`.

### T5 · Los pedidos ya no afectan inventario: se quita la llegada y lo "en camino"
**Objetivo:** el pedido solo produce el PDF o Excel y un aviso informativo ("Pedido: N") al lado de las existencias.

- Se borra `server/recepcion.js`, sus rutas en `pedidos.js` (`/por-recibir`, `/:id/recepcion`, `/:id/recibir`, `pedidoDeEmpresa`) y `recepcion` de `vistaPedido`.
- Se quita `recibido = CASE …` de `/por-que` y `/aprobar`.
- Se quita `enCamino` de:
  - `construirInventario`, `estadoDe`, `detalleSugerido` y `resumen` (`inventario.js`)
  - `inventario-rutas.js`, `pedidos.js:910` y `boletin.js`
  - la llave del caché
- Se quita la alerta `porRecibir` de `alertas.js`, `boletin-correo.js`, `cuenta.tsx` y `tipos.ts`.
- Las columnas de la base quedan (no hay migraciones).
- En la web:
  - Se borra `recepcion.tsx` y sus usos en `pedidos.tsx` y `pedido-flujo.tsx`.
  - Se quita el chip "En camino" de `ChipsProducto`, `productos.tsx`, `panel.tsx` y `pedido-preparar.tsx`.
- Se reutiliza `pedidoReciente` (`inventario-rutas.js:128`):
  - La ventana pasa de 14 días fijos a `max(14, tiempo de entrega del producto)`, para que un pedido importado no desaparezca antes de llegar.
  - Se agrega una columna "Pedido" en `existencias.tsx`; el mapa `estados` ya trae el dato.
- Pruebas:
  - Se borran las 4 pruebas de llegada de `test/recepcion-datos.test.js` (líneas 78–180).
  - Se ajustan `test/aprobacion.test.js:251`, `test/boletin.test.js` (`atrasadosDe`, `porRecibir`) y `test/alertas.test.js:191`.
- Antes de borrar, buscar con grep `recibido` en `equipo.js` y en `scripts/resultados.js` para que la medición del piloto no dependa de esto.
- **Riesgo que hay que aceptar:** después de cerrar un pedido, el sugerido sigue diciendo "pida ya" hasta que la mercancía entre en la subida del día. El aviso "Pedido: N" es lo que lo compensa, y es lo que pide el documento.

### T6 · Movimientos: "Varios a la vez" e importar archivo por defecto
**Objetivo:** el camino principal es subir lo del día.

- `movimientos.tsx`: `useState<Modo>('varios')` (se sigue respetando lo guardado en `localStorage`).
- En `PegarVarios`, `ImportarLista` pasa arriba como acción principal, con el botón primario.
- "Un movimiento" queda como segunda opción.

### T7 · Reportes en el servidor
**Objetivo:** cinco reportes por rango de fechas, que se pueden ver y descargar en Excel.

- Archivo nuevo `server/reportes.js`, montado en `app.js` con `requiereRol('gerente','administrador')`:
  - `GET /api/reportes/:tipo?desde=&hasta=` devuelve `{ titulo, subtitulo, columnas, filas }`.
  - `GET /api/reportes/:tipo.xlsx` arma el archivo con `hojaConMarca` + `tabla` + `aBuffer` (`server/excel.js`), siguiendo el patrón de `libroDeMinimos` en `exportar.js`.
- Tipos:
  - `mas-vendidos` y `menos-vendidos`
  - `proyectos`
  - `venta-unica` (`clase === 'unica'`)
  - `pedidos` (cerrados en el rango, por `empresa_id`, una fila por línea de `lista_final`)
- La venta por rango es una función pura nueva, `ventasEnRango(series, desde, hasta)`. Suma las semanas de `exports.series` que se cruzan con el rango, usando `inicioDeSemana` (`series.js`). La parte de proyecto sale de `series.proyecto`. La serie viene de `ultimoExport`, que ya combina el archivo con los movimientos.
- La granularidad es semanal. Va con un comentario `shortcut:` que lo dice.
- Columnas: código, nombre, unidades vendidas, existencias y "Pedido" (`pedidoReciente`). Si hay costos, se agrega "Valor vendido".
- Pruebas: `ventasEnRango` (semana parcial, rango fuera de la serie) y una prueba de API por tipo con su `.xlsx`.

### T8 · Reportes en la web
**Objetivo:** el gerente encuentra el reporte sin buscar filtros.

- Página nueva `app/(app)/reportes/page.tsx` + `components/app/reportes.tsx`. Usa `SoloRol` de T3 si ya existe; si no, `usuario.empresa.admin` mientras tanto.
- Una `Tarjeta` por reporte, con título grande y subtítulo. Para elegir el periodo hay unas `Pildoras`: "Últimos N días/semanas/meses" o "Entre fechas", con los inputs de fecha de `movimientos.tsx`.
- Dos botones:
  - **Ver** dibuja una tabla genérica debajo, con el markup de tabla de `existencias.tsx`.
  - **Descargar** usa `bajar()` de `lib/descargar.ts`.
- Se agrega el ítem en `itemsDe`.

### T9 · Precio en la página principal
**Objetivo:** la pestaña "Precio" lleva a los precios reales.

- Se reescribe `components/landing/pricing-section.tsx` (ya está montada y `#precio` ya está en `site-header.tsx`):
  - 82.500 COP/mes por el primer usuario gerente o administrador
  - 90.000 COP/mes con un operador
  - +10.000 COP/mes por cada usuario adicional
  - Una línea sobre el código de acceso
- Se quita "Versión piloto" de `cta-section.tsx`.
- Se corre `npm run texto`.

### T10 · Códigos de acceso de un solo uso
**Objetivo:** solo se crea una cuenta con un código que entrega el equipo, y cada persona lleva el suyo, también quien entra por invitación.

- Tabla nueva `codigos_acceso (codigo TEXT PK, nota TEXT, creado_por, creado_en, usado_en, usado_por)` en `ESQUEMA`.
- `POST /api/cuenta/crear`: dentro de la misma `db.tx` se consume el código con un `UPDATE … WHERE usado_en IS NULL RETURNING`, el mismo patrón de la invitación. Un código inválido o ya usado responde 400.
- `server/cuentas-equipo.js`: `GET` y `POST /codigos` (cantidad y nota). Los códigos se generan con `crypto.randomBytes`, en un formato legible tipo `XXXX-XXXX`.
- Web:
  - En `cuentas-equipo.tsx`, un bloque "Códigos de acceso": generar, copiar y ver si ya se usó y quién lo usó.
  - En `CrearCuenta`, un campo "Código de acceso".
- Pruebas: un ayudante `conCodigo(cuerpo)` en `test/` que inserta un código. Se aplica en las 22 creaciones de cuenta de 10 archivos, y se agrega una prueba de código reusado o inválido.

### T11 · Quitar el acceso a una cuenta
**Objetivo:** si un cliente no paga, el equipo suspende una o más cuentas y las puede reactivar sin borrar datos.

- Columna nueva `usuarios.suspendida_en TIMESTAMPTZ`.
- `cargarUsuario` agrega `AND u.suspendida_en IS NULL`. `/entrar`, `/olvide` y `/restablecer` rechazan la cuenta con un mensaje claro.
- `cuentas-equipo.js`: `POST /:id/suspender` (también borra sus sesiones, reutilizando `cerrarSesiones`) y `POST /:id/reactivar`. El evento queda con el correo enmascarado.
- Web: botones "Suspender" y "Reactivar" en `DetalleCuenta`, y el estado en la lista.
- Prueba: una cuenta suspendida queda fuera y al reactivarla vuelve a entrar.

### T12 · Pestaña Proveedores: tiempo de entrega con unidad
**Objetivo:** gerente y administrador manejan los proveedores en su propia pestaña.

- Página nueva `app/(app)/proveedores/` + `components/app/proveedores.tsx`. Se **mueve** ahí el componente `Proveedores` de `datos.tsx` (líneas 193–316), y Datos queda solo para subir archivos.
- Unidad por proveedor: `ajustes.unidades { prov: 'habiles' | 'calendario' | 'semanas' }`, filtrado en `leerAjustes`. El modelo sigue en días hábiles (`entregasDias`): la pantalla convierte al leer y al guardar (calendario ×5/7, semanas ×5).
- `Contador` (`ui.tsx`) agrega las unidades `'dias-calendario'` y `'semanas'`. Se mantienen el −/+ y la escritura directa.
- Prueba: `leerAjustes` conserva `unidades` y descarta lo desconocido.

### T13 · Condiciones de pedido por proveedor
**Objetivo:** el sugerido respeta el paquete y los mínimos del proveedor, por ejemplo 28 → 30 en paquetes de 10.

- `ajustes.condiciones { prov: { multiplo, minimoProducto, minimoEnvio } }` en `leerAjustes`.
- `construirInventario` (`inventario.js:292`): `multiplo = producto.multiplo || condiciones[prov].multiplo`, y lo mismo con `minimoPedido`. Lo del producto manda sobre lo del proveedor, y `loteOrigen` dice de dónde salió. Así el redondeo llega a todos los que llaman `construirInventario` sin tocarlos.
- `minimoEnvio` (total del pedido): un aviso en el encabezado del grupo de `pedido-preparar.tsx`, "Faltan N unidades para el mínimo de envío". No se agregan unidades solas.
- Los campos se editan en la ficha del proveedor (T12). `ComoSeCalcula` (`catalogo.tsx`) explica cuando el paquete viene del proveedor.
- Pruebas en `test/catalogo-motor.test.js`: el paquete del proveedor redondea, el del producto gana sobre el del proveedor, y el mínimo del proveedor se aplica.

### T14 · Importadores: dimensiones y contenedores
**Objetivo:** el pedido de un importador cabe en los contenedores que piensa contratar.

- `condiciones[prov]` suma `importado: boolean`, `contenedores: N` y `tipoContenedor: '20' | '40'`. La capacidad útil va en una constante con su fuente en un comentario.
- Por producto, columna `productos.volumen_paquete` (m³ por paquete). Se escribe como largo × ancho × alto en cm, en la ficha o en `/api/catalogo/lote` (columnas nuevas en `CatalogoEnLote`).
- Función pura nueva `ajustarAContenedores(lineas, capacidad)`: si el volumen pasa la capacidad, quita paquetes empezando por las líneas con más semanas de inventario hasta que quepa. Se aplica al preparar el pedido (`crearDesdeSugerido` / `fotoSugerido` en `pedidos.js`) para proveedores importados.
- En `pedido-preparar.tsx`, el grupo del importador muestra "Ocupa X de N contenedores", calculado en el cliente con las cantidades editadas. Si se pasa, el aviso sale en rojo.
- Pruebas: `ajustarAContenedores` (cabe, no cabe, productos sin volumen que no cuentan) y una prueba de API del pedido recortado.

---

## Verificación

- Por tarea: `npm test` en verde, más `node inventory-forecasting-landing-page/node_modules/typescript/bin/tsc --noEmit -p inventory-forecasting-landing-page` cuando toca la web.
- De punta a punta, en local (`TEAM_EMAILS=… npm run dev`):
  1. El equipo genera códigos en Cuentas.
  2. Crear cuenta con código → queda como gerente y ve la vista principal; cambia a maestro con un clic.
  3. El gerente invita a un administrador y a un operador; cada uno se registra con su propio código.
  4. El administrador no puede editar al gerente. El operador solo ve Productos, Movimientos, Existencias, Datos y Cuenta, sin valores en dinero, y Datos le pide permiso hasta que se lo marquen.
  5. Subir un archivo y luego movimientos por archivo (pantalla por defecto).
  6. Proveedores: tiempo en semanas, paquete de 10, y un importador con un contenedor → "Preparar pedido" redondea, avisa el mínimo de envío y recorta al contenedor.
  7. Cerrar el pedido → Existencias muestra "Pedido: N" y las existencias no cambian.
  8. Reportes: ver y descargar cada uno.
  9. El equipo suspende la cuenta del operador → queda fuera; al reactivarla, vuelve.
- `npm run texto` después de T2, T8 y T9.
- **Antes de publicar:** T1, T3, T4 y T5 cambian lo que ve un usuario del piloto y T5 cambia el sugerido. No se publican en producción mientras el piloto de Alpha 0.2 siga abierto. Cada cambio necesita su fila en "Cambios" con la fecha.

## Notas para las sesiones que implementen

Hallazgos del análisis del 2026-11-20 que no se ven leyendo un solo archivo. Verificar las líneas antes de usarlas: pueden haberse movido.

**Roles (T1–T4)**
- `usuarios.rol` vale `'usuario'` o `'equipo'`, no "probador". El administrador de la empresa se marca con `usuarios.admin_empresa`, y hay un solo guardia: `requiereAdminEmpresa` (`cuentas.js:139`). `aprueba` se revisa dentro de `pedidos.js` (`pedidoParaAprobar`, `puedeCerrarSolo`, `/por-que`, `/enviar`), no con un middleware.
- T1 revierte la decisión **D3** de `docs/PLAN_EMPRESAS_INVENTARIO.md` (líneas 30 y 186: "el perfil no es un permiso"). Hay que anotarlo ahí y en "Cambios". Los roles que pidió el cliente ya estaban en `docs/Retroalimentación Pruebas.md:86-87,99`.
- El `CHECK (perfil IN ('analista','operador'))` (`db.js:146`) no se toca: el plan reutiliza esos dos valores.
- Hoy se vuelven administradores: quien funda la empresa (`cuentas.js:251`), `asegurarEmpresa` (`cuentas.js:97`), el backfill viejo (`db.js:210`), quien es sacado de una empresa (`empresas.js:167`) y el miembro más antiguo cuando se borra al administrador (`borrar.js:43,59-65`). En todos esos casos la persona tiene que quedar como gerente.
- Lo que el operador recibe hoy con valores en dinero (T4 lo cierra):
  - `p.costo` en `/api/inventario`: `resumirParaOperador` no lo quita, y `productos.tsx:401` lo muestra.
  - `costo` en `GET /api/catalogo` (`vistaProducto`, `movimientos.js:195`).
  - `costo` en `pedidos.sugerido`, en `GET /:id/sugerido` y en el PDF y el Excel del pedido. Esto queda cerrado si se bloquea `/api/pedidos` al operador.
  - El boletín, si el operador activa `dineroQuieto` o `sobran` en sus preferencias.
- `PUT /api/inventario/ajustes` y `/api/catalogo/*` no revisan rol hoy: solo la pantalla los esconde. La prueba `test/empresas.test.js:144` confirma que un miembro que no es administrador puede guardar ajustes, y hay que cambiarla.
- `solo-equipo.tsx` es el único guardia de páginas que existe. Las demás páginas no tienen ninguno.

**Pedidos sin efecto (T5)**
- Cerrar un pedido **no** cambia las existencias hoy. Solo las cambia `POST /:id/recibir`. Lo que sí cambia es el sugerido y "pida ya", a través de `enCamino`, y eso es lo que se quita.
- Usos de `enCamino`: `inventario-rutas.js:172-195,213`, `pedidos.js:910,923`, `boletin.js:27,68,112`, y dentro de `inventario.js` en `estadoDe`, `construirInventario`, `detalleSugerido`, `resumen` y `CAMPOS_RESUMEN_OPERADOR`. `exportar.js` no lo usa.
- `pedidosRecientes` (`inventario-rutas.js:128`) deja **solo el pedido más reciente** de cada producto (no suma varios) y no excluye los simulados.
- Documentos que mencionan la llegada de pedidos: `CLAUDE.md` (sección SP5 y alerta `porRecibir`), `docs/modelo-rotacion.md` (§10 y líneas cercanas a 323-440), `docs/PLAN_ALPHA_02.md:219-220,272`. La página principal también describe "la llegada de los pedidos".

**Reportes (T7–T8)**
- `GET /api/pedidos` filtra por `usuario_id`. El reporte de pedidos tiene que consultar por `empresa_id`, como lo hace `pedidosRecientes`.
- `productos[].serie` de `/api/inventario` trae solo 52 semanas y **sin** las ventas de proyecto (y `null` para el operador). Para los rangos hay que usar `exports.series` del `ultimoExport` (hasta 110 semanas, con `proyecto` aparte).
- `GET /api/movimientos` tiene `LIMIT 500`: no sirve para sumar ventas.
- `clase === 'unica'` necesita al menos 26 semanas de serie (`ventaUnica`, `inventario.js:144`). Con menos datos, ese reporte sale vacío y la pantalla tiene que decir por qué.

**Monetización (T9–T11)**
- La sección de precio ya existe y ya está montada (`pricing-section.tsx`, `app/page.tsx:32`), y `#precio` ya está en el encabezado. El menú del encabezado no aparece en celular (`hidden lg:block`).
- `POST /api/cuenta/crear` se llama 22 veces en 10 archivos de prueba. `public/js/app.js:128` (la web antigua de las pruebas) también lo llama.
- Las sesiones se validan en `cargarUsuario` (`cuentas.js:105`). Ahí va el filtro de suspendidas. También abren sesión `/entrar` y `/restablecer`.

**Proveedores (T12–T14)**
- Un proveedor hoy es solo un nombre que sirve de llave en `empresas.inventario`. `leerAjustes` (`inventario.js:44`) funciona como lista blanca: **cualquier llave nueva (`unidades`, `condiciones`) se pierde al guardar si no se agrega ahí**.
- Todos los que llaman `construirInventario` con datos de una empresa: `inventario-rutas.js:178,213`, `pedidos.js:910,1160`, `boletin.js:68`, `demo.js:444`, `equipo.js:178`. Al poner las condiciones dentro de `construirInventario`, les llegan a todos.
- El redondeo de 28 → 30 por paquete ya funciona por producto (`multiplo`, `P.aLote`). Lo que falta es el valor por proveedor.
- `/api/inventario` devuelve `proveedores` solo con conteos (`inventario.js:458`), no con sus productos.
- Hoy el tiempo de entrega se escribe en `datos.tsx` (`Proveedores`, líneas 193-316), en `pedido-flujo.tsx:426` (en semanas, paso 4 de "Comparar con mi propia lista") y en `pedido-flujo.tsx:824`.
