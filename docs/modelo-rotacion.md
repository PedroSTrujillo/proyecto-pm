# Modelo de rotación de inventario · Alpha 0.1

Este documento explica el modelo matemático que usa el producto, por qué se eligió y cómo se mide la hipótesis. El código está en [`server/rotacion.js`](../server/rotacion.js) (cálculo), [`server/listas.js`](../server/listas.js) (comparación de listas) y [`server/equipo.js`](../server/equipo.js) (resultados de la prueba).

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

La excepción es el producto que de verdad es nuevo: con un T común quedaba con un promedio más bajo del real y parecía que sobraba. Desde el 2026-10-11 (ajuste 3 de §3.6), un producto cuenta como nuevo solo si su primera venta llega **más de 13 semanas después del inicio del archivo y más de 3 veces lo que suele tardar entre una venta y otra**. A ese se le cuentan las semanas desde su primera venta, con un mínimo de 13. El mínimo acota el error de la venta única: con 52 semanas de histórico, el promedio de un producto nuevo puede quedar como mucho 4 veces por encima del que daría el T común, y no 26 veces.

Si el export viene **agrupado por mes** (una fecha por mes, o una columna por mes), el último mes se cuenta completo hasta su último día, para no recortar el periodo.

### 3.4 El umbral de "sobra": 12 semanas

El documento fija el umbral de "se agota" (menos de 2 semanas), pero no dice cuántas semanas son "muchas". Se tomaron **12 semanas (unos 3 meses)**, a partir de referencias para distribuidores:

- Los distribuidores de ferretería, herramientas y suministro industrial rotan entre 4 y 8 veces al año, lo que equivale a mantener entre 45 y 90 días de inventario (unas 6,5 a 13 semanas).
- El comercio mayorista en general rota entre 5 y 10 veces al año.

Un producto con más de 12 semanas de inventario rota menos de 52 ÷ 12 ≈ 4,3 veces al año, por debajo de lo normal incluso para los distribuidores que rotan más lento. Es una constante en el código (`SEMANAS_SOBRA`), no algo que el usuario tenga que configurar. Si el equipo quiere cambiarla después de la prueba, se cambia en una línea.

### 3.5 Casos borde

| Caso | Qué hace el modelo |
|---|---|
| Producto sin ventas en el histórico | No divide por cero. Muestra "sin ventas en el periodo"; si tiene existencias, cuenta como "sobra". |
| Con ventas y sin existencias | Sᵢ = 0. Aparece de primero. |
| Con existencias y no aparece en las ventas | Se incluye como "sin ventas en el periodo" y se señala "No aparece en las ventas". |
| Con ventas y no aparece en las existencias | Se incluye con existencias 0 (Sᵢ = 0) y se señala "No aparece en las existencias (se tomó 0)". La mayoría de los programas no listan los productos en cero. |
| Existencias negativas | Se cuentan como 0 semanas y se señalan. |
| Devoluciones (cantidades negativas) | Se restan. Si el neto queda ≤ 0, el producto pasa a "sin ventas". |
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
- El segundo criterio de pivote (cambiaron por probar la herramienta) es cualitativo. La pantalla del equipo muestra la respuesta a "¿por qué cambió?" al lado de cada pedido para que el equipo lo juzgue.
- Cada pedido queda marcado como **real** o **simulado**, y el resumen dice cuántos de los que cumplen lo hicieron con un pedido real.

### 4.3 Coherencia con el reporte y magnitud del cambio (apoyo, no cambian el veredicto)

