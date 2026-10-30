# Modelo de rotación de inventario · Alpha 0.1 y 0.2

Este documento explica el modelo matemático que usa el producto, por qué se eligió y cómo se miden las hipótesis: la de Alpha 0.1 (§4.1 a §4.3, ya cerrada) y la del piloto de Alpha 0.2 (§4.4). El código está en [`server/rotacion.js`](../server/rotacion.js) (cálculo), [`server/listas.js`](../server/listas.js) (comparación de listas) y [`server/equipo.js`](../server/equipo.js) (resultados de la prueba y del piloto).

> Regla de diseño: el documento del MVP manda sobre cualquier decisión técnica. El modelo implementa exactamente las dos fórmulas de la sección 3.5 del contexto. La investigación sirve para justificarlas, fijar los detalles que el documento deja abiertos (cómo se cuentan las semanas, qué es "muchas semanas", casos borde) y dejar escrito cómo se extendería después, sin construirlo ahora.

---

## 1. Dos formas de medir la rotación

La literatura de inventarios usa dos indicadores que están relacionados:

| Indicador | Fórmula | Qué dice | Para qué sirve |
|---|---|---|---|
| **Rotación** (*inventory turnover*) | ventas del periodo ÷ inventario promedio | cuántas veces se renueva el inventario en el periodo | indicador financiero, agregado para toda la empresa |
| **Cobertura** (semanas de inventario, *weeks of supply*) | existencias actuales ÷ ventas promedio por semana | cuántas semanas dura lo que hay si se sigue vendiendo igual | decisión de compra, producto por producto |

Las dos miden lo mismo visto al revés. Si el inventario promedio se aproxima con las existencias actuales, entonces **semanas de inventario ≈ 52 ÷ rotación anual**. Un producto que rota 4 veces al año tiene unas 13 semanas de inventario.

El producto usa la **cobertura en semanas** por tres razones:

1. Se calcula **por producto y en unidades**, con los datos que ya existen en el export (código, fecha, cantidad, existencias). No necesita costos.
2. Responde directamente la pregunta del usuario antes de pedir: *¿qué se agota primero y qué sobra?*
3. Se explica en una frase con un ejemplo de su propio archivo, que es lo que pide el documento para no ser una "caja negra".

## 2. El modelo

Para cada producto *i* del archivo:

```
T    = semanas del histórico   = (último día − primer día + 1) ÷ 7
Qᵢ   = total vendido de i      = Σ cantidades vendidas de i (netas de devoluciones),
                                 con su mes fuera de lo normal recortado (ajuste 2)
Tᵢ   = semanas del producto    = T, o las semanas desde su primera venta si es nuevo (ajuste 3)
Rᵢ   = semanas recientes       = mín(13, Tᵢ)
Qᵢʳ  = vendido en lo reciente  = lo que vendió i en esas Rᵢ semanas
d̄ᵢ   = ventas por semana       = (Qᵢ + Qᵢʳ) ÷ (Tᵢ + Rᵢ)       (ajuste 1: lo reciente cuenta doble)
Iᵢ   = existencias actuales de i (si hay varias filas, como varias bodegas, se suman)
Sᵢ   = semanas de inventario   = Iᵢ ÷ d̄ᵢ            si Qᵢ > 0
                               = "sin ventas en el periodo"   si Qᵢ ≤ 0
```

La estructura es la del documento del MVP (Sᵢ = existencias ÷ ventas por semana). Lo que cambió el 2026-10-11 es cómo se calculan las ventas por semana: antes era el promedio simple Qᵢ ÷ T; ahora lleva los tres ajustes de §3.6. Sin ajustes que aplicar (histórico de 13 semanas o menos, sin picos, sin productos nuevos) d̄ᵢ da exactamente Qᵢ ÷ T. El reporte muestra el promedio simple en el título de cada celda, para comparar.

**Clasificación** (solo para resaltar y filtrar; el producto no le dice al usuario cuánto pedir):

| Estado | Condición | En pantalla |
|---|---|---|
| Se agota | Sᵢ < 2 | fila en rojo, va arriba |
| Sobra | Sᵢ > 12, o sin ventas y con existencias | fila en azul |
| Normal | 2 ≤ Sᵢ ≤ 12 | sin resaltar |

**Orden de la tabla:** de menor a mayor Sᵢ. Si dos productos empatan, va primero el que más vende por semana. Los productos sin ventas van al final, ordenados por existencias (primero los que tienen más mercancía quieta).

### Ejemplo resuelto (plantilla descargable)

El producto `TOR-0610` vendió 608 unidades en un histórico de 364 días, 158 de ellas en las últimas 13 semanas:

- T = 364 ÷ 7 = **52 semanas**; no es nuevo ni tiene picos, así que Tᵢ = 52 y Qᵢ = 608
- d̄ = (608 + 158) ÷ (52 + 13) = **11,8 unidades por semana** (el promedio simple daría 608 ÷ 52 = 11,7)
- I = 18 unidades
- S = 18 ÷ 11,8 = **1,5 semanas**: se agota (menos de 2).

Esto mismo aparece en la pantalla del reporte, paso a paso, con los números del archivo de cada usuario.

## 3. Por qué este modelo y no otro

### 3.1 Se usa todo el histórico

El documento pide usar todo el histórico (uno o dos años). Hay dos razones estadísticas para hacerlo:

**Menos error.** Si las ventas semanales de un producto son estables, con media μ y desviación σ, el promedio de T semanas estima μ sin sesgo y con error estándar σ/√T. Con 4 semanas el error es σ/2; con 52 semanas es σ/7,2; con 104 semanas es σ/10.

**Demanda intermitente.** En catálogos grandes, como los de una ferretería, muchos productos se venden de vez en cuando y tienen muchas semanas en cero. En la clasificación de Syntetos y Boylan son productos con un intervalo promedio entre ventas (ADI) mayor a 1,32 periodos. Con una ventana corta, esos productos salen como si no se vendieran:

> Un producto que vende en promedio 1 unidad cada 6 semanas (Poisson con λ = 1/6 por semana):
> - P(0 ventas en 4 semanas) = e^(−4/6) ≈ **51 %**: en la mitad de los casos saldría "sin ventas".
> - P(0 ventas en 52 semanas) = e^(−52/6) ≈ **0,02 %**.

Esto es lo que vieron en las entrevistas: con un periodo corto, muchos productos de baja rotación salen en cero.

### 3.2 Por qué no suavización exponencial ni Croston

Existen métodos que reaccionan más rápido a los cambios de demanda:

- La **suavización exponencial simple** queda sesgada cuando la demanda es intermitente.
- El método de **Croston** separa el tamaño de cada venta del intervalo entre ventas, pero sobreestima la demanda. La corrección de Syntetos y Boylan (SBA) reduce ese sesgo.

