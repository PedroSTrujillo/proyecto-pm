# Declaración de uso de IA · Alpha 0.2 (SP1 a SP8)

Para la entrega que incluya Alpha 0.2. Cubre el trabajo del 2026-10-28 y el 2026-10-29 en la rama `empresas-inventario-diario` (`docs/PLAN_ALPHA_02.md` y `docs/PLAN_EMPRESAS_INVENTARIO.md`). El detalle de cada sesión, con lo que no se hizo o no se verificó, está en `docs/HANDOFF.md` (entradas 34 a 45). Las entregas anteriores ya declararon el trabajo de antes.

## Herramientas

- **Claude Code** (Anthropic, modelos Claude Opus), en la terminal y en VS Code, con acceso al repositorio. Escribió el código, las pruebas y los documentos, y revisó la app en un navegador automatizado (Playwright) en escritorio y celular.
- **Skills de Emil Kowalski** (`.claude/skills`) como criterio de movimiento e interfaz.
- La app no usa IA generativa para el usuario: el modelo de inventario es estadístico y está escrito a mano (`docs/modelo-rotacion.md`).

## Qué decidió el equipo y qué hizo la IA

Las decisiones de producto las tomó el equipo: el backlog salió de las pruebas con usuarios y de la reunión del 27 oct. (`docs/Retroalimentación Pruebas.md`), y las decisiones D1 a D16 se acordaron con Santiago el 2026-10-28 y el 2026-10-29. Claude propuso el orden en sub-planes, el diseño técnico de cada uno y las alternativas cuando el plan no alcanzaba, e implementó lo acordado.

| Sub-plan | Lo que construyó Claude |
|---|---|
| Plan | Cruzó la retroalimentación con lo que ya existía y escribió `PLAN_ALPHA_02.md` (9 sub-planes, decisiones D9 a D16 tomadas con Santiago) |
| SP1 · Experiencia y tono | Pasó a "usted" las cerca de 650 apariciones de "tú" en la app, los errores, los correos, el PDF y el Excel; una regla automática que detecta el tuteo (`npm run texto`); la escala de letra, el componente `Desplegable` y el orden de las acciones; corrigió lo que se salía de la pantalla en celular |
| SP2 · Pedido desde lo sugerido | El modo de pedido `'sugerido'` en el servidor, la pantalla "Preparar pedido" (grupos por proveedor, selección, filtros, notas, autoguardado) y el PDF y Excel del pedido guardado |
| SP3 · Medición del piloto | La métrica de aceptación, la evaluación por usuario y el veredicto, "sugerido contra decidido contra ocurrido", la encuesta dentro de la app y la salida `npm run resultados -- --piloto` |
| SP4 · Catálogo y motor | Familia, múltiplo y mínimo de pedido; tiempo de entrega en días hábiles; ventas de proyecto fuera del promedio (por documento, por columna y por movimiento); clasificación de productos; "pedido hace N días"; "Cómo se calcula" |
| SP5 · Entradas y salidas | Lo pedido que cuenta en camino en el sugerido hasta que entra (sin registrar la llegada, T5); ventas de un periodo; pegar e importar movimientos; aviso de códigos que no coinciden; "datos de hace N días" |
| SP6 · Aprobación | Enviar, aprobar y devolver pedidos; historial de cambios; logo, cargo y firmas en el PDF y el Excel |
| SP7 · Alertas | Ocho tipos de aviso con frecuencia por persona y valores por perfil; el boletín por secciones; entregas atrasadas; sobrestock por producto |
| SP8 · Cierre | Actualizó `CLAUDE.md`, `README.md`, `modelo-rotacion.md` (§4.4 y §7.7), `ENTREGABLE_Y_APP.md` (hipótesis del piloto, filas 9 a 14 y resumen) y el backlog; escribió esta declaración |

Cada sub-plan terminó con las pruebas automáticas en verde (de 136 a 194 pruebas), la revisión de tipos de TypeScript, la regla de tuteo y una recorrida por las pantallas en el navegador.

## Dónde ayudó

- **Volumen y consistencia:** cambiar el tono de toda la app, o una regla que toca el servidor, la web, el PDF y el correo, en una sesión y sin dejar pantallas a medias. La regla de tuteo deja revisarlo solo en adelante.
- **Reglas en el servidor:** lo que la métrica necesita (que la aceptación no se muestre, que una aprobación no cuente como decisión de quien prepara, que el inventario se filtre por empresa) quedó en el servidor con pruebas, no solo en la pantalla.
- **Documentación al día:** cada cambio de modelo o de flujo quedó en `modelo-rotacion.md`, en la fila de "Cambios" y en la bitácora, que es lo que pide la rúbrica para que no haya desconexión.

## Dónde falló o hay que revisarlo

- **Cosas que no se vieron en el navegador**, solo con pruebas o con el compilador: la pregunta de canal y la opción "De proyecto" (SP4), el formulario de columnas al importar movimientos (SP5), un logo JPG o muy ancho (SP6) y "Comparar con mi propia lista" de punta a punta después del SP2.
- **El correo del boletín** se revisó como imagen del HTML; no se probó en Gmail ni Outlook, ni un lunes real con Brevo.
- **Errores propios corregidos en la misma sesión:** abrir "Preparar pedido" creaba dos borradores en desarrollo; varias tablas se salían de la pantalla en celular.
- **Apartarse del plan sin pedirlo:** en el SP1 cambió el texto de `pedido-sugerido.tsx`, que el plan decía no tocar (quedó anotado en la bitácora).
- **Simplificaciones que el equipo debe aceptar o cambiar:** lo pedido deja de contar por tiempo o al registrar su entrada (no se mira el archivo nuevo); el uso y las alertas no descuentan festivos; "sugerido contra ocurrido" cuenta semanas de forma aproximada; el pegado del catálogo es un cuadro de texto y no la hoja tipo Excel.
- **Nada de lo anterior se ha probado con usuarios reales.** Las pruebas usan datos inventados con la forma de los archivos reales. Lo que dice el piloto lo van a decir los usuarios.