M cuenta líneas, pero no dice si el cambio lo produjo el dato. Para el segundo criterio de pivote (vacío #12) y para el ruido de M (vacío #11), la vista del equipo muestra dos números más por pedido. Los dos se calculan solos al guardar la lista final (`coherenciaConReporte` y `compararListas` en `server/listas.js`):

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

El resumen dice cuántos de los que cumplen movieron **la mayoría** (≥ 50 %) de sus líneas en la dirección del reporte (`COHERENCIA_MAYORIA` en `server/equipo.js`). Es una ayuda para leer los "¿por qué?", no un criterio nuevo: el veredicto sigue siendo el de §4.2. Al usuario no se le muestra, para no sugerirle qué responder en el paso 5. Los pedidos guardados antes del 2026-10-11 se completan solos la primera vez que se abre la vista del equipo, con las listas y el reporte que ya están en la base.

## 5. Recordatorio antes de que se agote (stickiness)

La corrección del Entregable 2 (2026-10-07, fila de Stickiness en "Cambios") cambió el mecanismo que trae de vuelta al usuario: *"se le pregunta al usuario si quisiera recibir un recordatorio vía correo electrónico 3 días antes de cuando la aplicación estima que productos con buen nivel actual de inventario (más de 4 semanas) van a llegar al umbral de reabastecimiento (2 semanas)"*. Está en `server/recordatorios.js`.

```
t₀                     = día en que se subió el export (las existencias son de ese día), en hora de Colombia
fecha umbral(i)        = t₀ + ⌊7 · (Sᵢ − 2)⌋ días     para los productos con Sᵢ > 4
fecha recordatorio(i)  = fecha umbral(i) − 3 días
```

- **Sin tareas programadas.** Un envío programado necesita un servidor siempre despierto o un cron externo, y en el plan gratis de Render el servidor se duerme. Por eso el recordatorio es un **archivo de calendario (.ics)**: el usuario lo descarga al decir que sí, lo abre, y es su Google Calendar, Outlook o celular el que avisa en la fecha, a las 8 a. m. Si se configura el correo (`BREVO_API_KEY`), la misma invitación le llega también al correo en ese momento; es un envío inmediato, no programado.
- Supone que se sigue vendiendo al ritmo d̄ᵢ del reporte, así que cada recordatorio pide subir un export nuevo para confirmar. Redondea hacia abajo: es mejor avisar un día antes que un día tarde.
- Solo se programan los productos que llegan a 2 semanas dentro de los próximos 3 meses (`SEMANAS_HORIZONTE`). Más allá, la estimación ya no vale y lo correcto es subir otro export.
- Un recordatorio junta los productos de los 7 días siguientes al primero, así que llega como máximo uno por semana.
- La vista del equipo mide el stickiness: quién lo pidió, quién descargó el calendario, a quién ya le llegó la fecha de su primer recordatorio y quién volvió a entrar desde ese día. El recordatorio vive en el calendario del usuario, así que no se sabe si lo abrió; volver a entrar desde esa fecha es la señal.

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
| Riesgo de agotarse | P(X > existencias) con h = máx(tiempo de entrega, 2 semanas): la probabilidad de quedarse sin él antes de reponerlo. |
| "Pide ya" | No se agota en 2 semanas, pero Sᵢ < tiempo de entrega + 1. Si el usuario no ha dicho cuánto tarda su proveedor, se supone 1 semana y no hay "pide ya". |
| Cantidad sugerida | máx(0, ⌈cuantil 90 % de X con h = entrega + cada cuánto pide⌉ − existencias). Alcanza para la entrega y hasta el siguiente pedido en 9 de cada 10 casos. "Cada cuánto pide" es 4 semanas si el usuario no lo cambia. |
| Mínimo y máximo | Mínimo = ⌈cuantil 90 % de X con h = entrega⌉ (lo que se vende mientras llega un pedido); máximo = ⌈cuantil 90 % de X con h = entrega + cada cuánto pide⌉. Así, sugerido = máx(0, máximo − existencias). Se descargan en Excel para cargarlos en el programa contable, que casi siempre tiene esos dos campos. |
| Dinero quieto | Lo que hay por encima de 12 semanas de venta (o todo, si no se vendió), a costo. Solo si el archivo trae el costo. |
| Total del catálogo | La suma de las medias; el rango suma las varianzas, pero nunca es más angosto que lo que varió el total en el último semestre (las ventas de un catálogo no suben y bajan cada una por su lado). |

Costo y proveedor se leen del archivo si vienen (columnas opcionales en `formatos.js`); el tiempo de entrega de cada proveedor y cada cuánto pide los escribe el usuario en "Datos" (`usuarios.inventario`). Como casi ningún export trae el proveedor, el usuario también puede decirlo: producto por producto desde la ficha, o por el comienzo del código ("TOR-" → Tornillería Central) en Datos. Manda lo asignado a mano, después el archivo y después el comienzo de código más largo que coincida.

### 7.5 Qué tan bien acierta, medido con los datos del usuario

Se esconden las últimas 8 semanas del archivo, se pronostican con lo anterior (con las mismas reglas: lo reciente doble, productos nuevos desde su primera venta) y se cuenta en cuántos productos lo vendido de verdad cayó dentro del rango del 10 % al 90 %. Se mide sin temporada, para no usar información de las semanas escondidas. Si el modelo está bien calibrado, debería acertar en unos 8 de cada 10; en los datos de ejemplo da entre 6 y 9 de cada 10.

### 7.6 La prueba con los probadores

Durante los 14 días de prueba de cada probador (desde su primera lista inicial), la cantidad sugerida no se muestra: si la vieran, M ya no mediría el efecto del reporte de semanas, que es lo que dice la hipótesis. El panel, el gráfico y el riesgo sí se ven, pero solo después de guardar la primera lista inicial (`server/inventario-rutas.js`). Este cambio de alcance va con su fila en "4 · Cambios y Reflexión" del Entregable.

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