Todos piden elegir parámetros (α) y no se explican en una frase. Eso choca con dos requisitos del documento: no exigir configuración y que el usuario entienda de dónde sale el número. En vez de eso, el promedio lleva tres ajustes fijos que sí se explican en una frase cada uno (§3.6). El ajuste por temporada sigue fuera del alcance de esta versión (sección 6 del documento).

### 3.3 Un mismo T para todos los productos, salvo los nuevos

Las semanas se cuentan entre la primera y la última fecha de **todo el archivo**, no de cada producto. Si se contaran desde la primera venta de cada producto, uno que se vendió una sola vez hace dos semanas tendría un promedio inflado y parecería de alta rotación. Además, un producto que se vende de vez en cuando tarda en aparecer en el archivo sin ser nuevo.

La excepción es el producto que de verdad es nuevo: con un T común quedaba con un promedio más bajo del real y parecía que sobraba. Desde el 2026-10-11 (ajuste 3 de §3.6), un producto cuenta como nuevo solo si su primera venta llega **más de 13 semanas después del inicio del archivo y más de 3 veces lo que suele tardar entre una venta y otra**. A ese se le cuentan las semanas desde su primera venta, con un mínimo de 13. No cuenta como nuevo el que vendió todo en dos semanas o menos y no volvió a venderse en las últimas 4: es una venta puntual (§7.4), no un producto que empezó (2026-10-14). El mínimo acota el error de la venta única: con 52 semanas de histórico, el promedio de un producto nuevo puede quedar como mucho 4 veces por encima del que daría el T común, y no 26 veces.

Si el export viene **agrupado por mes** (una fecha por mes, o una columna por mes), el último mes se cuenta completo hasta su último día, para no recortar el periodo.

### 3.4 El umbral de "sobra": 12 semanas

El documento fija el umbral de "se agota" (menos de 2 semanas), pero no dice cuántas semanas son "muchas". Se tomaron **12 semanas (unos 3 meses)**, a partir de referencias para distribuidores:

- Los distribuidores de ferretería, herramientas y suministro industrial rotan entre 4 y 8 veces al año, lo que equivale a mantener entre 45 y 90 días de inventario (unas 6,5 a 13 semanas).
- El comercio mayorista en general rota entre 5 y 10 veces al año.

Un producto con más de 12 semanas de inventario rota menos de 52 ÷ 12 ≈ 4,3 veces al año, por debajo de lo normal incluso para los distribuidores que rotan más lento. Es una constante en el código (`SEMANAS_SOBRA`), no algo que el usuario tenga que configurar. Si el equipo quiere cambiarla después de la prueba, se cambia en una línea. *Desde el 2026-10-29 (SP7)* cada producto puede tener su propio umbral; 12 sigue siendo el valor general (§11.1).

### 3.4.1 El umbral de "se agota": 2 semanas, o el que elija el usuario

El documento fija "se agota" en menos de 2 semanas. Desde el 2026-10-13 cada cuenta puede cambiarlo en el paso 2 de cada pedido, antes de subir el archivo, y en Datos ("¿Cuándo te avisamos que algo se agota?"), porque un importador con entregas largas necesita el aviso antes (vacío 8 de CLAUDE.md). Llamemos **U** a ese umbral:

- Si el usuario no elige nada, U = 2 y todo da igual que antes.
- U es un número entero de semanas entre 1 y 11, menor que el umbral de "sobra" (12), para que un producto no pueda salir con los dos estados. Se guarda en `usuarios.inventario.semanasAgota` y lo valida `leerAjustes` (`server/inventario.js`).
- Sᵢ no cambia: solo cambia qué productos se marcan como "se agota" (Sᵢ < U).
- **Reporte del paso 3:** cada pedido tiene su U (`pedidos.semanas_agota`). Se elige en el paso 2 (`PUT /api/pedidos/:id/semanas-agota`, que también lo deja como el de Datos) o, si no, es el de Datos, y **queda fijo al ver el reporte**. El reporte guardado en `exports` se calcula con el U de Datos al subir el archivo; si el pedido usa otro (por ejemplo, con "Usar ese inventario"), `conUmbral` (`server/rotacion.js`) vuelve a marcar los estados con las mismas semanas. La coherencia con el reporte (§4.3), el recordatorio y `npm run resultados` usan el U del pedido. Los pedidos de antes no tienen U guardado y usan el de su reporte (2).
- **Panel y productos:** usan el U de hoy, también con un archivo subido antes.
- **Aplica también a los probadores durante sus 14 días** (decisión del equipo, 2026-10-13). Es un cambio de tratamiento: `npm run resultados` muestra el U de cada probador y el de cada reporte, y tiene que quedar su fila en "4 · Cambios y Reflexión".

### 3.5 Casos borde

| Caso | Qué hace el modelo |
|---|---|
| Producto sin ventas en el histórico | No divide por cero. Muestra "sin ventas en el periodo"; si tiene existencias, cuenta como "sobra". |
| Con ventas y sin existencias | Sᵢ = 0. Aparece de primero. |
| Con existencias y no aparece en las ventas | Se incluye como "sin ventas en el periodo" y se señala "No aparece en las ventas". |
| Con ventas y no aparece en las existencias | Se incluye con existencias 0 (Sᵢ = 0) y se señala "No aparece en las existencias (se tomó 0)". La mayoría de los programas no listan los productos en cero. |
| Existencias negativas | Se cuentan como 0 semanas y se señalan. |
| Devoluciones de clientes | Cuando el archivo trae tipo de documento, el usuario marca cada tipo como venta, devolución (NC se sugiere) o nada. Una devolución resta, en la fecha en que se hizo, lo que entró (columna "Cantidad entrada" de un kardex) o, si no hay esa columna, el valor absoluto de la cantidad de la fila. En un informe sin tipo de documento, las cantidades negativas también restan. Si el neto queda ≤ 0, el producto pasa a "sin ventas". En las ventas por semana del pronóstico (§7.1), una semana que queda negativa se descuenta de las semanas anteriores. |
| Varias bodegas | Las existencias se suman. |
| Códigos `00123` y `123` | Son el mismo producto (Excel suele borrar los ceros a la izquierda). Tampoco importan las mayúsculas ni los espacios sobrantes. |
| Histórico de menos de 26 semanas | Se calcula igual y se avisa que es más confiable con uno o dos años. |
| Histórico de 13 semanas o menos | Todo es "reciente": d̄ᵢ = (Qᵢ + Qᵢ) ÷ (T + T) = Qᵢ ÷ T, el promedio simple. |
| Ventas como total de un periodo, sin fecha por venta | Pasa con "Ventas por ítems" de Alegra o con el listado de inventario con la casilla de salidas. La app pregunta el periodo (desde, hasta) y T sale de ahí. Sin fechas no se sabe qué es reciente, qué mes fue un pico ni cuándo empezó un producto, así que se usa el promedio simple d̄ᵢ = Qᵢ ÷ T, y el reporte lo dice. |
| Más devoluciones que ventas en lo reciente | Lo reciente no suma doble ni resta doble: Qᵢʳ se toma como 0. |
| Pico en un mes reciente | El exceso recortado se descuenta también de Qᵢʳ, en la proporción de ese mes que cae en lo reciente. |

