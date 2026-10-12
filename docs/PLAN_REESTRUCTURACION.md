# Plan de reestructuración de SINESC

Acordado el 2026-10-11. Es el plan de trabajo de las próximas sesiones; el estado de cada fase va en `docs/HANDOFF.md`.

## Por qué

Vista como cliente, la app de hoy se siente como una encuesta y no como un producto:

- **El valor llega tarde.** Antes de ver algo hay que escribir el pedido (es el instrumento de la prueba, no algo que el cliente quiera hacer).
- **El reporte es una tabla larga.** Sin resumen del inventario, sin gráficos, sin ficha de producto, sin dinero quieto, sin prioridades.
- **No dice qué hacer.** Muestra semanas, no qué pedir ni cuánto ni a quién.
- **No recuerda el inventario.** Cada pedido vuelve a pedir el archivo; el inicio es una lista de pedidos vacía.
- **El cliente se va sin nada.** No hay pedido para exportar ni para mandarle al proveedor.

## Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Alcance | Producto completo: panel, pronóstico, ficha de producto y pedido sugerido. **La cantidad sugerida queda detrás de un interruptor**: apagada para las cuentas de probadores durante sus 14 días; encendida en la demo y después de la prueba. | El Entregable 3 califica el plan de prueba declarado (reporte de semanas, lista antes y después, métrica M). Si los probadores ven cantidades sugeridas, M ya no mide el efecto del reporte. Con el interruptor la medición queda limpia y el producto luce completo. Va con su fila en "4 · Cambios y Reflexión". |
| Prueba con los 5 probadores | No ha empezado: se reestructura antes. | |
| Tecnología | Una sola app en **Next.js** junto con la landing (lo que declaró el plan de prueba; cierra el vacío #1 de `CLAUDE.md`). Base de datos: la misma de Neon. | Gráficos, transiciones y componentes ricos cuestan mucho menos que en JS sin framework. |
| IA generativa | **Ninguna por ahora.** | Sin costo de API y sin datos comerciales saliendo a un tercero. "Última generación" va por el modelo de pronóstico, no por un chat. |
| Diseño | Primero un prototipo en **Stitch**, aprobado en grupo, y luego código con las skills de Emil Kowalski (`.claude/skills`). Paleta de la misma familia (verde azulado), mejorada. | Decidir el diseño antes de programar evita rehacer pantallas. |

## Estructura nueva

1. **Panel "Tu inventario hoy"**: qué se agota esta semana, dinero quieto (si el archivo trae costos), cobertura promedio, tendencia de ventas y tarjetas de "atender hoy". Botón para actualizar los datos.
2. **Productos**: tabla con búsqueda, filtros y mini-gráfico de ventas. **Ficha de producto**: historial de ventas, pronóstico con su rango, probabilidad de agotarse y la cuenta explicada.
3. **Preparar pedido** (el flujo de la prueba, más corto): qué ibas a pedir → el reporte → tu lista final → por qué cambió. Con el interruptor encendido muestra además la cantidad sugerida por proveedor, editable y exportable a Excel o como texto para WhatsApp.
4. **Datos**: subir o actualizar archivos (guía por programa, plantilla para Excel), historial de cargas. El inventario queda guardado: no se sube de nuevo en cada pedido.
5. **Recordatorios** y **Mi cuenta**, como hoy.
6. **Demo**: `/demo`, con negocios de ejemplo, para ver la aplicación sin crear cuenta ni subir nada.

## Pronóstico

- **Modelo Gamma-Poisson (bayesiano)** por producto: mezcla el ritmo de venta del producto con el del catálogo según cuántas ventas tiene. Funciona bien con productos de venta esporádica y da probabilidades: "70 % de agotarse en 2 semanas".
- **Temporada** cuando el archivo trae 18 meses o más.
- **Tiempo de entrega por proveedor** (lo escribe el usuario una vez) para el punto de reorden y la cantidad sugerida.
- **Acierto medido con los datos del usuario**: se esconden las últimas semanas, se pronostican y se compara. "En tu historial, acertó 8 de cada 10 veces".
- Lo actual (los tres ajustes de §3.6 del modelo) sigue siendo el número que ven los probadores; el modelo nuevo se documenta en `docs/modelo-rotacion.md` antes de usarse.

## Estado (2026-10-11, noche)

- **Fase 0 hecha:** Stitch no generó pantallas (se agotaba el tiempo), así que el prototipo se hizo en un lienzo de diseño de Claude (4 pantallas navegables) y se aprobó. La app final mejora ese prototipo.
- **Fases 1 a 6 hechas en una primera versión:** Next.js junto con la API en un solo servidor; inventario guardado con proveedores, tiempos de entrega y costos; panel, productos con ficha y gráficos; los 5 pasos de la prueba con el diseño nuevo y el interruptor (la cantidad sugerida se apaga sola durante los 14 días de cada probador); pronóstico Gamma-Poisson con temporada y acierto medido (§7 del modelo); demo con cinco negocios de ejemplo y enlaces desde la página.
- **Segunda pasada (entrada 8 de HANDOFF):** proveedores asignables por producto o por comienzo de código, mínimos y máximos (ficha y Excel), cobertura y recordatorio en el panel, sección del panel en la página principal y navegación con teclado.
- **Tercera pasada, contra el Entregable 2 corregido (entrada 9 de HANDOFF, `docs/ENTREGABLE_Y_APP.md`):** el interruptor quedó más estricto: durante sus 14 días el probador ve solo el reporte de semanas que declara el plan de prueba (nada de pronóstico, tiempo de entrega ni sugerido); foto de la lista inicial como respaldo; el equipo clasifica el "¿por qué?" y eso entra al pivote; la vista del equipo mide el costo de equivocarse y cada cuánto piden.
- **Pendiente:** el equipo prueba todo con sus cuentas en Render; la fila de "Cambios" en el Entregable; subir la rama.

## Fases

| # | Fase | Qué sale | Toca la prueba |
|---|---|---|---|
| 0 | Prototipo en Stitch | Paleta, tipografía y 4 pantallas: panel, productos con ficha, preparar pedido, datos | No |
| 1 | Base Next.js | App y landing en un solo proyecto; cuentas, sesión y base de datos de hoy; lector y modelo reutilizados como módulos | Sí: hay que repetir las pruebas de punta a punta |
| 2 | Datos persistentes | Inventario guardado por usuario, proveedores y tiempos de entrega, costos | No |
| 3 | Panel, productos y ficha | Las pantallas nuevas con gráficos | No |
| 4 | Preparar pedido | El flujo de la prueba dentro del diseño nuevo, con el interruptor | Sí: M debe calcularse igual (pruebas actuales) |
| 5 | Pronóstico | Gamma-Poisson, temporada, acierto medido | No (con el interruptor apagado) |
| 6 | Demo y landing | Datos de ejemplo, landing alineada, pulido de interacción | No |

Cada fase termina con `npm test`, revisión en el navegador (390 px y escritorio) y su entrada en `docs/HANDOFF.md`.

## Riesgos

- **Reescribir en Next.js** es el cambio más grande: se rehace el frontend completo. Se mitiga reutilizando `lector.js`, `rotacion.js`, `listas.js` y `recordatorios.js` tal cual, con sus pruebas.
- **Hospedaje**: la app sigue en Render con Neon. Si la landing pasa a Render se duerme como la app; se decide en la fase 1 (alternativa: la misma app en Vercel, subiendo los archivos ya leídos en el navegador para no chocar con el límite de 4,5 MB por petición).
- **Desconexión con el Entregable**: cada cambio de alcance necesita su fila en "Cambios" con la evidencia (entrevistas que piden saber cuánto pedir y el pedido del profesor de mejorar el producto).
