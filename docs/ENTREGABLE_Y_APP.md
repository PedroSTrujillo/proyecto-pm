# El Entregable 2 corregido y lo que hace la app

Revisión del 2026-10-11 contra `(Corrección) Entregable 2 - Grupo 1.xlsx` (el Excel no se edita: esto dice qué de lo declarado hace la app, dónde, y en qué se aparta). Lo que se aparta necesita su fila en "4 · Cambios y Reflexión" para que la rúbrica no lo cuente como desconexión.

## Pestaña 2 · Hipótesis MVP

| Lo que declara el Entregable | En la app | Dónde |
|---|---|---|
| Solución: reporte de rotación por producto, calculado desde el export, que muestra cuántas semanas de inventario quedan | Paso 3 de cada pedido y, después de la primera lista inicial, el panel y Productos | `server/rotacion.js`, `components/app/reporte.tsx` |
| Usuario: gerentes y administradores de inventario que pronostican la rotación y coordinan el reabastecimiento | Textos de la app y de la página | |
| Métrica: líneas que agrega, quita o ajusta después de ver el reporte | Se calcula en el servidor al guardar la lista final, por código | `server/listas.js` (`compararListas`), `pedidos.comparacion` |
| Resultado: 3 de 5 cambian 5 o más líneas en 14 días | Veredicto automático en "Resultados de la prueba" | `server/equipo.js` (`META_*`, `DIAS_PRUEBA`) |
| "No dice cuánto pedir, no se conecta con el proveedor, no proyecta por temporada" y "lo que dejamos por fuera es el ajuste por temporada y el tiempo de entrega" | **Durante los 14 días de cada probador la app muestra solo eso:** semanas de inventario, "se agota" y "sobra". Sin pronóstico, sin temporada, sin tiempo de entrega ("pide ya", riesgo), sin cantidad sugerida ni mínimos | `permisos` y `alcance: 'prueba'` en `server/inventario-rutas.js` e `inventario.js`; aviso en el panel |
| Sin conexión al software contable; el archivo se sube a mano con una plantilla de ejemplo | Igual. Además lee casi cualquier formato y pregunta lo que falta | `server/lector.js`, `/plantillas/*.xlsx` |
| Se prueba con 5 usuarios; los simulados se anotan aparte | Cada pedido se marca real o simulado y la vista del equipo lo separa | Paso 1, `equipo.js` |
| Plan: aplicación web en Next.js con Postgres y autenticación, con acceso público | Next.js (interfaz) + Express (API) en un solo servidor, PostgreSQL (Neon), cuentas con contraseña | `server/index.js`, `inventory-forecasting-landing-page/` |
| Pantalla del reporte: sube CSV o Excel con 1–2 años de ventas y existencias; tabla con producto, ventas por semana, existencias y semanas; de menor a mayor; filtros; resaltados los de menos de 2 semanas | Igual, con búsqueda y filtros "se agotan" y "sobran" | `components/app/reporte.tsx` |
| Pantalla de medición: antes de abrir el reporte escribe la lista que iba a pedir, **la importa o adjunta una imagen**; después escribe la lista final; la app guarda las dos y cuenta | Escribir, pegar desde Excel o importar el archivo. **No se adjunta imagen** (ver Cambios) | `components/app/pedido-flujo.tsx`, `components/app/hoja.tsx` |
| Cómo miden: cada usuario con sus credenciales; el número sale de la base de datos; hasta guardar la lista inicial no se habilita el reporte | Reglas en el servidor: sin lista inicial, subir el export o pedir el reporte responde 403; la lista inicial queda fija (409) | `server/pedidos.js` |
| Encuesta de una pregunta: por qué cambió lo que cambió | Paso 5 | `POST /:id/por-que` |
| Pivote: 3 o más de los 5 cambian 0 o 1 líneas | Veredicto automático | `resumirPrueba` |
| Pivote: cambian líneas, pero por probar la herramienta | **El equipo lee cada respuesta y la marca** ("el dato le sirvió" o "por probar la herramienta"); los marcados por probar cuentan para el pivote y no para la meta | `POST /api/equipo/pedidos/:id/clasificacion`, `pedidos.clasificacion` |

## Pestaña 3 · Market Product Fit

| Lo que declara | En la app |
|---|---|
| Hook: sube el export y ve sus productos ordenados por semanas de inventario | Paso 2 → paso 3 |
| Time to value: 3 a 5 minutos | Inicio de sesión, lista inicial, subir el archivo y ver el reporte. La lista inicial agrega un paso que el time to value del Entregable no cuenta (sí está en el plan de prueba) |
| Stickiness (corregido): recordatorio por correo 3 días antes de que un producto con más de 4 semanas llegue a 2, con los productos, la fecha de la última estimación y un enlace | Se ofrece al ver el reporte. Es un archivo de calendario que avisa 3 días antes, con los productos, la fecha del reporte y el enlace; si hay Brevo, llega además por correo en ese momento. **Diferencia:** el correo no sale el día del aviso, sale cuando el usuario dice que sí: el equipo decidió no usar tareas programadas (cron), y Brevo solo deja programar correos 72 horas antes. Lo que llega 3 días antes es el aviso del calendario. En el panel, la tarjeta del recordatorio pide subir el archivo cuando ya pasó la fecha |
| Eslabón más débil: stickiness, porque la prueba no mide si vuelve | La vista del equipo mide quién pidió el recordatorio y quién volvió a entrar desde la fecha de su primer aviso |

## Pestaña 4 · "Qué seguimos sin saber"

| Pregunta abierta | Cómo la responde la app con los datos de cada probador |
|---|---|
| Cuánto les cuesta equivocarse: agotados al mes y plata quieta | En "Resultados de la prueba", por probador: productos que se venden y están en cero, los que se agotan en 2 semanas, los que sobran y, si el archivo trae costo, el dinero quieto |
| Cada cuánto piden | Días promedio entre sus listas iniciales |

## Lo que la app hace además de lo declarado

Fuera de la prueba (el equipo, la demo y cada probador cuando terminan sus 14 días): panel con lo que hay que atender, pronóstico Gamma-Poisson con temporada (§7 de `docs/modelo-rotacion.md`), tiempo de entrega por proveedor, riesgo de agotarse, cantidad sugerida, mínimos y máximos, pedido para Excel, WhatsApp o gerencia, y la demo con seis negocios inventados. Es lo que la pestaña 2 dejó "para después si el reporte se usa"; como no lo ven los probadores durante su prueba, no cambia lo que mide M.

## Filas que conviene agregar en "4 · Cambios y Reflexión"

1. Plan de prueba, lista inicial: "adjunta una imagen" se quitó. Una foto no se compara por código, y leerla con OCR falla con listas escritas a mano; la lista se escribe, se pega desde Excel o se importa de un archivo.
2. Stickiness: el correo llega cuando el usuario acepta, con la invitación de calendario; el aviso de 3 días antes lo da el calendario (sin cron).
3. Producto después de la prueba: panel, pronóstico, tiempo de entrega y cantidad sugerida, apagados para los probadores durante sus 14 días. Evidencia: Claudia Mueces (avisos de mínimos), Juan José Aya (importación, qué no volver a traer), Ricardo Osorio (comercialización contra proyectos).
4. Criterio para clasificar el "¿por qué?" (la vista del equipo lo marca y el veredicto lo cuenta).