### 3.6 Los tres ajustes del promedio (2026-10-11)

Vienen de la lista de pendientes del equipo ("complejizar el cálculo de semanas de inventario, pero explicarlo desglosado") y de tres vacíos que dejaba el promedio simple. Las constantes están al comienzo de `server/rotacion.js`; ninguna la configura el usuario.

| # | Ajuste | Regla | Por qué |
|---|---|---|---|
| 1 | Lo reciente cuenta doble | Lo vendido en las últimas 13 semanas (o los últimos 3 meses completos si el archivo viene por mes) pesa 2 y lo demás pesa 1: d̄ᵢ = (Qᵢ + Qᵢʳ) ÷ (Tᵢ + Rᵢ). | Con 104 semanas iguales, un producto que se aceleró parece lento. Pesar el último trimestre 2 a 1 reacciona a la tendencia sin perder lo que el histórico largo protege (§3.1). Es una ponderación común en planeación de inventarios: simple de explicar y sin parámetros que el usuario tenga que elegir. |
| 2 | Un mes fuera de lo normal no infla el promedio | Si un solo mes vende **más de 3 veces la mediana de los otros meses con venta y más del doble que cualquier otro mes**, se cuenta como 3 veces la mediana. Hacen falta al menos 6 meses con venta. | Vacío #10: Claudia Mueces y Ricardo Osorio separan la demanda de proyectos de la de comercialización; una venta por proyecto infla el promedio y el reporte termina pidiendo de más. La segunda condición deja quieta una subida sostenida (varios meses altos seguidos), que es demanda real y que el ajuste 1 debe recoger. Con la primera condición sola, la prueba automática de este repo mostró que una subida de tres meses se recortaba como si fuera un pico. |
| 3 | Un producto nuevo no sale lento | Ver §3.3. | Un producto que entró al catálogo hace dos meses salía como "sobra" con un T de dos años. |

Lo que no se ajustó a propósito: la demanda que no se pudo vender porque el producto estaba agotado (las semanas en cero de un producto agotado bajan su promedio). El export de ventas y existencias no dice cuándo estuvo en cero, así que no hay con qué corregirlo. Corregirlo requiere registrar los pedidos que no se pudieron despachar; aquí queda como limitación.

**Efecto en los archivos de ejemplo** (`ejemplos/`): cambian de estado (se agota, normal, sobra) entre 0 % y 3 % de los productos. Son datos inventados, sin tendencias ni proyectos, así que el efecto real solo se verá con los exports de los probadores.

## 4. La métrica de la prueba

§4.1 a §4.3 son la métrica de Alpha 0.1, que se mide en el flujo de 5 pasos (modo `'lista'`). Esa prueba cerró el 2026-10-29 (D10 de `docs/PLAN_ALPHA_02.md`); el veredicto se sigue calculando igual. §4.4 es la del piloto de Alpha 0.2.

### 4.1 Comparación de listas (por código de producto)

Sea *I* el conjunto de códigos de la lista inicial y *F* el de la final. La cantidad de cada código en cada lista se escribe qᴵ(c) y qᶠ(c).

```
Agregadas  A = |F \ I|                                   códigos que están en la final y no en la inicial
Quitadas   Q = |I \ F|                                   códigos que estaban en la inicial y no en la final
Cambiadas  C = |{ c ∈ I ∩ F : qᴵ(c) ≠ qᶠ(c) }|           códigos que están en las dos con otra cantidad
Métrica    M = A + Q + C
```

Antes de comparar, cada lista se normaliza:

- Una línea con cantidad 0 no es parte del pedido. Si en la lista final se pone 0, esa línea cuenta como quitada.
- Si un código aparece repetido, sus cantidades se suman. Se avisa antes de guardar.
- Los códigos se comparan con la misma clave que en el reporte: sin espacios sobrantes, sin importar mayúsculas y sin ceros a la izquierda.

La prueba automática `test/listas.test.js` verifica la comparación contra un conteo hecho a mano sobre un ejemplo conocido: inicial {A 10, B 5, C 8, D 3, E 1} y final {A 10, B 7, C 8, E 2, F 4, G 6} dan A = 2, Q = 1, C = 2 y **M = 5**.

### 4.2 Resultado por usuario y veredicto

- La **ventana de 14 días** de cada usuario empieza cuando guarda su primera lista inicial.
- De cada usuario se toma el pedido con mayor M entre los que guardó como lista final dentro de esa ventana. Si dos pedidos empatan, se prefiere el real.
- **Cumple:** M ≥ 5. **No cambia:** M ≤ 1. **Intermedio:** M entre 2 y 4. **Sin pedido:** todavía no guarda una lista final dentro de la ventana.
- **Veredicto:** se cumplió la meta si 3 o más usuarios cumplen. Toca pivotar si 3 o más no cambian. Si no pasa ninguna de las dos, la prueba sigue en curso.
- El segundo criterio de pivote (cambiaron por probar la herramienta) es cualitativo. `npm run resultados` muestra la respuesta a "¿qué tuviste en cuenta?" (antes "¿por qué cambió?"; opcional desde el 2026-10-28) al lado de cada pedido para que el equipo lo juzgue.
- Cada pedido queda marcado como **real** o **simulado**, y el resumen dice cuántos de los que cumplen lo hicieron con un pedido real.

### 4.3 Coherencia con el reporte y magnitud del cambio (apoyo, no cambian el veredicto)

