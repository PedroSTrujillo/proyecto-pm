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
T   = semanas del histórico      = (último día − primer día + 1) ÷ 7
Qᵢ  = total vendido de i         = Σ cantidades vendidas de i en el histórico (netas de devoluciones)
d̄ᵢ  = ventas promedio por semana = Qᵢ ÷ T
Iᵢ  = existencias actuales de i  (si hay varias filas, como varias bodegas, se suman)
Sᵢ  = semanas de inventario      = Iᵢ ÷ d̄ᵢ            si Qᵢ > 0
                                 = "sin ventas en el periodo"   si Qᵢ ≤ 0
```

**Clasificación** (solo para resaltar y filtrar; el producto no le dice al usuario cuánto pedir):

| Estado | Condición | En pantalla |
|---|---|---|
| Se agota | Sᵢ < 2 | fila en rojo, va arriba |
| Sobra | Sᵢ > 12, o sin ventas y con existencias | fila en azul |
| Normal | 2 ≤ Sᵢ ≤ 12 | sin resaltar |

**Orden de la tabla:** de menor a mayor Sᵢ. Si dos productos empatan, va primero el que más vende por semana. Los productos sin ventas van al final, ordenados por existencias (primero los que tienen más mercancía quieta).

### Ejemplo resuelto (plantilla descargable)

El producto `TOR-0610` vendió 608 unidades en un histórico de 364 días:

- T = 364 ÷ 7 = **52 semanas**
- d̄ = 608 ÷ 52 = **11,7 unidades por semana**
- I = 18 unidades
- S = 18 ÷ 11,7 = **1,5 semanas**: se agota (menos de 2).

Esto mismo aparece en la pantalla del reporte, con los números del archivo de cada usuario.

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

Todos piden elegir parámetros (α) y no se explican en una frase. Eso choca con dos requisitos del documento: no exigir configuración y que el usuario entienda de dónde sale el número. El costo de usar el promedio simple está aceptado: no reacciona a tendencias ni temporadas, y el ajuste por temporada está fuera del alcance de esta versión (sección 6 del documento).

### 3.3 Un mismo T para todos los productos

Las semanas se cuentan entre la primera y la última fecha de **todo el archivo**, no de cada producto. Si se contaran desde la primera venta de cada producto, uno que se vendió una sola vez hace dos semanas tendría un promedio inflado y parecería de alta rotación. La desventaja es que un producto que entró al catálogo hace poco queda con un promedio más bajo del real. Es una limitación conocida; se ve en la tabla y el usuario decide.

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

## 5. Lo que queda para después (no construido)

El modelo deja la base para las funciones de la sección 6 del documento. No se construyen ahora; esto solo deja escrito cómo se extendería el cálculo:

| Función futura | Extensión del modelo |
|---|---|
| Ajuste por temporada | Índice estacional del mes m: ventas del mes m ÷ promedio mensual. Demanda ajustada = d̄ᵢ × índice del mes. |
| Tiempo de entrega del proveedor | Punto de reorden: ROP = d̄ᵢ·L + z·σᵢ·√L, donde L es el tiempo de entrega en semanas, σᵢ la desviación de las ventas semanales y z el nivel de servicio. |
| Sugerencia de cuánto pedir | Pedido = máx(0, d̄ᵢ·(L + R) + stock de seguridad − Iᵢ), donde R son las semanas entre pedidos; o el lote económico EOQ = √(2DS/H). |
| Demanda intermitente | Croston con la corrección SBA para los productos con ADI > 1,32. |

## Fuentes

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