M cuenta líneas, pero no dice si el cambio lo produjo el dato. Para el segundo criterio de pivote (vacío #12) y para el ruido de M (vacío #11), `npm run resultados` muestra dos números más por pedido. Los dos se calculan solos al guardar la lista final (`coherenciaConReporte` y `compararListas` en `server/listas.js`):

```
Para cada línea cambiada c, dirección(c) = sube  si se agregó o subió su cantidad
                                         = baja  si se quitó o bajó su cantidad
coherente(c)  ⇔  (sube y c se agota en el reporte)  o  (baja y c sobra en el reporte)
contraria(c)  ⇔  (sube y c sobra)                   o  (baja y c se agota)
neutra(c)     ⇔  c está normal o no aparece en el reporte

Coherencia = coherentes ÷ M
Magnitud   = Σ |qᶠ(c) − qᴵ(c)| ÷ Σ qᴵ(c)          (una línea agregada o quitada aporta toda su cantidad)
```

En el ejemplo de §4.1, con un reporte donde F se agota, G y D sobran, B está normal y E no aparece: coherentes = 2 (F y D), contrarias = 1 (G), neutras = 2, **coherencia = 2 ÷ 5 = 40 %**; magnitud = 16 ÷ 27 = **59 %**. Lo verifica `test/listas.test.js`.

El resumen dice cuántos de los que cumplen movieron **la mayoría** (≥ 50 %) de sus líneas en la dirección del reporte (`COHERENCIA_MAYORIA` en `server/equipo.js`). Es una ayuda para leer los "¿por qué?", no un criterio nuevo: el veredicto sigue siendo el de §4.2. Al usuario no se le muestra, para no sugerirle qué responder en el paso 5. Los pedidos guardados antes del 2026-10-11 se completan solos la primera vez que se abre `npm run resultados`, con las listas y el reporte que ya están en la base.

### 4.4 Piloto de Alpha 0.2: aceptación, satisfacción y uso (SP3, 2026-10-29)

Hipótesis: *si SINESC permite registrar entradas y salidas a diario, X de Y usuarios califican su satisfacción con 4 o más sobre 5 y aceptan el pedido sugerido sin cambios en Z % de las líneas.* Código: `evaluarPiloto`, `resumirPiloto` y `compararConLoOcurrido` en `server/equipo.js`, `medirAceptacion` en `server/listas.js`. Pruebas: `test/piloto.test.js` y `test/pedidos-sugerido.test.js`.

**Aceptación de un pedido.** Al preparar un pedido desde lo sugerido (modo `'sugerido'`) se guarda la foto S de lo sugerido (`pedidos.sugerido`): las líneas con sugerido mayor que 0 y estado "se agota", "pedir ya" o normal. La lista final F la escribe la persona. Con la misma comparación por código de §4.1 (I = S):

```
Sugeridas    s = |S|
Sin cambio   k = |{ c ∈ S ∩ F : qˢ(c) = qᶠ(c) }|          líneas sugeridas que quedaron igual
Ajustadas, quitadas y agregadas: C, Q y A de §4.1
Aceptación del pedido = k ÷ s
```

Se guarda en `comparacion.aceptacion` al guardar la lista final. Si en la empresa alguien aprueba pedidos (SP6), se mide cuando quien prepara **envía** el pedido, porque es su decisión; lo que cambia después quien aprueba va aparte (`comparacion.aprobacion`, contra `pedidos.lista_enviada`) y no entra en la meta. Una línea agregada no baja k pero queda contada en A.

**Por usuario**, en una ventana de 30 días (`PILOTO_DIAS`) desde el día de su primer pedido desde lo sugerido:

```
Aceptación   = Σ k ÷ Σ s       sobre sus pedidos cerrados dentro de la ventana (sin borrados ni anulados)
Satisfacción = su última respuesta de 1 a 5 a "¿Qué tan útil le ha resultado SINESC para preparar sus pedidos?"
Uso          = días hábiles con movimientos de su empresa ÷ días hábiles de la ventana que ya pasaron
```

Se suman las líneas de todos los pedidos (no se promedian porcentajes), así un pedido de 3 líneas no pesa lo mismo que uno de 200. Los días hábiles son de lunes a viernes, en hora de Bogotá, sin descontar festivos. El uso es la condición de la hipótesis ("si permite registrar a diario"): se reporta al lado, no decide el veredicto.

- **Cumple:** satisfacción ≥ 4 y aceptación ≥ Z. **En curso:** no cumple y su ventana no ha terminado. **Incompleto:** terminó la ventana sin pedido cerrado o sin respuesta a la encuesta. **No cumple:** terminó con las dos y no llega.
- **Veredicto:** meta cumplida si X o más usuarios cumplen; meta no cumplida si ya terminaron su ventana Y usuarios y no se llegó. X = 3, Y = 5 y Z = 70 % son provisionales (`META_PILOTO_USUARIOS`, `TOTAL_PILOTO`, `META_ACEPTACION_PCT`) y el equipo las fija antes de empezar. Cambiarlas cambia el resultado, así que va también en el Entregable.
- **Nadie ve la aceptación durante el piloto** (D16): `vistaPedido` la quita de toda respuesta. Ver cuánto se aceptó empujaría a aceptar sin mirar.

**Sugerido contra decidido contra ocurrido** (solo para el equipo, Hito 7). Para cada línea de la foto cuyo horizonte (entrega + cada cuánto pide, `cubre`) ya pasó, se compara lo vendido de verdad en las semanas que cubría el pedido con el rango del pronóstico guardado en la foto (del 10 % al 90 %, §7.4). Es la misma prueba de §7.5, con lo que pasó después del pedido: si el modelo está bien calibrado, unos 8 de cada 10 caen dentro. Las semanas vienen de la serie del último inventario de la empresa y se cuentan las que empiezan dentro del horizonte (aproximado).

**Encuesta** (`server/encuesta.js`, D15). Aparece en el panel cuando el equipo la abre (`npm run resultados -- --encuesta abrir`) o a los 21 días del primer pedido cerrado. "Ahora no" la pospone 3 días, como máximo dos veces. No menciona la prueba.

## 5. Recordatorio antes de que se agote (stickiness)

La corrección del Entregable 2 (2026-10-07, fila de Stickiness en "Cambios") cambió el mecanismo que trae de vuelta al usuario: *"se le pregunta al usuario si quisiera recibir un recordatorio vía correo electrónico 3 días antes de cuando la aplicación estima que productos con buen nivel actual de inventario (más de 4 semanas) van a llegar al umbral de reabastecimiento (2 semanas)"*. Está en `server/recordatorios.js`.

```
t₀                     = día en que se subió el export (las existencias son de ese día), en hora de Colombia
fecha umbral(i)        = t₀ + ⌊7 · (Sᵢ − U)⌋ días     para los productos con Sᵢ > máx(4, U + 2)
fecha recordatorio(i)  = fecha umbral(i) − 3 días
```

- **Sin tareas programadas.** Un envío programado necesita un servidor siempre despierto o un cron externo, y en el plan gratis de Render el servidor se duerme. Por eso el recordatorio es un **archivo de calendario (.ics)**: el usuario lo descarga al decir que sí, lo abre, y es su Google Calendar, Outlook o celular el que avisa en la fecha, a las 8 a. m. Si se configura el correo (`BREVO_API_KEY`), la misma invitación le llega también al correo en ese momento; es un envío inmediato, no programado.
- Supone que se sigue vendiendo al ritmo d̄ᵢ del reporte, así que cada recordatorio pide subir un export nuevo para confirmar. Redondea hacia abajo: es mejor avisar un día antes que un día tarde.
- U es el umbral de "se agota" con que se vio ese reporte (§3.4.1); sin cambiarlo, U = 2 y la fórmula es la de la corrección. Con un U alto, "buen nivel" sube a U + 2 para no programar avisos que ya pasaron.
- Solo se programan los productos que llegan a U semanas dentro de los próximos 3 meses (`SEMANAS_HORIZONTE`). Más allá, la estimación ya no vale y lo correcto es subir otro export.
- Un recordatorio junta los productos de los 7 días siguientes al primero, así que llega como máximo uno por semana.
- `npm run resultados` mide el stickiness: quién lo pidió, quién descargó el calendario, a quién ya le llegó la fecha de su primer recordatorio y quién volvió a entrar desde ese día. El recordatorio vive en el calendario del usuario, así que no se sabe si lo abrió; volver a entrar desde esa fecha es la señal.

## 6. Lo que queda para después

Desde el 2026-10-11 la temporada, el tiempo de entrega y la cantidad sugerida están construidos (§7). Lo que sigue sin construir:

| Función futura | Extensión del modelo |
|---|---|
| Demanda perdida por agotados | Sumar a las ventas lo que se pidió y no se pudo despachar. Requiere un dato que el export no trae. |
| Nivel de servicio por producto | Clase ABC por plata vendida (A = el 80 % de la venta) y un nivel distinto por clase (por ejemplo 97 % / 92 % / 85 %). Hoy es 90 % para todos. |
| Lote económico | EOQ = √(2DS/H). Requiere el costo de hacer un pedido y el de tener inventario, que nadie nos ha dado. |
| Temporada por producto | Hoy el índice es del catálogo completo. Con tres o más años de ventas se podría estimar por familia de productos. |

## 7. Pronóstico, riesgo y cantidad sugerida (2026-10-11)

Código: `server/pronostico.js`, `server/series.js` e `server/inventario.js`. Pruebas: `test/pronostico.test.js`.

**Regla:** el pronóstico no cambia el número de la prueba. Las semanas de inventario Sᵢ, el estado "se agota" / "sobra" y la métrica M salen igual que antes (§2 a §4). El pronóstico agrega, al lado, un rango, una probabilidad y una cantidad.

### 7.1 Ventas por semana de cada producto

Al subir el archivo se guardan las ventas de cada producto agrupadas por semana (`exports.series`). La última semana termina el último día del archivo; una semana incompleta al comienzo se descarta. Si las ventas vienen por mes, lo de cada mes se reparte por igual entre sus días. Con totales de un periodo no hay semanas, y entonces no hay gráfico ni temporada.

El mes de un proyecto que el reporte recorta (§3.6) también se recorta aquí: el exceso (vendido − contado) se le quita a las semanas de ese mes que vendieron por encima de lo normal del producto (la mediana de las 13 semanas de antes y después), en proporción a cuánto se pasaron. Así el gráfico marca la semana del proyecto y no el mes entero.

### 7.2 Modelo Gamma-Poisson

Para cada producto i:

- **Tasa base:** λᵢ = d̄ᵢ ÷ t̄ᵢ, donde d̄ᵢ son las ventas por semana del reporte (con sus tres ajustes) y t̄ᵢ es la temporada promedio de las semanas con que se calculó (lo reciente pesa doble). Es d̄ᵢ "sin temporada".
- **Dispersión:** φᵢ = varianza ÷ media de sus ventas semanales (mínimo 1, máximo 25). Vale 1 si se vende de a una unidad y más si se vende en paquetes o a saltos. Con pocas semanas se mezcla con la del catálogo: φᵢ = (φ·n + φ_catálogo·13) ÷ (n + 13).
- **A priori:** Gamma(α₀, β₀) con β₀ = media semana y α₀ = β₀ · tasa típica del catálogo ÷ φᵢ. Pesa poco: un producto con un año de ventas casi no se mueve, uno nuevo se acerca un poco a lo típico.
- **A posteriori:** α = α₀ + λᵢ·nᵢ ÷ φᵢ, β = β₀ + nᵢ, con nᵢ las semanas que cuentan para el producto (Tᵢ del reporte).
- **Lo que se va a vender en h semanas:** X = φᵢ · N, con N ~ BinomialNegativa(α, β ÷ (β + H)), donde H es la suma de la temporada de esas semanas (H = h sin temporada). La media es λᵢ·H.

Se eligió este modelo porque funciona con los productos que se venden poco y a saltos (la mayoría de un catálogo de distribuidora), da probabilidades y no un solo número, y se calcula en milisegundos sin librerías.

### 7.3 Temporada

Con 18 meses o más de ventas, se suma todo el catálogo (sin picos de proyectos) por semana, se ajusta una recta (la tendencia) y cada semana se compara con ella. El índice de cada mes es el promedio de esas comparaciones. Se toma al 60 % (1 + 0,6·(índice − 1)), entre 0,6 y 1,6, y se normaliza para que el promedio del año sea 1. Con menos de 18 meses no hay temporada (índice 1): un solo diciembre no hace una temporada.

### 7.4 Lo que ve el usuario

| Dato | Cálculo |
|---|---|
| Rango de cada semana | Del 10 % al 90 % de X con h = 1 semana: 8 de cada 10 semanas caen ahí. |
| Riesgo de agotarse | P(X > existencias) con h = máx(tiempo de entrega, U semanas): la probabilidad de quedarse sin él antes de reponerlo. |
| "Pide ya" | No se agota en U semanas (§3.4.1), pero Sᵢ < tiempo de entrega + 1. Si el usuario no ha dicho cuánto tarda su proveedor, se supone 1 semana y no hay "pide ya". |
| Cantidad sugerida | máx(0, ⌈cuantil 90 % de X con h = entrega + cada cuánto pide⌉ − existencias). Alcanza para la entrega y hasta el siguiente pedido en 9 de cada 10 casos. "Cada cuánto pide" es 4 semanas si el usuario no lo cambia. Si el reporte marca el producto como "sobra" (más de 12 semanas), el sugerido es 0: el margen para ventas de golpe no justifica comprar lo que el reporte dice que sobra (2026-10-14). |
| Venta de una sola vez | Si todo lo vendido de un producto cae en 1 o 2 semanas seguidas, en un archivo de 26 semanas o más, y en las últimas 4 semanas no se vendió, es una venta puntual (un proyecto, un cliente de una vez). No se pronostica, no tiene riesgo ni mínimo y máximo, y el sugerido es 0, con la explicación y la fecha de esa venta. Si se pronosticara como venta de todas las semanas, se sugeriría repetir el proyecto entero: con los archivos reales de un probador salía pedir 216 paneles (unos $250 M) por una venta de 390 en dos semanas de junio (2026-10-14). |
| Para cuánto dura una cantidad | (existencias + cantidad) ÷ venta esperada por semana, con la venta esperada = media de X con h = entrega + cada cuánto pide, dividida por esas semanas (lleva la temporada). Es al ritmo normal: en productos que se venden de golpe dura más que las semanas que cubre el pedido, porque el sugerido trae margen. Se muestra en el paso 4 para el sugerido, para lo que va a pedir y para lo que iba a pedir. |
| Paquete | Si en 12 semanas o más todas las ventas del producto son múltiplos de un mismo número (cajas de 10, bultos de 4), ese es el paquete, y la cantidad sugerida y el máximo se redondean hacia arriba a paquetes completos. Una sola semana que no sea múltiplo, o ventas con decimales (mensuales repartidas), y no hay paquete. |
| Mínimo y máximo | Mínimo = ⌈cuantil 90 % de X con h = entrega⌉ (lo que se vende mientras llega un pedido); máximo = ⌈cuantil 90 % de X con h = entrega + cada cuánto pide⌉. Así, sugerido = máx(0, máximo − existencias). Se descargan en Excel para cargarlos en el programa contable, que casi siempre tiene esos dos campos. |
| Dinero quieto | Lo que hay por encima de 12 semanas de venta (o del umbral propio del producto, §11.1), o todo si no se vendió, a costo. Solo si el archivo trae el costo. |
| Total del catálogo | La suma de las medias; el rango suma las varianzas, pero nunca es más angosto que lo que varió el total en el último semestre (las ventas de un catálogo no suben y bajan cada una por su lado). |

Costo y proveedor se leen del archivo si vienen (columnas opcionales en `formatos.js`); el tiempo de entrega de cada proveedor y cada cuánto pide los escribe el usuario en "Datos" (`usuarios.inventario`). Como casi ningún export trae el proveedor, el usuario también puede decirlo: producto por producto desde la ficha, o por el comienzo del código ("TOR-" → Tornillería Central) en Datos. Manda lo asignado a mano, después el archivo y después el comienzo de código más largo que coincida.

### 7.5 Qué tan bien acierta, medido con los datos del usuario

Se esconden las últimas 8 semanas del archivo, se pronostican con lo anterior (con las mismas reglas: lo reciente doble, productos nuevos desde su primera venta) y se cuenta en cuántos productos lo vendido de verdad cayó dentro del rango del 10 % al 90 %. Se mide sin temporada, para no usar información de las semanas escondidas. Si el modelo está bien calibrado, debería acertar en unos 8 de cada 10; en los datos de ejemplo da entre 6 y 9 de cada 10.

### 7.6 La prueba con los probadores

Al comienzo, durante los 14 días de prueba de cada probador, la app mostraba solo lo que declara el plan de prueba del Entregable 2: semanas de inventario, "se agota" y "sobra". **Desde el 2026-10-14** (decisión del equipo) ven todo desde el primer día, también la cantidad sugerida en la lista final del paso 4, y la prueba mide cuántas líneas cambian con el reporte y el sugerido al lado (`permisos` en `server/inventario-rutas.js` devuelve siempre `alcance: 'completo'`). Desde el 2026-10-29 (D9 y D10) tampoco hace falta guardar una lista inicial para ver el inventario. Ver `docs/ENTREGABLE_Y_APP.md`, filas 3 y 9 de "Cambios".

### 7.7 La cantidad sugerida completa (Alpha 0.2)

§7.4 es el núcleo. Alpha 0.2 le agregó lo que pidieron las pruebas, en este orden:

```
entrega (semanas)  = días hábiles del proveedor ÷ 5                        (§9.2; si no hay días, las semanas guardadas)
necesidad          = cuantil 90 % de X con h = entrega + cada cuánto pide   (§7.2; sin las ventas de proyecto, §9.3)
falta              = ⌈necesidad − existencias − en camino⌉                  (posición de inventario, §10.1)
paquete            = múltiplo del catálogo, o el que se deduce de las ventas (§9.1, §7.4)
sugerido           = 0                                si falta ≤ 0, el producto sobra (12 semanas o su umbral, §11.1) o fue venta única
                   = máx(⌈falta ÷ paquete⌉, ⌈mínimo ÷ paquete⌉) · paquete    en otro caso (§9.1)
```

- "Pedir ya" usa (existencias + en camino) ÷ ventas por semana; "se agota" y el riesgo siguen con las existencias de hoy (§10.1).
- Las ventas de proyecto (por tipo de documento, por columna de canal o por la casilla de Movimientos) bajan existencias pero no entran en el promedio ni en la serie del pronóstico (§9.3).
- `detalleSugerido` guarda cada paso (falta, en camino, paquete y de dónde salió, mínimo) y "Cómo se calcula" lo explica con los números del producto (§9.6).

## 8. Alpha 0.2: inventario desde movimientos y unidades al mostrar (2026-10-28)

### 8.1 Inventario desde movimientos

Además del archivo del programa contable, la empresa puede registrar cada día entradas, ventas, devoluciones de clientes, otras salidas (daño, consumo, traslado) y conteos físicos (`server/saldos.js`, `server/movimientos.js`). No cambia el modelo: los movimientos producen un export más, con la misma forma, y se calcula con `calcularRotacion` igual que un archivo.

- **Ventas:** las del último archivo (rearmadas desde sus ventas por semana guardadas, una por semana en su primer día; si el archivo traía solo el total de un periodo, el total se reparte por igual entre sus semanas) más las ventas registradas después de la fecha del archivo, menos las devoluciones (igual que NC en la pregunta de documentos, §3.5).
- **Existencias:** las del archivo más entradas y devoluciones, menos ventas y otras salidas. Un conteo fija la cantidad de ese día. Lo registrado el día del archivo o antes no se suma (ya está en el archivo) y se avisa.
- **Periodo:** termina el día del último movimiento aunque ese día no se haya vendido nada (`hastaDia` en `calcularRotacion` y `seriesSemanales`): las existencias son las de ese día.
- **Sin archivo:** el inventario sale solo de los movimientos, con el aviso de historial corto (menos de 26 semanas) que ya trae el modelo.
- El reporte de un pedido sigue fijo: si un pedido usa un inventario calculado con movimientos, el siguiente cálculo crea otro.

### 8.2 Unidades al mostrar

El modelo sigue en semanas: S, los umbrales (2 y 12 semanas), el tiempo de entrega y cada cuánto pide. Cada persona elige si lo ve en días (S × 7), semanas o meses (S × 7 ÷ 30,44). Menos de una semana se dice siempre en días. También elige el horizonte de "venderás en…" (de media semana a 26 semanas; 4 si no elige): es la predictiva de §7.2 con h igual al horizonte, no la suma de los rangos de cada semana. Los reportes guardados no cambian.

Desde el SP4 (2026-10-29), "cada cuánto pide" y el umbral de "se agota" se escriben en esa unidad y se guardan en semanas (cada cuánto pide con 3 decimales; el umbral sigue en semanas enteras, porque `pedidos.semanas_agota` es entero).

## 9. Catálogo y motor de reabastecimiento (SP4, 2026-10-29)

Código: `server/inventario.js`, `server/lector.js`, `server/rotacion.js`, `server/series.js`, `server/saldos.js` y `server/movimientos.js`. Pruebas: `test/catalogo-motor.test.js`. Pedidos de la retroalimentación de las pruebas (Hito 2 de `docs/Retroalimentación Pruebas.md`).

### 9.1 Múltiplo de empaque y mínimo de pedido

Cada producto del catálogo de la empresa (`productos.multiplo`, `productos.minimo_pedido`) puede tener un múltiplo (se pide en cajas de 80) y un mínimo de pedido. Se escriben en la ficha o se pegan desde Excel (`POST /api/catalogo/lote`).

- Con múltiplo, el paquete de §7.4 es ese número y no el que se deduce de las ventas. La cantidad sugerida y el máximo se redondean hacia arriba a cajas completas. El múltiplo puede ser decimal (bultos de 2,5 kg).
- Con mínimo, un sugerido que queda entre 0 y el mínimo sube al mínimo (redondeado a la caja). Un sugerido de 0 sigue en 0: el mínimo no obliga a pedir lo que no hace falta.
- El desglose (`detalleSugerido`) guarda lo que faltaba antes de redondear, el paquete, de dónde salió (catálogo o ventas) y si subió al mínimo, para explicarlo.

### 9.2 Tiempo de entrega en días hábiles

El tiempo de cada proveedor se escribe en días hábiles (`ajustes.entregasDias`, y `entregaPorDefectoDias` para los demás). El modelo lo usa en semanas: días ÷ 5. Si un proveedor no tiene días escritos, se usan las semanas guardadas antes (`ajustes.entregas`), así que los ajustes de antes siguen sirviendo. Si una pantalla todavía manda semanas (el paso 4 de "Comparar con mi propia lista"), lo que cambie se convierte a días.

### 9.3 Ventas de proyecto (D12)

Una venta para un proyecto, una obra o un cliente puntual baja existencias pero no cuenta en el promedio de venta, porque no se repite. Se marca de tres formas:

- **Tipo de documento:** en la pregunta de documentos (§3.5) cada tipo puede ser venta, devolución, **de proyecto** o nada.
- **Columna de canal:** si el archivo trae una columna de centro de costo, OT, proyecto, cotización o cliente con entre 2 y 50 valores distintos, la app pregunta cuáles son de proyecto (puede no ser ninguno). La respuesta se guarda en `exports.canales` y se recuerda por formato (`usuarios.mapeos.canales`). Con más de 50 valores (cada cliente de un almacén) no se pregunta.
- **Movimientos:** la casilla "Es para un proyecto" en una venta (`movimientos.proyecto`).

En el cálculo, esas ventas cuentan para el periodo del archivo, pero no para Qᵢ ni para lo reciente: van aparte en `vendidoProyecto` (con la señal `proyecto`). Las ventas por semana (`exports.series`) las guardan aparte (`series.proyecto`), así que no se pronostican, pero el gráfico del catálogo las muestra como proyectos. Es distinto del recorte de un mes pico (§3.6), que sigue funcionando para lo que no se marcó. Los reportes ya guardados no se recalculan.

### 9.4 Clasificación de cada producto

| Clase | Regla |
|---|---|
| Venta única | La venta de una sola vez de §7.4. |
| De proyecto | Más de la mitad de lo vendido (contando proyectos) fue para proyectos. |
| Frecuente | Vendió en la mitad o más de sus semanas (Tᵢ, las que cuentan para el producto). |
| Esporádico | Vendió en menos de la mitad de sus semanas. |

Sin ventas por semana (un informe con el total del periodo) o sin ventas, no se clasifica. Aparte, **venta alta** marca el 20 % de los productos que más venden por semana. Se usan como etiqueta y filtro en Productos y en Preparar pedido; no cambian el sugerido.

### 9.5 Pedido reciente

Cada producto trae lo pedido en los últimos 14 días por cualquier persona de la empresa (pedidos cerrados, sin borrados ni anulados): fecha, cantidad, número del pedido y quién lo preparó. Se muestra como "Pedido hace 5 días" en Productos, el panel y Preparar pedido. Desde el SP5 lo que va en camino sí cambia el sugerido (§10.1).

### 9.6 Cómo se calcula

La ficha de cada producto, y el paso 3 si el inventario es el mismo archivo del reporte, explican el sugerido en orden con los números del producto: venta por semana con sus ajustes (y lo que no se contó por proyectos), para cuánto alcanza, temporada, lo que se puede vender en las semanas que cubre el pedido (el rango de 8 de cada 10) y el sugerido al 90 % con su redondeo a caja o al mínimo.

## 10. Entradas, salidas y datos al día (SP5, 2026-10-29)

Código: `server/recepcion.js`, `server/saldos.js`, `server/movimientos.js`, `server/rotacion.js` (`revisarCodigos`) y `server/inventario.js`. Pruebas: `test/recepcion-datos.test.js`. Pedidos de la retroalimentación de las pruebas (Hito 1).

### 10.1 En camino y llegada de un pedido

Al cerrar un pedido real, cada línea queda **en camino** (`pedidos.recibido = {}`). "Registrar llegada" (por proveedor, con lo pedido precargado) crea una entrada en Movimientos por cada línea que llegó (`movimientos.pedido_id`) y marca la línea; una línea en 0 "no llegó" y se cierra sin entrada. Una llegada parcial también cierra la línea: lo que falte, si llega, se registra como entrada en Movimientos. Si alguien anula la entrada, la línea vuelve a estar en camino.

- **Sugerido:** con E = existencias y C = lo que sigue en camino de ese producto, lo que falta es ⌈necesidad − E − C⌉ (posición de inventario), y de ahí el redondeo a paquete y al mínimo de §9.1. `detalleSugerido.enCamino` guarda C.
- **"Pedir ya":** usa (E + C) ÷ ventas por semana en vez de S. "Se agota" no cambia: lo que hay hoy no alcanza, aunque venga algo.
- **El riesgo de agotarse** sigue calculado con E solamente (no se sabe si llega a tiempo).
- No cuentan: pedidos anulados, borrados o simulados, los cerrados antes del SP5 (`recibido` NULL) ni los de hace más de 120 días (un importado puede tardar 3 o 4 meses; un pedido que nunca se recibió no frena el sugerido para siempre).

### 10.2 Ventas de un periodo en Movimientos

Una venta con `desde` es el total de un periodo (desde → fecha, como mucho un año). Para el promedio se reparte por partes iguales entre sus días, igual que un archivo con el total de un periodo; las existencias bajan completas el último día. Si el periodo empieza el día del archivo base o antes y termina después, se cuenta la parte proporcional a los días siguientes (de 30 días con 10 ya en el archivo, 20/30 de la cantidad), con aviso. El kardex cuenta lo mismo.

### 10.3 Códigos que no coinciden

Cada reporte trae `codigos`: cuántos códigos vendidos aparecen en las existencias, los que están en un solo lado (hasta 500 de cada uno) y parejas probables (el mismo código sin guiones, puntos, barras, espacios ni ceros a la izquierda, o sin su último pedazo: "TOR-0610-UN" y "TOR0610"). Si hay 5 o más códigos vendidos y menos de la mitad está en las existencias, el aviso va primero y la pantalla de subir lo muestra antes de seguir, con la lista para descargar. No cambia el cálculo: esos productos siguen con 0 existencias.

### 10.4 Datos al día

El panel muestra "Datos de hoy", "de ayer" o "de hace N días" según el último día con datos (`fuente.hasta`), en verde hasta 1 día hábil, en ámbar hasta 3 y en rojo después. Lo sugerido es tan bueno como esos datos (Claudia).

## 11. Alertas del boletín y sobrestock por producto (SP7, 2026-10-29)

Código: `server/alertas.js`, `server/boletin.js`, `server/boletin-correo.js`, `server/recepcion.js` (`atrasadosDe`) y `server/inventario.js` (`conSobraPropia`). Pruebas: `test/boletin.test.js` y `test/alertas.test.js`. Pedido de la retroalimentación de las pruebas (Hito 6).

### 11.1 Sobrestock con umbral por producto

El umbral de "sobra" (§3.4) sigue en 12 semanas, pero cada producto puede tener el suyo (`productos.sobra_semanas`, de 1 a 104). Se aplica sobre la fila del reporte guardado, sin recalcularla: con S semanas de inventario y U el umbral del producto, sobra si S > U y no se agota. Sin ventas y con existencias sobra con cualquier umbral. Con eso cambian el estado en Productos y el panel, el sugerido (0 si sobra, §7) y el dinero quieto (lo que hay por encima de U semanas de venta, a costo). El reporte del flujo de 5 pasos sigue con 12.

### 11.2 Qué trae el boletín

Cada tipo de alerta es una sección del correo, con su frecuencia: a diario, los lunes, el primer día de lunes a viernes del mes o nunca. Los festivos cuentan como hábiles. Si el Cron falla un día, la sección espera a su siguiente turno.

| Tipo | Qué dice | Cuándo tiene algo que decir |
|---|---|---|
| `enCero` | Productos en cero | Se agota y existencias ≤ 0 |
| `pideYa` | Pedir ya, por proveedor | Estado "pide" (§7, con lo que viene en camino) |
| `seAgota` | Se van a agotar | Se agota y existencias > 0 |
| `porAprobar` | Pedidos por aprobar | Pedidos enviados sin aprobar ni devolver (solo a quien aprueba) |
| `porRecibir` | Entregas atrasadas | Un proveedor de un pedido en camino pasó su fecha: día del pedido + lo que tarda ese proveedor, en días hábiles (sus días escritos o sus semanas × 5) |
| `sinDatos` | Datos sin actualizar | Más de 3 días hábiles desde el último movimiento registrado o el último archivo subido (solo a quien administra la empresa y a los operadores) |
| `sobran` | Sobrestock | Estado "sobra" o sin ventas con existencias (§11.1) |
| `dineroQuieto` | Dinero quieto | El archivo trae costos y hay dinero quieto |

Valores por defecto: el analista recibe a diario `pideYa`, `seAgota` y `porAprobar`; los lunes `enCero`, `porRecibir`, `dineroQuieto` y `sinDatos`; `sobran` el primer día hábil del mes. El operador recibe todo a diario menos `dineroQuieto` y `sobran` (nunca). Lo que la persona cambia en Mi cuenta manda sobre su perfil.

Si ese día no toca ninguna sección con algo que decir, no se manda nada. El asunto es la sección más urgente en el orden de la tabla. Cada sección dice qué es nuevo desde la última vez que se revisó (no desde ayer): `boletines.resumen.tipos` guarda, por tipo, la fecha y lo que había.

## Fuentes

- Syntetos, A. A., Boylan, J. E., y Disney, S. M. (2009). *Forecasting for inventory planning: a 50-year review*. Journal of the Operational Research Society, 60(sup1), S149–S160.
- Gelman, A., et al. (2013). *Bayesian Data Analysis*, 3.ª ed., cap. 2 (modelo Gamma-Poisson y su predictiva binomial negativa).

- Uphance, *How to Calculate Weeks of Supply*: https://www.uphance.com/blog/weeks-of-supply/
- Wair, *Weeks of Supply (WOS): Formula, Calculator & Retail Benchmarks*: https://wair.ai/wos-meaning-and-how-to-calculate-it/
- Ask the Ledger, *Inventory Turnover Ratio: Formula + Industry Benchmarks (Distributors)*: https://asktheledger.com/blog/inventory-turnover-calculation-distributors.html
- Xorosoft, *Inventory Turnover Benchmarks by Industry*: https://xorosoft.com/inventory-turnover-benchmarks-by-industry/
- Industrial Supply Magazine, *Four Inventory Turns Per Year Doesn't Cut It Anymore!*: https://industrialsupplymagazine.com/pages/Management---Four-Inventory-Turns-Per-Year-Doesnt-Cut-It-Anymore!.php
- *Intermittent demand forecasting: a guideline for method selection* (Sādhanā, Indian Academy of Sciences): https://www.ias.ac.in/public/Volumes/sadh/045/00/0051.pdf
- OpenForecast, *Intermittent demand classifications: is that what you need?*: https://openforecast.org/2024/07/16/intermittent-demand-classifications-is-that-what-you-need/
- Syntetos, A. A., y Boylan, J. E. (2005). *The accuracy of intermittent demand estimates*. International Journal of Forecasting, 21(2), 303–314.
- Croston, J. D. (1972). *Forecasting and stock control for intermittent demands*. Operational Research Quarterly, 23(3), 289–303.
- Portal de clientes de Siigo Nube, informes de movimiento y saldos de productos: https://siigonube.portaldeclientes.siigo.com/informe-movimiento-de-productos/
